import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipFeedbackNudge } from '@/components/feedback/keepflip-feedback-nudge';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { PlaidBankConnectionCard } from '@/components/books/plaid-bank-connection-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import {
  createBookkeepingIdempotencyKey,
  getBookkeepingOverview,
  isResellerBookkeepingConfigured,
  recordBookkeepingEvent,
  type BookkeepingEventType,
  type BookkeepingMoneyEvent,
} from '@/services/reseller-bookkeeping-service';
import {
  buildResellerLedgerCsv,
  centsFromLedgerAmount,
  createManualLedgerEntry,
  isResellerBooksConfigured,
  ledgerEntryDetails,
  listResellerLedgerEntries,
  parseLedgerDate,
  resolvedInventoryCostCents,
  summarizeResellerBooks,
  todayBusinessDate,
  type ResellerLedgerEntry,
  type ResellerLedgerEntryType,
} from '@/services/reseller-ledger-service';

type LedgerDraft = {
  amount: string;
  channel: string;
  entryType: ResellerLedgerEntryType;
  idempotencyKey: string;
  itemId: string | null;
  notes: string;
  occurredOn: string;
  quantity: string;
};

type MetricProps = {
  detail: string;
  label: string;
  tone?: 'cyan' | 'gold' | 'violet';
  value: string;
};

const ENTRY_TYPE_OPTIONS: ResellerLedgerEntryType[] = [
  'sale_proceeds',
  'inventory_purchase',
  'marketplace_fee',
  'shipping_label',
  'refund',
  'repair_parts',
  'supplies',
  'software',
  'advertising',
  'storage',
  'mileage',
  'other_income',
  'other_expense',
];

function makeDraft(entryType: ResellerLedgerEntryType): LedgerDraft {
  return {
    amount: '',
    channel: '',
    entryType,
    idempotencyKey: createBookkeepingIdempotencyKey(`manual-${entryType}`),
    itemId: null,
    notes: '',
    occurredOn: todayBusinessDate(),
    quantity: '1',
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(cents / 100);
}

function formatSignedMoney(cents: number) {
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents))}`;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function fullDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';

  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

function Metric({ detail, label, tone = 'gold', value }: MetricProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const toneStyle =
    tone === 'cyan'
      ? styles.metricCyan
      : tone === 'violet'
        ? styles.metricViolet
        : styles.metricGold;

  return (
    <View style={[styles.metric, toneStyle]}>
      <Text style={[styles.metricLabel, { fontSize: responsiveFont(8) }]}>{label}</Text>
      <Text selectable style={[styles.metricValue, { fontSize: responsiveFont(21) }]}>
        {value}
      </Text>
      <Text style={[styles.metricDetail, { fontSize: responsiveFont(10) }]}>{detail}</Text>
    </View>
  );
}

function Section({
  action,
  children,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>{eyebrow}</Text>
          <Text style={[styles.sectionTitle, { fontSize: responsiveFont(17) }]}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function TransactionRow({
  entry,
  inventoryNames,
  onPress,
}: {
  entry: ResellerLedgerEntry;
  inventoryNames: Map<string, string>;
  onPress: () => void;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const details = ledgerEntryDetails(entry.entryType);
  const isIncome = entry.direction === 'income';
  const itemName = entry.itemId ? inventoryNames.get(entry.itemId) : null;
  const secondary = [shortDate(entry.occurredAt), entry.channel, itemName]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityHint="Opens the full transaction details."
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.transactionRow,
        pressed && styles.transactionRowPressed,
      ]}>
      <View
        style={[
          styles.transactionMarker,
          isIncome ? styles.transactionMarkerIncome : styles.transactionMarkerExpense,
        ]}
      />
      <View style={styles.transactionCopy}>
        <Text style={[styles.transactionTitle, { fontSize: responsiveFont(13) }]}>{details.label}</Text>
        <Text numberOfLines={1} style={styles.transactionSecondary}>
          {entry.notes || secondary || 'Manual transaction'}
        </Text>
        {entry.notes && secondary ? (
          <Text numberOfLines={1} style={styles.transactionTertiary}>
            {secondary}
          </Text>
        ) : null}
      </View>
      <View style={styles.transactionAmountColumn}>
        <Text
          selectable
          style={[
            styles.transactionAmount,
            isIncome
              ? styles.transactionAmountIncome
              : styles.transactionAmountExpense,
          ]}>
          {isIncome ? '+' : '−'}
          {formatMoney(entry.amountCents)}
        </Text>
        <Text style={styles.transactionSource}>{entry.source.toUpperCase()}</Text>
      </View>
      <IconSymbol
        color={theme.colors.textMuted}
        name="chevron.right"
        size={13}
      />
    </Pressable>
  );
}

function TransactionDetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  if (!value) return null;

  return (
    <View style={styles.transactionDetailRow}>
      <Text style={[styles.transactionDetailLabel, { fontSize: responsiveFont(7) }]}>{label}</Text>
      <Text selectable style={[styles.transactionDetailValue, { fontSize: responsiveFont(12) }]}>
        {value}
      </Text>
    </View>
  );
}

function bookkeepingEventsAsLedgerEntries(
  ownerId: string,
  events: BookkeepingMoneyEvent[],
): ResellerLedgerEntry[] {
  return events.map((event) => ({
    amountCents: event.amountCents,
    channel: 'KeepFlip Books',
    createdAt: event.occurredAt,
    currency: 'USD',
    direction: event.direction,
    entryType: event.entryType,
    externalId: null,
    id: `books-v2-${event.id}`,
    itemId: event.itemId,
    notes: null,
    occurredAt: event.occurredAt,
    ownerId,
    receiptFileId: null,
    saleGroupId: null,
    source: 'migration',
    updatedAt: event.occurredAt,
    voidedAt: null,
  }));
}

function advancedEventTypeForLedgerEntry(
  entryType: ResellerLedgerEntryType,
): BookkeepingEventType | null {
  switch (entryType) {
    case 'sale_proceeds':
      return 'sale';
    case 'inventory_purchase':
    case 'marketplace_fee':
    case 'shipping_label':
    case 'refund':
    case 'repair_parts':
    case 'supplies':
    case 'software':
    case 'advertising':
    case 'storage':
    case 'mileage':
    case 'other_expense':
      return entryType;
    case 'other_income':
      return null;
  }
}

export function BooksScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const router = useRouter();
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

  const { user } = useKeepFlipAuth();
  const { recordCompletedAction } = useKeepFlipFeedbackNudge();
  const { canUse } = useKeepFlipSubscription();
  const insets = useSafeAreaInsets();
  const userId = user?.$id;
  const basicBooksAllowed = canUse('basic_books');
  const advancedBooksAllowed = canUse('automated_books');
  const scheduleCExportAllowed = canUse('schedule_c_export');
  const legacyLedgerConfigured =
    isResellerBooksConfigured() && basicBooksAllowed;
  const advancedBookkeepingConfigured =
    isResellerBookkeepingConfigured() && advancedBooksAllowed;
  const ledgerConfigured = legacyLedgerConfigured || advancedBookkeepingConfigured;
  const [entries, setEntries] = useState<ResellerLedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<ResellerLedgerEntry | null>(null);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LedgerDraft>(() =>
    makeDraft('sale_proceeds'),
  );

  const loadBooks = useCallback(
    async (refresh = false) => {
      if (!userId) {
        setEntries([]);
        setInventory([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);

      setError(null);
      setSetupNotice(null);

      try {
        const [inventoryResult, legacyResult, advancedResult] = await Promise.allSettled([
          listInventoryItems(userId),
          legacyLedgerConfigured
            ? listResellerLedgerEntries(userId)
            : Promise.resolve([] as ResellerLedgerEntry[]),
          advancedBookkeepingConfigured
            ? getBookkeepingOverview()
            : Promise.resolve(null),
        ]);

        if (inventoryResult.status === 'rejected') {
          throw inventoryResult.reason;
        }

        const savedInventory = inventoryResult.value;
        const legacyEntries =
          legacyResult.status === 'fulfilled' ? legacyResult.value : [];
        const advancedOverview =
          advancedResult.status === 'fulfilled' ? advancedResult.value : null;

        setInventory(savedInventory);

        if (!ledgerConfigured) {
          setEntries([]);
          setSetupNotice(
            'Deploy the private Books service and add its Function ID to this app configuration to start recording transactions. Your existing inventory stays unchanged.',
          );
          return;
        }

        const advancedEntries = advancedOverview
          ? bookkeepingEventsAsLedgerEntries(userId, advancedOverview.moneyEvents)
          : [];
        const loadingNotice = [
          ...(legacyLedgerConfigured && legacyResult.status === 'rejected'
            ? ['Classic Books history could not load right now.']
            : []),
          ...(advancedBookkeepingConfigured && advancedResult.status === 'rejected'
            ? ['Advanced Books could not load right now.']
            : []),
        ].join(' ');

        if (loadingNotice) {
          setSetupNotice(`${loadingNotice} Your saved inventory is still available.`);
        }

        setEntries(
          [...legacyEntries, ...advancedEntries].sort(
            (left, right) =>
              new Date(right.occurredAt).getTime() -
              new Date(left.occurredAt).getTime(),
          ),
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'KeepFlip could not load your books right now.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      advancedBookkeepingConfigured,
      ledgerConfigured,
      legacyLedgerConfigured,
      userId,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      void loadBooks();
    }, [loadBooks]),
  );

  const summary = useMemo(
    () => summarizeResellerBooks({ entries, inventory }),
    [entries, inventory],
  );
  const inventoryNames = useMemo(
    () => new Map(inventory.map((item) => [item.id, item.title])),
    [inventory],
  );
  const selectedItem = draft.itemId
    ? inventory.find((item) => item.id === draft.itemId) ?? null
    : null;
  const selectedTransactionItem = selectedTransaction?.itemId
    ? inventory.find((item) => item.id === selectedTransaction.itemId) ?? null
    : null;
  const draftDetails = ledgerEntryDetails(draft.entryType);
  const availableEntryTypeOptions = advancedBookkeepingConfigured
    ? ENTRY_TYPE_OPTIONS.filter((entryType) => entryType !== 'other_income')
    : ENTRY_TYPE_OPTIONS;

  const openTransactionDetails = (entry: ResellerLedgerEntry) => {
    hapticSelection();
    setSelectedTransaction(entry);
  };

  const openEntrySheet = (entryType: ResellerLedgerEntryType) => {
    if (!basicBooksAllowed && !advancedBooksAllowed) {
      setStatusMessage(
        'Books is included with a KeepFlip plan. Open Plan & Billing to continue.',
      );
      return;
    }

    if (!ledgerConfigured) {
      setStatusMessage(
        'Books recording turns on after its private Appwrite ledger table is configured.',
      );
      return;
    }

    hapticSelection();
    setDraft(makeDraft(entryType));
    setFormError(null);
    setShowItemPicker(false);
    setSheetOpen(true);
  };

  const saveEntry = async () => {
    if (!userId || saving) return;

    const amountCents = centsFromLedgerAmount(draft.amount);
    if (!amountCents) {
      setFormError('Enter a valid amount from $0.01 to $10,000,000.00.');
      return;
    }

    const occurredAt = parseLedgerDate(draft.occurredOn);
    if (!occurredAt) {
      setFormError('Use a real date in YYYY-MM-DD format.');
      return;
    }

    const quantity = Number(draft.quantity);
    if (
      advancedBookkeepingConfigured &&
      draft.entryType === 'sale_proceeds' &&
      (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000)
    ) {
      setFormError('How many sold must be a whole number from 1 to 100,000.');
      return;
    }

    if (
      advancedBookkeepingConfigured &&
      draft.entryType === 'sale_proceeds' &&
      selectedItem &&
      quantity > selectedItem.quantityOnHand
    ) {
      setFormError(
        `Only ${selectedItem.quantityOnHand.toLocaleString()} unit${selectedItem.quantityOnHand === 1 ? '' : 's'
        } remain for this item.`,
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (advancedBookkeepingConfigured) {
        const advancedEventType = advancedEventTypeForLedgerEntry(draft.entryType);
        if (!advancedEventType) {
          setFormError(
            'Other income is not available in Advanced Books yet. Use a sale or a recorded cost instead.',
          );
          return;
        }
        if (
          (advancedEventType === 'sale' ||
            advancedEventType === 'inventory_purchase') &&
          !draft.itemId
        ) {
          setFormError(
            advancedEventType === 'sale'
              ? 'Choose the item that sold so KeepFlip can move its original cost.'
              : 'Choose the item you bought so KeepFlip can save its original cost.',
          );
          return;
        }
        const advancedNotes = [
          draft.channel.trim() ? `Source: ${draft.channel.trim()}` : '',
          draft.notes.trim(),
        ]
          .filter(Boolean)
          .join(' | ');
        await recordBookkeepingEvent({
          ...(advancedEventType === 'sale'
            ? { grossSaleCents: amountCents }
            : { amountCents }),
          eventType: advancedEventType,
          idempotencyKey: draft.idempotencyKey,
          itemId: draft.itemId,
          notes: advancedNotes || null,
          occurredAt,
          ...(advancedEventType === 'sale' ? { quantity } : {}),
          summary: draftDetails.label,
        });
      } else {
        await createManualLedgerEntry({
          amountCents,
          channel: draft.channel,
          entryType: draft.entryType,
          itemId: draft.itemId,
          notes: draft.notes,
          occurredAt,
          ownerId: userId,
        });
      }
      setSheetOpen(false);
      setStatusMessage(`${draftDetails.label} recorded in Books.`);
      hapticSuccess();
      recordCompletedAction();
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.bookkeepingEntryCreated, {
        amount_cents: amountCents,
        entry_type: draft.entryType,
      });
      await loadBooks(true);
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : 'KeepFlip could not save that transaction.',
      );
    } finally {
      setSaving(false);
    }
  };

  const exportLedger = async () => {
    if (!scheduleCExportAllowed) {
      setStatusMessage(
        'CSV export is included with the Serious Reseller plan. Choose Serious in Plan & Billing to unlock it.',
      );
      return;
    }

    if (!entries.length || exporting) return;

    setExporting(true);
    setStatusMessage(null);
    try {
      // Keep the app bootable for someone who has not yet installed the native
      // development build that contains Expo Sharing.
      const Sharing = await import('expo-sharing');
      const csv = buildResellerLedgerCsv(entries, inventory);
      const file = new File(
        Paths.cache,
        `keepflip-books-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      );
      file.create();
      file.write(csv);

      if (!(await Sharing.isAvailableAsync())) {
        setStatusMessage('Your CSV was prepared, but sharing is unavailable on this device.');
        return;
      }

      await Sharing.shareAsync(file.uri, {
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export KeepFlip Books',
        mimeType: 'text/csv',
      });
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.exportedScheduleC, {
        entry_count: entries.length,
        inventory_count: inventory.length,
      });
      setStatusMessage('Your Books CSV is ready to save or send.');
      hapticSuccess();
    } catch (caughtError) {
      setStatusMessage(
        caughtError instanceof Error && caughtError.message.includes('ExpoSharing')
          ? 'CSV sharing needs the latest KeepFlip Android build. Install the refreshed build, then try again.'
          : caughtError instanceof Error
            ? caughtError.message
            : 'KeepFlip could not prepare the CSV export.',
      );
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content,
        { paddingBottom: insets.bottom + 30, paddingTop: insets.top + 15, width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadBooks(true)}
            refreshing={refreshing}
            tintColor={theme.colors.scannerCyan}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { fontFamily: theme.fonts.display, fontSize: responsiveFont(10) }]}>KEEPFLIP / BOOKS</Text>
          <Text style={[styles.title, { fontFamily: theme.fonts.bold, fontSize: responsiveFont(26) }]}>Your money & items</Text>
          <Text style={[styles.subtitle, { fontFamily: theme.fonts.body, fontSize: responsiveFont(12) }]}>
            Track money in, costs, and what is tied up in your items. Estimates and asking prices stay out of
            your books.
          </Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityHint="Records a completed sale or other income."
              accessibilityRole="button"
              disabled={!ledgerConfigured}
              onPress={() => openEntrySheet('sale_proceeds')}
              style={({ pressed }) => [
                styles.primaryAction,
                !ledgerConfigured && styles.actionDisabled,
                pressed && ledgerConfigured && styles.primaryActionPressed,
              ]}>
              <IconSymbol
      color={theme.colors.textOnAccent}
                name="dollarsign.circle.fill"
                size={16}
              />
              <Text style={[styles.primaryActionText, { fontSize: responsiveFont(9) }]}>RECORD SALE</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Records a business expense or inventory cost."
              accessibilityRole="button"
              disabled={!ledgerConfigured}
              onPress={() => openEntrySheet('other_expense')}
              style={({ pressed }) => [
                styles.secondaryAction,
                !ledgerConfigured && styles.actionDisabled,
                pressed && ledgerConfigured && styles.secondaryActionPressed,
              ]}>
              <IconSymbol color={theme.colors.goldBright} name="save.fill" size={15} />
              <Text style={[styles.secondaryActionText, { fontSize: responsiveFont(9) }]}>ADD EXPENSE</Text>
            </Pressable>
          </View>
        </View>

        {setupNotice ? (
          <View style={styles.setupNotice}>
            <IconSymbol color={theme.colors.goldBright} name="lock.fill" size={16} />
            <View style={styles.noticeCopy}>
              <Text style={[styles.noticeTitle, { fontSize: responsiveFont(9) }]}>PRIVATE LEDGER SETUP NEEDED</Text>
              <Text selectable style={[styles.noticeText, { fontSize: responsiveFont(12) }]}>
                {setupNotice}
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.noticeCopy}>
              <Text style={[styles.errorTitle, { fontSize: responsiveFont(9) }]}>BOOKS COULDN’T LOAD</Text>
              <Text selectable style={[styles.errorText, { fontSize: responsiveFont(12) }]}>
                {error}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Retry loading Books"
              accessibilityRole="button"
              onPress={() => void loadBooks()}
              style={styles.retryButton}>
              <Text style={[styles.retryText, { fontSize: responsiveFont(8) }]}>RETRY</Text>
            </Pressable>
          </View>
        ) : null}

        {statusMessage ? (
          <Text accessibilityLiveRegion="polite" selectable style={[styles.statusMessage, { fontSize: responsiveFont(12) }]}>
            {statusMessage}
          </Text>
        ) : null}

        <PlaidBankConnectionCard
          automationAllowed={advancedBookkeepingConfigured}
          onBooksChanged={() => void loadBooks(true)}
        />

        <Section eyebrow="THIS MONTH" title="Money movement">
          {loading ? (
            <View style={styles.loadingLine}>
              <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
              <Text style={[styles.loadingText, { fontSize: responsiveFont(12) }]}>Loading your books</Text>
            </View>
          ) : (
            <View style={styles.metricGrid}>
              <Metric
                detail="Sales and other money recorded"
                label="MONEY IN"
                tone="cyan"
                value={formatMoney(summary.currentMonthIncomeCents)}
              />
              <Metric
                detail="Purchases, fees, and other costs"
                label="COSTS"
                value={formatMoney(summary.currentMonthExpensesCents)}
              />
              <Metric
                detail="Money in minus recorded costs"
                label="LEFT AFTER COSTS"
                tone="violet"
                value={formatSignedMoney(summary.currentMonthNetCashCents)}
              />
            </View>
          )}
        </Section>

        <Section eyebrow="ITEM HEALTH" title="What is in your items">
          <View style={styles.metricGrid}>
            <Metric
              detail="What you have paid for unsold items"
              label="CASH TIED UP"
              tone="cyan"
              value={formatMoney(summary.inventoryBasisCents)}
            />
            <Metric
              detail="Linked sales after item cost and fees"
              label="TRUE ITEM PROFIT"
              value={formatSignedMoney(summary.realizedItemProfitCents)}
            />
            <Metric
              detail={
                summary.missingCostItemCount === 1
                  ? 'Saved item needs a real cost'
                  : 'Saved items need real costs'
              }
              label="ADD COSTS"
              tone="violet"
              value={String(summary.missingCostItemCount)}
            />
          </View>
          {summary.unlinkedInventoryPurchaseCents > 0 || summary.unlinkedSalesCount > 0 ? (
            <Text selectable style={[styles.summaryNote, { fontSize: responsiveFont(11) }]}>
              {summary.unlinkedInventoryPurchaseCents > 0
                ? `${formatMoney(summary.unlinkedInventoryPurchaseCents)} of inventory cost is not linked to an item. `
                : ''}
              {summary.unlinkedSalesCount > 0
                ? `${summary.unlinkedSalesCount} sale${summary.unlinkedSalesCount === 1 ? '' : 's'} cannot be included in item-level profit until linked.`
                : ''}
            </Text>
          ) : null}
        </Section>

        <Section
          action={
            <View style={styles.ledgerActions}>
              <Pressable
                accessibilityHint="Opens every recorded Books transaction with search and filters."
                accessibilityRole="button"
                onPress={() => router.push('/books-records' as Href)}
                style={({ pressed }) => [
                  styles.recordsButton,
                  pressed && styles.recordsButtonPressed,
                ]}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="rectangle.stack.fill"
                  size={14}
                />
                <Text style={[styles.exportButtonText, { fontSize: responsiveFont(8) }]}>ALL RECORDS</Text>
              </Pressable>
              <Pressable
                accessibilityHint={
                  scheduleCExportAllowed
                    ? 'Creates a CSV of every recorded Books entry.'
                    : 'Requires the Serious Reseller plan.'
                }
                accessibilityRole="button"
                disabled={!entries.length || exporting}
                onPress={() => void exportLedger()}
                style={({ pressed }) => [
                  styles.exportButton,
                  (!entries.length || exporting) && styles.exportButtonDisabled,
                  pressed && entries.length > 0 && !exporting && styles.exportButtonPressed,
                ]}>
                {exporting ? (
                  <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
                ) : (
                  <Text style={[styles.exportButtonText, { fontSize: responsiveFont(8) }]}>
                    {scheduleCExportAllowed ? 'EXPORT CSV' : 'SERIOUS CSV'}
                  </Text>
                )}
              </Pressable>
            </View>
          }
          eyebrow="LEDGER"
          title="Recent activity">
          {loading ? (
            <View style={styles.loadingLine}>
              <ActivityIndicator color={theme.colors.goldBright} size="small" />
              <Text style={[styles.loadingText, { fontSize: responsiveFont(12) }]}>Reading transaction history</Text>
            </View>
          ) : entries.length ? (
            <View style={styles.transactionList}>
              {entries.slice(0, 18).map((entry) => (
                <TransactionRow
                  entry={entry}
                  inventoryNames={inventoryNames}
                  key={entry.id}
                  onPress={() => openTransactionDetails(entry)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyLedger}>
              <Text style={[styles.emptyLedgerTitle, { fontSize: responsiveFont(14) }]}>No money events recorded yet</Text>
              <Text style={[styles.emptyLedgerText, { fontSize: responsiveFont(12) }]}>
                Start with an actual sale, the cost of inventory, marketplace fees,
                shipping, or supplies.
              </Text>
            </View>
          )}
        </Section>

        <View style={styles.disclaimer}>
          <Text selectable style={[styles.disclaimerText, { fontSize: responsiveFont(10) }]}>
            Books is a cash-basis reseller record and CSV export—not tax filing or
            tax advice. Review your records and reporting treatment with a qualified
            professional.
          </Text>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedTransaction(null)}
        transparent
        visible={selectedTransaction != null}>
        <View style={styles.transactionDetailModalRoot}>
          <Pressable
            accessibilityLabel="Close transaction details"
            accessibilityRole="button"
            onPress={() => setSelectedTransaction(null)}
            style={styles.modalDismiss}
          />
          {selectedTransaction ? (
            <View
              style={[
                styles.transactionDetailSheet,
                { paddingBottom: Math.max(insets.bottom + 16, 24) },
              ]}>
              <View style={styles.transactionDetailHeader}>
                <View style={styles.transactionDetailHeaderCopy}>
                  <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>BOOKS / TRANSACTION</Text>
                  <Text style={[styles.transactionDetailTitle, { fontSize: responsiveFont(22) }]}>
                    {ledgerEntryDetails(selectedTransaction.entryType).label}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close transaction details"
                  accessibilityRole="button"
                  onPress={() => setSelectedTransaction(null)}
                  style={styles.closeButton}>
                  <IconSymbol color={theme.colors.cream} name="xmark" size={18} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.transactionDetailContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.transactionDetailAmountCard}>
                  <Text style={[styles.transactionDetailAmountLabel, { fontSize: responsiveFont(8) }]}>
                    {selectedTransaction.direction === 'income'
                      ? 'MONEY IN'
                      : 'MONEY OUT'}
                  </Text>
                  <Text
                    selectable
                    style={[
                      styles.transactionDetailAmount,
                      selectedTransaction.direction === 'income'
                        ? styles.transactionAmountIncome
                        : styles.transactionAmountExpense,
                    ]}>
                    {selectedTransaction.direction === 'income' ? '+' : '−'}
                    {formatMoney(selectedTransaction.amountCents)}
                  </Text>
                  <Text style={[styles.transactionDetailDirection, { fontSize: responsiveFont(11) }]}>
                    {selectedTransaction.direction === 'income'
                      ? 'Income'
                      : 'Expense'}{' '}
                    · {selectedTransaction.currency}
                  </Text>
                </View>

                <View style={styles.transactionDetailSection}>
                  <Text style={[styles.transactionDetailSectionTitle, { fontSize: responsiveFont(8) }]}>DETAILS</Text>
                  <TransactionDetailRow
                    label="Date"
                    value={fullDate(selectedTransaction.occurredAt)}
                  />
                  <TransactionDetailRow
                    label="Source"
                    value={
                      selectedTransaction.channel ||
                      (selectedTransaction.source === 'migration'
                        ? 'KeepFlip Books'
                        : selectedTransaction.source.replace(/_/g, ' '))
                    }
                  />
                  <TransactionDetailRow
                    label="Linked item"
                    value={
                      selectedTransactionItem?.title ||
                      (selectedTransaction.itemId
                        ? 'Item ' + selectedTransaction.itemId
                        : null)
                    }
                  />
                  <TransactionDetailRow
                    label="Notes"
                    value={selectedTransaction.notes}
                  />
                  <TransactionDetailRow
                    label="External ID"
                    value={selectedTransaction.externalId}
                  />
                  <TransactionDetailRow
                    label="Sale group"
                    value={selectedTransaction.saleGroupId}
                  />
                  <TransactionDetailRow
                    label="Receipt file"
                    value={selectedTransaction.receiptFileId}
                  />
                </View>

                <View style={styles.transactionDetailSection}>
                  <Text style={[styles.transactionDetailSectionTitle, { fontSize: responsiveFont(8) }]}>RECORD</Text>
                  <TransactionDetailRow
                    label="Transaction ID"
                    value={selectedTransaction.id}
                  />
                  <TransactionDetailRow
                    label="Recorded"
                    value={fullDate(selectedTransaction.createdAt)}
                  />
                  {selectedTransaction.updatedAt !== selectedTransaction.createdAt ? (
                    <TransactionDetailRow
                      label="Last updated"
                      value={fullDate(selectedTransaction.updatedAt)}
                    />
                  ) : null}
                  {selectedTransaction.voidedAt ? (
                    <TransactionDetailRow
                      label="Voided"
                      value={fullDate(selectedTransaction.voidedAt)}
                    />
                  ) : null}
                </View>

                <Text style={[styles.transactionDetailHint, { fontSize: responsiveFont(10) }]}>
                  This is the recorded Books transaction. Estimates, asking prices,
                  and projected profit are not included here.
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
        transparent
        visible={sheetOpen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close transaction form"
            accessibilityRole="button"
            onPress={() => setSheetOpen(false)}
            style={styles.modalDismiss}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>MANUAL MONEY EVENT</Text>
                <Text style={[styles.sheetTitle, { fontSize: responsiveFont(22) }]}>Record transaction</Text>
              </View>
              <Pressable
                accessibilityLabel="Close transaction form"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setSheetOpen(false)}
                style={styles.closeButton}>
                <IconSymbol color={theme.colors.cream} name="xmark" size={18} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>WHAT HAPPENED</Text>
                <View style={styles.typeOptions}>
                  {availableEntryTypeOptions.map((entryType) => {
                    const selected = draft.entryType === entryType;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={entryType}
                        onPress={() => {
                          hapticSelection();
                          setDraft((current) => ({ ...current, entryType }));
                        }}
                        style={[
                          styles.typeOption,
                          selected && styles.typeOptionSelected,
                        ]}>
                        <Text
                          style={[
                            styles.typeOptionText,
                            selected && styles.typeOptionTextSelected,
                          ]}>
                          {ledgerEntryDetails(entryType).shortLabel.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.typeHelp}>
                  {draftDetails.direction === 'income'
                    ? 'Income increases cash in Books.'
                    : 'Expenses reduce cash in Books.'}
                </Text>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldWide}>
                  <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>
                    {draft.entryType === 'sale_proceeds'
                      ? 'GROSS PAID BY BUYER'
                      : 'AMOUNT'}
                  </Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      accessibilityLabel="Transaction amount"
                      autoCorrect={false}
                      keyboardType="decimal-pad"
                      maxLength={13}
                      onChangeText={(amount) =>
                        setDraft((current) => ({ ...current, amount }))
                      }
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.amountInput}
                      value={draft.amount}
                    />
                  </View>
                </View>
                <View style={styles.formFieldDate}>
                  <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>DATE</Text>
                  <TextInput
                    accessibilityLabel="Transaction date in year month day format"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={10}
                    onChangeText={(occurredOn) =>
                      setDraft((current) => ({ ...current, occurredOn }))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.dateInput}
                    value={draft.occurredOn}
                  />
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>
                  {draft.entryType === 'sale_proceeds' ? 'SALE CHANNEL' : 'SOURCE / CHANNEL'}
                </Text>
                <TextInput
                  accessibilityLabel="Transaction source or sales channel"
                  autoCapitalize="words"
                  maxLength={64}
                  onChangeText={(channel) =>
                    setDraft((current) => ({ ...current, channel }))
                  }
                  placeholder={
                    draft.entryType === 'sale_proceeds'
                      ? 'eBay, local sale, Poshmark…'
                      : 'Thrift store, eBay, shipping…'
                  }
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.textInput}
                  value={draft.channel}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>INVENTORY ITEM (OPTIONAL)</Text>
                <Pressable
                  accessibilityHint="Links this transaction to a saved inventory item."
                  accessibilityRole="button"
                  onPress={() => {
                    hapticSelection();
                    setShowItemPicker((visible) => !visible);
                  }}
                  style={({ pressed }) => [
                    styles.itemPickerButton,
                    pressed && styles.itemPickerButtonPressed,
                  ]}>
                  <View style={styles.itemPickerCopy}>
                    <Text numberOfLines={1} style={[styles.itemPickerTitle, { fontSize: responsiveFont(13) }]}>
                      {selectedItem?.title ?? 'No item linked'}
                    </Text>
                    <Text style={[styles.itemPickerDetail, { fontSize: responsiveFont(10) }]}>
                      Link sales and related costs to calculate item-level profit.
                    </Text>
                  </View>
                  <IconSymbol
                    color={theme.colors.goldMuted}
                    name="chevron.right"
                    size={17}
                    style={showItemPicker ? styles.itemPickerChevronOpen : undefined}
                  />
                </Pressable>

                {showItemPicker ? (
                  <View style={styles.itemOptions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: !draft.itemId }}
                      onPress={() => {
                        setDraft((current) => ({ ...current, itemId: null }));
                        setShowItemPicker(false);
                      }}
                      style={styles.itemOption}>
                      <Text style={[styles.itemOptionText, { fontSize: responsiveFont(12) }]}>No item linked</Text>
                    </Pressable>
                    {inventory.length ? (
                      inventory.map((item) => {
                        const selected = draft.itemId === item.id;
                        const itemCostCents = resolvedInventoryCostCents(item);
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            key={item.id}
                            onPress={() => {
                              setDraft((current) => ({ ...current, itemId: item.id }));
                              setShowItemPicker(false);
                            }}
                            style={[
                              styles.itemOption,
                              selected && styles.itemOptionSelected,
                            ]}>
                            <Text numberOfLines={1} style={[styles.itemOptionText, { fontSize: responsiveFont(12) }]}>
                              {item.title}
                            </Text>
                            {itemCostCents > 0 ? (
                              <Text style={styles.itemOptionCost}>
                                {formatMoney(itemCostCents)}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })
                    ) : (
                      <Text style={[styles.noItemText, { fontSize: responsiveFont(12) }]}>
                        No inventory items are available to link yet.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>

              {advancedBookkeepingConfigured && draft.entryType === 'sale_proceeds' ? (
                <View style={styles.formSection}>
                  <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>HOW MANY SOLD?</Text>
                  <TextInput
                    accessibilityLabel="Number of inventory units sold"
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={(quantity) =>
                      setDraft((current) => ({ ...current, quantity }))
                    }
                    placeholder="1"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.textInput}
                    value={draft.quantity}
                  />
                  {selectedItem ? (
                    <Text style={styles.typeHelp}>
                      {selectedItem.quantityOnHand.toLocaleString()} on hand. KeepFlip moves
                      only this many units of cost into your sold cost.
                    </Text>
                  ) : (
                    <Text style={styles.typeHelp}>
                      Choose an item above so KeepFlip can move the right cost into your sold
                      cost.
                    </Text>
                  )}
                </View>
              ) : null}

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { fontSize: responsiveFont(8) }]}>NOTE (OPTIONAL)</Text>
                <TextInput
                  accessibilityLabel="Transaction note"
                  maxLength={2000}
                  multiline
                  onChangeText={(notes) =>
                    setDraft((current) => ({ ...current, notes }))
                  }
                  placeholder="Order number, lot detail, reason for expense…"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.textInput, styles.notesInput]}
                  textAlignVertical="top"
                  value={draft.notes}
                />
              </View>

              {formError ? (
                <Text accessibilityLiveRegion="polite" selectable style={[styles.formError, { fontSize: responsiveFont(12) }]}>
                  {formError}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: saving, disabled: saving }}
                disabled={saving}
                onPress={() => void saveEntry()}
                style={({ pressed }) => [
                  styles.saveButton,
                  saving && styles.saveButtonDisabled,
                  pressed && !saving && styles.saveButtonPressed,
                ]}>
                {saving ? (
                  <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
                ) : (
                  <Text style={[styles.saveButtonText, { fontSize: responsiveFont(10) }]}>RECORD TRANSACTION</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: {
      alignSelf: 'center',
      gap: 26,
      maxWidth: 720,
      paddingHorizontal: 18,
      width: '100%',
    },
    header: { gap: 7 },
    eyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.8,
    },
    title: {
      color: theme.colors.cream,
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: -0.65,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      maxWidth: 510,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      marginTop: 9,
    },
    ledgerActions: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      justifyContent: 'flex-end',
    },
    primaryAction: {
      alignItems: 'center',
      backgroundColor: theme.colors.scannerCyan,
      borderRadius: 10,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 43,
      paddingHorizontal: 14,
    },
    primaryActionPressed: { opacity: 0.82 },
    primaryActionText: {
      color: theme.colors.textOnAccent,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.95,
    },
    secondaryAction: {
      alignItems: 'center',
      backgroundColor: theme.colors.iconSurfaceGold,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 43,
      paddingHorizontal: 14,
    },
    secondaryActionPressed: { backgroundColor: theme.colors.iconSurfaceGold },
    secondaryActionText: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.95,
    },
    actionDisabled: { opacity: 0.42 },
    setupNotice: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.iconSurfaceGold,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      padding: 13,
    },
    noticeCopy: { flex: 1, gap: 3 },
    noticeTitle: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1,
    },
    noticeText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
    errorCard: {
      alignItems: 'center',
      backgroundColor: theme.colors.dangerSurface,
      borderColor: theme.colors.danger,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      padding: 13,
    },
    errorTitle: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1,
    },
    errorText: { color: theme.colors.text, fontSize: 12, lineHeight: 17 },
    retryButton: {
      alignItems: 'center',
      borderColor: theme.colors.danger,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      minHeight: 34,
      paddingHorizontal: 10,
    },
    retryText: {
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    statusMessage: { color: theme.colors.scannerCyan, fontSize: 12, lineHeight: 17 },
    section: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 13,
      paddingTop: 17,
    },
    sectionHeader: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 14,
      justifyContent: 'space-between',
    },
    sectionHeading: { gap: 2 },
    sectionEyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.25,
    },
    sectionTitle: {
      color: theme.colors.cream,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    loadingLine: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 9,
      minHeight: 84,
    },
    loadingText: { color: theme.colors.textMuted, fontSize: 12 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    metric: {
      backgroundColor: theme.colors.card,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 150,
      padding: 12,
    },
    metricGold: { borderColor: theme.colors.accentGoldBorder },
    metricCyan: { borderColor: theme.colors.accentCyanBorder },
    metricViolet: { borderColor: theme.colors.accentVioletBorder },
    metricLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.95,
    },
    metricValue: {
      color: theme.colors.cream,
      fontSize: 21,
      fontVariant: ['tabular-nums'],
      fontWeight: '800',
      letterSpacing: -0.45,
      marginTop: 5,
    },
    metricDetail: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 3,
    },
    summaryNote: { color: theme.colors.goldBright, fontSize: 11, lineHeight: 16 },
    exportButton: {
      alignItems: 'center',
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      minHeight: 32,
      minWidth: 86,
      paddingHorizontal: 9,
    },
    exportButtonDisabled: { opacity: 0.35 },
    exportButtonPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    recordsButton: {
      alignItems: 'center',
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 5,
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: 9,
    },
    recordsButtonPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    exportButtonText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    transactionList: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    transactionRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 67,
      paddingHorizontal: 2,
      paddingVertical: 9,
    },
    transactionRowPressed: {
      backgroundColor: theme.colors.cardSoft,
    },
    transactionMarker: { borderRadius: 2, height: 25, width: 3 },
    transactionMarkerIncome: { backgroundColor: theme.colors.scannerCyan },
    transactionMarkerExpense: { backgroundColor: theme.colors.gold },
    transactionCopy: { flex: 1, gap: 2, minWidth: 0 },
    transactionTitle: { color: theme.colors.cream, fontSize: 13, fontWeight: '700' },
    transactionSecondary: { color: theme.colors.textMuted, fontSize: 11 },
    transactionTertiary: { color: theme.colors.textMuted, fontSize: 10 },
    transactionAmountColumn: { alignItems: 'flex-end', gap: 3 },
    transactionAmount: { fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '800' },
    transactionAmountIncome: { color: theme.colors.scannerCyan },
    transactionAmountExpense: { color: theme.colors.goldBright },
    transactionSource: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    emptyLedger: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 4,
      minHeight: 108,
      justifyContent: 'center',
      padding: 14,
    },
    emptyLedgerTitle: { color: theme.colors.cream, fontSize: 14, fontWeight: '700' },
    emptyLedgerText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      maxWidth: 430,
    },
    disclaimer: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 14,
    },
    disclaimerText: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
      maxWidth: 560,
    },
    transactionDetailModalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    transactionDetailSheet: {
      alignSelf: 'center',
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.accentCyanBorder,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      maxHeight: '84%',
      maxWidth: 720,
      paddingHorizontal: 18,
      paddingTop: 17,
      width: '100%',
    },
    transactionDetailHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    transactionDetailHeaderCopy: { flex: 1, gap: 2 },
    transactionDetailTitle: {
      color: theme.colors.cream,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    transactionDetailContent: {
      gap: 14,
      paddingBottom: 4,
    },
    transactionDetailAmountCard: {
      backgroundColor: theme.colors.iconSurfaceCyan,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 3,
      padding: 14,
    },
    transactionDetailAmountLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1,
    },
    transactionDetailAmount: {
      fontSize: 27,
      fontVariant: ['tabular-nums'],
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    transactionDetailDirection: {
      color: theme.colors.textMuted,
      fontSize: 11,
    },
    transactionDetailSection: {
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    transactionDetailSectionTitle: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1,
      paddingBottom: 7,
      paddingHorizontal: 12,
      paddingTop: 11,
    },
    transactionDetailRow: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    transactionDetailLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.75,
      textTransform: 'uppercase',
    },
    transactionDetailValue: {
      color: theme.colors.cream,
      fontSize: 12,
      lineHeight: 17,
    },
    transactionDetailHint: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
    },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalDismiss: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.scrim },
    sheet: {
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.accentVioletBorder,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      maxHeight: '95%',
      paddingHorizontal: 18,
      paddingTop: 17,
    },
    sheetHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    sheetTitle: {
      color: theme.colors.cream,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    closeButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    sheetContent: { gap: 17, paddingBottom: 4 },
    formSection: { gap: 7 },
    formLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1,
    },
    typeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    typeOption: {
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 7,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 29,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    typeOptionSelected: {
      backgroundColor: theme.colors.iconSurfaceCyan,
      borderColor: theme.colors.accentCyanBorder,
    },
    typeOptionText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    typeOptionTextSelected: { color: theme.colors.scannerCyan },
    typeHelp: { color: theme.colors.textMuted, fontSize: 11 },
    formRow: { flexDirection: 'row', gap: 9 },
    formFieldWide: { flex: 1.2, gap: 7 },
    formFieldDate: { flex: 1, gap: 7 },
    amountInputWrap: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      height: 45,
      paddingHorizontal: 11,
    },
    currencyPrefix: {
      color: theme.colors.goldBright,
      fontSize: 16,
      fontWeight: '700',
      marginRight: 3,
    },
    amountInput: {
      color: theme.colors.cream,
      flex: 1,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      padding: 0,
    },
    dateInput: {
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.cream,
      fontSize: 13,
      height: 45,
      paddingHorizontal: 10,
    },
    textInput: {
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: theme.colors.cream,
      fontSize: 13,
      minHeight: 45,
      paddingHorizontal: 11,
      paddingVertical: 11,
    },
    notesInput: { minHeight: 84 },
    itemPickerButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 8,
      minHeight: 53,
      paddingHorizontal: 11,
    },
    itemPickerButtonPressed: { backgroundColor: theme.colors.cardSoft },
    itemPickerCopy: { flex: 1, gap: 2, minWidth: 0 },
    itemPickerTitle: { color: theme.colors.cream, fontSize: 13, fontWeight: '700' },
    itemPickerDetail: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    itemPickerChevronOpen: { transform: [{ rotate: '90deg' }] },
    itemOptions: {
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.accentVioletBorder,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      maxHeight: 230,
      overflow: 'hidden',
    },
    itemOption: {
      alignItems: 'center',
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 8,
      minHeight: 42,
      paddingHorizontal: 11,
    },
    itemOptionSelected: { backgroundColor: theme.colors.iconSurfaceCyan },
    itemOptionText: { color: theme.colors.cream, flex: 1, fontSize: 12 },
    itemOptionCost: {
      color: theme.colors.goldBright,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    noItemText: { color: theme.colors.textMuted, fontSize: 12, padding: 11 },
    formError: { color: theme.colors.danger, fontSize: 12, lineHeight: 17 },
    saveButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.scannerCyan,
      borderRadius: 9,
      justifyContent: 'center',
      minHeight: 48,
      marginTop: 2,
    },
    saveButtonDisabled: { opacity: 0.55 },
    saveButtonPressed: { opacity: 0.82 },
    saveButtonText: {
      color: theme.colors.textOnAccent,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(28),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    primaryActionText: [
      staticStyles.primaryActionText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    secondaryActionText: [
      staticStyles.secondaryActionText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    noticeTitle: [
      staticStyles.noticeTitle,
      {
        fontSize: responsiveFont(9),
      },
    ],
    noticeText: [
      staticStyles.noticeText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    errorTitle: [
      staticStyles.errorTitle,
      {
        fontSize: responsiveFont(9),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    retryText: [
      staticStyles.retryText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    statusMessage: [
      staticStyles.statusMessage,
      {
        fontSize: responsiveFont(12),
      },
    ],
    sectionEyebrow: [
      staticStyles.sectionEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    sectionTitle: [
      staticStyles.sectionTitle,
      {
        fontSize: responsiveFont(17),
      },
    ],
    loadingText: [
      staticStyles.loadingText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    metricLabel: [
      staticStyles.metricLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    metricValue: [
      staticStyles.metricValue,
      {
        fontSize: responsiveFont(21),
      },
    ],
    metricDetail: [
      staticStyles.metricDetail,
      {
        fontSize: responsiveFont(10),
      },
    ],
    summaryNote: [
      staticStyles.summaryNote,
      {
        fontSize: responsiveFont(11),
      },
    ],
    exportButtonText: [
      staticStyles.exportButtonText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    transactionMarker: [
      staticStyles.transactionMarker,
      {
        height: responsiveHeight(25),
        width: responsiveWidth(3),
      },
    ],
    transactionTitle: [
      staticStyles.transactionTitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    transactionSecondary: [
      staticStyles.transactionSecondary,
      {
        fontSize: responsiveFont(11),
      },
    ],
    transactionTertiary: [
      staticStyles.transactionTertiary,
      {
        fontSize: responsiveFont(10),
      },
    ],
    transactionAmount: [
      staticStyles.transactionAmount,
      {
        fontSize: responsiveFont(13),
      },
    ],
    transactionSource: [
      staticStyles.transactionSource,
      {
        fontSize: responsiveFont(7),
      },
    ],
    emptyLedgerTitle: [
      staticStyles.emptyLedgerTitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    emptyLedgerText: [
      staticStyles.emptyLedgerText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    disclaimerText: [
      staticStyles.disclaimerText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    transactionDetailTitle: [
      staticStyles.transactionDetailTitle,
      {
        fontSize: responsiveFont(22),
      },
    ],
    transactionDetailAmountLabel: [
      staticStyles.transactionDetailAmountLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    transactionDetailAmount: [
      staticStyles.transactionDetailAmount,
      {
        fontSize: responsiveFont(27),
      },
    ],
    transactionDetailDirection: [
      staticStyles.transactionDetailDirection,
      {
        fontSize: responsiveFont(11),
      },
    ],
    transactionDetailSectionTitle: [
      staticStyles.transactionDetailSectionTitle,
      {
        fontSize: responsiveFont(8),
      },
    ],
    transactionDetailLabel: [
      staticStyles.transactionDetailLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    transactionDetailValue: [
      staticStyles.transactionDetailValue,
      {
        fontSize: responsiveFont(12),
      },
    ],
    transactionDetailHint: [
      staticStyles.transactionDetailHint,
      {
        fontSize: responsiveFont(10),
      },
    ],
    sheetTitle: [
      staticStyles.sheetTitle,
      {
        fontSize: responsiveFont(22),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        height: responsiveHeight(34),
        width: responsiveWidth(34),
      },
    ],
    formLabel: [
      staticStyles.formLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    typeOptionText: [
      staticStyles.typeOptionText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    typeHelp: [
      staticStyles.typeHelp,
      {
        fontSize: responsiveFont(11),
      },
    ],
    amountInputWrap: [
      staticStyles.amountInputWrap,
      {
        height: responsiveHeight(45),
      },
    ],
    currencyPrefix: [
      staticStyles.currencyPrefix,
      {
        fontSize: responsiveFont(16),
      },
    ],
    amountInput: [
      staticStyles.amountInput,
      {
        fontSize: responsiveFont(17),
      },
    ],
    dateInput: [
      staticStyles.dateInput,
      {
        fontSize: responsiveFont(13),
        height: responsiveHeight(45),
      },
    ],
    textInput: [
      staticStyles.textInput,
      {
        fontSize: responsiveFont(13),
      },
    ],
    itemPickerTitle: [
      staticStyles.itemPickerTitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    itemPickerDetail: [
      staticStyles.itemPickerDetail,
      {
        fontSize: responsiveFont(10),
      },
    ],
    itemOptionText: [
      staticStyles.itemOptionText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    itemOptionCost: [
      staticStyles.itemOptionCost,
      {
        fontSize: responsiveFont(11),
      },
    ],
    noItemText: [
      staticStyles.noItemText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    formError: [
      staticStyles.formError,
      {
        fontSize: responsiveFont(12),
      },
    ],
    saveButtonText: [
      staticStyles.saveButtonText,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}
