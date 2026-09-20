import { useContext, useMemo, useState } from 'react';
import {
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

import { IconSymbol } from '@/components/ui/icon-symbol';
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
  trimLeadingEmptyProfitAndLossMonths,
  trimLeadingEmptyMoneyFlowBuckets,
  type BusinessMoneyFlowGranularity,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';

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
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const [selectedGranularity, setSelectedGranularity] =
    useState<BusinessMoneyFlowGranularity | null>(null);
  const [selectedRangeCount, setSelectedRangeCount] = useState<number | null>(
    null,
  );

  if (loading && !overview) {
    return (
      <View style={styles.loadingCard}>
        <IconSymbol color={theme.colors.scannerCyan} name="chart.bar.fill" size={20} />
        <View style={styles.loadingCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
          <Text style={[styles.loadingText, { fontSize: responsiveFont(12), lineHeight: 17 }]}>Loading your saved money and inventory records</Text>
        </View>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <IconSymbol color={theme.colors.goldBright} name="chart.bar.fill" size={20} />
        </View>
        <View style={styles.emptyCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
          <Text style={[styles.emptyTitle, { fontSize: responsiveFont(15), lineHeight: 20 }]}>Your working numbers will show here</Text>
          <Text style={[styles.emptyText, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
            Add an item with its real cost, then record a sale or expense to see a clear picture of your business.
          </Text>
          <Pressable
            accessibilityHint="Opens a private calculator for planning a possible flip"
            accessibilityRole="button"
            onPress={onOpenFlipPlan}
            style={({ pressed }) => [styles.emptyPlanAction, pressed && styles.pressed]}
          >
            <Text style={[styles.emptyPlanActionText, { fontSize: responsiveFont(11) }]}>Plan a possible flip</Text>
            <IconSymbol color={theme.colors.scannerCyan} name="chevron.right" size={14} />
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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS PULSE</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(19), lineHeight: 24 }]}>The numbers that matter</Text>
        </View>
      </View>

      <Text style={[styles.description, { fontSize: responsiveFont(11), lineHeight: 15 }]}>
        Real money stays separate from item estimates, so you can see what happened without the sometimes confusing accounting-speak.
      </Text>

      <View style={styles.metricGrid}>
        <Metric label="MONEY IN" value={money(overview.currentMonth.moneyInCents)} tone="cyan" />
        <Metric label="COSTS" value={money(overview.currentMonth.moneyOutCents)} tone="gold" />
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
        <Metric label="CASH TIED UP" value={money(overview.inventory.cashTiedUpCents)} tone="muted" />
      </View>

      <View style={styles.chartSurface}>
        <View style={styles.chartHeading}>
          <View>
            <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>MONEY MOVEMENT</Text>
            <Text style={[styles.chartTitle, { fontSize: responsiveFont(13), lineHeight: 17 }]}>{selectedRange.label}</Text>
          </View>
          <View style={styles.legend}>
            <Legend color={theme.colors.scannerCyan} label="In" />
            <Legend color={theme.colors.goldBright} label="Out" />
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
        <MoneyMovementChart moneyFlow={moneyFlow} maximumFlow={maximumFlow} />
      </View>

      <FinancialReporting overview={overview} />

      <View style={styles.splitRow}>
        <View style={styles.inventorySurface}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>ITEMS ON HAND</Text>
          <Text style={[styles.inventoryValue, { fontSize: responsiveFont(25), lineHeight: 30 }]}>{overview.inventory.onHandCount}</Text>
          <Text style={[styles.inventoryCopy, { fontSize: responsiveFont(10), lineHeight: 14 }]}>
            {overview.inventory.readyToFlipCount} ready to flip · {overview.inventory.undecidedCount} to decide
          </Text>
          <Text style={[styles.estimateCopy, { fontSize: responsiveFont(9), lineHeight: 13 }]}>
            Est. item value {money(overview.inventory.estimatedOnHandValueCents)} · not money earned
          </Text>
        </View>
        <View style={styles.costSurface}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>BIGGEST COSTS</Text>
          {overview.topCostsThisMonth.length ? (
            overview.topCostsThisMonth.map((cost) => (
              <View key={cost.entryType} style={styles.costRow}>
                <Text numberOfLines={1} style={[styles.costLabel, { fontSize: responsiveFont(10), lineHeight: 14 }]}>{cost.label}</Text>
                <Text style={[styles.costValue, { fontSize: responsiveFont(10) }]}>{money(cost.amountCents)}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.noCostsText, { fontSize: responsiveFont(10), lineHeight: 15 }]}>No costs saved for this month yet.</Text>
          )}
        </View>
      </View>

      {attention.length ? (
        <View style={styles.attentionSurface}>
          <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={18} />
          <View style={styles.attentionCopy}>
            <Text style={[styles.attentionTitle, { fontSize: responsiveFont(11), lineHeight: 15 }]}>A couple things need your eyes</Text>
            {attention.slice(0, 2).map((message) => (
              <Text key={message} style={[styles.attentionText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>• {message}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {errorMessage ? <Text style={[styles.errorText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityHint="Opens a private calculator for planning a possible flip"
        accessibilityRole="button"
        onPress={onOpenFlipPlan}
        style={({ pressed }) => [styles.planAction, pressed && styles.pressed]}
      >
        <View style={styles.planActionIcon}>
          <IconSymbol color={theme.colors.scannerCyan} name="star.fill" size={16} />
        </View>
        <View style={styles.planActionCopy}>
          <Text style={[styles.planActionTitle, { fontSize: responsiveFont(12) }]}>Plan the next flip</Text>
          <Text style={[styles.planActionText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>Test the buy, fix-up, selling costs, and an optional partner split.</Text>
        </View>
        <IconSymbol color={theme.colors.scannerCyan} name="chevron.right" size={15} />
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Opens your books and reports"
          accessibilityRole="button"
          onPress={onOpenBooks}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
        >
          <Text style={[styles.primaryActionText, { fontSize: responsiveFont(12) }]}>Open books</Text>
          <IconSymbol color={theme.colors.backgroundDeep} name="chart.bar.fill" size={15} />
        </Pressable>
      </View>
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
  moneyFlow,
  maximumFlow,
}: {
  moneyFlow: ResellerBusinessOverview['moneyFlow'];
  maximumFlow: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont, responsiveHeight, responsiveWidth } = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [plotWidth, setPlotWidth] = useState(0);
  const chartGrid = [1, 0.75, 0.5, 0.25, 0];
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
  const chartValueMax = Math.max(maximumFlow / 100, 1);
  const safePointIndex = Math.min(
    Math.max(activePointIndex, 0),
    Math.max(moneyFlow.length - 1, 0),
  );
  const activePoint = moneyFlow[safePointIndex];
  const yAxisWidth = responsiveWidth(34);
  const fallbackChartWidth = Math.max(windowWidth - 84, 180);
  const chartWidth = plotWidth > 0
    ? Math.max(plotWidth - yAxisWidth, 1)
    : fallbackChartWidth;
  const netCents = activePoint
    ? activePoint.moneyInCents - activePoint.moneyOutCents
    : 0;

  return (
    <>
      <View
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          setPlotWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
        }}
        style={styles.chartPlotRow}
      >
        <View
          style={[
            styles.moneyFlowYAxis,
            {
              height: responsiveHeight(178),
              width: yAxisWidth,
            },
          ]}
        >
          {chartGrid.map((fraction) => (
            <Text
              key={fraction}
              style={[
                styles.yAxisLabel,
                { fontSize: responsiveFont(7), lineHeight: 9 },
              ]}
            >
              {compactMoney(Math.round(maximumFlow * fraction))}
            </Text>
          ))}
        </View>
        <View style={[styles.moneyFlowChartContent, { width: chartWidth }]}>
          <View style={[styles.wagmiChart, { width: chartWidth }]}>
            <LineChart.Provider
              data={chartData}
              onCurrentIndexChange={setActivePointIndex}
              yRange={{ min: 0, max: chartValueMax }}
            >
              <LineChart.Group>
                <LineChart id="moneyIn" width={chartWidth} height={218}>
                  <LineChart.Path color={theme.colors.scannerCyan} width={3} />
                  <MoneyFlowTrackerDot color={theme.colors.scannerCyan} index={safePointIndex} />
                </LineChart>
                <LineChart id="moneyOut" width={chartWidth} height={218}>
                  <LineChart.Path color={theme.colors.goldBright} width={3}>
                    {chartGrid.map((fraction) => (
                      <LineChart.HorizontalLine
                        at={{ value: chartValueMax * fraction }}
                        color={
                          fraction === 0
                            ? theme.colors.dividerStrong
                            : theme.colors.divider
                        }
                        key={fraction}
                        lineProps={{
                          strokeDasharray: fraction === 0 ? undefined : '4 5',
                          strokeWidth: fraction === 0 ? 2 : 1,
                        }}
                      />
                    ))}
                  </LineChart.Path>
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
                        borderRadius: 8,
                        color: theme.colors.text,
                        fontSize: 10,
                        padding: 6,
                      }}
                    />
                  </LineChart.CursorLine>
                  <MoneyFlowTrackerDot color={theme.colors.goldBright} index={safePointIndex} />
                </LineChart>
              </LineChart.Group>
            </LineChart.Provider>
          </View>
          <View style={[styles.chartAxisLabels, { width: chartWidth }]}>
            {moneyFlow.map((bucket) => (
              <Text
                key={bucket.key}
                numberOfLines={1}
                style={[
                  styles.chartAxisLabel,
                  { fontSize: responsiveFont(8) },
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
                { fontSize: responsiveFont(9) },
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
                  fontSize: responsiveFont(13),
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
                { color: theme.colors.scannerCyan, fontSize: responsiveFont(9) },
              ]}
            >
              IN {money(activePoint.moneyInCents)}
            </Text>
            <Text
              style={[
                styles.flowSelectedValue,
                { color: theme.colors.goldBright, fontSize: responsiveFont(9) },
              ]}
            >
              OUT {money(activePoint.moneyOutCents)}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

function FinancialReporting({
  overview,
}: {
  overview: ResellerBusinessOverview;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const [activeChart, setActiveChart] = useState<FinancialChartId>('pnl');
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
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
  const chartWidth = Math.min(Math.max(windowWidth - 60, 240), 720);
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

  return (
    <View style={styles.reportingSurface}>
      <View style={styles.reportingHeader}>
        <View style={styles.reportingHeadingCopy}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>FINANCIAL REPORTING</Text>
          <Text style={[styles.reportingTitle, { fontSize: responsiveFont(15), lineHeight: 19 }]}>{chartOption.label}</Text>
          <Text style={[styles.reportingDescription, { fontSize: responsiveFont(10), lineHeight: 14 }]}>{chartOption.description}</Text>
        </View>
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
        <IconSymbol
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
                {selected ? <IconSymbol color={option.color} name="checkmark.circle.fill" size={17} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasChartData ? (
        <>
          <View style={styles.wagmiChart}>
            <LineChart.Provider
              data={chartData}
              onCurrentIndexChange={setActivePointIndex}
              yRange={{
                min: chartMin - chartPadding,
                max: chartMax + chartPadding,
              }}>
              <LineChart width={chartWidth} height={218}>
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
                    size={4}
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
                      borderRadius: 8,
                      color: theme.colors.text,
                      fontSize: 10,
                      padding: 6,
                    }}
                  />
                </LineChart.CursorLine>
              </LineChart>
            </LineChart.Provider>
            <View style={styles.chartAxisLabels}>
              {chartPoints.map((point) => (
                <Text key={point.key} numberOfLines={1} style={[styles.chartAxisLabel, { fontSize: responsiveFont(8) }]}>
                  {point.label}
                </Text>
              ))}
            </View>
          </View>
          {activePoint ? (
            <View style={styles.selectedPointCard}>
              <View style={styles.selectedPointHeading}>
                <Text style={[styles.selectedPointLabel, { fontSize: responsiveFont(9) }]}>{activePoint.label}</Text>
                <Text selectable style={[styles.selectedPointValue, { color: chartOption.color, fontSize: responsiveFont(13) }]}>{money(activePoint.valueCents)}</Text>
              </View>
              <Text style={[styles.selectedPointDetail, { fontSize: responsiveFont(8) }]}>{activePoint.detail}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.reportEmpty}>
          <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>
            {activeChart === 'pnl'
              ? 'Record income, purchases, and expenses in Books to populate this trend.'
              : activeChart === 'gross-margin'
                ? 'Link a recorded sale to an item and add its acquisition cost to see category margin.'
                : 'No cash outflows have been recorded for this month yet.'}
          </Text>
        </View>
      )}
      <Text style={[styles.reportingNote, { fontSize: responsiveFont(9), lineHeight: 14 }]}>COGS is recognized when a recorded sale is matched to a known acquisition cost. Inventory purchases stay working-capital cash outflows until they are sold.</Text>
    </View>
  );
}

function Metric({
  label,
  value,
  tone,
  valueStyle,
}: {
  label: string;
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
  return (
    <View style={[styles.metric, toneStyle]}>
      <Text style={[styles.metricLabel, { fontSize: responsiveFont(8) }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, valueStyle]}>{value}</Text>
    </View>
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

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    card: {
      gap: 14,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      backgroundColor: theme.colors.card,
    },
    cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    eyebrow: { color: theme.colors.goldBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
    title: { color: theme.colors.cream, fontSize: 19, fontWeight: '900', letterSpacing: -0.25, lineHeight: 24 },
    description: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
    livePill: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
    liveDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: 4, height: 6, width: 6 },
    liveText: { color: theme.colors.scannerCyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { borderRadius: 11, borderWidth: 1, flexGrow: 1, flexBasis: '46%', gap: 4, minWidth: 125, padding: 11 },
    metricCyan: { backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder },
    metricGold: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder },
    metricViolet: { backgroundColor: theme.colors.iconSurfaceViolet, borderColor: theme.colors.accentVioletBorder },
    metricMuted: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider },
    metricLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
    metricValue: { color: theme.colors.cream, fontSize: 21, fontWeight: '900', letterSpacing: -0.45, lineHeight: 25 },
    metricNegativeValue: { color: theme.colors.danger },
    chartSurface: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.accentCyanBorder, borderRadius: 12, borderWidth: 1, gap: 11, padding: 12 },
    reportingSurface: { backgroundColor: theme.colors.surfaceOverlay, borderColor: theme.colors.accentVioletBorder, borderRadius: 12, borderWidth: 1, gap: 12, padding: 12 },
    reportingHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
    reportingHeadingCopy: { flex: 1, gap: 3 },
    reportingTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '900', lineHeight: 19 },
    reportingDescription: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    chartPickerTrigger: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chartPickerCopy: { flex: 1, gap: 2 },
    chartPickerEyebrow: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
    chartPickerValue: { color: theme.colors.text, fontSize: 12, fontWeight: '900' },
    chartPickerMenu: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 10,
      borderWidth: 1,
      gap: 4,
      padding: 5,
    },
    chartPickerOption: {
      alignItems: 'center',
      borderRadius: 8,
      flexDirection: 'row',
      gap: 9,
      minHeight: 48,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    chartPickerOptionSelected: { backgroundColor: theme.colors.iconSurfaceCyan },
    chartPickerDot: { borderRadius: 5, height: 9, width: 9 },
    chartPickerOptionCopy: { flex: 1, gap: 2 },
    chartPickerOptionTitle: { color: theme.colors.text, fontSize: 10, fontWeight: '900' },
    chartPickerOptionDescription: { color: theme.colors.textMuted, fontSize: 8, lineHeight: 12 },
    wagmiChart: {
      alignItems: 'center',
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.divider,
      borderRadius: 10,
      borderWidth: 1,
      overflow: 'hidden',
      paddingTop: 5,
    },
    chartAxisLabels: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingBottom: 9,
    },
    chartAxisLabel: { color: theme.colors.textMuted, flex: 1, fontSize: 8, textAlign: 'center' },
    selectedPointCard: {
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.divider,
      borderRadius: 9,
      borderWidth: 1,
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectedPointHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    selectedPointLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
    selectedPointValue: { fontSize: 13, fontWeight: '900' },
    selectedPointDetail: { color: theme.colors.textMuted, fontSize: 8, lineHeight: 12 },
    flowSelectedValues: { flexDirection: 'row', gap: 12 },
    flowSelectedValue: { fontSize: 9, fontWeight: '900' },
    reportingLegend: { alignItems: 'flex-end', gap: 4, paddingTop: 2 },
    reportingNote: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 14 },
    pnlChart: { alignItems: 'flex-end', flexDirection: 'row', gap: 7, minHeight: 112, paddingTop: 2 },
    pnlMonth: { alignItems: 'center', flex: 1, gap: 5, minWidth: 38 },
    pnlNetLabel: { color: theme.colors.text, fontSize: 8, fontWeight: '900', maxWidth: 52 },
    pnlBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 72 },
    pnlBar: { borderRadius: 4, minHeight: 3, width: 7 },
    pnlRevenueBar: { backgroundColor: theme.colors.scannerCyan },
    pnlCostBar: { backgroundColor: theme.colors.goldBright },
    pnlNetBar: { backgroundColor: theme.colors.scannerViolet },
    pnlNetNegativeBar: { backgroundColor: theme.colors.danger },
    pnlMonthLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '800' },
    reportDivider: { backgroundColor: theme.colors.dividerStrong, height: 1 },
    reportSection: { gap: 8 },
    reportSectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    reportSectionTitle: { color: theme.colors.text, fontSize: 11, fontWeight: '900' },
    reportSectionHint: { color: theme.colors.goldBright, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
    reportSectionDescription: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 13 },
    reportRow: { gap: 4 },
    reportRowHeading: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
    reportRowLabel: { color: theme.colors.textMuted, flex: 1, fontSize: 10 },
    reportRowValue: { color: theme.colors.text, fontSize: 10, fontWeight: '900' },
    reportTrack: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider, borderRadius: 999, borderWidth: 1, height: 7, overflow: 'hidden' },
    reportTrackFill: { borderRadius: 999, height: '100%' },
    reportFillCyan: { backgroundColor: theme.colors.scannerCyan },
    reportFillGold: { backgroundColor: theme.colors.goldBright },
    reportFillViolet: { backgroundColor: theme.colors.scannerViolet },
    reportFillSuccess: { backgroundColor: theme.colors.success },
    reportFillDanger: { backgroundColor: theme.colors.danger },
    reportMeta: { color: theme.colors.textMuted, fontSize: 8 },
    reportEmpty: { backgroundColor: theme.colors.cardSoft, borderRadius: 8, padding: 10 },
    reportEmptyText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    chartHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
    chartLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
    chartTitle: { color: theme.colors.text, fontSize: 13, fontWeight: '800', lineHeight: 17 },
    legend: { flexDirection: 'row', gap: 8, paddingTop: 2 },
    legendItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    legendDot: { borderRadius: 3, height: 6, width: 6 },
    legendText: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700' },
    chartControls: { gap: 7 },
    controlHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    controlLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
    controlValue: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '800' },
    segmentRow: { backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider, borderRadius: 9, borderWidth: 1, flexDirection: 'row', padding: 3 },
    segmentButton: { alignItems: 'center', borderRadius: 6, flex: 1, minHeight: 28, justifyContent: 'center', paddingHorizontal: 7 },
    segmentButtonActive: { backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderWidth: 1 },
    segmentText: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
    segmentTextActive: { color: theme.colors.scannerCyan },
    rangeRow: { alignItems: 'center', gap: 7, paddingVertical: 1 },
    rangeChip: { alignItems: 'center', borderColor: theme.colors.dividerStrong, borderRadius: 999, borderWidth: 1, minHeight: 28, justifyContent: 'center', paddingHorizontal: 11 },
    rangeChipActive: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder },
    rangeChipText: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '900' },
    rangeChipTextActive: { color: theme.colors.goldBright },
    chartPlotRow: { flexDirection: 'row', marginHorizontal: -10, minHeight: 100 },
    moneyFlowYAxis: { justifyContent: 'space-between', marginTop: 6, paddingRight: 4 },
    moneyFlowChartContent: { flexShrink: 0 },
    yAxisLabel: { color: theme.colors.textMuted, fontSize: 7, fontWeight: '700', lineHeight: 9, textAlign: 'right' },
    splitRow: { flexDirection: 'row', gap: 8 },
    inventorySurface: { backgroundColor: theme.colors.iconSurfaceViolet, borderColor: theme.colors.accentVioletBorder, borderRadius: 12, borderWidth: 1, flex: 1, gap: 3, padding: 11 },
    costSurface: { backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder, borderRadius: 12, borderWidth: 1, flex: 1, gap: 5, padding: 11 },
    inventoryValue: { color: theme.colors.cream, fontSize: 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: 30 },
    inventoryCopy: { color: theme.colors.text, fontSize: 10, fontWeight: '700', lineHeight: 14 },
    estimateCopy: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
    costRow: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
    costLabel: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 14 },
    costValue: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '900' },
    noCostsText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 4 },
    attentionSurface: { alignItems: 'flex-start', backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 11 },
    attentionCopy: { flex: 1, gap: 2 },
    attentionTitle: { color: theme.colors.goldBright, fontSize: 11, fontWeight: '900', lineHeight: 15 },
    attentionText: { color: theme.colors.text, fontSize: 10, lineHeight: 14 },
    actions: { flexDirection: 'row', gap: 8 },
    planAction: { alignItems: 'center', backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.accentCyanBorder, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58, paddingHorizontal: 10, paddingVertical: 8 },
    planActionIcon: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
    planActionCopy: { flex: 1, gap: 1 },
    planActionTitle: { color: theme.colors.cream, fontSize: 12, fontWeight: '900' },
    planActionText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    primaryAction: { alignItems: 'center', backgroundColor: theme.colors.scannerCyan, borderRadius: 10, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
    primaryActionText: { color: theme.colors.textOnAccent, fontSize: 12, fontWeight: '900' },
    secondaryAction: { alignItems: 'center', borderColor: theme.colors.accentGoldBorder, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
    secondaryActionText: { color: theme.colors.goldBright, fontSize: 12, fontWeight: '900' },
    errorText: { color: theme.colors.danger, fontSize: 10, lineHeight: 14 },
    pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
    loadingCard: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.accentCyanBorder, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 16 },
    loadingCopy: { flex: 1, gap: 3 },
    loadingText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
    emptyCard: { alignItems: 'flex-start', backgroundColor: theme.colors.card, borderColor: theme.colors.accentCyanBorder, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 16 },
    emptyIcon: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceGold, borderRadius: 10, height: 39, justifyContent: 'center', width: 39 },
    emptyCopy: { flex: 1, gap: 3 },
    emptyTitle: { color: theme.colors.cream, fontSize: 15, fontWeight: '900', lineHeight: 20 },
    emptyText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
    emptyPlanAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 5, marginTop: 5, minHeight: 28 },
    emptyPlanActionText: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: '900' },
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
