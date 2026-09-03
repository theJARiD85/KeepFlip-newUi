import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type PlanField =
  | 'buyCost'
  | 'extraCost'
  | 'feePercent'
  | 'partnerShare'
  | 'salePrice'
  | 'shippingCost';

type PlanDraft = Record<PlanField, string>;
type FlipStage = 'buy' | 'refurbish' | 'sell' | 'split';
type LedgerAccountId = 'cash' | 'inventory' | 'cogs' | 'revenue' | 'partnerPayable';

type LedgerEntry = {
  amount: number;
  label: string;
};

type LedgerAccount = {
  credits: LedgerEntry[];
  debits: LedgerEntry[];
  id: LedgerAccountId;
  title: string;
  type: 'ASSET' | 'EXPENSE' | 'LIABILITY' | 'REVENUE';
};

const EMPTY_PLAN: PlanDraft = {
  buyCost: '225',
  extraCost: '35',
  feePercent: '',
  partnerShare: '35',
  salePrice: '530',
  shippingCost: '',
};

const STAGE_COPY: Record<
  FlipStage,
  { description: string; impact: string; title: string }
> = {
  buy: {
    description: 'Set the acquisition cost and preview the first two sides of the planned purchase.',
    impact: 'Cash is credited/decreased, and the device inventory asset is debited/increased.',
    title: '1. Buy Device',
  },
  refurbish: {
    description: 'Add planned parts or repair work to the device cost before it is ready to sell.',
    impact: 'Repair parts cash spent capitalizes directly into the device inventory asset value.',
    title: '2. Refurbish',
  },
  sell: {
    description: 'Preview the customer payment, sale revenue, and the inventory cost moving into COGS.',
    impact: 'Received payment triggers revenue credit and concurrent COGS recognition moving value out of inventory.',
    title: '3. Sell Item',
  },
  split: {
    description: 'Allocate an optional partner share of positive estimated profit after the planned sale.',
    impact: 'Payout split allocation creates partner payable liability while drawing down project surplus revenue.',
    title: '4. Split Payout',
  },
};

function amountFrom(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function percentageFrom(value: string) {
  return Math.min(100, amountFrom(value));
}

function money(value: number) {
  const safeValue = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(safeValue);
}

function percent(value: number) {
  const safeValue = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return String(safeValue) + '%';
}

function total(entries: LedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

function StageToolButton({
  active,
  detail,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  detail: string;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={'Shows the ' + label + ' projection'}
      accessibilityLabel={label + ' tool'}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stageButton,
        active && styles.stageButtonActive,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.stageIcon, active && styles.stageIconActive]}>
        <IconSymbol
          color={active ? theme.colors.backgroundDeep : theme.colors.textMuted}
          name={icon}
          size={15}
        />
      </View>
      <Text numberOfLines={2} style={[styles.stageLabel, active && styles.stageLabelActive]}>
        {label}
      </Text>
      <Text style={[styles.stageDetail, active && styles.stageDetailActive]}>{detail}</Text>
    </Pressable>
  );
}

function SnapshotMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'cream' | 'cyan' | 'green' | 'red' | 'violet';
  value: string;
}) {
  const valueStyle = {
    cream: styles.metricValueCream,
    cyan: styles.metricValueCyan,
    green: styles.metricValueGreen,
    red: styles.metricValueRed,
    violet: styles.metricValueViolet,
  }[tone];

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text selectable style={[styles.metricValue, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}

function LedgerEntryList({
  entries,
  side,
}: {
  entries: LedgerEntry[];
  side: 'credit' | 'debit';
}) {
  const amountStyle = side === 'credit' ? styles.creditAmount : styles.debitAmount;

  return (
    <View style={[styles.ledgerColumn, side === 'credit' && styles.creditColumn]}>
      {entries.length === 0 ? (
        <Text style={styles.emptyEntry}>—</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.label} style={styles.ledgerEntry}>
            <Text numberOfLines={1} style={styles.entryLabel}>
              {entry.label}
            </Text>
            <Text selectable style={[styles.entryAmount, amountStyle]}>
              {money(entry.amount)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function LedgerAccountCard({ account }: { account: LedgerAccount }) {
  const debitTotal = total(account.debits);
  const creditTotal = total(account.credits);

  return (
    <View
      accessibilityLabel={
        account.title +
        '. Debit total ' +
        money(debitTotal) +
        '. Credit total ' +
        money(creditTotal) +
        '.'
      }
      style={styles.ledgerCard}>
      <View style={styles.ledgerCardHeader}>
        <Text numberOfLines={1} style={styles.ledgerAccountTitle}>
          {account.title}
        </Text>
        <View style={styles.accountTypePill}>
          <Text style={styles.accountTypeText}>{account.type}</Text>
        </View>
      </View>

      <View style={styles.ledgerColumnHeaders}>
        <Text style={[styles.ledgerColumnHeading, styles.ledgerHeadingDivider]}>DEBIT (DR)</Text>
        <Text style={styles.ledgerColumnHeading}>CREDIT (CR)</Text>
      </View>

      <View style={styles.ledgerColumns}>
        <LedgerEntryList entries={account.debits} side="debit" />
        <LedgerEntryList entries={account.credits} side="credit" />
      </View>

      <View style={styles.ledgerTotals}>
        <Text selectable style={[styles.ledgerTotal, styles.ledgerTotalDivider]}>
          {'Total: ' + money(debitTotal)}
        </Text>
        <Text selectable style={styles.ledgerTotal}>
          {'Total: ' + money(creditTotal)}
        </Text>
      </View>
    </View>
  );
}

function snapToStep(
  value: number,
  minimumValue: number,
  maximumValue: number,
  step: number,
) {
  const boundedValue = Math.min(maximumValue, Math.max(minimumValue, value));
  const steppedValue =
    minimumValue + Math.round((boundedValue - minimumValue) / step) * step;

  return Math.min(maximumValue, Math.max(minimumValue, steppedValue));
}

function GradientSlider({
  accessibilityLabel,
  maximumValue,
  minimumValue,
  onValueChange,
  step,
  value,
}: {
  accessibilityLabel: string;
  maximumValue: number;
  minimumValue: number;
  onValueChange: (nextValue: number) => void;
  step: number;
  value: number;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const percentage = (
    maximumValue === minimumValue
      ? 0
      : ((value - minimumValue) / (maximumValue - minimumValue)) * 100
  ).toFixed(3) + '%';

  const updateFromLocation = useCallback(
    (locationX: number) => {
      if (trackWidth <= 0) {
        return;
      }

      const rawValue =
        minimumValue + (locationX / trackWidth) * (maximumValue - minimumValue);
      onValueChange(snapToStep(rawValue, minimumValue, maximumValue, step));
    },
    [maximumValue, minimumValue, onValueChange, step, trackWidth],
  );

  const decrease = () => {
    onValueChange(snapToStep(value - step, minimumValue, maximumValue, step));
  };

  const increase = () => {
    onValueChange(snapToStep(value + step, minimumValue, maximumValue, step));
  };

  return (
    <View
      accessible
      accessibilityActions={[
        { label: 'Decrease value', name: 'decrement' },
        { label: 'Increase value', name: 'increment' },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{
        max: maximumValue,
        min: minimumValue,
        now: value,
        text: String(value),
      }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          increase();
        }

        if (event.nativeEvent.actionName === 'decrement') {
          decrease();
        }
      }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      onResponderGrant={(event) => updateFromLocation(event.nativeEvent.locationX)}
      onResponderMove={(event) => updateFromLocation(event.nativeEvent.locationX)}
      onStartShouldSetResponder={() => true}
      pointerEvents="box-only"
      style={styles.sliderTouch}>
      <View pointerEvents="none" style={styles.sliderTrack}>
        <LinearGradient
          colors={[
            theme.colors.scannerViolet,
            theme.colors.goldBright,
            theme.colors.scannerCyan,
          ]}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          style={[styles.sliderFill, { width: percentage as any }]}
        />
        <LinearGradient
          colors={[
            theme.colors.cream,
            theme.colors.cream,
            theme.colors.cream,
          ]}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          style={[styles.sliderThumb, { left: percentage as any }]}
        />
      </View>
    </View>
  );
}

function SliderControl({
  accessibilityLabel,
  label,
  maximumValue,
  minimumValue,
  onValueChange,
  step,
  suffix,
  value,
}: {
  accessibilityLabel: string;
  label: string;
  maximumValue: number;
  minimumValue: number;
  onValueChange: (nextValue: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  return (
    <View style={styles.sliderControl}>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text selectable style={styles.sliderValue}>
          {suffix === '%' ? String(value) + '%' : money(value)}
        </Text>
      </View>
      <GradientSlider
        accessibilityLabel={accessibilityLabel}
        maximumValue={maximumValue}
        minimumValue={minimumValue}
        onValueChange={onValueChange}
        step={step}
        value={value}
      />
    </View>
  );
}

/**
 * Flip Plan renders an estimate-only accounting projection. It never writes a
 * Books record, so planned transactions cannot be mistaken for real activity.
 */
export function FlipPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_PLAN);
  const [activeStage, setActiveStage] = useState<FlipStage>('buy');

  const updateField = (field: PlanField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const plan = useMemo(() => {
    const buyCost = amountFrom(draft.buyCost);
    const extraCost = amountFrom(draft.extraCost);
    const salePrice = amountFrom(draft.salePrice);
    const shippingCost = amountFrom(draft.shippingCost);
    const feePercent = percentageFrom(draft.feePercent);
    const partnerShare = percentageFrom(draft.partnerShare);
    const accumulatedCogs = buyCost + extraCost;
    const grossProfit = salePrice - accumulatedCogs;
    const sellingFee = salePrice * (feePercent / 100);
    const profitAfterSaleCosts = grossProfit - sellingFee - shippingCost;
    const partnerPayout =
      Math.max(0, profitAfterSaleCosts) * (partnerShare / 100);
    const resellerKeep = profitAfterSaleCosts - partnerPayout;

    return {
      accumulatedCogs,
      buyCost,
      extraCost,
      feePercent,
      grossProfit,
      partnerPayout,
      partnerShare,
      profitAfterSaleCosts,
      resellerKeep,
      salePrice,
      sellingFee,
      shippingCost,
    };
  }, [draft]);

  const ledger = useMemo(() => {
    const accounts: Record<LedgerAccountId, LedgerAccount> = {
      cash: {
        credits: [],
        debits: [],
        id: 'cash',
        title: 'Cash & Bank',
        type: 'ASSET',
      },
      cogs: {
        credits: [],
        debits: [],
        id: 'cogs',
        title: 'Cost of Goods Sold (COGS)',
        type: 'EXPENSE',
      },
      inventory: {
        credits: [],
        debits: [],
        id: 'inventory',
        title: 'Inventory Asset (Device)',
        type: 'ASSET',
      },
      partnerPayable: {
        credits: [],
        debits: [],
        id: 'partnerPayable',
        title: 'Partner Split Payable',
        type: 'LIABILITY',
      },
      revenue: {
        credits: [],
        debits: [],
        id: 'revenue',
        title: 'Sales Revenue',
        type: 'REVENUE',
      },
    };

    accounts.inventory.debits.push({
      amount: plan.buyCost,
      label: 'Device Purchase',
    });
    accounts.cash.credits.push({
      amount: plan.buyCost,
      label: 'Device Purchase',
    });

    if (activeStage !== 'buy') {
      accounts.inventory.debits.push({
        amount: plan.extraCost,
        label: 'Parts / Screen Repair',
      });
      accounts.cash.credits.push({
        amount: plan.extraCost,
        label: 'Parts / Screen Repair',
      });
    }

    if (activeStage === 'sell' || activeStage === 'split') {
      accounts.cash.debits.push({
        amount: plan.salePrice,
        label: 'Customer Payment',
      });
      accounts.revenue.credits.push({
        amount: plan.salePrice,
        label: 'Device Sale',
      });
      accounts.cogs.debits.push({
        amount: plan.accumulatedCogs,
        label: 'Recognize Item COGS',
      });
      accounts.inventory.credits.push({
        amount: plan.accumulatedCogs,
        label: 'Clear Sold Inventory',
      });
    }

    if (activeStage === 'split' && plan.partnerPayout > 0) {
      accounts.revenue.debits.push({
        amount: plan.partnerPayout,
        label: 'Partner Profit Split Share',
      });
      accounts.partnerPayable.credits.push({
        amount: plan.partnerPayout,
        label: 'Partner Allocation',
      });
    }

    const visibleAccounts = [
      accounts.cash,
      accounts.inventory,
      accounts.cogs,
      accounts.revenue,
      accounts.partnerPayable,
    ].filter(
      (account) => account.debits.length > 0 || account.credits.length > 0,
    );
    const debitTotal = visibleAccounts.reduce(
      (sum, account) => sum + total(account.debits),
      0,
    );
    const creditTotal = visibleAccounts.reduce(
      (sum, account) => sum + total(account.credits),
      0,
    );

    return {
      accounts: visibleAccounts,
      creditTotal,
      debitTotal,
      isBalanced: Math.abs(debitTotal - creditTotal) < 0.01,
    };
  }, [activeStage, plan]);

  const stageCopy = STAGE_COPY[activeStage];

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 28,
            paddingTop: insets.top / 2,
          },
        ]}
        style={{marginBottom: insets.bottom, marginTop: insets.top}}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(220)} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="chevron.right"
              size={22}
              style={styles.backIcon}
            />
          </Pressable>
          <Text style={styles.topLabel}>SELLER ACCOUNT</Text>
          <View style={styles.topSpacer} />
        </Animated.View>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>KEEPFLIP / FLIP PLAN</Text>
          <Text style={styles.title}>Map each side of the flip</Text>
          <Text style={styles.subtitle}>
            Buy, refurbish, sell, and split are separate planning tools. Each button
            reveals the cumulative projection for that stage, without posting real
            entries to Books.
          </Text>
        </View>

        <View style={styles.stagePanel}>
          <View style={styles.stageGrid}>
            <View style={styles.stageRow}>
              <StageToolButton
                active={activeStage === 'buy'}
                detail={money(plan.buyCost)}
                icon="shippingbox.fill"
                label="1. Buy Device"
                onPress={() => setActiveStage('buy')}
              />
              <StageToolButton
                active={activeStage === 'refurbish'}
                detail={'+' + money(plan.extraCost)}
                icon="wrench.and.screwdriver.fill"
                label="2. Refurbish"
                onPress={() => setActiveStage('refurbish')}
              />
            </View>
            <View style={styles.stageRow}>
            <StageToolButton
              active={activeStage === 'sell'}
              detail={money(plan.salePrice)}
              icon="tag.fill"
              label="3. Sell Item"
              onPress={() => setActiveStage('sell')}
            />
            <StageToolButton
              active={activeStage === 'split'}
              detail={percent(plan.partnerShare) + ' Split'}
              icon="person.fill"
              label="4. Split Payout"
              onPress={() => setActiveStage('split')}
            />
            </View>
          </View>

          <View style={styles.metricGrid}>
            <SnapshotMetric
              label="ACCUMULATED COGS"
              tone="cream"
              value={money(plan.accumulatedCogs)}
            />
            <SnapshotMetric
              label="GROSS PROFIT MARGIN"
              tone={plan.grossProfit < 0 ? 'red' : 'green'}
              value={money(plan.grossProfit)}
            />
            <SnapshotMetric
              label="PARTNER PAYOUT"
              tone="cyan"
              value={money(plan.partnerPayout)}
            />
            <SnapshotMetric
              label="RESELLER KEEP"
              tone={plan.resellerKeep < 0 ? 'red' : 'violet'}
              value={money(plan.resellerKeep)}
            />
          </View>

          <View style={styles.impactRow}>
            <View style={styles.impactCopy}>
              <Text style={styles.impactLabel}>DOUBLE-ENTRY IMPACT</Text>
              <Text style={styles.impactText}>{stageCopy.impact}</Text>
            </View>
            <View
              accessibilityLabel={
                ledger.isBalanced
                  ? 'Projection ledger balanced'
                  : 'Projection ledger not balanced'
              }
              style={[styles.balancePill, !ledger.isBalanced && styles.balancePillUnbalanced]}>
              <IconSymbol
                color={ledger.isBalanced ? theme.colors.scannerCyan : theme.colors.goldBright}
                name={ledger.isBalanced ? 'checkmark.shield.fill' : 'exclamationmark.triangle.fill'}
                size={13}
              />
              <Text
                style={[
                  styles.balanceText,
                  !ledger.isBalanced && styles.balanceTextUnbalanced,
                ]}>
                {ledger.isBalanced ? 'Ledger balanced' : 'Check ledger'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.ledgerSection}>
          <View style={styles.ledgerSectionHeading}>
            <View style={styles.ledgerSectionCopy}>
              <Text style={styles.sectionEyebrow}>{stageCopy.title.toUpperCase()}</Text>
              <Text style={styles.sectionTitle}>Projected account movement</Text>
              <Text style={styles.sectionText}>{stageCopy.description}</Text>
            </View>
            <View style={styles.projectionPill}>
              <Text style={styles.projectionPillText}>PLAN PROJECTION</Text>
            </View>
          </View>

          <View style={styles.ledgerGrid}>
            {ledger.accounts.map((account) => (
              <LedgerAccountCard account={account} key={account.id} />
            ))}
          </View>

          <View style={styles.ledgerGrandTotals}>
            <Text style={styles.ledgerGrandLabel}>STAGE TOTALS</Text>
            <Text selectable style={styles.ledgerGrandValue}>
              {'DR ' + money(ledger.debitTotal) + '  ·  CR ' + money(ledger.creditTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.sliderPanel}>
          <View style={styles.sliderPanelHeading}>
            <Text style={styles.sectionEyebrow}>FLIP INPUTS</Text>
            <Text style={styles.sectionTitle}>Tune the plan</Text>
            <Text style={styles.sectionText}>
              Adjust any scale and every stage updates live.
            </Text>
          </View>

          <View style={styles.sliderGrid}>
            <SliderControl
              accessibilityLabel="Device Purchase Cost"
              label="Item Purchase Cost"
              maximumValue={400}
              minimumValue={20}
              onValueChange={(value) => updateField('buyCost', String(value))}
              step={5}
              value={plan.buyCost}
            />
            <SliderControl
              accessibilityLabel="Refurbishment and Parts"
              label="Refurbishment & Parts"
              maximumValue={150}
              minimumValue={0}
              onValueChange={(value) => updateField('extraCost', String(value))}
              step={5}
              value={plan.extraCost}
            />
            <SliderControl
              accessibilityLabel="Resale Consumer Price"
              label="Resale Consumer Price"
              maximumValue={800}
              minimumValue={100}
              onValueChange={(value) => updateField('salePrice', String(value))}
              step={10}
              value={plan.salePrice}
            />
            <SliderControl
              accessibilityLabel="Partner Profit Share"
              label="Partner Profit Share"
              maximumValue={100}
              minimumValue={0}
              onValueChange={(value) => updateField('partnerShare', String(value))}
              step={5}
              suffix="%"
              value={plan.partnerShare}
            />
          </View>
        </View>

        <View style={styles.planNote}>
          <IconSymbol color={theme.colors.textMuted} name="lock.fill" size={14} />
          <Text style={styles.planNoteText}>
            This is an estimate-only projection. It stays separate from Books, so a
            planned sale, cost, or payout cannot look like real business activity.
          </Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  accountTypePill: {
    backgroundColor: 'rgba(234, 241, 236, 0.07)',
    borderColor: 'rgba(234, 241, 236, 0.16)',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  accountTypeText: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    paddingRight: 8,
  },
  backButtonText: { color: theme.colors.cream, fontSize: 12, fontWeight: '800' },
  backIcon: { transform: [{ rotate: '180deg' }] },
  balancePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(88, 223, 232, 0.10)',
    borderColor: 'rgba(88, 223, 232, 0.25)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  balancePillUnbalanced: {
    backgroundColor: 'rgba(242, 211, 138, 0.10)',
    borderColor: 'rgba(242, 211, 138, 0.28)',
  },
  balanceText: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  balanceTextUnbalanced: { color: theme.colors.goldBright },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 760,
    paddingHorizontal: 18,
    width: '100%',
  },
  costNote: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(242, 211, 138, 0.07)',
    borderColor: 'rgba(242, 211, 138, 0.22)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  costNoteComplete: {
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
    borderColor: 'rgba(88, 223, 232, 0.22)',
  },
  costNoteCopy: { flex: 1, gap: 2 },
  costNoteText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  costNoteTitle: { color: theme.colors.cream, fontSize: 11, fontWeight: '900', lineHeight: 15 },
  creditAmount: { color: theme.colors.goldBright },
  creditColumn: { borderLeftColor: 'rgba(234, 241, 236, 0.10)', borderLeftWidth: 1 },
  debitAmount: { color: theme.colors.cream },
  emptyEntry: {
    color: 'rgba(234, 241, 236, 0.24)',
    fontSize: 13,
    paddingHorizontal: 5,
    paddingTop: 7,
    textAlign: 'center',
  },
  entryAmount: { fontSize: 11, fontWeight: '900', textAlign: 'right' },
  entryLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  field: {
    backgroundColor: 'rgba(4, 10, 15, 0.68)',
    borderColor: 'rgba(234, 241, 236, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 8,
    minHeight: 108,
    padding: 12,
  },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldHeading: { gap: 3 },
  fieldHelper: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
  fieldLabel: {
    color: theme.colors.cream,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  header: { gap: 5 },
  impactCopy: { flex: 1, gap: 3 },
  impactLabel: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  impactRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(234, 241, 236, 0.045)',
    borderColor: 'rgba(234, 241, 236, 0.07)',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 11,
  },
    topLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.8,
    },
    topSpacer: {
      width: 44,
      height: 44,
    },
  impactText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  input: {
    color: theme.colors.cream,
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    minHeight: 42,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  inputPrefix: {
    color: theme.colors.scannerCyan,
    fontSize: 20,
    fontWeight: '900',
    paddingLeft: 1,
  },
  inputSuffix: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '900',
    paddingRight: 3,
  },
  inputSurface: {
    alignItems: 'center',
    backgroundColor: 'rgba(88, 223, 232, 0.055)',
    borderColor: 'rgba(88, 223, 232, 0.18)',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    paddingHorizontal: 9,
  },
  ledgerAccountTitle: {
    color: theme.colors.cream,
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  ledgerCard: {
    backgroundColor: 'rgba(4, 10, 15, 0.74)',
    borderColor: 'rgba(234, 241, 236, 0.14)',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: 245,
    flexGrow: 1,
    minHeight: 176,
    overflow: 'hidden',
  },
  ledgerCardHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(234, 241, 236, 0.055)',
    borderBottomColor: 'rgba(234, 241, 236, 0.10)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 39,
    paddingHorizontal: 10,
  },
  ledgerColumn: { flex: 1, gap: 5, padding: 6 },
  ledgerColumnHeading: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    paddingVertical: 7,
    textAlign: 'center',
  },
  ledgerColumnHeaders: {
    backgroundColor: 'rgba(234, 241, 236, 0.025)',
    borderBottomColor: 'rgba(234, 241, 236, 0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  ledgerColumns: { flex: 1, flexDirection: 'row', minHeight: 78 },
  ledgerEntry: {
    backgroundColor: 'rgba(234, 241, 236, 0.035)',
    borderColor: 'rgba(234, 241, 236, 0.08)',
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  ledgerGrandLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  ledgerGrandTotals: {
    alignItems: 'center',
    borderTopColor: 'rgba(234, 241, 236, 0.10)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 12,
  },
  ledgerGrandValue: {
    color: theme.colors.cream,
    fontSize: 11,
    fontWeight: '900',
  },
  ledgerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ledgerHeadingDivider: {
    borderRightColor: 'rgba(234, 241, 236, 0.10)',
    borderRightWidth: 1,
  },
  ledgerSection: {
    backgroundColor: 'rgba(5, 16, 22, 0.90)',
    borderColor: 'rgba(88, 223, 232, 0.23)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 13,
  },
  ledgerSectionCopy: { flex: 1, gap: 3 },
  ledgerSectionHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  ledgerTotal: {
    color: theme.colors.cream,
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    paddingVertical: 8,
    textAlign: 'center',
  },
  ledgerTotalDivider: {
    borderRightColor: 'rgba(234, 241, 236, 0.10)',
    borderRightWidth: 1,
  },
  ledgerTotals: {
    backgroundColor: 'rgba(234, 241, 236, 0.055)',
    borderTopColor: 'rgba(234, 241, 236, 0.10)',
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  metric: {
    backgroundColor: 'rgba(4, 10, 15, 0.68)',
    borderColor: 'rgba(234, 241, 236, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 128,
    flexGrow: 1,
    gap: 4,
    minHeight: 78,
    padding: 11,
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  metricValue: { fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  metricValueCream: { color: theme.colors.cream },
  metricValueCyan: { color: theme.colors.scannerCyan },
  metricValueGreen: { color: '#42d989' },
  metricValueRed: { color: '#ff827b' },
  metricValueViolet: { color: theme.colors.scannerViolet },
  planNote: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(234, 241, 236, 0.035)',
    borderColor: 'rgba(234, 241, 236, 0.09)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 11,
  },
  planNoteText: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  projectionPill: {
    backgroundColor: 'rgba(88, 223, 232, 0.10)',
    borderColor: 'rgba(88, 223, 232, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  projectionPillText: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  resetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 8,
  },
  resetText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  sectionEyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  sectionText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16, maxWidth: 540 },
  sectionTitle: {
    color: theme.colors.cream,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  stageButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 10, 15, 0.55)',
    borderColor: 'rgba(234, 241, 236, 0.10)',
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 82,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  stageButtonActive: {
    backgroundColor: 'rgba(88, 223, 232, 0.13)',
    borderColor: 'rgba(88, 223, 232, 0.42)',
  },
  stageDetail: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 12 },
  stageDetailActive: { color: theme.colors.scannerCyan },
  stageGrid: { flexDirection: 'column', gap: 6 },
  stageRow: { flexDirection: 'row', gap: 6 },
  stageIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(234, 241, 236, 0.075)',
    borderRadius: 7,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  stageIconActive: { backgroundColor: theme.colors.scannerCyan },
  stageLabel: {
    color: theme.colors.cream,
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 12,
    textAlign: 'center',
  },
  stageLabelActive: { color: theme.colors.scannerCyan },
  stagePanel: {
    backgroundColor: 'rgba(5, 16, 22, 0.90)',
    borderColor: 'rgba(88, 223, 232, 0.25)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 11,
  },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 600 },
  title: {
    color: theme.colors.cream,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.55,
    lineHeight: 34,
  },
  toolPanel: {
    backgroundColor: 'rgba(5, 16, 22, 0.86)',
    borderColor: 'rgba(234, 241, 236, 0.14)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 14,
  },
  toolPanelHeading: { gap: 3 },
  sliderControl: {
    flexBasis: 238,
    flexGrow: 1,
    gap: 7,
  },
  sliderFill: {
    borderRadius: 999,
    height: 5,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  sliderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
  },
  sliderLabel: {
    color: theme.colors.cream,
    fontSize: 11,
    fontWeight: '800',
  },
  sliderLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderPanel: {
    backgroundColor: 'rgba(5, 16, 22, 0.86)',
    borderColor: 'rgba(88, 223, 232, 0.24)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 14,
  },
  sliderPanelHeading: { gap: 3 },
  sliderThumb: {
    color: theme.colors.cream,
    borderColor: 'rgba(4, 10, 15, 0.88)',
    borderRadius: 12,
    borderWidth: 2,
    height: 22,
    marginLeft: -11,
    position: 'absolute',
    top: -9,
    width: 22,
  },
  sliderTouch: {
    height: 34,
    justifyContent: 'center',
    width: '100%',
  },
  sliderTrack: {
    backgroundColor: 'rgba(234, 241, 236, 0.14)',
    borderRadius: 999,
    height: 5,
    position: 'relative',
    width: '100%',
  },
  sliderValue: {
    color: theme.colors.goldBright,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});

