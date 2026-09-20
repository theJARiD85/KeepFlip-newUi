import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LineChart } from 'react-native-wagmi-charts';
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

const MAX_EBAY_ORDER_PAGES = 5;

const DIMENSIONS: { id: SellerAnalyticsDimension; label: string }[] = [
  { id: 'category', label: 'Item category' },
  { id: 'source', label: 'Purchase source' },
  { id: 'condition', label: 'Condition' },
];

const METRICS: {
  id: SellerAnalyticsMetric;
  label: string;
  description: string;
  accent: 'scannerCyan' | 'goldBright' | 'scannerViolet' | 'goldMuted';
}[] = [
  {
    id: 'roi',
    label: 'Average ROI',
    description: 'Average realized return on recorded acquisition cost.',
    accent: 'scannerCyan',
  },
  {
    id: 'profit',
    label: 'Net profit',
    description: 'Realized profit across cost-confirmed items.',
    accent: 'goldBright',
  },
  {
    id: 'listingDays',
    label: 'Days listed',
    description: 'Time from listing to sale, or current listing age.',
    accent: 'scannerViolet',
  },
  {
    id: 'soldUnits',
    label: 'Units sold',
    description: 'Units in matched manual and eBay orders.',
    accent: 'goldMuted',
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

function getMetricAccent(metric: (typeof METRICS)[number]) {
  return theme.colors[metric.accent];
}

function formatMetricValue(metric: SellerAnalyticsMetric, value: number) {
  if (metric === 'roi') return `${value.toFixed(1)}%`;
  if (metric === 'profit') return formatMoney(value);
  if (metric === 'listingDays') return `${value.toFixed(1)} days`;
  return `${Math.round(value)} ${Math.round(value) === 1 ? 'unit' : 'units'}`;
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
  const { width: windowWidth } = useWindowDimensions();
  const allValues = groups
    .map((group) => ({ group, value: group.metrics[metric.id] }))
    .filter((entry): entry is { group: SellerAnalyticsGroup; value: number } => entry.value !== null);
  const values = [...allValues]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 8);
  const chartData = values.map(({ group, value }, index) => ({
    timestamp: Date.UTC(2024, 0, index + 1),
    value: metric.id === 'profit' ? value / 100 : value,
    group,
  }));
  const chartValues = chartData.map(({ value }) => value);
  const chartMin = Math.min(0, ...chartValues);
  const chartMax = Math.max(0, ...chartValues);
  const chartRange = Math.max(chartMax - chartMin, 1);
  const chartPadding = chartRange * 0.14;
  const chartWidth = Math.min(Math.max(windowWidth - 64, 230), 720);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, values.length - 1));

  useEffect(() => {
    setActiveIndex(Math.max(0, values.length - 1));
  }, [metric.id, values.length]);

  const selectedIndex = Math.min(Math.max(activeIndex, 0), Math.max(values.length - 1, 0));
  const selectedEntry = values[selectedIndex];

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
        <View style={[styles.metricMark, { backgroundColor: getMetricAccent(metric) }]} />
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
          <LineChart.Provider
            data={chartData}
            onCurrentIndexChange={setActiveIndex}
            yRange={{ min: chartMin - chartPadding, max: chartMax + chartPadding }}
          >
            <LineChart width={chartWidth} height={220}>
              <LineChart.Path color={getMetricAccent(metric)} width={3}>
                <LineChart.Gradient color={getMetricAccent(metric)} />
                <LineChart.HorizontalLine at={{ value: 0 }} color={theme.colors.dividerStrong} />
                <LineChart.Dot
                  at={selectedIndex}
                  color={getMetricAccent(metric)}
                  hasOuterDot
                  outerSize={9}
                  size={4}
                />
              </LineChart.Path>
              <LineChart.CursorLine color={theme.colors.textMuted} persistOnEnd>
                <LineChart.Tooltip
                  position="top"
                  textProps={{ precision: metric.id === 'profit' ? 0 : 1 }}
                  textStyle={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}
                />
              </LineChart.CursorLine>
            </LineChart>
          </LineChart.Provider>

          <View style={styles.chartAxisLabels}>
            <Text numberOfLines={1} style={styles.chartAxisLabel}>{values[0]?.group.label}</Text>
            {values.length > 2 ? (
              <Text numberOfLines={1} style={[styles.chartAxisLabel, styles.chartAxisLabelCenter]}>
                {values[Math.floor((values.length - 1) / 2)]?.group.label}
              </Text>
            ) : null}
            {values.length > 1 ? (
              <Text numberOfLines={1} style={[styles.chartAxisLabel, styles.chartAxisLabelRight]}>
                {values[values.length - 1]?.group.label}
              </Text>
            ) : null}
          </View>

          {selectedEntry ? (
            <View style={styles.selectedPointCard}>
              <Text style={styles.selectedPointLabel}>{selectedEntry.group.label}</Text>
              <Text selectable style={[styles.selectedPointValue, { fontSize: responsiveFont(18) }]}>
                {formatMetricValue(metric.id, selectedEntry.value)}
              </Text>
              <Text style={styles.selectedPointDetail}>
                {selectedEntry.group.itemCount} {selectedEntry.group.itemCount === 1 ? 'item' : 'items'} in this group
              </Text>
            </View>
          ) : null}

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

export function MetricsAnalyticsScreen({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [activeMetric, setActiveMetric] = useState<SellerAnalyticsMetric>('roi');
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
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

  const activeMetricDefinition = METRICS.find((metric) => metric.id === activeMetric) ?? METRICS[0];
  const inventoryIds = useMemo(() => new Set(inventory.map((item) => item.id)), [inventory]);
  const totalSoldUnits = orders.reduce(
    (total, order) =>
      total + (order.sourceItemId && inventoryIds.has(order.sourceItemId) && order.quantity > 0 ? order.quantity : 0),
    0,
  );
  const activeListings = inventory.filter((item) => item.isListed).length;

  const analyticsContent = (
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 30,
            paddingTop: embedded ? 15 : insets.top + 15,
          },
        ]}
        contentInsetAdjustmentBehavior={embedded ? 'never' : 'automatic'}
        style={embedded ? undefined : { marginBottom: insets.bottom, marginTop: insets.top }}
        showsVerticalScrollIndicator={false}>
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
              <Text style={styles.sectionEyebrow}>CHART</Text>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Choose a metric</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: metricPickerOpen }}
                onPress={() => setMetricPickerOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.metricPickerTrigger,
                  pressed && styles.pillPressed,
                ]}
              >
                <View style={styles.metricPickerCopy}>
                  <View style={[styles.metricPickerDot, { backgroundColor: getMetricAccent(activeMetricDefinition) }]} />
                  <View style={styles.metricPickerTextBlock}>
                    <Text style={styles.metricPickerLabel}>{activeMetricDefinition.label}</Text>
                    <Text style={styles.metricPickerDescription}>{activeMetricDefinition.description}</Text>
                  </View>
                </View>
                <IconSymbol
                  color={theme.colors.textMuted}
                  name="chevron.right"
                  size={16}
                  style={metricPickerOpen ? { transform: [{ rotate: '90deg' }] } : undefined}
                />
              </Pressable>
              {metricPickerOpen ? (
                <View style={styles.metricPickerMenu}>
                  {METRICS.map((metric) => {
                    const selected = activeMetric === metric.id;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={metric.id}
                        onPress={() => {
                          hapticSelection();
                          setActiveMetric(metric.id);
                          setMetricPickerOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.metricPickerOption,
                          selected && styles.metricPickerOptionSelected,
                          pressed && styles.pillPressed,
                        ]}
                      >
                        <View style={[styles.metricPickerDot, { backgroundColor: getMetricAccent(metric) }]} />
                        <View style={styles.metricPickerTextBlock}>
                          <Text style={styles.metricPickerOptionTitle}>{metric.label}</Text>
                          <Text style={styles.metricPickerDescription}>{metric.description}</Text>
                        </View>
                        {selected ? (
                          <IconSymbol color={theme.colors.scannerCyan} name="checkmark" size={16} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <ChartCard
              metric={activeMetricDefinition}
              groups={groups}
              responsiveFont={responsiveFont}
            />

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
  );

  return embedded ? analyticsContent : <KeepFlipBackground>{analyticsContent}</KeepFlipBackground>;
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
    backgroundColor: theme.colors.iconSurfaceGold,
    borderColor: theme.colors.accentGoldBorder,
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  refreshButton: {
    alignItems: 'center',
    borderColor: theme.colors.accentGoldBorder,
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
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.accentCyanBorder,
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
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.divider,
    borderCurve: 'continuous',
    borderRadius: 17,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  errorText: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
  lockedCard: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.iconSurfaceGold,
    borderColor: theme.colors.dividerStrong,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  lockIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceGold,
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
    backgroundColor: theme.colors.iconSurfaceGold,
    borderColor: theme.colors.divider,
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
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.divider,
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
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.divider,
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
    backgroundColor: theme.colors.surfaceInset,
    borderColor: theme.colors.divider,
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  pillSelected: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder },
  pillPressed: { opacity: 0.78 },
  pillText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' },
  pillTextSelected: { color: theme.colors.text },
  pillDetail: { color: theme.colors.textMuted, fontSize: 9 },
  divider: { backgroundColor: theme.colors.divider, height: StyleSheet.hairlineWidth, marginVertical: 2 },
  metricPickerTrigger: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceInset,
    borderColor: theme.colors.dividerStrong,
    borderCurve: 'continuous',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metricPickerCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9 },
  metricPickerTextBlock: { flex: 1, gap: 2 },
  metricPickerDot: { borderRadius: 5, height: 10, width: 10 },
  metricPickerLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '900' },
  metricPickerDescription: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 13 },
  metricPickerMenu: {
    backgroundColor: theme.colors.surfaceOverlay,
    borderColor: theme.colors.dividerStrong,
    borderRadius: 13,
    borderWidth: 1,
    gap: 4,
    padding: 5,
  },
  metricPickerOption: {
    alignItems: 'center',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  metricPickerOptionSelected: { backgroundColor: theme.colors.iconSurfaceCyan },
  metricPickerOptionTitle: { color: theme.colors.text, fontSize: 10, fontWeight: '800' },
  metricSelectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectionCount: { color: theme.colors.scannerCyan, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '800' },
  selectionHint: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14 },
  chartCard: {
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.divider,
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
  wagmiChart: {
    backgroundColor: theme.colors.card,
    borderRadius: 13,
    overflow: 'hidden',
  },
  chartAxisLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  chartAxisLabel: { color: theme.colors.textMuted, flex: 1, fontSize: 8 },
  chartAxisLabelCenter: { textAlign: 'center' },
  chartAxisLabelRight: { textAlign: 'right' },
  selectedPointCard: {
    backgroundColor: theme.colors.surfaceInset,
    borderColor: theme.colors.dividerStrong,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  selectedPointLabel: { color: theme.colors.goldMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  selectedPointValue: { color: theme.colors.text, fontVariant: ['tabular-nums'], fontWeight: '900' },
  selectedPointDetail: { color: theme.colors.textMuted, fontSize: 9 },
  chartRow: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 25 },
  chartLabel: { color: theme.colors.textMuted, fontSize: 9, width: 78 },
  track: {
    backgroundColor: theme.colors.cardSoft,
    borderRadius: 4,
    flex: 1,
    height: 13,
    overflow: 'hidden',
  },
  trackCenter: { backgroundColor: theme.colors.dividerStrong, height: '100%', left: '50%', position: 'absolute', width: StyleSheet.hairlineWidth },
  bar: { borderRadius: 4, height: '100%', position: 'absolute' },
  chartValue: { color: theme.colors.text, fontVariant: ['tabular-nums'], fontWeight: '800', textAlign: 'right', width: 72 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 84, paddingRight: 79 },
  axisText: { color: theme.colors.textMuted, fontSize: 8, fontVariant: ['tabular-nums'] },
  chartFootnote: { color: theme.colors.textMuted, fontSize: 9, textAlign: 'right' },
  chartEmpty: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  chartEmptyText: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 15 },
  dataNote: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.accentCyanBorder,
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
