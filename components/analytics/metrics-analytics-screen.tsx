import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { SellerOrderPerformanceInput } from '@/lib/seller-performance';
import {
  buildSellerAnalyticsGroups,
  buildSellerAnalyticsMargins,
  type SellerAnalyticsDimension,
  type SellerAnalyticsGroup,
  type SellerAnalyticsMetric,
} from '@/lib/seller-analytics';
import { checkKeepFlipCapabilitiesAccess } from '@/services/keepflip-subscription-service';
import {
  listInventoryItemsForAnalytics,
  type InventoryItem,
} from '@/services/inventory-service';
import {
  isResellerBooksConfigured,
  listResellerLedgerEntries,
  type ResellerLedgerEntry,
} from '@/services/reseller-ledger-service';
import { getEbayOAuthEnvironment } from '@/services/ebayConnectionService';
import {
  fetchEbaySellerOrders,
  listManualSellerOrders,
  matchEbayOrderLinesToInventory,
  type EbaySellerOrder,
  type SellerOrder,
} from '@/services/seller-order-service';

const MAX_SELECTED_METRICS = 3;
const MAX_EBAY_ORDER_PAGES = 5;

const DIMENSIONS: { id: SellerAnalyticsDimension; label: string }[] = [
  { id: 'category', label: 'Item category' },
  { id: 'source', label: 'Purchase source' },
  { id: 'condition', label: 'Condition' },
];

const METRICS: {
  id: SellerAnalyticsMetric;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
}[] = [
  {
    id: 'roi',
    label: 'Average ROI',
    shortLabel: 'ROI',
    description: 'Average realized return on recorded acquisition cost.',
    accent: theme.colors.scannerCyan,
  },
  {
    id: 'profit',
    label: 'Net profit',
    shortLabel: 'Profit',
    description: 'Realized profit across cost-confirmed items.',
    accent: theme.colors.goldBright,
  },
  {
    id: 'listingDays',
    label: 'Days listed',
    shortLabel: 'Days listed',
    description: 'Time from listing to sale, or current listing age.',
    accent: theme.colors.scannerViolet,
  },
  {
    id: 'soldUnits',
    label: 'Units sold',
    shortLabel: 'Units',
    description: 'Units in matched manual and eBay orders.',
    accent: theme.colors.goldMuted,
  },
];

type AnalyticsLoadState = 'checking' | 'ready' | 'locked' | 'error';
type FinancialDataState = 'ready' | 'unavailable' | 'error';

function message(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
}

function useMetricsStyles() {
  const { appliedColorScheme } = useKeepFlipAppearance();
  return useMemo(() => {
    void appliedColorScheme;
    return createMetricsStyles();
  }, [appliedColorScheme]);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatMetricValue(metric: SellerAnalyticsMetric, value: number) {
  if (metric === 'roi') return `${value.toFixed(1)}%`;
  if (metric === 'profit') return formatMoney(value);
  if (metric === 'listingDays') return `${value.toFixed(1)} days`;
  return `${Math.round(value)} ${Math.round(value) === 1 ? 'unit' : 'units'}`;
}

function formatAxisValue(metric: SellerAnalyticsMetric, value: number) {
  if (metric === 'roi') return `${Math.round(value)}%`;
  if (metric === 'profit') return formatMoney(value);
  if (metric === 'listingDays') return `${Math.round(value)}d`;
  return `${Math.round(value)}`;
}

function performanceInputs(
  inventory: InventoryItem[],
  manualOrders: SellerOrder[],
  ebayOrders: EbaySellerOrder[],
): SellerOrderPerformanceInput[] {
  const manual = manualOrders.map((order) => ({
    id: order.id,
    sourceItemId: order.sourceItemId,
    quantity: order.quantity,
    soldPriceCents: order.soldPriceCents,
    listPriceCents: order.listPriceCents,
    refundCents: order.refundCents,
    soldAt: order.soldAt,
  }));
  const matchedEbay = matchEbayOrderLinesToInventory(ebayOrders, inventory);
  const ebay = matchedEbay.flatMap((order) =>
    order.lineItems.map((line) => ({
      id: line.externalLineKey,
      sourceItemId: line.itemId,
      quantity: line.quantity ?? 1,
      soldPriceCents: line.sale?.amountCents ?? line.total?.amountCents ?? null,
      listPriceCents: null,
      refundCents: order.refundsCents,
      soldAt: order.soldAt,
    })),
  );
  const manualSaleKeys = new Set(
    manual
      .map((order) => {
        if (!order.sourceItemId || !order.soldAt || order.soldPriceCents == null) return null;
        return `${order.sourceItemId}|${order.soldAt.slice(0, 10)}|${order.quantity}|${order.soldPriceCents}`;
      })
      .filter((key): key is string => key !== null),
  );
  const nonDuplicateEbay = ebay.filter((order) => {
    if (!order.sourceItemId || !order.soldAt || order.soldPriceCents == null) return true;
    const key = `${order.sourceItemId}|${order.soldAt.slice(0, 10)}|${order.quantity}|${order.soldPriceCents}`;
    return !manualSaleKeys.has(key);
  });
  return [...manual, ...nonDuplicateEbay];
}

async function loadEbayOrderSnapshot(enabled: boolean) {
  if (!enabled) return { orders: [] as EbaySellerOrder[], truncated: false };

  const orders: EbaySellerOrder[] = [];
  let offset = 0;
  let hasMore = false;
  for (let pageNumber = 0; pageNumber < MAX_EBAY_ORDER_PAGES; pageNumber += 1) {
    const page = await fetchEbaySellerOrders({
      environment: getEbayOAuthEnvironment(),
      limit: 100,
      offset,
    });
    orders.push(...page.orders);
    if (!page.nextCursor || page.nextCursor.offset <= offset) {
      hasMore = false;
      break;
    }
    offset = page.nextCursor.offset;
    hasMore = true;
  }
  return { orders, truncated: hasMore };
}

function MetricPill({
  selected,
  title,
  detail,
  color,
  onPress,
}: {
  selected: boolean;
  title: string;
  detail?: string;
  color?: string;
  onPress: () => void;
}) {
  const styles = useMetricsStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        selected && color ? { borderColor: color, backgroundColor: `${color}1A` } : null,
        pressed && styles.pillPressed,
      ]}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{title}</Text>
      {detail ? <Text style={styles.pillDetail}>{detail}</Text> : null}
    </Pressable>
  );
}

function ChartCard({
  metric,
  groups,
  responsiveFont,
}: {
  metric: (typeof METRICS)[number];
  groups: SellerAnalyticsGroup[];
  responsiveFont: (size: number) => number;
}) {
  const styles = useMetricsStyles();
  const allValues = groups
    .map((group) => ({ group, value: group.metrics[metric.id] }))
    .filter((entry): entry is { group: SellerAnalyticsGroup; value: number } => entry.value !== null);
  const values = [...allValues]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 8);
  const maxAbs = Math.max(1, ...values.map(({ value }) => Math.abs(value)));
  const hasNegative = values.some(({ value }) => value < 0);
  const positiveColor = metric.accent;

  let summary = 'No data yet';
  if (allValues.length) {
    if (metric.id === 'profit') {
      const total = allValues.reduce((sum, entry) => sum + entry.value, 0);
      summary = `${formatMoney(total)} across ${allValues.reduce((sum, entry) => sum + entry.group.samples.profit, 0)} cost-confirmed items`;
    } else if (metric.id === 'soldUnits') {
      const total = allValues.reduce((sum, entry) => sum + entry.value, 0);
      summary = `${Math.round(total)} units sold`;
    } else {
      const samples = allValues.reduce((sum, entry) => sum + entry.group.samples[metric.id], 0);
      const weightedTotal = allValues.reduce(
        (sum, entry) => sum + entry.value * Math.max(1, entry.group.samples[metric.id]),
        0,
      );
      const average = weightedTotal / Math.max(1, samples);
      summary = `${formatMetricValue(metric.id, average)} average across ${samples} ${metric.id === 'listingDays' ? 'listed/sold units' : 'cost-confirmed items'}`;
    }
  }

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.chartCard}>
      <View style={styles.chartHeading}>
        <View style={[styles.metricMark, { backgroundColor: metric.accent }]} />
        <View style={styles.chartTitleBlock}>
          <Text accessibilityRole="header" style={[styles.chartTitle, { fontSize: responsiveFont(15) }]}>
            {metric.label}
          </Text>
          <Text style={styles.chartSummary} selectable>{summary}</Text>
        </View>
      </View>
      <Text style={styles.chartDescription}>{metric.description}</Text>

      {values.length ? (
        <View style={styles.chartRows}>
          {values.map(({ group, value }) => {
            const width = Math.max(1, (Math.abs(value) / maxAbs) * 50);
            const negative = value < 0;
            return (
              <View key={group.key} style={styles.chartRow}>
                <Text numberOfLines={1} style={styles.chartLabel}>{group.label}</Text>
                <View style={styles.track}>
                  <View style={styles.trackCenter} />
                  <View
                    style={[
                      styles.bar,
                      {
                        backgroundColor: negative ? theme.colors.danger : positiveColor,
                        left: negative ? `${50 - width}%` : '50%',
                        width: `${width}%`,
                      },
                    ]}
                  />
                </View>
                <Text selectable style={[styles.chartValue, { fontSize: responsiveFont(10) }]}>
                  {formatMetricValue(metric.id, value)}
                </Text>
              </View>
            );
          })}
          <View style={styles.axisRow}>
            <Text style={styles.axisText}>{hasNegative ? formatAxisValue(metric.id, -maxAbs) : ''}</Text>
            <Text style={styles.axisText}>0</Text>
            <Text style={styles.axisText}>{formatAxisValue(metric.id, maxAbs)}</Text>
          </View>
          {groups.length > values.length ? (
            <Text style={styles.chartFootnote}>Showing the 8 largest groups by magnitude.</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.chartEmpty}>
          <IconSymbol color={theme.colors.textMuted} name="chart.bar.fill" size={19} />
          <Text style={styles.chartEmptyText}>
            {metric.id === 'roi' || metric.id === 'profit'
              ? 'No reconciled Books records with a known acquisition cost yet.'
              : metric.id === 'listingDays'
                ? 'Add a listing date and record a sale, or keep an item actively listed, to see listing days.'
                : 'Matched sales will appear here after an order is linked to inventory.'}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export function MetricsAnalyticsScreen() {
  const styles = useMetricsStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();
  const { user } = useKeepFlipAuth();
  const ownerId = user?.$id;
  const requestId = useRef(0);
  const [loadState, setLoadState] = useState<AnalyticsLoadState>('checking');
  const [accessError, setAccessError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryTruncated, setInventoryTruncated] = useState(false);
  const [manualOrders, setManualOrders] = useState<SellerOrder[]>([]);
  const [ebayOrders, setEbayOrders] = useState<EbaySellerOrder[]>([]);
  const [ebayOrdersTruncated, setEbayOrdersTruncated] = useState(false);
  const [ledger, setLedger] = useState<ResellerLedgerEntry[]>([]);
  const [financialDataState, setFinancialDataState] = useState<FinancialDataState>('unavailable');
  const [dimension, setDimension] = useState<SellerAnalyticsDimension>('category');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<SellerAnalyticsMetric[]>(['roi', 'listingDays']);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    const activeRequestId = ++requestId.current;
    const isCurrent = () => requestId.current === activeRequestId;

    if (!ownerId) {
      setLoading(false);
      setLoadState('error');
      setLoadError('Sign in to see your inventory analytics.');
      return;
    }

    setLoading(true);
    setLoadError('');
    setAccessError('');
    try {
      const access = await checkKeepFlipCapabilitiesAccess([
        'seller_analytics',
        'basic_books',
        'automatic_order_sync',
      ]);
      if (!isCurrent()) return;
      if (access.seller_analytics?.allowed !== true) {
        setLoadState('locked');
        setInventory([]);
        setManualOrders([]);
        setEbayOrders([]);
        setLedger([]);
        setLoading(false);
        return;
      }

      setLoadState('ready');
      const booksReady = access.basic_books?.allowed === true && isResellerBooksConfigured();
      setFinancialDataState(booksReady ? 'ready' : 'unavailable');

      const results = await Promise.allSettled([
        listInventoryItemsForAnalytics(ownerId),
        listManualSellerOrders(ownerId),
        booksReady ? listResellerLedgerEntries(ownerId) : Promise.resolve([] as ResellerLedgerEntry[]),
        loadEbayOrderSnapshot(access.automatic_order_sync?.allowed === true),
      ]);
      if (!isCurrent()) return;

      const nextWarnings: string[] = [];
      const inventoryResult = results[0];
      if (inventoryResult.status !== 'fulfilled') {
        throw inventoryResult.reason;
      }
      setInventory(inventoryResult.value.items);
      setInventoryTotal(inventoryResult.value.total);
      setInventoryTruncated(inventoryResult.value.truncated);

      const ordersResult = results[1];
      if (ordersResult.status === 'fulfilled') setManualOrders(ordersResult.value);
      else {
        setManualOrders([]);
        nextWarnings.push(message(ordersResult.reason, 'Manual sales could not be loaded.'));
      }

      const ledgerResult = results[2];
      if (booksReady && ledgerResult.status === 'fulfilled') {
        setLedger(ledgerResult.value);
        setFinancialDataState('ready');
      } else {
        setLedger([]);
        if (booksReady && ledgerResult.status === 'rejected') {
          setFinancialDataState('error');
          nextWarnings.push('Books data could not be loaded; ROI and realized profit are unavailable until it is refreshed.');
        } else {
          setFinancialDataState('unavailable');
        }
      }

      const ebayResult = results[3];
      if (ebayResult.status === 'fulfilled') {
        setEbayOrders(ebayResult.value.orders);
        setEbayOrdersTruncated(ebayResult.value.truncated);
      }
      else {
        setEbayOrders([]);
        setEbayOrdersTruncated(false);
        nextWarnings.push('eBay sales could not be loaded. Showing other linked sales where available.');
      }
      if (ebayResult.status === 'fulfilled' && ebayResult.value.truncated) {
        nextWarnings.push('Showing the latest 500 eBay orders; older eBay sales are not included in these charts.');
      }
      if (!booksReady) {
        nextWarnings.push('Books is not available in this build or plan, so ROI and net profit cannot be calculated.');
      }
      setWarnings(nextWarnings);
      setLoadState('ready');
      setLoading(false);
    } catch (cause) {
      if (!isCurrent()) return;
      const errorMessage = message(cause, 'KeepFlip could not load your analytics.');
      if (errorMessage.includes('access') || errorMessage.includes('subscription')) {
        setAccessError(errorMessage);
      } else {
        setLoadError(errorMessage);
      }
      setLoadState('error');
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadAnalytics());
    return () => {
      cancelAnimationFrame(frame);
      requestId.current += 1;
    };
  }, [loadAnalytics]);

  const orders = useMemo(
    () => performanceInputs(inventory, manualOrders, ebayOrders),
    [ebayOrders, inventory, manualOrders],
  );
  const margins = useMemo(
    () => buildSellerAnalyticsMargins(inventory, ledger),
    [inventory, ledger],
  );
  const groups = useMemo(
    () => buildSellerAnalyticsGroups({
      inventory,
      margins,
      orders,
      dimension,
      categoryFilter,
    }),
    [categoryFilter, dimension, inventory, margins, orders],
  );
  const categories = useMemo(
    () => [...new Set(inventory.map((item) => item.category.trim() || 'Uncategorized'))]
      .sort((left, right) => left.localeCompare(right)),
    [inventory],
  );

  function toggleMetric(metric: SellerAnalyticsMetric) {
    hapticSelection();
    setSelectedMetrics((current) => {
      if (current.includes(metric)) return current.filter((candidate) => candidate !== metric);
      if (current.length >= MAX_SELECTED_METRICS) return current;
      return [...current, metric];
    });
  }

  const chartMetrics = METRICS.filter((metric) => selectedMetrics.includes(metric.id));
  const inventoryIds = useMemo(() => new Set(inventory.map((item) => item.id)), [inventory]);
  const totalSoldUnits = orders.reduce(
    (total, order) =>
      total + (order.sourceItemId && inventoryIds.has(order.sourceItemId) && order.quantity > 0 ? order.quantity : 0),
    0,
  );
  const activeListings = inventory.filter((item) => item.isListed).length;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 15, paddingBottom: insets.bottom + 30 },
        ]}
        style={{marginTop: insets.top, marginBottom: insets.bottom}}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(10)}]}>KEEPFLIP / PERFORMANCE</Text>
            <Text accessibilityRole="header" style={[styles.title, { fontSize: responsiveFont(26) }]}>
              Inventory analytics
            </Text>
            <Text style={[styles.intro, { fontSize: responsiveFont(12), fontFamily: theme.fonts.body }]}>Compare how your flips perform across categories, sourcing channels, and item condition.</Text>
          </View>
        </View>

        {loadState === 'checking' || loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.scannerCyan} />
            <Text style={styles.loadingText}>Loading your saved inventory and sales history…</Text>
          </View>
        ) : null}

        {loadState === 'error' ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{loadError || accessError || 'Analytics could not be loaded.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadAnalytics()} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {loadState === 'locked' ? (
          <View style={styles.lockedCard}>
            <View style={styles.lockIcon}>
              <IconSymbol color={theme.colors.goldBright} name="lock.fill" size={20} />
            </View>
            <Text accessibilityRole="header" style={styles.lockedTitle}>A clearer view of your flips</Text>
            <Text style={styles.lockedCopy}>Detailed performance charts are included with Serious Reseller. Your access is checked securely each time this screen opens.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account?tab=subscription' as Href)}
              style={styles.actionButton}>
              <Text style={styles.actionButtonText}>View plans</Text>
              <IconSymbol color={theme.colors.backgroundDeep} name="chevron.right" size={16} />
            </Pressable>
          </View>
        ) : null}

        {loadState === 'ready' && !loading ? (
          <>
            {warnings.map((warning) => (
              <View key={warning} style={styles.warningCard}>
                <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={16} />
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>ITEMS LOADED</Text>
                <Text selectable style={[styles.summaryValue, { fontSize: responsiveFont(20) }]}>{inventory.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>ACTIVE LISTINGS</Text>
                <Text selectable style={[styles.summaryValue, { fontSize: responsiveFont(20) }]}>{activeListings}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>LINKED UNITS SOLD</Text>
                <Text selectable style={[styles.summaryValue, { fontSize: responsiveFont(20) }]}>{totalSoldUnits}</Text>
              </View>
            </View>

            {inventory.length === 0 ? (
              <View style={styles.messageCard}>
                <Text style={styles.chartEmptyText}>Save your first item to start comparing performance across your inventory.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/scanner' as Href)} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Open scanner</Text>
                  <IconSymbol color={theme.colors.backgroundDeep} name="chevron.right" size={16} />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.controlsCard}>
              <Text style={styles.sectionEyebrow}>CHOOSE YOUR VIEW</Text>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Break down by</Text>
              <View style={styles.pillWrap}>
                {DIMENSIONS.map((option) => (
                  <MetricPill
                    key={option.id}
                    selected={dimension === option.id}
                    title={option.label}
                    onPress={() => {
                      hapticSelection();
                      setDimension(option.id);
                    }}
                  />
                ))}
              </View>

              <View style={styles.divider} />
              <Text style={styles.sectionEyebrow}>FILTER CATEGORY</Text>
              <ScrollView horizontal contentContainerStyle={styles.horizontalPills} showsHorizontalScrollIndicator={false}>
                <MetricPill
                  selected={categoryFilter === null}
                  title="All"
                  onPress={() => {
                    hapticSelection();
                    setCategoryFilter(null);
                  }}
                />
                {categories.map((category) => (
                  <MetricPill
                    key={category}
                    selected={categoryFilter === category}
                    title={category}
                    onPress={() => {
                      hapticSelection();
                      setCategoryFilter(category);
                    }}
                  />
                ))}
              </ScrollView>

              <View style={styles.divider} />
              <View style={styles.metricSelectionHeading}>
                <View>
                  <Text style={styles.sectionEyebrow}>METRICS</Text>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Show up to 3</Text>
                </View>
                <Text style={styles.selectionCount}>{selectedMetrics.length}/{MAX_SELECTED_METRICS}</Text>
              </View>
              <Text style={styles.selectionHint}>
                {selectedMetrics.length === MAX_SELECTED_METRICS
                  ? 'Three selected. Turn one off to choose a different metric.'
                  : 'Pick up to 3 so you can compare the charts together.'}
              </Text>
              <View style={styles.pillWrap}>
                {METRICS.map((metric) => (
                  <MetricPill
                    key={metric.id}
                    color={metric.accent}
                    selected={selectedMetrics.includes(metric.id)}
                    title={metric.shortLabel}
                    onPress={() => toggleMetric(metric.id)}
                  />
                ))}
              </View>
            </View>

            {selectedMetrics.length === 0 ? (
              <View style={styles.messageCard}>
                <Text style={styles.chartEmptyText}>Choose at least one metric above to build your chart.</Text>
              </View>
            ) : (
              chartMetrics.map((metric) => (
                <ChartCard
                  key={metric.id}
                  metric={metric}
                  groups={groups}
                  responsiveFont={responsiveFont}
                />
              ))
            )}

            <View style={styles.dataNote}>
              <IconSymbol color={theme.colors.scannerCyan} name="checkmark.shield.fill" size={16} />
              <Text style={styles.dataNoteText}>
                ROI and net profit use reconciled Books records and known acquisition costs only. Days listed uses the saved listing date through sale, or through today for an active listing. Estimated resale values are not counted as earned revenue.
              </Text>
            </View>
            <Text style={styles.footerText}>
              {inventoryTruncated
                ? `Charts use the ${inventory.length.toLocaleString()} most recent of ${inventoryTotal.toLocaleString()} items; older inventory is not included.`
                : ebayOrdersTruncated
                  ? 'The eBay order history is capped at its latest 500 records.'
                : financialDataState === 'ready'
                ? 'Saved-history view · Refresh to check for newer inventory, Books, and order records.'
                : financialDataState === 'error'
                  ? 'Books history is temporarily unavailable; refresh to try again.'
                  : 'Saved-history view · ROI and net-profit records are unavailable until Books is ready.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createMetricsStyles() {
  return StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 14,
    paddingHorizontal: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  headerCopy: { flex: 1, gap: 2 },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(242, 211, 138, 0.08)',
    borderColor: 'rgba(242, 211, 138, 0.2)',
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  refreshButton: {
    alignItems: 'center',
    borderColor: 'rgba(242, 211, 138, 0.24)',
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontWeight: '900', letterSpacing: -0.4 },
  intro: { color: theme.colors.textMuted, fontFamily: theme.fonts.display, lineHeight: 19, maxWidth: 360 },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(88, 223, 232, 0.22)',
    borderCurve: 'continuous',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 16,
  },
  loadingText: { color: theme.colors.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
  messageCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderCurve: 'continuous',
    borderRadius: 17,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  errorText: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
  lockedCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(242, 211, 138, 0.055)',
    borderColor: 'rgba(242, 211, 138, 0.22)',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  lockIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(242, 211, 138, 0.12)',
    borderRadius: 11,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  lockedTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  lockedCopy: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.goldBright,
    borderCurve: 'continuous',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  actionButtonText: { color: theme.colors.backgroundDeep, fontSize: 12, fontWeight: '900' },
  warningCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(242, 211, 138, 0.055)',
    borderColor: 'rgba(242, 211, 138, 0.16)',
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 11,
  },
  warningText: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 15 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    minHeight: 77,
    padding: 10,
  },
  summaryLabel: { color: theme.colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  summaryValue: { color: theme.colors.text, fontVariant: ['tabular-nums'], fontWeight: '900' },
  controlsCard: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderCurve: 'continuous',
    borderRadius: 17,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  sectionEyebrow: { color: theme.colors.goldMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  sectionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '900' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  horizontalPills: { gap: 7, paddingRight: 4 },
  pill: {
    alignItems: 'center',
    backgroundColor: 'rgba(3, 3, 6, 0.62)',
    borderColor: 'rgba(242, 211, 138, 0.17)',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  pillSelected: { backgroundColor: 'rgba(242, 211, 138, 0.11)', borderColor: theme.colors.goldMuted },
  pillPressed: { opacity: 0.78 },
  pillText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' },
  pillTextSelected: { color: theme.colors.text },
  pillDetail: { color: theme.colors.textMuted, fontSize: 9 },
  divider: { backgroundColor: 'rgba(255,255,255,0.08)', height: StyleSheet.hairlineWidth, marginVertical: 2 },
  metricSelectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectionCount: { color: theme.colors.scannerCyan, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '800' },
  selectionHint: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14 },
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.11)',
    borderCurve: 'continuous',
    borderRadius: 17,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  chartHeading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  metricMark: { borderRadius: 4, height: 10, width: 10 },
  chartTitleBlock: { flex: 1, gap: 2 },
  chartTitle: { color: theme.colors.text, fontWeight: '900' },
  chartSummary: { color: theme.colors.text, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '800' },
  chartDescription: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14 },
  chartRows: { gap: 10, paddingTop: 4 },
  chartRow: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 25 },
  chartLabel: { color: theme.colors.textMuted, fontSize: 9, width: 78 },
  track: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 4,
    flex: 1,
    height: 13,
    overflow: 'hidden',
  },
  trackCenter: { backgroundColor: 'rgba(255,255,255,0.35)', height: '100%', left: '50%', position: 'absolute', width: StyleSheet.hairlineWidth },
  bar: { borderRadius: 4, height: '100%', position: 'absolute' },
  chartValue: { color: theme.colors.text, fontVariant: ['tabular-nums'], fontWeight: '800', textAlign: 'right', width: 72 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 84, paddingRight: 79 },
  axisText: { color: theme.colors.textMuted, fontSize: 8, fontVariant: ['tabular-nums'] },
  chartFootnote: { color: theme.colors.textMuted, fontSize: 9, textAlign: 'right' },
  chartEmpty: {
    alignItems: 'center',
    backgroundColor: 'rgba(3, 3, 6, 0.42)',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  chartEmptyText: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 15 },
  dataNote: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(88, 223, 232, 0.055)',
    borderColor: 'rgba(88, 223, 232, 0.15)',
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  dataNoteText: { color: theme.colors.textMuted, flex: 1, fontSize: 9, lineHeight: 14 },
  footerText: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  });
}
