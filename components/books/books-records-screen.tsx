import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  getBookkeepingOverview,
  isResellerBookkeepingConfigured,
  type BookkeepingMoneyEvent,
} from '@/services/reseller-bookkeeping-service';
import {
  isResellerBooksConfigured,
  ledgerEntryDetails,
  listResellerLedgerEntries,
  RESELLER_LEDGER_ENTRY_TYPES,
  type ResellerLedgerDirection,
  type ResellerLedgerEntry,
  type ResellerLedgerEntryType,
} from '@/services/reseller-ledger-service';
import { listInventoryItems, type InventoryItem } from '@/services/inventory-service';

type DirectionFilter = 'all' | ResellerLedgerDirection;
type EntryTypeFilter = 'all' | ResellerLedgerEntryType;

const DIRECTION_FILTERS: readonly { label: string; value: DirectionFilter }[] = [
  { label: 'ALL MONEY', value: 'all' },
  { label: 'MONEY IN', value: 'income' },
  { label: 'MONEY OUT', value: 'expense' },
];

const ENTRY_TYPE_FILTERS: readonly {
  label: string;
  value: EntryTypeFilter;
}[] = [
  { label: 'ALL TYPES', value: 'all' },
  ...RESELLER_LEDGER_ENTRY_TYPES.map((entryType) => ({
    label: ledgerEntryDetails(entryType).shortLabel.toUpperCase(),
    value: entryType,
  })),
];

function formatMoney(cents: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      currency,
      style: 'currency',
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
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

function shortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function FilterChip({
  label,
  onPress,
  selected,
  styles,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  styles: RecordsStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.filterChipPressed,
      ]}>
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecordRow({
  entry,
  itemName,
  onPress,
  styles,
}: {
  entry: ResellerLedgerEntry;
  itemName: string | null;
  onPress: () => void;
  styles: RecordsStyles;
}) {
  const details = ledgerEntryDetails(entry.entryType);
  const isIncome = entry.direction === 'income';
  const secondary = [
    shortDate(entry.occurredAt),
    entry.channel,
    itemName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityHint="Opens the complete transaction record."
      accessibilityLabel={`${details.label}, ${formatMoney(entry.amountCents, entry.currency)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recordRow,
        pressed && styles.recordRowPressed,
      ]}>
      <View
        style={[
          styles.recordMarker,
          isIncome ? styles.recordMarkerIncome : styles.recordMarkerExpense,
        ]}
      />
      <View style={styles.recordDateColumn}>
        <Text style={styles.recordDate}>{shortDate(entry.occurredAt)}</Text>
        <Text style={styles.recordSource}>{entry.source.toUpperCase()}</Text>
      </View>
      <View style={styles.recordCopy}>
        <Text numberOfLines={1} style={styles.recordTitle}>
          {details.label}
        </Text>
        <Text numberOfLines={1} style={styles.recordSecondary}>
          {entry.notes || secondary || 'Recorded Books transaction'}
        </Text>
      </View>
      <View style={styles.recordAmountColumn}>
        <Text
          style={[
            styles.recordAmount,
            isIncome ? styles.recordAmountIncome : styles.recordAmountExpense,
          ]}>
          {isIncome ? '+' : '−'}
          {formatMoney(entry.amountCents, entry.currency)}
        </Text>
        <Text style={styles.recordDirection}>
          {isIncome ? 'IN' : 'OUT'}
        </Text>
      </View>
      <IconSymbol color={theme.colors.textMuted} name="chevron.right" size={14} />
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string | null | undefined;
  styles: RecordsStyles;
}) {
  if (!value) return null;

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

export function BooksRecordsScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const router = useRouter();
  const {
    contentMaxWidth,
    contentWidth,
    insets,
    pageGutter,
    responsiveFont,
  } = useResponsiveLayout();
  const { user } = useKeepFlipAuth();
  const { canUse } = useKeepFlipSubscription();
  const userId = user?.$id;
  const legacyLedgerConfigured =
    isResellerBooksConfigured() && canUse('basic_books');
  const advancedBookkeepingConfigured =
    isResellerBookkeepingConfigured() && canUse('automated_books');
  const ledgerConfigured =
    legacyLedgerConfigured || advancedBookkeepingConfigured;
  const [entries, setEntries] = useState<ResellerLedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>('all');
  const [entryTypeFilter, setEntryTypeFilter] =
    useState<EntryTypeFilter>('all');
  const [selectedEntry, setSelectedEntry] =
    useState<ResellerLedgerEntry | null>(null);

  const loadRecords = useCallback(
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
        const [inventoryResult, legacyResult, advancedResult] =
          await Promise.allSettled([
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

        setInventory(inventoryResult.value);

        if (!ledgerConfigured) {
          setEntries([]);
          setSetupNotice(
            'Deploy the private Books service and add its Function ID to this app configuration to start recording transactions.',
          );
          return;
        }

        const legacyEntries =
          legacyResult.status === 'fulfilled' ? legacyResult.value : [];
        const advancedOverview =
          advancedResult.status === 'fulfilled' ? advancedResult.value : null;
        const advancedEntries = advancedOverview
          ? bookkeepingEventsAsLedgerEntries(userId, advancedOverview.moneyEvents)
          : [];
        const notices = [
          ...(legacyLedgerConfigured && legacyResult.status === 'rejected'
            ? ['Classic Books history could not load right now.']
            : []),
          ...(advancedBookkeepingConfigured && advancedResult.status === 'rejected'
            ? ['Advanced Books could not load right now.']
            : []),
          ...(advancedOverview?.truncated
            ? ['Advanced Books marked some older records as outside this response.']
            : []),
        ];

        setSetupNotice(notices.length ? notices.join(' ') : null);
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
            : 'KeepFlip could not load every transaction record right now.',
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
      void loadRecords();
    }, [loadRecords]),
  );

  const inventoryNames = useMemo(
    () => new Map(inventory.map((item) => [item.id, item.title])),
    [inventory],
  );
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (
        directionFilter !== 'all' &&
        entry.direction !== directionFilter
      ) {
        return false;
      }
      if (entryTypeFilter !== 'all' && entry.entryType !== entryTypeFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      const itemName = entry.itemId ? inventoryNames.get(entry.itemId) : null;
      const details = ledgerEntryDetails(entry.entryType);
      const searchableText = [
        details.label,
        details.shortLabel,
        entry.direction,
        entry.channel,
        entry.source,
        entry.notes,
        entry.externalId,
        entry.saleGroupId,
        entry.itemId,
        itemName,
        entry.currency,
        entry.occurredAt,
        String(entry.amountCents / 100),
        formatMoney(entry.amountCents, entry.currency),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [directionFilter, entries, entryTypeFilter, inventoryNames, query]);

  const selectedItemName = selectedEntry?.itemId
    ? inventoryNames.get(selectedEntry.itemId) ?? null
    : null;

  return (
    <KeepFlipBackground>
      <FlatList
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 28,
            paddingTop: insets.top + 12,
            width: contentWidth,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: pageGutter,
          },
        ]}
        data={filteredEntries}
        keyExtractor={(entry) => entry.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
              <Text style={styles.emptyStateText}>Reading every transaction record</Text>
            </View>
          ) : entries.length ? (
            <View style={styles.emptyState}>
              <IconSymbol color={theme.colors.goldBright} name="magnifyingglass" size={22} />
              <Text style={styles.emptyStateTitle}>No matching records</Text>
              <Text style={styles.emptyStateText}>
                Try a different search term or clear one of the filters.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No transactions recorded yet</Text>
              <Text style={styles.emptyStateText}>
                Your complete Books history will appear here after you record a sale,
                purchase, fee, shipping cost, or other business transaction.
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: '78%' }}>
              <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>BOOKS / RECORDS</Text>
              <Text style={styles.headerCount}>
                {loading ? 'LOADING' : `${filteredEntries.length} / ${entries.length}`}
              </Text>
            </View>
            <Text style={[styles.title, { fontSize: responsiveFont(26) }]}>Every transaction</Text>
            <Text style={[styles.subtitle, { fontFamily: theme.fonts.display, fontSize: responsiveFont(12) }]}>Search and filter your complete recorded money history. Tap any row for the full record.</Text>

            {error ? (
              <View style={styles.errorCard}>
                <IconSymbol color={theme.colors.danger} name="exclamationmark.triangle.fill" size={18} />
                <Text selectable style={styles.errorText}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadRecords(true)}
                  style={styles.retryButton}>
                  <Text style={styles.retryText}>RETRY</Text>
                </Pressable>
              </View>
            ) : null}

            {setupNotice ? (
              <View style={styles.noticeCard}>
                <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={18} />
                <Text selectable style={styles.noticeText}>{setupNotice}</Text>
              </View>
            ) : null}

            <View style={styles.searchBar}>
              <IconSymbol color={theme.colors.textMuted} name="magnifyingglass" size={18} />
              <TextInput
                accessibilityLabel="Search transaction records"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Search notes, channel, item, amount…"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
                value={query}
              />
              {query ? (
                <Pressable
                  accessibilityLabel="Clear transaction search"
                  accessibilityRole="button"
                  onPress={() => setQuery('')}
                  style={styles.clearSearchButton}>
                  <IconSymbol color={theme.colors.textMuted} name="xmark" size={16} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.filterLabel}>MONEY FLOW</Text>
            <ScrollView
              contentContainerStyle={styles.filterRow}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {DIRECTION_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.value}
                  label={filter.label}
                  onPress={() => {
                    hapticSelection();
                    setDirectionFilter(filter.value);
                  }}
                  selected={directionFilter === filter.value}
                  styles={styles}
                />
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>TRANSACTION TYPE</Text>
            <ScrollView
              contentContainerStyle={styles.filterRow}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {ENTRY_TYPE_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.value}
                  label={filter.label}
                  onPress={() => {
                    hapticSelection();
                    setEntryTypeFilter(filter.value);
                  }}
                  selected={entryTypeFilter === filter.value}
                  styles={styles}
                />
              ))}
            </ScrollView>

            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>DATE</Text>
              <Text style={[styles.tableHeaderText, styles.tableHeaderEntry]}>TRANSACTION</Text>
              <Text style={styles.tableHeaderText}>AMOUNT</Text>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadRecords(true)}
            refreshing={refreshing}
            tintColor={theme.colors.scannerCyan}
          />
        }
        renderItem={({ item }) => (
          <RecordRow
            entry={item}
            itemName={item.itemId ? inventoryNames.get(item.itemId) ?? null : null}
            onPress={() => {
              hapticSelection();
              setSelectedEntry(item);
            }}
            styles={styles}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
        transparent
        visible={selectedEntry != null}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close transaction record"
            accessibilityRole="button"
            onPress={() => setSelectedEntry(null)}
            style={styles.modalDismiss}
          />
          {selectedEntry ? (
            <View
              style={[
                styles.detailSheet,
                { paddingBottom: Math.max(insets.bottom + 16, 24) },
              ]}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderCopy}>
                  <Text style={styles.detailEyebrow}>BOOKS / RECORD</Text>
                  <Text style={styles.detailTitle}>
                    {ledgerEntryDetails(selectedEntry.entryType).label}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close transaction record"
                  accessibilityRole="button"
                  onPress={() => setSelectedEntry(null)}
                  style={styles.closeButton}>
                  <IconSymbol color={theme.colors.cream} name="xmark" size={18} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.detailScrollContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.detailAmountCard}>
                  <Text style={styles.detailAmountLabel}>
                    {selectedEntry.direction === 'income' ? 'MONEY IN' : 'MONEY OUT'}
                  </Text>
                  <Text
                    selectable
                    style={[
                      styles.detailAmount,
                      selectedEntry.direction === 'income'
                        ? styles.recordAmountIncome
                        : styles.recordAmountExpense,
                    ]}>
                    {selectedEntry.direction === 'income' ? '+' : '−'}
                    {formatMoney(selectedEntry.amountCents, selectedEntry.currency)}
                  </Text>
                  <Text style={styles.detailDirection}>
                    {selectedEntry.currency} · {fullDate(selectedEntry.occurredAt)}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>DETAILS</Text>
                  <DetailRow label="Date" value={fullDate(selectedEntry.occurredAt)} styles={styles} />
                  <DetailRow
                    label="Source"
                    value={
                      selectedEntry.channel ||
                      (selectedEntry.source === 'migration'
                        ? 'KeepFlip Books'
                        : selectedEntry.source.replace(/_/g, ' '))
                    }
                    styles={styles}
                  />
                  <DetailRow label="Linked item" value={selectedItemName} styles={styles} />
                  <DetailRow label="Notes" value={selectedEntry.notes} styles={styles} />
                  <DetailRow label="External ID" value={selectedEntry.externalId} styles={styles} />
                  <DetailRow label="Sale group" value={selectedEntry.saleGroupId} styles={styles} />
                  <DetailRow label="Receipt file" value={selectedEntry.receiptFileId} styles={styles} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>RECORD</Text>
                  <DetailRow label="Transaction ID" value={selectedEntry.id} styles={styles} />
                  <DetailRow label="Recorded" value={fullDate(selectedEntry.createdAt)} styles={styles} />
                  {selectedEntry.updatedAt !== selectedEntry.createdAt ? (
                    <DetailRow label="Last updated" value={fullDate(selectedEntry.updatedAt)} styles={styles} />
                  ) : null}
                  {selectedEntry.voidedAt ? (
                    <DetailRow label="Voided" value={fullDate(selectedEntry.voidedAt)} styles={styles} />
                  ) : null}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </KeepFlipBackground>
  );
}

type RecordsStyles = ReturnType<typeof createResponsiveStyles>;

function createResponsiveStyles(
  responsiveLayout: ReturnType<typeof useResponsiveLayout>,
) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;

  return StyleSheet.create({
    content: {
      gap: 10,
    },
    headerBlock: {
      gap: 12,
    },
    topBar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 36,
    },
    backButton: {
      alignItems: 'center',
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 5,
      minHeight: 34,
      paddingHorizontal: 9,
    },
    backButtonPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    backButtonText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    headerCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    eyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(9),
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    title: {
      color: theme.colors.cream,
      fontSize: responsiveFont(26),
      fontWeight: '900',
      letterSpacing: -0.65,
      marginTop: -5,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: responsiveFont(12),
      lineHeight: responsiveHeight(18),
      maxWidth: 560,
    },
    errorCard: {
      alignItems: 'center',
      backgroundColor: theme.colors.dangerSurface,
      borderColor: theme.colors.danger,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 9,
      padding: 12,
    },
    errorText: {
      color: theme.colors.text,
      flex: 1,
      fontSize: responsiveFont(11),
      lineHeight: responsiveHeight(16),
    },
    retryButton: {
      alignItems: 'center',
      borderColor: theme.colors.danger,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: 9,
    },
    retryText: {
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    noticeCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.iconSurfaceGold,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 9,
      padding: 12,
    },
    noticeText: {
      color: theme.colors.textMuted,
      flex: 1,
      fontSize: responsiveFont(11),
      lineHeight: responsiveHeight(16),
    },
    searchBar: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 8,
      minHeight: 47,
      paddingHorizontal: 12,
    },
    searchInput: {
      color: theme.colors.text,
      flex: 1,
      fontSize: responsiveFont(12),
      minHeight: 42,
      paddingVertical: 0,
    },
    clearSearchButton: {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    filterLabel: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 1.1,
      marginTop: 2,
    },
    filterRow: {
      gap: 7,
      paddingRight: 8,
    },
    filterChip: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: 11,
    },
    filterChipSelected: {
      backgroundColor: theme.colors.iconSurfaceCyan,
      borderColor: theme.colors.accentCyanBorder,
    },
    filterChipPressed: { opacity: 0.78 },
    filterChipText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    filterChipTextSelected: { color: theme.colors.scannerCyan },
    tableHeader: {
      alignItems: 'center',
      borderBottomColor: theme.colors.dividerStrong,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.dividerStrong,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 9,
      marginTop: 3,
      minHeight: 32,
      paddingHorizontal: 2,
    },
    tableHeaderText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: '900',
      letterSpacing: 0.75,
      width: responsiveWidth(74),
    },
    tableHeaderEntry: { flex: 1, width: undefined },
    recordRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.divider,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 9,
      minHeight: 70,
      paddingHorizontal: 2,
      paddingVertical: 9,
    },
    recordRowPressed: { backgroundColor: theme.colors.cardSoft },
    recordMarker: { borderRadius: 2, height: 30, width: 3 },
    recordMarkerIncome: { backgroundColor: theme.colors.scannerCyan },
    recordMarkerExpense: { backgroundColor: theme.colors.gold },
    recordDateColumn: {
      gap: 3,
      width: responsiveWidth(74),
    },
    recordDate: {
      color: theme.colors.text,
      fontSize: responsiveFont(10),
      fontWeight: '700',
    },
    recordSource: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(6),
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    recordCopy: { flex: 1, gap: 3, minWidth: 0 },
    recordTitle: {
      color: theme.colors.cream,
      fontSize: responsiveFont(12),
      fontWeight: '700',
    },
    recordSecondary: {
      color: theme.colors.textMuted,
      fontSize: responsiveFont(10),
    },
    recordAmountColumn: {
      alignItems: 'flex-end',
      gap: 3,
      minWidth: responsiveWidth(84),
    },
    recordAmount: {
      fontSize: responsiveFont(11),
      fontVariant: ['tabular-nums'],
      fontWeight: '800',
    },
    recordAmountIncome: { color: theme.colors.scannerCyan },
    recordAmountExpense: { color: theme.colors.goldBright },
    recordDirection: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(6),
      fontWeight: '900',
      letterSpacing: 0.75,
    },
    emptyState: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.divider,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 7,
      justifyContent: 'center',
      minHeight: 160,
      padding: 18,
    },
    emptyStateTitle: {
      color: theme.colors.cream,
      fontSize: responsiveFont(14),
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyStateText: {
      color: theme.colors.textMuted,
      fontSize: responsiveFont(11),
      lineHeight: responsiveHeight(16),
      maxWidth: 440,
      textAlign: 'center',
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalDismiss: StyleSheet.absoluteFill,
    detailSheet: {
      alignSelf: 'center',
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.accentCyanBorder,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 15,
      maxHeight: '86%',
      maxWidth: 720,
      paddingHorizontal: 18,
      paddingTop: 17,
      width: '100%',
    },
    detailScrollContent: {
      gap: 15,
      paddingBottom: 4,
    },
    detailHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    detailHeaderCopy: { flex: 1, gap: 2 },
    detailEyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    detailTitle: {
      color: theme.colors.cream,
      fontSize: responsiveFont(21),
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    closeButton: {
      alignItems: 'center',
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    detailAmountCard: {
      backgroundColor: theme.colors.iconSurfaceCyan,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 4,
      padding: 14,
    },
    detailAmountLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 1,
    },
    detailAmount: {
      fontSize: responsiveFont(25),
      fontVariant: ['tabular-nums'],
      fontWeight: '900',
    },
    detailDirection: {
      color: theme.colors.textMuted,
      fontSize: responsiveFont(11),
    },
    detailSection: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 10,
      paddingTop: 13,
    },
    detailSectionTitle: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: '900',
      letterSpacing: 1,
    },
    detailRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 12,
    },
    detailLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: '900',
      letterSpacing: 0.65,
      paddingTop: 2,
      width: responsiveWidth(86),
    },
    detailValue: {
      color: theme.colors.text,
      flex: 1,
      fontSize: responsiveFont(11),
      lineHeight: responsiveHeight(16),
    },
  });
}
