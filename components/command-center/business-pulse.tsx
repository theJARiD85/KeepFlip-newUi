import * as ScreenOrientation from 'expo-screen-orientation';
import { useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  LineChart,
  LineChartDimensionsContext,
  useLineChart,
} from 'react-native-wagmi-charts';

import {
  BusinessPulseBreakdownModal,
  type BusinessPulseMetric,
} from '@/components/command-center/business-pulse-breakdown-modal';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  buildMoneyFlowBuckets,
  getDefaultMoneyFlowGranularity,
  getDefaultMoneyFlowRange,
  moneyFlowRangeOptions,
  trimLeadingEmptyMoneyFlowBuckets,
  trimLeadingEmptyProfitAndLossMonths,
  type BusinessMoneyFlowEntry,
  type BusinessMoneyFlowGranularity,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BusinessPulseProps = {
  errorMessage?: string | null;
  loading: boolean;
  overview: ResellerBusinessOverview | null;
  onOpenBooks: () => void;
  onOpenFlipPlan: () => void;
};

function money(cents: number) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

function metricTone(value: number): 'negative' | 'default' {
  return value < 0 ? 'negative' : 'default';
}

function compactMoney(cents: number) {
  const amount = Math.abs(cents) / 100;
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}K`;
  }
  return `$${Math.round(amount)}`;
}

function shiftMoneyFlowAnchor(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
  periods: number,
) {
  const shifted = new Date(date);
  if (granularity === 'days') shifted.setDate(shifted.getDate() - periods);
  else if (granularity === 'weeks') shifted.setDate(shifted.getDate() - periods * 7);
  else {
    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() - periods);
  }
  return shifted;
}

function moneyFlowPeriodOrdinal(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
) {
  if (granularity === 'months') return date.getFullYear() * 12 + date.getMonth();

  const periodStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === 'weeks') {
    periodStart.setDate(periodStart.getDate() - periodStart.getDay());
  }
  const daysFromEpoch = Date.UTC(
    periodStart.getFullYear(),
    periodStart.getMonth(),
    periodStart.getDate(),
  ) / 86_400_000;
  return granularity === 'weeks' ? Math.floor(daysFromEpoch / 7) : daysFromEpoch;
}

function availableMoneyFlowHistory(
  firstTransactionAt: string | null,
  now: Date,
  granularity: BusinessMoneyFlowGranularity,
) {
  if (!firstTransactionAt) return 0;
  const firstTransaction = new Date(firstTransactionAt);
  if (!Number.isFinite(firstTransaction.getTime())) return 0;
  return Math.max(
    0,
    moneyFlowPeriodOrdinal(now, granularity) -
    moneyFlowPeriodOrdinal(firstTransaction, granularity),
  );
}

type FinancialChartId = 'pnl' | 'gross-margin' | 'expenses';

type FinancialChartPoint = {
  key: string;
  label: string;
  valueCents: number;
  detail: string;
};

const FINANCIAL_CHART_OPTIONS: {
  id: FinancialChartId;
  label: string;
  description: string;
  color: string;
}[] = [
    {
      id: 'pnl',
      label: 'Profit & loss trend',
      description: 'Realized net profit across the last six months.',
      color: theme.colors.scannerCyan,
    },
    {
      id: 'gross-margin',
      label: 'Gross margin by category',
      description: 'Realized gross profit grouped by item category.',
      color: theme.colors.scannerViolet,
    },
    {
      id: 'expenses',
      label: 'Expense allocation',
      description: 'Current-month cash outflows by ledger category.',
      color: theme.colors.goldBright,
    },
  ];

export function BusinessPulse({
  errorMessage,
  loading,
  overview,
  onOpenBooks,
  onOpenFlipPlan,
}: BusinessPulseProps) {
  const responsiveLayout2 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const [selectedGranularity, setSelectedGranularity] =
    useState<BusinessMoneyFlowGranularity | null>(null);
  const [selectedRangeCount, setSelectedRangeCount] = useState<number | null>(
    null,
  );
  const [moneyFlowZoomOpen, setMoneyFlowZoomOpen] = useState(false);
  const [activeBreakdown, setActiveBreakdown] =
    useState<BusinessPulseMetric | null>(null);

  if (loading && !overview) {
    return (
      <View style={styles.loadingCard}>
        <Ionicons color={theme.colors.scannerCyan} name="chart.bar.fill" size={20} />
        <View style={styles.loadingCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
          <Text style={[styles.loadingText, { fontSize: responsiveFont(12), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(17) : 17 }]}>Loading your saved money and inventory records</Text>
        </View>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons color={theme.colors.goldBright} name="chart.bar.fill" size={20} />
        </View>
        <View style={styles.emptyCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
          <Text style={[styles.emptyTitle, { fontSize: responsiveFont(15), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(20) : 20 }]}>Your working numbers will show here</Text>
          <Text style={[styles.emptyText, { fontSize: responsiveFont(11), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(16) : 16 }]}>
            Add an item with its real cost, then record a sale or expense to see a clear picture of your business.
          </Text>
          <Pressable
            accessibilityHint="Opens a private calculator for planning a possible flip"
            accessibilityRole="button"
            onPress={onOpenFlipPlan}
            style={({ pressed }) => [styles.emptyPlanAction, pressed && styles.pressed]}
          >
            <Text style={[styles.emptyPlanActionText, { fontSize: responsiveFont(11) }]}>Plan a possible flip</Text>
            <Ionicons color={theme.colors.scannerCyan} name="chevron.right" size={14} />
          </Pressable>
        </View>
      </View>
    );
  }

  const chartNow = new Date();
  const automaticGranularity = getDefaultMoneyFlowGranularity(
    overview.firstTransactionAt,
    chartNow,
  );
  const granularity = selectedGranularity ?? automaticGranularity;
  const rangeOptions = moneyFlowRangeOptions(granularity);
  const defaultRangeCount = getDefaultMoneyFlowRange(
    granularity,
    overview.firstTransactionAt,
    chartNow,
  );
  const rangeCount = rangeOptions.some(
    (option) => option.count === selectedRangeCount,
  )
    ? selectedRangeCount!
    : defaultRangeCount;
  const selectedRange = rangeOptions.find((option) => option.count === rangeCount)!;
  const fullMoneyFlow = buildMoneyFlowBuckets({
    bucketCount: rangeCount,
    entries: overview.moneyFlowEntries,
    granularity,
    now: chartNow,
  });
  const moneyFlow =
    selectedRangeCount == null
      ? trimLeadingEmptyMoneyFlowBuckets(fullMoneyFlow)
      : fullMoneyFlow;
  const maximumFlow = Math.max(
    ...moneyFlow.flatMap((date) => [date.moneyInCents, date.moneyOutCents]),
    1,
  );
  const attention = [
    overview.inventory.missingCostCount > 0
      ? `${overview.inventory.missingCostCount} item${overview.inventory.missingCostCount === 1 ? '' : 's'} need${overview.inventory.missingCostCount === 1 ? 's' : ''} a real purchase price`
      : null,
    overview.attention.unlinkedSaleCount > 0
      ? `${overview.attention.unlinkedSaleCount} sale${overview.attention.unlinkedSaleCount === 1 ? '' : 's'} need${overview.attention.unlinkedSaleCount === 1 ? 's' : ''} to be linked to an item`
      : null,
    overview.attention.unlinkedInventoryCostCents > 0
      ? `${money(overview.attention.unlinkedInventoryCostCents)} of purchases are not tied to an item`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <View style={styles.cardStack}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(19), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(24) : 24 }]}>The numbers that matter</Text>
          </View>
        </View>

        <Text style={[styles.description, { fontSize: responsiveFont(11), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(15) : 15 }]}>
          Real money stays separate from item estimates, so you can see what happened without the sometimes confusing accounting-speak.
        </Text>

        <View style={styles.metricGrid}>
          <Metric
            accessibilityHint="Shows every income entry that makes up this month's total"
            label="MONEY IN"
            onPress={() => setActiveBreakdown('money-in')}
            value={money(overview.currentMonth.moneyInCents)}
            tone="cyan"
          />
          <Metric
            accessibilityHint="Shows every cost entry that makes up this month's total"
            label="COSTS"
            onPress={() => setActiveBreakdown('costs')}
            value={money(overview.currentMonth.moneyOutCents)}
            tone="gold"
          />
          <Metric
            label="LEFT AFTER COSTS"
            value={money(overview.currentMonth.leftAfterCostsCents)}
            valueStyle={
              metricTone(overview.currentMonth.leftAfterCostsCents) === 'negative'
                ? styles.metricNegativeValue
                : undefined
            }
            tone="violet"
          />
          <Metric
            accessibilityHint="Shows the on-hand items included in this total and their saved costs"
            label="CASH TIED UP"
            onPress={() => setActiveBreakdown('cash-tied-up')}
            value={money(overview.inventory.cashTiedUpCents)}
            tone="muted"
          />
        </View>
      </View>

      <View style={styles.chartSurface}>
        <View style={styles.chartHeading}>
          <View>
            <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>MONEY MOVEMENT</Text>
            <Text style={[styles.chartTitle, { fontSize: responsiveFont(13), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(17) : 17 }]}>{selectedRange.label}</Text>
          </View>
          <View style={styles.chartHeadingActions}>
            <View style={styles.legend}>
              <Legend color={theme.colors.scannerCyan} label="In" />
              <Legend color={theme.colors.goldBright} label="Out" />
            </View>
            <ChartZoomButton
              label="Money Movement"
              onPress={() => setMoneyFlowZoomOpen(true)}
            />
          </View>
        </View>
        <View style={styles.chartControls}>
          <View style={styles.controlHeading}>
            <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>TIME UNIT</Text>
            <Text style={[styles.controlValue, { fontSize: responsiveFont(9) }]}>
              {granularity === 'days'
                ? 'Daily'
                : granularity === 'weeks'
                  ? 'Weekly'
                  : 'Monthly'}
            </Text>
          </View>
          <View style={styles.segmentRow}>
            {(['days', 'weeks', 'months'] as BusinessMoneyFlowGranularity[]).map(
              (option) => {
                const active = option === granularity;
                return (
                  <Pressable
                    accessibilityLabel={`Show money movement by ${option}`}
                    accessibilityRole="button"
                    key={option}
                    onPress={() => {
                      setSelectedGranularity(option);
                      setSelectedRangeCount(null);
                    }}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      active && styles.segmentButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                      ]}
                    >
                      {option.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
          <View style={styles.controlHeading}>
            <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>TIME SPAN</Text>
            <Text style={[styles.controlValue, { fontSize: responsiveFont(9) }]}>{selectedRange.label}</Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.rangeRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {rangeOptions.map((option) => {
              const active = option.count === rangeCount;
              return (
                <Pressable
                  accessibilityLabel={`Show ${option.label}`}
                  accessibilityRole="button"
                  key={option.count}
                  onPress={() => setSelectedRangeCount(option.count)}
                  style={({ pressed }) => [
                    styles.rangeChip,
                    active && styles.rangeChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.rangeChipText,
                      active && styles.rangeChipTextActive,
                    ]}
                  >
                    {option.shortLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <MoneyMovementChart
          key={`${granularity}:${rangeCount}:${overview.firstTransactionAt ?? 'none'}`}
          entries={overview.moneyFlowEntries}
          firstTransactionAt={overview.firstTransactionAt}
          granularity={granularity}
          now={chartNow}
          maximumFlow={maximumFlow}
          moneyFlow={moneyFlow}
          rangeCount={rangeCount}
          rangeLabel={selectedRange.label}
          onCloseZoom={() => setMoneyFlowZoomOpen(false)}
          zoomOpen={moneyFlowZoomOpen}
        />
      </View>

      <FinancialReporting overview={overview} />

      <View style={styles.splitRow}>
        <View style={styles.inventorySurface}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>ITEMS ON HAND</Text>
          <Text style={[styles.inventoryValue, { fontSize: responsiveFont(25), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(30) : 30 }]}>{overview.inventory.onHandCount}</Text>
          <Text style={[styles.inventoryCopy, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>
            {overview.inventory.readyToFlipCount} ready to flip · {overview.inventory.undecidedCount} to decide
          </Text>
          <Text style={[styles.estimateCopy, { fontSize: responsiveFont(9), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(13) : 13 }]}>
            Est. item value {money(overview.inventory.estimatedOnHandValueCents)} · not money earned
          </Text>
        </View>
        <View style={styles.costSurface}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>BIGGEST COSTS</Text>
          {overview.topCostsThisMonth.length ? (
            overview.topCostsThisMonth.map((cost) => (
              <View key={cost.entryType} style={styles.costRow}>
                <Text numberOfLines={1} style={[styles.costLabel, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>{cost.label}</Text>
                <Text style={[styles.costValue, { fontSize: responsiveFont(10) }]}>{money(cost.amountCents)}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.noCostsText, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(15) : 15 }]}>No costs saved for this month yet.</Text>
          )}
        </View>
      </View>

      {attention.length ? (
        <View style={styles.attentionSurface}>
          <Ionicons color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={18} />
          <View style={styles.attentionCopy}>
            <Text style={[styles.attentionTitle, { fontSize: responsiveFont(11), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(15) : 15 }]}>A couple things need your eyes</Text>
            {attention.slice(0, 2).map((message) => (
              <Text key={message} style={[styles.attentionText, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>• {message}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {errorMessage ? <Text style={[styles.errorText, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityHint="Opens a private calculator for planning a possible flip"
        accessibilityRole="button"
        onPress={onOpenFlipPlan}
        style={({ pressed }) => [styles.planAction, pressed && styles.pressed]}
      >
        <View style={styles.planActionIcon}>
          <Ionicons color={theme.colors.scannerCyan} name="star.fill" size={16} />
        </View>
        <View style={styles.planActionCopy}>
          <Text style={[styles.planActionTitle, { fontSize: responsiveFont(12) }]}>Plan the next flip</Text>
          <Text style={[styles.planActionText, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>Test the buy, fix-up, selling costs, and an optional partner split.</Text>
        </View>
        <Ionicons color={theme.colors.scannerCyan} name="chevron.right" size={15} />
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Opens your books and reports"
          accessibilityRole="button"
          onPress={onOpenBooks}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
        >
          <Text style={[styles.primaryActionText, { fontSize: responsiveFont(12) }]}>Open books</Text>
          <Ionicons color={theme.colors.backgroundDeep} name="chart.bar.fill" size={15} />
        </Pressable>
      </View>

      <BusinessPulseBreakdownModal
        metric={activeBreakdown}
        notice={errorMessage}
        onClose={() => setActiveBreakdown(null)}
        overview={overview}
        visible={activeBreakdown !== null}
      />
    </View>
  );
}

const MONEY_FLOW_TRACKER_OUTER_SIZE = 18;
const MONEY_FLOW_TRACKER_CORE_SIZE = 6;

const moneyFlowTrackerStyles = StyleSheet.create({
  host: {
    alignItems: 'center',
    height: MONEY_FLOW_TRACKER_OUTER_SIZE,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: MONEY_FLOW_TRACKER_OUTER_SIZE,
  },
  outer: {
    borderRadius: MONEY_FLOW_TRACKER_OUTER_SIZE / 2,
    height: MONEY_FLOW_TRACKER_OUTER_SIZE,
    opacity: 0.24,
    position: 'absolute',
    width: MONEY_FLOW_TRACKER_OUTER_SIZE,
  },
  core: {
    borderRadius: MONEY_FLOW_TRACKER_CORE_SIZE / 2,
    height: MONEY_FLOW_TRACKER_CORE_SIZE,
    width: MONEY_FLOW_TRACKER_CORE_SIZE,
  },
});

function MoneyFlowTrackerDot({ color, index }: { color: string; index: number }) {
  const { currentX, currentY, data, isActive, yDomain } = useLineChart();
  const { chartDrawingHeight, gutter, width } = useContext(LineChartDimensionsContext);
  const dataLength = data?.length ?? 0;
  const staticX = dataLength > 1 ? (width * index) / (dataLength - 1) : 0;
  const yRange = Math.max(yDomain.max - yDomain.min, Number.EPSILON);
  const selectedValue = data?.[index]?.value ?? yDomain.min;
  const staticY =
    chartDrawingHeight -
    gutter -
    ((selectedValue - yDomain.min) / yRange) * (chartDrawingHeight - gutter * 2);

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateX:
            (isActive.value ? currentX.value : staticX) - MONEY_FLOW_TRACKER_OUTER_SIZE / 2,
        },
        {
          translateY:
            (isActive.value ? currentY.value : staticY) - MONEY_FLOW_TRACKER_OUTER_SIZE / 2,
        },
      ],
    }),
    [currentX, currentY, isActive, staticX, staticY],
  );

  return (
    <Animated.View pointerEvents="none" style={[moneyFlowTrackerStyles.host, animatedStyle]}>
      <View style={[moneyFlowTrackerStyles.outer, { backgroundColor: color }]} />
      <View style={[moneyFlowTrackerStyles.core, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function MoneyMovementChart({
  entries,
  firstTransactionAt,
  granularity,
  now,
  moneyFlow,
  maximumFlow,
  rangeCount,
  rangeLabel,
  onCloseZoom,
  zoomOpen,
}: {
  entries: BusinessMoneyFlowEntry[];
  firstTransactionAt: string | null;
  granularity: BusinessMoneyFlowGranularity;
  now: Date;
  moneyFlow: ResellerBusinessOverview['moneyFlow'];
  maximumFlow: number;
  rangeCount: number;
  rangeLabel: string;
  onCloseZoom: () => void;
  zoomOpen: boolean;
}) {
  const responsiveLayout3 = useResponsiveLayout();
  const responsiveZoomUiStyles = useResponsiveStyles(createZoomUiStylesWebResponsive);
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont, responsiveWidth } = useResponsiveLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [expandedPeriodOffset, setExpandedPeriodOffset] = useState(0);
  const [plotWidth, setPlotWidth] = useState(0);
  const [expandedPlotWidth, setExpandedPlotWidth] = useState(0);
  const chartGrid = [1, 0.75, 0.5, 0.25, 0];
  const expandedMoneyFlow = useMemo(
    () =>
      buildMoneyFlowBuckets({
        bucketCount: rangeCount,
        entries,
        granularity,
        now: shiftMoneyFlowAnchor(now, granularity, expandedPeriodOffset),
      }),
    [entries, expandedPeriodOffset, granularity, now, rangeCount],
  );
  const chartData = useMemo(
    () => ({
      moneyIn: moneyFlow.map((bucket, index) => ({
        timestamp: Date.UTC(2024, 0, index + 1),
        value: bucket.moneyInCents / 100,
      })),
      moneyOut: moneyFlow.map((bucket, index) => ({
        timestamp: Date.UTC(2024, 0, index + 1),
        value: bucket.moneyOutCents / 100,
      })),
    }),
    [moneyFlow],
  );
  const expandedChartData = useMemo(
    () => ({
      moneyIn: expandedMoneyFlow.map((bucket, index) => ({
        timestamp: Date.UTC(2024, 0, index + 1),
        value: bucket.moneyInCents / 100,
      })),
      moneyOut: expandedMoneyFlow.map((bucket, index) => ({
        timestamp: Date.UTC(2024, 0, index + 1),
        value: bucket.moneyOutCents / 100,
      })),
    }),
    [expandedMoneyFlow],
  );
  const expandedMaximumFlow = Math.max(
    ...expandedMoneyFlow.flatMap((bucket) => [bucket.moneyInCents, bucket.moneyOutCents]),
    1,
  );
  const maximumPeriodOffset = availableMoneyFlowHistory(
    firstTransactionAt,
    now,
    granularity,
  );

  const renderChart = (expanded: boolean) => {
    const plottedMoneyFlow = expanded ? expandedMoneyFlow : moneyFlow;
    const plottedChartData = expanded ? expandedChartData : chartData;
    const chartValueMax = Math.max((expanded ? expandedMaximumFlow : maximumFlow) / 100, 1);
    const safePointIndex = Math.min(
      Math.max(activePointIndex, 0),
      Math.max(plottedMoneyFlow.length - 1, 0),
    );
    const activePoint = plottedMoneyFlow[safePointIndex];
    const netCents = activePoint
      ? activePoint.moneyInCents - activePoint.moneyOutCents
      : 0;
    const yAxisWidth = responsiveWidth(expanded ? 42 : 34);
    const measuredPlotWidth = expanded ? expandedPlotWidth : plotWidth;
    const fallbackChartWidth = Math.max(
      windowWidth - (expanded ? 58 : 84),
      180,
    );
    const chartWidth = measuredPlotWidth > 0
      ? Math.max(measuredPlotWidth - yAxisWidth, 1)
      : fallbackChartWidth;
    const chartHeight = expanded
      ? Math.max(Math.min(windowHeight * 0.56, 560), windowWidth > windowHeight ? 180 : 300)
      : 218;

    return (
      <>
        <View
          onLayout={(event) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            const updatePlotWidth = expanded ? setExpandedPlotWidth : setPlotWidth;
            updatePlotWidth((currentWidth) =>
              currentWidth === nextWidth ? currentWidth : nextWidth,
            );
          }}
          style={styles.chartPlotRow}
        >
          <View
            style={[
              styles.moneyFlowYAxis,
              {
                height: chartHeight - 40,
                width: yAxisWidth,
              },
            ]}
          >
            {chartGrid.map((fraction) => (
              <Text
                key={fraction}
                style={[
                  styles.yAxisLabel,
                  { fontSize: responsiveFont(expanded ? 9 : 7), lineHeight: expanded ? 12 : 9 },
                ]}
              >
                {compactMoney(Math.round(maximumFlow * fraction))}
              </Text>
            ))}
          </View>
          <View style={[styles.moneyFlowChartContent, { width: chartWidth }]}>
            <View style={[styles.wagmiChart, { width: chartWidth }]}>
              <LineChart.Provider
                key={expanded ? `${granularity}:${rangeCount}:${expandedPeriodOffset}` : 'compact'}
                data={plottedChartData}
                onCurrentIndexChange={setActivePointIndex}
                yRange={{ min: 0, max: chartValueMax }}
              >
                <LineChart.Group>
                  <LineChart id="moneyIn" width={chartWidth} height={chartHeight}>
                    <LineChart.Path color={theme.colors.scannerCyan} width={3} />
                    <MoneyFlowTrackerDot color={theme.colors.scannerCyan} index={safePointIndex} />
                  </LineChart>
                  <LineChart id="moneyOut" width={chartWidth} height={chartHeight}>
                    <LineChart.Path color={theme.colors.goldBright} width={3} />
                    <LineChart.CursorLine
                      color={theme.colors.goldBright}
                      persistOnEnd
                      showLabel={false}
                      snapToPoint
                    >
                      <LineChart.Tooltip
                        position="top"
                        textProps={{ precision: 0 }}
                        textStyle={{
                          backgroundColor: theme.colors.surface,
                          borderRadius: responsiveLayout3.isWeb ? responsiveLayout3.webResponsiveWidth(8) : 8,
                          color: theme.colors.text,
                          fontSize: expanded ? 14 : 10,
                          padding: 6,
                        }}
                      />
                    </LineChart.CursorLine>
                    <MoneyFlowTrackerDot color={theme.colors.goldBright} index={safePointIndex} />
                  </LineChart>
                </LineChart.Group>
              </LineChart.Provider>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {chartGrid.map((fraction) => (
                  <View
                    key={fraction}
                    style={[
                      styles.moneyFlowGridLine,
                      {
                        borderTopColor:
                          fraction === 0
                            ? theme.colors.dividerStrong
                            : theme.colors.divider,
                        borderStyle: fraction === 0 ? 'solid' : 'dashed',
                        borderTopWidth: fraction === 0 ? 2 : 1,
                        top: 5 + 16 + (1 - fraction) * (chartHeight - 72),
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={[styles.chartAxisLabels, { width: chartWidth }]}>
              {plottedMoneyFlow.map((bucket) => (
                <Text
                  key={bucket.key}
                  numberOfLines={1}
                  style={[
                    styles.chartAxisLabel,
                    { fontSize: responsiveFont(expanded ? 10 : 8) },
                  ]}
                >
                  {bucket.label}
                </Text>
              ))}
            </View>
          </View>
        </View>
        {activePoint ? (
          <View style={styles.selectedPointCard}>
            <View style={styles.selectedPointHeading}>
              <Text
                style={[
                  styles.selectedPointLabel,
                  { fontSize: responsiveFont(expanded ? 11 : 9) },
                ]}
              >
                {activePoint.label}
              </Text>
              <Text
                style={[
                  styles.selectedPointValue,
                  {
                    color:
                      netCents < 0
                        ? theme.colors.danger
                        : theme.colors.scannerViolet,
                    fontSize: responsiveFont(expanded ? 17 : 13),
                  },
                ]}
              >
                {money(netCents)} net
              </Text>
            </View>
            <View style={styles.flowSelectedValues}>
              <Text
                style={[
                  styles.flowSelectedValue,
                  { color: theme.colors.scannerCyan, fontSize: responsiveFont(expanded ? 12 : 9) },
                ]}
              >
                IN {money(activePoint.moneyInCents)}
              </Text>
              <Text
                style={[
                  styles.flowSelectedValue,
                  { color: theme.colors.goldBright, fontSize: responsiveFont(expanded ? 12 : 9) },
                ]}
              >
                OUT {money(activePoint.moneyOutCents)}
              </Text>
            </View>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <>
      {renderChart(false)}
      <ChartZoomModal
        eyebrow="MONEY MOVEMENT"
        onClose={onCloseZoom}
        title={rangeLabel}
        visible={zoomOpen}
      >
        {zoomOpen ? (
          <>
            <View style={styles.zoomLegend}>
              <Legend color={theme.colors.scannerCyan} label="In" />
              <Legend color={theme.colors.goldBright} label="Out" />
            </View>
            <View style={responsiveZoomUiStyles.dateNavigation}>
              <Pressable
                accessibilityHint="Moves the chart one date period earlier"
                accessibilityLabel="Show earlier dates"
                accessibilityRole="button"
                disabled={expandedPeriodOffset >= maximumPeriodOffset}
                onPress={() => {
                  setExpandedPeriodOffset((current) =>
                    Math.min(current + 1, maximumPeriodOffset),
                  );
                  setActivePointIndex(0);
                }}
                style={({ pressed }) => [
                  responsiveZoomUiStyles.dateButton,
                  expandedPeriodOffset >= maximumPeriodOffset &&
                  responsiveZoomUiStyles.dateButtonDisabled,
                  pressed && responsiveZoomUiStyles.pressed,
                ]}
              >
                <Ionicons color={theme.colors.text} name="chevron.left" size={17} />
              </Pressable>
              <View style={responsiveZoomUiStyles.dateRangeCopy}>
                <Text style={[responsiveZoomUiStyles.dateRange, { fontSize: responsiveFont(11) }]}>
                  {expandedMoneyFlow[0]?.label ?? rangeLabel}
                  {'  –  '}
                  {expandedMoneyFlow[expandedMoneyFlow.length - 1]?.label ?? rangeLabel}
                </Text>
                <Text style={[responsiveZoomUiStyles.dateHint, { fontSize: responsiveFont(8) }]}>
                  Drag across the chart to inspect each date
                </Text>
              </View>
              <Pressable
                accessibilityHint="Moves the chart one date period later"
                accessibilityLabel="Show later dates"
                accessibilityRole="button"
                disabled={expandedPeriodOffset === 0}
                onPress={() => {
                  setExpandedPeriodOffset((current) => Math.max(current - 1, 0));
                  setActivePointIndex(0);
                }}
                style={({ pressed }) => [
                  responsiveZoomUiStyles.dateButton,
                  expandedPeriodOffset === 0 && responsiveZoomUiStyles.dateButtonDisabled,
                  pressed && responsiveZoomUiStyles.pressed,
                ]}
              >
                <Ionicons color={theme.colors.text} name="chevron.right" size={17} />
              </Pressable>
            </View>
            {renderChart(true)}
          </>
        ) : null}
      </ChartZoomModal>
    </>
  );
}

function FinancialReporting({
  overview,
}: {
  overview: ResellerBusinessOverview;
}) {
  const responsiveLayout4 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeChart, setActiveChart] = useState<FinancialChartId>('pnl');
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [plotWidth, setPlotWidth] = useState(0);
  const [expandedPlotWidth, setExpandedPlotWidth] = useState(0);
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const chartOption =
    FINANCIAL_CHART_OPTIONS.find((option) => option.id === activeChart) ??
    FINANCIAL_CHART_OPTIONS[0];
  const chartPoints = useMemo<FinancialChartPoint[]>(() => {
    if (activeChart === 'pnl') {
      return trimLeadingEmptyProfitAndLossMonths(overview.profitAndLoss).map((month) => ({
        key: month.key,
        label: month.label,
        valueCents: month.netProfitCents,
        detail: `${money(month.revenueCents)} revenue · ${money(month.cogsCents + month.operatingExpensesCents)} costs`,
      }));
    }

    if (activeChart === 'gross-margin') {
      return [...overview.grossMarginByCategory]
        .sort((left, right) => Math.abs(right.grossProfitCents) - Math.abs(left.grossProfitCents))
        .slice(0, 8)
        .map((category) => ({
          key: category.key,
          label: category.label,
          valueCents: category.grossProfitCents,
          detail: `${category.itemCount} realized item${category.itemCount === 1 ? '' : 's'} · ${money(category.revenueCents)} revenue`,
        }));
    }

    return [...overview.expenseBreakdownThisMonth]
      .sort((left, right) => right.amountCents - left.amountCents)
      .slice(0, 8)
      .map((expense) => ({
        key: expense.entryType,
        label: expense.label,
        valueCents: expense.amountCents,
        detail: `${Math.round(expense.sharePercent)}% of cash out${expense.isWorkingCapital ? ' · working capital' : ''}`,
      }));
  }, [activeChart, overview]);
  const chartData = useMemo(
    () =>
      chartPoints.map((point, index) => ({
        timestamp: Date.UTC(2024, 0, index + 1),
        value: point.valueCents / 100,
      })),
    [chartPoints],
  );
  const fallbackChartWidth = Math.min(Math.max(windowWidth - 60, 240), 720);
  const fallbackExpandedChartWidth = Math.min(Math.max(windowWidth - 48, 180), 1_200);
  const expandedChartHeight = Math.max(
    Math.min(windowHeight * 0.56, 560),
    windowWidth > windowHeight ? 180 : 300,
  );
  const safePointIndex = Math.min(
    Math.max(activePointIndex, 0),
    Math.max(chartPoints.length - 1, 0),
  );
  const activePoint = chartPoints[safePointIndex];
  const chartValues = chartData.map((point) => point.value);
  const chartMin = Math.min(...chartValues, 0);
  const chartMax = Math.max(...chartValues, 0);
  const chartPadding = Math.max(1, (chartMax - chartMin) * 0.12);
  const hasChartData = chartPoints.length > 0;

  const renderChart = (expanded: boolean) => {
    const availableWidth = expanded
      ? expandedPlotWidth || fallbackExpandedChartWidth
      : plotWidth || fallbackChartWidth;
    const width = Math.max(availableWidth - 2, 1);
    const height = expanded ? expandedChartHeight : 218;
    return (
      <View
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          const updatePlotWidth = expanded ? setExpandedPlotWidth : setPlotWidth;
          updatePlotWidth((currentWidth) =>
            currentWidth === nextWidth ? currentWidth : nextWidth,
          );
        }}
        style={[styles.wagmiChart, { width: '100%' }]}
      >
        <LineChart.Provider
          data={chartData}
          onCurrentIndexChange={setActivePointIndex}
          yRange={{
            min: chartMin - chartPadding,
            max: chartMax + chartPadding,
          }}>
          <LineChart width={width} height={height}>
            <LineChart.Path color={chartOption.color} width={3}>
              <LineChart.Gradient color={chartOption.color} />
              <LineChart.HorizontalLine
                at={{ value: 0 }}
                color={theme.colors.dividerStrong}
              />
              <LineChart.Dot
                at={safePointIndex}
                color={chartOption.color}
                hasOuterDot
                size={expanded ? 6 : 4}
              />
            </LineChart.Path>
            <LineChart.CursorLine
              color={chartOption.color}
              persistOnEnd
              snapToPoint>
              <LineChart.Tooltip
                position="top"
                textProps={{ precision: 0 }}
                textStyle={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveWidth(8) : 8,
                  color: theme.colors.text,
                  fontSize: expanded ? 14 : 10,
                  padding: 6,
                }}
              />
            </LineChart.CursorLine>
          </LineChart>
        </LineChart.Provider>
        <View style={styles.chartAxisLabels}>
          {chartPoints.map((point) => (
            <Text key={point.key} numberOfLines={1} style={[styles.chartAxisLabel, { fontSize: responsiveFont(expanded ? 11 : 8) }]}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    );
  };

  const renderActivePoint = (expanded: boolean) => activePoint ? (
    <View style={styles.selectedPointCard}>
      <View style={styles.selectedPointHeading}>
        <Text style={[styles.selectedPointLabel, { fontSize: responsiveFont(expanded ? 11 : 9) }]}>
          {activePoint.label}
        </Text>
        <Text selectable style={[styles.selectedPointValue, { color: chartOption.color, fontSize: responsiveFont(expanded ? 17 : 13) }]}>
          {money(activePoint.valueCents)}
        </Text>
      </View>
      <Text style={[styles.selectedPointDetail, { fontSize: responsiveFont(expanded ? 10 : 8) }]}>
        {activePoint.detail}
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.reportingSurface}>
      <View style={styles.reportingHeader}>
        <View style={styles.reportingHeadingCopy}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>FINANCIAL REPORTING</Text>
          <Text style={[styles.reportingTitle, { fontSize: responsiveFont(15), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(19) : 19 }]}>{chartOption.label}</Text>
          <Text style={[styles.reportingDescription, { fontSize: responsiveFont(10), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(14) : 14 }]}>{chartOption.description}</Text>
        </View>
        <ChartZoomButton
          label={chartOption.label}
          onPress={() => setZoomOpen(true)}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: chartPickerOpen }}
        onPress={() => setChartPickerOpen((open) => !open)}
        style={({ pressed }) => [styles.chartPickerTrigger, pressed && styles.pressed]}>
        <View style={styles.chartPickerCopy}>
          <Text style={[styles.chartPickerEyebrow, { fontSize: responsiveFont(8) }]}>CHART VIEW</Text>
          <Text style={[styles.chartPickerValue, { fontSize: responsiveFont(12) }]}>{chartOption.label}</Text>
        </View>
        <Ionicons
          color={chartOption.color}
          name="chevron.right"
          size={18}
          style={{ transform: [{ rotate: chartPickerOpen ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {chartPickerOpen ? (
        <View style={styles.chartPickerMenu}>
          {FINANCIAL_CHART_OPTIONS.map((option) => {
            const selected = option.id === activeChart;
            return (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                key={option.id}
                onPress={() => {
                  setActiveChart(option.id);
                  setActivePointIndex(0);
                  setChartPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.chartPickerOption,
                  selected && styles.chartPickerOptionSelected,
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.chartPickerDot, { backgroundColor: option.color }]} />
                <View style={styles.chartPickerOptionCopy}>
                  <Text style={[styles.chartPickerOptionTitle, { fontSize: responsiveFont(10) }]}>{option.label}</Text>
                  <Text style={[styles.chartPickerOptionDescription, { fontSize: responsiveFont(8) }]}>{option.description}</Text>
                </View>
                {selected ? <Ionicons color={option.color} name="checkmark.circle.fill" size={17} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasChartData ? (
        <>
          {renderChart(false)}
          {renderActivePoint(false)}
        </>
      ) : (
        <View style={styles.reportEmpty}>
          <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(10), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(14) : 14 }]}>
            {activeChart === 'pnl'
              ? 'Record income, purchases, and expenses in Books to populate this trend.'
              : activeChart === 'gross-margin'
                ? 'Link a recorded sale to an item and add its acquisition cost to see category margin.'
                : 'No cash outflows have been recorded for this month yet.'}
          </Text>
        </View>
      )}
      <Text style={[styles.reportingNote, { fontSize: responsiveFont(9), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(14) : 14 }]}>COGS is recognized when a recorded sale is matched to a known acquisition cost. Inventory purchases stay working-capital cash outflows until they are sold.</Text>

      <ChartZoomModal
        eyebrow="FINANCIAL REPORTING"
        onClose={() => setZoomOpen(false)}
        title={chartOption.label}
        visible={zoomOpen}
      >
        {zoomOpen ? (
          hasChartData ? (
            <>
              {renderChart(true)}
              {renderActivePoint(true)}
              <Text style={[styles.reportingNote, { fontSize: responsiveFont(10), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(15) : 15 }]}>
                {chartOption.description}
              </Text>
            </>
          ) : (
            <View style={styles.reportEmpty}>
              <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(12), lineHeight: responsiveLayout4.isWeb ? responsiveLayout4.webResponsiveFont(17) : 17 }]}>
                {activeChart === 'pnl'
                  ? 'Record income, purchases, and expenses in Books to populate this trend.'
                  : activeChart === 'gross-margin'
                    ? 'Link a recorded sale to an item and add its acquisition cost to see category margin.'
                    : 'No cash outflows have been recorded for this month yet.'}
              </Text>
            </View>
          )
        ) : null}
      </ChartZoomModal>
    </View>
  );
}

function Metric({
  accessibilityHint,
  label,
  onPress,
  value,
  tone,
  valueStyle,
}: {
  accessibilityHint?: string;
  label: string;
  onPress?: () => void;
  value: string;
  tone: 'cyan' | 'gold' | 'violet' | 'muted';
  valueStyle?: object;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const toneStyle = {
    cyan: styles.metricCyan,
    gold: styles.metricGold,
    muted: styles.metricMuted,
    violet: styles.metricViolet,
  }[tone];
  const contents = (
    <>
      <View style={styles.metricLabelRow}>
        <Text style={[styles.metricLabel, { fontSize: responsiveFont(8) }]}>{label}</Text>
        {onPress ? <Ionicons color={theme.colors.textMuted} name="chevron.right" size={12} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.metricValue, valueStyle]}>{value}</Text>
    </>
  );
  if (!onPress) return <View style={[styles.metric, toneStyle]}>{contents}</View>;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.metric, toneStyle, pressed && styles.metricPressed]}
    >
      {contents}
    </Pressable>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { fontSize: responsiveFont(9) }]}>{label}</Text>
    </View>
  );
}

function ChartZoomButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const responsiveZoomUiStyles2 = useResponsiveStyles(createZoomUiStylesWebResponsive);
  const { responsiveWidth } = useResponsiveLayout();

  return (
    <Pressable
      accessibilityLabel={`Enlarge ${label} chart`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [responsiveZoomUiStyles2.zoomButton, pressed && responsiveZoomUiStyles2.pressed]}
    >
      <Ionicons
        color={theme.colors.scannerCyan}
        name="arrow.up.left.and.arrow.down.right"
        size={responsiveWidth(17)}
      />
    </Pressable>
  );
}

function ChartZoomModal({
  children,
  eyebrow,
  onClose,
  title,
  visible,
}: PropsWithChildren<{
  eyebrow: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}>) {
  const responsiveLayout5 = useResponsiveLayout();
  const responsiveZoomUiStyles3 = useResponsiveStyles(createZoomUiStylesWebResponsive);
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();

  useEffect(() => {
    if (!visible || process.env.EXPO_OS === 'web') return;

    let cancelled = false;
    let previousOrientationLock: ScreenOrientation.OrientationLock | null = null;
    const lockLandscape = async () => {
      try {
        previousOrientationLock = await ScreenOrientation.getOrientationLockAsync();
        if (cancelled) return;
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        // Keep the enlarged chart usable when a platform cannot change orientation.
      }
    };

    void lockLandscape();
    return () => {
      cancelled = true;
      if (previousOrientationLock != null) {
        void ScreenOrientation.lockAsync(previousOrientationLock).catch(() => undefined);
      }
    };
  }, [visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={[
          responsiveZoomUiStyles3.backdrop,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: Math.max(insets.top, 8),
          },
        ]}
      >
        <View style={[responsiveZoomUiStyles3.panel, { marginTop: insets.top, marginBottom: insets.bottom, marginLeft: insets.left, marginRight: insets.right }]}>
          <View style={[responsiveZoomUiStyles3.header, { paddingTop: insets.top }]}>
            <View style={responsiveZoomUiStyles3.headingCopy}>
              <Text style={[responsiveZoomUiStyles3.eyebrow, { fontSize: responsiveFont(8) }]}>
                {eyebrow}
              </Text>
              <Text
                numberOfLines={2}
                style={[responsiveZoomUiStyles3.title, { fontSize: responsiveFont(18), lineHeight: responsiveLayout5.isWeb ? responsiveLayout5.webResponsiveFont(23) : 23 }]}
              >
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close enlarged chart"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [responsiveZoomUiStyles3.closeButton, pressed && responsiveZoomUiStyles3.pressed]}
            >
              <Ionicons color={theme.colors.text} name="xmark" size={19} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={responsiveZoomUiStyles3.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const zoomUiStyles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(3, 8, 17, 0.88)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  panel: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 18,
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
  content: { flexGrow: 1, gap: 12, paddingBottom: 4 },
  dateNavigation: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  dateButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardSoft,
    borderColor: theme.colors.dividerStrong,
    borderRadius: 9,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dateButtonDisabled: { opacity: 0.4 },
  dateRangeCopy: { alignItems: 'center', flex: 1, gap: 2 },
  dateRange: { color: theme.colors.text, fontWeight: '900' },
  dateHint: { color: theme.colors.textMuted, fontWeight: '700', textAlign: 'center' },
  zoomButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceCyan,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 9,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});

function createZoomUiStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...zoomUiStyles,
    backdrop: {
      ...zoomUiStyles["backdrop"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    panel: {
      ...zoomUiStyles["panel"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      maxHeight: layout.isWeb ? layout.webResponsiveHeight(900) : 900,
    },
    header: {
      ...zoomUiStyles["header"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    headingCopy: {
      ...zoomUiStyles["headingCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    closeButton: {
      ...zoomUiStyles["closeButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      height: layout.isWeb ? layout.webResponsiveHeight(40) : 40,
      width: layout.isWeb ? layout.webResponsiveWidth(40) : 40,
    },
    content: {
      ...zoomUiStyles["content"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    dateNavigation: {
      ...zoomUiStyles["dateNavigation"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    dateButton: {
      ...zoomUiStyles["dateButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      height: layout.isWeb ? layout.webResponsiveHeight(36) : 36,
      width: layout.isWeb ? layout.webResponsiveWidth(36) : 36,
    },
    zoomButton: {
      ...zoomUiStyles["zoomButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      height: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      width: layout.isWeb ? layout.webResponsiveWidth(34) : 34,
    },
  });
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    card: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
      borderWidth: 1,
      padding: 16,
      backgroundColor: theme.colors.card,
    },
    cardStack: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14 },
    cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, justifyContent: 'space-between' },
    eyebrow: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 1.4 },
    title: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(19) : 19, fontWeight: '900', letterSpacing: -0.25, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(24) : 24 },
    description: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15 },
    livePill: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999, borderWidth: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5, paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5 },
    liveDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6, width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6 },
    liveText: { color: theme.colors.scannerCyan, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 0.8 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    metric: { borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, borderWidth: 1, flexGrow: 1, flexBasis: '46%', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4, minWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(125) : 125, padding: 11 },
    metricCyan: { backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder },
    metricGold: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder },
    metricViolet: { backgroundColor: theme.colors.iconSurfaceViolet, borderColor: theme.colors.accentVioletBorder },
    metricMuted: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider },
    metricLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    metricLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 0.9 },
    metricValue: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(21) : 21, fontWeight: '900', letterSpacing: -0.45, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(25) : 25 },
    metricNegativeValue: { color: theme.colors.danger },
    metricPressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
    chartSurface: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.accentCyanBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, borderWidth: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, padding: 12 },
    reportingSurface: { backgroundColor: theme.colors.surfaceOverlay, borderColor: theme.colors.accentVioletBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, borderWidth: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, padding: 12 },
    reportingHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, justifyContent: 'space-between' },
    reportingHeadingCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    reportingTitle: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15, fontWeight: '900', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(19) : 19 },
    reportingDescription: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    chartPickerTrigger: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(52) : 52,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
    },
    chartPickerCopy: { flex: 1, gap: 2 },
    chartPickerEyebrow: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 1.1 },
    chartPickerValue: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12, fontWeight: '900' },
    chartPickerMenu: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderWidth: 1,
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4,
      padding: 5,
    },
    chartPickerOption: {
      alignItems: 'center',
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      flexDirection: 'row',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : 48,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(7) : 7,
    },
    chartPickerOptionSelected: { backgroundColor: theme.colors.iconSurfaceCyan },
    chartPickerDot: { borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(9) : 9, width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9 },
    chartPickerOptionCopy: { flex: 1, gap: 2 },
    chartPickerOptionTitle: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, fontWeight: '900' },
    chartPickerOptionDescription: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12 },
    wagmiChart: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderWidth: 1,
      overflow: 'hidden',
      paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5,
    },
    chartAxisLabels: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4,
      justifyContent: 'space-between',
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      paddingBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(9) : 9,
    },
    chartAxisLabel: { color: theme.colors.textMuted, flex: 1, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, textAlign: 'center' },
    moneyFlowGridLine: {
      left: 0,
      position: 'absolute',
      right: 0,
    },
    selectedPointCard: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.divider,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      borderWidth: 1,
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
    },
    selectedPointHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    selectedPointLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '900', letterSpacing: 0.7 },
    selectedPointValue: { fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13, fontWeight: '900' },
    selectedPointDetail: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12 },
    flowSelectedValues: { flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12 },
    flowSelectedValue: { fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '900' },
    reportingLegend: { alignItems: 'flex-end', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4, paddingTop: 2 },
    reportingNote: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    pnlChart: { alignItems: 'flex-end', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(112) : 112, paddingTop: 2 },
    pnlMonth: { alignItems: 'center', flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5, minWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(38) : 38 },
    pnlNetLabel: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(52) : 52 },
    pnlBars: { alignItems: 'flex-end', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(72) : 72 },
    pnlBar: { borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(3) : 3, width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7 },
    pnlRevenueBar: { backgroundColor: theme.colors.scannerCyan },
    pnlCostBar: { backgroundColor: theme.colors.goldBright },
    pnlNetBar: { backgroundColor: theme.colors.scannerViolet },
    pnlNetNegativeBar: { backgroundColor: theme.colors.danger },
    pnlMonthLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '800' },
    reportDivider: { backgroundColor: theme.colors.dividerStrong, height: 1 },
    reportSection: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    reportSectionHeading: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, justifyContent: 'space-between' },
    reportSectionTitle: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, fontWeight: '900' },
    reportSectionHint: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 0.8 },
    reportSectionDescription: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13 },
    reportRow: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4 },
    reportRowHeading: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6, justifyContent: 'space-between' },
    reportRowLabel: { color: theme.colors.textMuted, flex: 1, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10 },
    reportRowValue: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, fontWeight: '900' },
    reportTrack: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999, borderWidth: 1, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(7) : 7, overflow: 'hidden' },
    reportTrackFill: { borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999, height: '100%' },
    reportFillCyan: { backgroundColor: theme.colors.scannerCyan },
    reportFillGold: { backgroundColor: theme.colors.goldBright },
    reportFillViolet: { backgroundColor: theme.colors.scannerViolet },
    reportFillSuccess: { backgroundColor: theme.colors.success },
    reportFillDanger: { backgroundColor: theme.colors.danger },
    reportMeta: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8 },
    reportEmpty: { backgroundColor: theme.colors.cardSoft, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, padding: 10 },
    reportEmptyText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    chartHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
    chartHeadingActions: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    zoomLegend: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, justifyContent: 'flex-end' },
    chartLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 1 },
    chartTitle: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13, fontWeight: '800', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 },
    legend: { flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, paddingTop: 2 },
    legendItem: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4 },
    legendDot: { borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6, width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6 },
    legendText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '700' },
    chartControls: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7 },
    controlHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    controlLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 1 },
    controlValue: { color: theme.colors.scannerCyan, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '800' },
    segmentRow: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9, borderWidth: 1, flexDirection: 'row', padding: 3 },
    segmentButton: { alignItems: 'center', borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6, flex: 1, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(28) : 28, justifyContent: 'center', paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7 },
    segmentButtonActive: { backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderWidth: 1 },
    segmentText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 0.8 },
    segmentTextActive: { color: theme.colors.scannerCyan },
    rangeRow: { alignItems: 'center', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7, paddingVertical: 1 },
    rangeChip: { alignItems: 'center', borderColor: theme.colors.dividerStrong, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999, borderWidth: 1, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(28) : 28, justifyContent: 'center', paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11 },
    rangeChipActive: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder },
    rangeChipText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '900' },
    rangeChipTextActive: { color: theme.colors.goldBright },
    chartPlotRow: { flexDirection: 'row', marginHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(-10) : -10, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(100) : 100 },
    moneyFlowYAxis: { justifyContent: 'space-between', marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6, paddingRight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4 },
    moneyFlowChartContent: { flexShrink: 0 },
    yAxisLabel: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(7) : 7, fontWeight: '700', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, textAlign: 'right' },
    splitRow: { flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    inventorySurface: { backgroundColor: theme.colors.iconSurfaceViolet, borderColor: theme.colors.accentVioletBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, borderWidth: 1, flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3, padding: 11 },
    costSurface: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, borderWidth: 1, flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5, padding: 11 },
    inventoryValue: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(25) : 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(30) : 30 },
    inventoryCopy: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, fontWeight: '700', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    estimateCopy: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13, marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(3) : 3 },
    costRow: { alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4, justifyContent: 'space-between' },
    costLabel: { color: theme.colors.textMuted, flex: 1, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    costValue: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, fontWeight: '900' },
    noCostsText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15, marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(4) : 4 },
    attentionSurface: { alignItems: 'flex-start', backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, borderWidth: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9, padding: 11 },
    attentionCopy: { flex: 1, gap: 2 },
    attentionTitle: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, fontWeight: '900', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15 },
    attentionText: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    actions: { flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    planAction: { alignItems: 'center', backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.accentCyanBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, borderWidth: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(58) : 58, paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8 },
    planActionIcon: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(32) : 32, justifyContent: 'center', width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(32) : 32 },
    planActionCopy: { flex: 1, gap: 1 },
    planActionTitle: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12, fontWeight: '900' },
    planActionText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    primaryAction: { alignItems: 'center', backgroundColor: theme.colors.scannerCyan, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, flex: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7, justifyContent: 'center', minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(42) : 42, paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 },
    primaryActionText: { color: theme.colors.textOnAccent, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12, fontWeight: '900' },
    secondaryAction: { alignItems: 'center', borderColor: theme.colors.accentGoldBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(42) : 42, paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 },
    secondaryActionText: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12, fontWeight: '900' },
    errorText: { color: theme.colors.danger, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
    loadingCard: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.accentCyanBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16, borderWidth: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, padding: 16 },
    loadingCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    loadingText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 },
    emptyCard: { alignItems: 'flex-start', backgroundColor: theme.colors.card, borderColor: theme.colors.accentCyanBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16, borderWidth: 1, flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11, padding: 16 },
    emptyIcon: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceGold, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(39) : 39, justifyContent: 'center', width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(39) : 39 },
    emptyCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    emptyTitle: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15, fontWeight: '900', lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(20) : 20 },
    emptyText: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16 },
    emptyPlanAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5, marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5, minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(28) : 28 },
    emptyPlanActionText: { color: theme.colors.scannerCyan, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, fontWeight: '900' },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(19),
      },
    ],
    description: [
      staticStyles.description,
      {
        fontSize: responsiveFont(11),
      },
    ],
    liveDot: [
      staticStyles.liveDot,
      {
        height: responsiveHeight(6),
        width: responsiveWidth(6),
      },
    ],
    liveText: [
      staticStyles.liveText,
      {
        fontSize: responsiveFont(8),
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
    chartLabel: [
      staticStyles.chartLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    chartTitle: [
      staticStyles.chartTitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    legendDot: [
      staticStyles.legendDot,
      {
        height: responsiveHeight(6),
        width: responsiveWidth(6),
      },
    ],
    legendText: [
      staticStyles.legendText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    controlLabel: [
      staticStyles.controlLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    controlValue: [
      staticStyles.controlValue,
      {
        fontSize: responsiveFont(9),
      },
    ],
    segmentText: [
      staticStyles.segmentText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    rangeChipText: [
      staticStyles.rangeChipText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    yAxisLabel: [
      staticStyles.yAxisLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    inventoryValue: [
      staticStyles.inventoryValue,
      {
        fontSize: responsiveFont(25),
      },
    ],
    inventoryCopy: [
      staticStyles.inventoryCopy,
      {
        fontSize: responsiveFont(10),
      },
    ],
    estimateCopy: [
      staticStyles.estimateCopy,
      {
        fontSize: responsiveFont(9),
      },
    ],
    costLabel: [
      staticStyles.costLabel,
      {
        fontSize: responsiveFont(10),
      },
    ],
    costValue: [
      staticStyles.costValue,
      {
        fontSize: responsiveFont(10),
      },
    ],
    noCostsText: [
      staticStyles.noCostsText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    attentionTitle: [
      staticStyles.attentionTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    attentionText: [
      staticStyles.attentionText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    planActionIcon: [
      staticStyles.planActionIcon,
      {
        height: responsiveHeight(32),
        width: responsiveWidth(32),
      },
    ],
    planActionTitle: [
      staticStyles.planActionTitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    planActionText: [
      staticStyles.planActionText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    primaryActionText: [
      staticStyles.primaryActionText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    secondaryActionText: [
      staticStyles.secondaryActionText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    loadingText: [
      staticStyles.loadingText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    emptyIcon: [
      staticStyles.emptyIcon,
      {
        height: responsiveHeight(39),
        width: responsiveWidth(39),
      },
    ],
    emptyTitle: [
      staticStyles.emptyTitle,
      {
        fontSize: responsiveFont(15),
      },
    ],
    emptyText: [
      staticStyles.emptyText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    emptyPlanActionText: [
      staticStyles.emptyPlanActionText,
      {
        fontSize: responsiveFont(11),
      },
    ],
  };
}
