import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  BusinessCashTiedUpItem,
  BusinessMoneyBreakdownEntry,
  ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import Modal from 'react-native-modal';
export type BusinessPulseMetric = 'money-in' | 'costs' | 'cash-tied-up';

type BusinessPulseBreakdownModalProps = {
  metric: BusinessPulseMetric | null;
  notice?: string | null;
  onClose: () => void;
  overview: ResellerBusinessOverview | null;
  visible: boolean;
};

type CashBreakdownRow =
  | { key: string; type: 'heading'; title: string; count: number }
  | { key: string; type: 'empty'; text: string }
  | { key: string; type: 'item'; item: BusinessCashTiedUpItem };

function exactMoney(cents: number) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function costSourceLabel(source: BusinessCashTiedUpItem['costSource']) {
  switch (source) {
    case 'on_hand':
      return 'Saved on-hand cost';
    case 'linked_purchase':
      return 'Linked purchase records';
    case 'legacy_cost':
      return 'Saved item purchase cost';
    default:
      return 'No positive cost saved';
  }
}

function metricTitle(metric: BusinessPulseMetric) {
  if (metric === 'money-in') return 'Money in';
  if (metric === 'costs') return 'Costs';
  return 'Cash tied up';
}

function metricTotal(metric: BusinessPulseMetric, overview: ResellerBusinessOverview) {
  if (metric === 'money-in') return overview.currentMonth.moneyInCents;
  if (metric === 'costs') return overview.currentMonth.moneyOutCents;
  return overview.inventory.cashTiedUpCents;
}

export function BusinessPulseBreakdownModal({
  metric,
  notice,
  onClose,
  overview,
  visible,
}: BusinessPulseBreakdownModalProps) {
  const insets = useSafeAreaInsets();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();

  if (!visible || !metric || !overview) return null;

  const moneyEntries =
    metric === 'money-in'
      ? overview.currentMonth.moneyInEntries
      : overview.currentMonth.moneyOutEntries;
  const sortedMoneyEntries = [...moneyEntries].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
  const countedInventoryItems = overview.inventory.cashTiedUpItems
    .filter((item) => item.costCents > 0)
    .sort((left, right) => right.costCents - left.costCents);
  const missingCostItems = overview.inventory.cashTiedUpItems
    .filter((item) => item.costCents <= 0)
    .sort((left, right) => left.title.localeCompare(right.title));
  const cashRows: CashBreakdownRow[] = [
    {
      key: 'counted-heading',
      type: 'heading',
      title: 'COUNTED IN THIS TOTAL',
      count: countedInventoryItems.length,
    },
    ...(countedInventoryItems.length
      ? countedInventoryItems.map((item): CashBreakdownRow => ({
          key: `counted:${item.id}`,
          type: 'item',
          item,
        }))
      : [{
          key: 'counted-empty',
          type: 'empty' as const,
          text: 'No on-hand items with a positive saved cost are included yet.',
        }]),
    ...(missingCostItems.length
      ? [
          {
            key: 'missing-heading',
            type: 'heading' as const,
            title: 'NOT COUNTED · NO POSITIVE COST',
            count: missingCostItems.length,
          },
          ...missingCostItems.map((item): CashBreakdownRow => ({
            key: `missing:${item.id}`,
            type: 'item',
            item,
          })),
        ]
      : []),
  ];
  const isCashTiedUp = metric === 'cash-tied-up';

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropColor={theme.colors.backgroundRaised}
      backdropOpacity={0.05}
      onBackdropPress={onClose}
      isVisible={visible}
      style={{position: 'absolute', bottom: insets.bottom, top: insets.top * 2, left: -18, right: -18}}
    >
        <View
          style={[
            styles.panel,
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              top: insets.top * 2,
              marginBottom: insets.bottom,
              marginTop: insets.top * 2,
            },
          ]}
        >
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
              <Text style={[styles.title, { fontSize: responsiveFont(18), lineHeight: 23 }]}>
                {metricTitle(metric)} breakdown
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close breakdown"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <IconSymbol color={theme.colors.text} name="xmark" size={19} />
            </Pressable>
          </View>

          {isCashTiedUp ? (
            <CashTiedUpBreakdown
              notice={notice}
              responsiveFont={responsiveFont}
              rows={cashRows}
              totalCents={metricTotal(metric, overview)}
              unlinkedPurchaseCents={overview.attention.unlinkedInventoryCostCents}
            />
          ) : (
            <MoneyEntriesBreakdown
              entries={sortedMoneyEntries}
              isIncome={metric === 'money-in'}
              notice={notice}
              responsiveFont={responsiveFont}
              totalCents={metricTotal(metric, overview)}
            />
          )}
        </View>
    </Modal>
  );
}

function BreakdownTotal({
  isCashTiedUp,
  responsiveFont,
  totalCents,
}: {
  isCashTiedUp: boolean;
  responsiveFont: (size: number) => number;
  totalCents: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <View style={styles.totalCard}>
      <View style={styles.totalCopy}>
        <Text style={[styles.totalLabel, { fontSize: responsiveFont(8) }]}>
          {isCashTiedUp ? 'CURRENT INVENTORY' : 'CURRENT MONTH TO DATE'}
        </Text>
        <Text selectable style={[styles.totalValue, { fontSize: responsiveFont(25), lineHeight: 31 }]}>
          {exactMoney(totalCents)}
        </Text>
      </View>
      <Text style={[styles.totalCount, { fontSize: responsiveFont(9) }]}>Exact amounts</Text>
    </View>
  );
}

function MoneyEntriesBreakdown({
  entries,
  isIncome,
  notice,
  responsiveFont,
  totalCents,
}: {
  entries: BusinessMoneyBreakdownEntry[];
  isIncome: boolean;
  notice?: string | null;
  responsiveFont: (size: number) => number;
  totalCents: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <FlatList
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={entries}
      initialNumToRender={12}
      keyExtractor={(entry) => entry.id}
      ListEmptyComponent={(
        <Text style={[styles.emptyText, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
          No eligible {isIncome ? 'income' : 'cost'} entries have been recorded this month.
        </Text>
      )}
      ListHeaderComponent={(
        <View style={styles.listHeader}>
          <BreakdownTotal
            isCashTiedUp={false}
            responsiveFont={responsiveFont}
            totalCents={totalCents}
          />
          <View style={styles.introSection}>
            <Text style={[styles.description, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
              {isIncome
                ? 'Money in adds eligible income entries recorded this calendar month.'
                : 'Costs adds eligible expense and adjustment entries recorded this calendar month.'}
            </Text>
            <Text style={[styles.filterNote, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
              Only active USD records with a positive amount are counted. Voided records, other currencies, and entries from other months are left out.
            </Text>
            {notice ? (
              <Text style={[styles.unlinkedNote, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
                {notice}
              </Text>
            ) : null}
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { fontSize: responsiveFont(10) }]}>RECORDED ENTRIES</Text>
              <Text style={[styles.sectionCount, { fontSize: responsiveFont(9) }]}>
                {entries.length} line{entries.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        </View>
      )}
      renderItem={({ item }) => (
        <MoneyEntryRow entry={item} responsiveFont={responsiveFont} />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      windowSize={7}
    />
  );
}

function MoneyEntryRow({
  entry,
  responsiveFont,
}: {
  entry: BusinessMoneyBreakdownEntry;
  responsiveFont: (size: number) => number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryHeading}>
        <Text style={[styles.entryLabel, { fontSize: responsiveFont(11) }]}>{entry.label}</Text>
        <Text selectable style={[styles.entryAmount, { fontSize: responsiveFont(11) }]}>
          {exactMoney(entry.amountCents)}
        </Text>
      </View>
      <Text style={[styles.entryMeta, { fontSize: responsiveFont(9) }]}>{dateLabel(entry.occurredAt)}</Text>
      {entry.itemTitle ? (
        <Text style={[styles.entryDetail, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
          Item · {entry.itemTitle}
        </Text>
      ) : null}
      {entry.channel ? (
        <Text style={[styles.entryDetail, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
          Source · {entry.channel}
        </Text>
      ) : null}
      {entry.notes ? (
        <Text selectable style={[styles.entryDetail, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
          Note · {entry.notes}
        </Text>
      ) : null}
    </View>
  );
}

function CashTiedUpBreakdown({
  notice,
  responsiveFont,
  rows,
  totalCents,
  unlinkedPurchaseCents,
}: {
  notice?: string | null;
  responsiveFont: (size: number) => number;
  rows: CashBreakdownRow[];
  totalCents: number;
  unlinkedPurchaseCents: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <FlatList
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      initialNumToRender={12}
      keyExtractor={(row) => row.key}
      ListFooterComponent={
        unlinkedPurchaseCents > 0 ? (
          <Text style={[styles.unlinkedNote, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
            Across all saved records, not included: {exactMoney(unlinkedPurchaseCents)} in inventory purchases are not linked to an item, so they cannot be assigned to this total.
          </Text>
        ) : null
      }
      ListHeaderComponent={(
        <View style={styles.listHeader}>
          <BreakdownTotal
            isCashTiedUp
            responsiveFont={responsiveFont}
            totalCents={totalCents}
          />
          <View style={styles.introSection}>
            <Text style={[styles.description, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
              Cash tied up adds the positive saved cost for each item currently counted as on hand. Quantity is shown for context; it is not used as a multiplier.
            </Text>
            {notice ? (
              <Text style={[styles.unlinkedNote, { fontSize: responsiveFont(9), lineHeight: 14 }]}>
                {notice}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      renderItem={({ item }) => {
        if (item.type === 'heading') {
          return (
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { fontSize: responsiveFont(10) }]}>{item.title}</Text>
              <Text style={[styles.sectionCount, { fontSize: responsiveFont(9) }]}>
                {item.count} item{item.count === 1 ? '' : 's'}
              </Text>
            </View>
          );
        }
        if (item.type === 'empty') {
          return (
            <Text style={[styles.emptyText, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
              {item.text}
            </Text>
          );
        }
        return <InventoryCostRow item={item.item} responsiveFont={responsiveFont} />;
      }}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      windowSize={7}
    />
  );
}

function InventoryCostRow({
  item,
  responsiveFont,
}: {
  item: BusinessCashTiedUpItem;
  responsiveFont: (size: number) => number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const hasCost = item.costCents > 0;

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryHeading}>
        <Text numberOfLines={2} style={[styles.entryLabel, { fontSize: responsiveFont(11) }]}>
          {item.title.trim() || 'Untitled inventory item'}
        </Text>
        <Text selectable style={[hasCost ? styles.entryAmount : styles.missingAmount, { fontSize: responsiveFont(11) }]}>
          {exactMoney(item.costCents)}
        </Text>
      </View>
      <Text style={[styles.entryMeta, { fontSize: responsiveFont(9) }]}>
        {item.quantityOnHand} on hand · {costSourceLabel(item.costSource)}
      </Text>
    </View>
  );
}

function createResponsiveStyles() {
  return StyleSheet.create({
    backdrop: {
      backgroundColor: 'rgba(3, 8, 17, 0.88)',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    panel: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.accentCyanBorder,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 14,
      maxHeight: 900,
      padding: 14,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    headingCopy: { flex: 1, gap: 3 },
    eyebrow: {
      color: theme.colors.goldBright,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    title: { color: theme.colors.cream, fontWeight: '900' },
    closeButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 10,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    list: { flex: 1 },
    content: { flexGrow: 1, gap: 9, paddingBottom: 4 },
    listHeader: { gap: 12 },
    totalCard: {
      alignItems: 'flex-end',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 12,
    },
    totalCopy: { gap: 4 },
    totalLabel: { color: theme.colors.textMuted, fontWeight: '900', letterSpacing: 1 },
    totalValue: { color: theme.colors.cream, fontWeight: '900', fontVariant: ['tabular-nums'] },
    totalCount: { color: theme.colors.textMuted, fontWeight: '700', paddingBottom: 4 },
    introSection: { gap: 9 },
    description: { color: theme.colors.text, fontWeight: '700' },
    filterNote: { color: theme.colors.textMuted },
    sectionHeading: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 5,
    },
    sectionTitle: { color: theme.colors.goldBright, fontWeight: '900', letterSpacing: 1 },
    sectionCount: { color: theme.colors.textMuted, fontWeight: '700' },
    entryCard: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: 1,
      gap: 4,
      padding: 10,
    },
    entryHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
    entryLabel: { color: theme.colors.text, flex: 1, fontWeight: '800' },
    entryAmount: { color: theme.colors.scannerCyan, fontWeight: '900', fontVariant: ['tabular-nums'] },
    missingAmount: { color: theme.colors.textMuted, fontWeight: '900', fontVariant: ['tabular-nums'] },
    entryMeta: { color: theme.colors.textMuted, fontWeight: '700' },
    entryDetail: { color: theme.colors.textMuted },
    emptyText: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: 1,
      color: theme.colors.textMuted,
      padding: 12,
    },
    unlinkedNote: {
      backgroundColor: theme.colors.iconSurfaceGold,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 10,
      borderWidth: 1,
      color: theme.colors.text,
      padding: 11,
    },
    pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
  });
}
