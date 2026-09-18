import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  onOpenInventory: () => void;
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

function barHeight(value: number, maximum: number) {
  if (value <= 0 || maximum <= 0) return 4;
  return Math.max(8, Math.round((value / maximum) * 74));
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

function compactSignedMoney(cents: number) {
  return `${cents < 0 ? '-' : ''}${compactMoney(cents)}`;
}

function reportBarHeight(value: number, maximum: number, maximumHeight = 72) {
  if (value <= 0 || maximum <= 0) return 3;
  return Math.max(5, Math.round((value / maximum) * maximumHeight));
}

function reportPercent(value: number | null) {
  return value == null ? '—' : `${Math.round(value)}%`;
}

export function BusinessPulse({
  errorMessage,
  loading,
  overview,
  onOpenBooks,
  onOpenFlipPlan,
  onOpenInventory,
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
  const chartGrid = [1, 0.75, 0.5, 0.25, 0];
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
            <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>BAR UNIT</Text>
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
        <View style={styles.chartPlotRow}>
          <View style={styles.yAxis}>
            {chartGrid.map((fraction) => (
              <Text key={fraction} style={[styles.yAxisLabel, { fontSize: responsiveFont(8), lineHeight: 10 }]}>
                {compactMoney(Math.round(maximumFlow * fraction))}
              </Text>
            ))}
          </View>
          <ScrollView
            contentContainerStyle={styles.chartBarsViewport}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chartScroll}
          >
            <View style={styles.chartPlotContent}>
              <View pointerEvents="none" style={styles.gridLayer}>
                {chartGrid.map((fraction) => (
                  <View
                    key={fraction}
                    style={[
                      styles.gridLine,
                      { bottom: Math.round(fraction * 77) },
                      fraction === 0 && styles.gridBaseline,
                    ]}
                  />
                ))}
              </View>
              <View style={styles.chartBars}>
                {moneyFlow.map((date) => (
                  <View key={date.key} style={styles.flowGroup}>
                    <View style={styles.bars}>
                      <View
                        style={[
                          styles.bar,
                          styles.inBar,
                          { height: barHeight(date.moneyInCents, maximumFlow) },
                        ]}
                      />
                      <View
                        style={[
                          styles.bar,
                          styles.outBar,
                          { height: barHeight(date.moneyOutCents, maximumFlow) },
                        ]}
                      />
                    </View>
                    <Text style={[styles.flowLabel, { fontSize: responsiveFont(9) }]}>{date.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
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
        <Pressable
          accessibilityHint="Opens your inventory items"
          accessibilityRole="button"
          onPress={onOpenInventory}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          <Text style={[styles.secondaryActionText, { fontSize: responsiveFont(12) }]}>See inventory</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FinancialReporting({
  overview,
}: {
  overview: ResellerBusinessOverview;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const profitAndLoss = overview.profitAndLoss;
  const grossMargin = overview.grossMarginByCategory;
  const expenseBreakdown = overview.expenseBreakdownThisMonth;
  const maximumProfitAndLoss = Math.max(
    ...profitAndLoss.flatMap((month) => [
      month.revenueCents,
      month.cogsCents + month.operatingExpensesCents,
      Math.abs(month.netProfitCents),
    ]),
    1,
  );
  const maximumGrossProfit = Math.max(
    ...grossMargin.map((category) => Math.abs(category.grossProfitCents)),
    1,
  );
  const maximumExpense = Math.max(
    ...expenseBreakdown.map((expense) => expense.amountCents),
    1,
  );
  const hasProfitAndLoss = profitAndLoss.some(
    (month) =>
      month.revenueCents > 0 ||
      month.cogsCents > 0 ||
      month.operatingExpensesCents > 0,
  );

  return (
    <View style={styles.reportingSurface}>
      <View style={styles.reportingHeader}>
        <View style={styles.reportingHeadingCopy}>
          <Text style={[styles.chartLabel, { fontSize: responsiveFont(8) }]}>FINANCIAL REPORTING</Text>
          <Text style={[styles.reportingTitle, { fontSize: responsiveFont(15), lineHeight: 19 }]}>Profit &amp; loss at a glance</Text>
          <Text style={[styles.reportingDescription, { fontSize: responsiveFont(10), lineHeight: 14 }]}>Recorded Books activity · last 6 months</Text>
        </View>
        <View style={styles.reportingLegend}>
          <Legend color={theme.colors.scannerCyan} label="Revenue" />
          <Legend color={theme.colors.goldBright} label="Costs" />
          <Legend color={theme.colors.scannerViolet} label="Net" />
        </View>
      </View>

      {hasProfitAndLoss ? (
        <View style={styles.pnlChart}>
          {profitAndLoss.map((month) => {
            const costsCents = month.cogsCents + month.operatingExpensesCents;
            return (
              <View
                accessible
                accessibilityLabel={`${month.label}: revenue ${money(month.revenueCents)}, costs ${money(costsCents)}, net ${money(month.netProfitCents)}`}
                key={month.key}
                style={styles.pnlMonth}
              >
                <Text numberOfLines={1} style={[styles.pnlNetLabel, { fontSize: responsiveFont(8) }]}>
                  {compactSignedMoney(month.netProfitCents)}
                </Text>
                <View style={styles.pnlBars}>
                  <View
                    style={[
                      styles.pnlBar,
                      styles.pnlRevenueBar,
                      { height: reportBarHeight(month.revenueCents, maximumProfitAndLoss) },
                    ]}
                  />
                  <View
                    style={[
                      styles.pnlBar,
                      styles.pnlCostBar,
                      { height: reportBarHeight(costsCents, maximumProfitAndLoss) },
                    ]}
                  />
                  <View
                    style={[
                      styles.pnlBar,
                      month.netProfitCents < 0
                        ? styles.pnlNetNegativeBar
                        : styles.pnlNetBar,
                      { height: reportBarHeight(Math.abs(month.netProfitCents), maximumProfitAndLoss) },
                    ]}
                  />
                </View>
                <Text style={[styles.pnlMonthLabel, { fontSize: responsiveFont(8) }]}>{month.label}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.reportEmpty}>
          <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>Record income, purchases, and expenses in Books to populate this trend.</Text>
        </View>
      )}

      <View style={styles.reportDivider} />

      <View style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={[styles.reportSectionTitle, { fontSize: responsiveFont(11) }]}>Gross margin by category</Text>
          <Text style={[styles.reportSectionHint, { fontSize: responsiveFont(8) }]}>REALIZED ONLY</Text>
        </View>
        <Text style={[styles.reportSectionDescription, { fontSize: responsiveFont(9), lineHeight: 13 }]}>Sales with a known acquisition cost, grouped by item category.</Text>
        {grossMargin.length ? (
          grossMargin.map((category) => {
            const fillWidth = Math.max(
              4,
              Math.round(
                (Math.abs(category.grossProfitCents) / maximumGrossProfit) * 100,
              ),
            );
            return (
              <View key={category.key} style={styles.reportRow}>
                <View style={styles.reportRowHeading}>
                  <Text numberOfLines={1} style={[styles.reportRowLabel, { fontSize: responsiveFont(10) }]}>{category.label}</Text>
                  <Text style={[styles.reportRowValue, { fontSize: responsiveFont(10) }]}>{money(category.grossProfitCents)} · {reportPercent(category.grossMarginPercent)}</Text>
                </View>
                <View style={styles.reportTrack}>
                  <View
                    style={[
                      styles.reportTrackFill,
                      category.grossProfitCents < 0
                        ? styles.reportFillDanger
                        : styles.reportFillViolet,
                      { width: `${Math.min(100, fillWidth)}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.reportMeta, { fontSize: responsiveFont(8) }]}>{category.itemCount} realized item{category.itemCount === 1 ? '' : 's'} · {money(category.revenueCents)} revenue · {money(category.cogsCents)} cost</Text>
              </View>
            );
          })
        ) : (
          <View style={styles.reportEmpty}>
            <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>Link a recorded sale to an item and add its acquisition cost to see category margin.</Text>
          </View>
        )}
      </View>

      <View style={styles.reportDivider} />

      <View style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={[styles.reportSectionTitle, { fontSize: responsiveFont(11) }]}>Expense allocation</Text>
          <Text style={[styles.reportSectionHint, { fontSize: responsiveFont(8) }]}>CURRENT MONTH</Text>
        </View>
        <Text style={[styles.reportSectionDescription, { fontSize: responsiveFont(9), lineHeight: 13 }]}>Cash outflows by ledger category, including inventory working capital.</Text>
        {expenseBreakdown.length ? (
          expenseBreakdown.map((expense, index) => {
            const fillStyle = [
              styles.reportFillCyan,
              styles.reportFillGold,
              styles.reportFillViolet,
              styles.reportFillSuccess,
              styles.reportFillDanger,
            ][index % 5];
            return (
              <View key={expense.entryType} style={styles.reportRow}>
                <View style={styles.reportRowHeading}>
                  <Text numberOfLines={1} style={[styles.reportRowLabel, { fontSize: responsiveFont(10) }]}>{expense.label}</Text>
                  <Text style={[styles.reportRowValue, { fontSize: responsiveFont(10) }]}>{money(expense.amountCents)}</Text>
                </View>
                <View style={styles.reportTrack}>
                  <View style={[styles.reportTrackFill, fillStyle, { width: `${Math.min(100, Math.max(4, Math.round((expense.amountCents / maximumExpense) * 100)))}%` }]} />
                </View>
                <Text style={[styles.reportMeta, { fontSize: responsiveFont(8) }]}>{Math.round(expense.sharePercent)}% of cash out{expense.isWorkingCapital ? ' · working capital' : ''}</Text>
              </View>
            );
          })
        ) : (
          <View style={styles.reportEmpty}>
            <Text style={[styles.reportEmptyText, { fontSize: responsiveFont(10), lineHeight: 14 }]}>No cash outflows have been recorded for this month yet.</Text>
          </View>
        )}
      </View>

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
    chartPlotRow: { flexDirection: 'row', minHeight: 100 },
    yAxis: { height: 78, justifyContent: 'space-between', marginTop: 6, paddingRight: 6, width: 42 },
    yAxisLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '700', lineHeight: 10, textAlign: 'right' },
    chartScroll: { flex: 1 },
    chartBarsViewport: { minWidth: '100%' },
    chartPlotContent: { minHeight: 100, minWidth: '100%', position: 'relative' },
    gridLayer: { height: 78, left: 2, position: 'absolute', right: 2, top: 6 },
    gridLine: { backgroundColor: theme.colors.divider, height: 1, left: 0, position: 'absolute', right: 0 },
    gridBaseline: { backgroundColor: theme.colors.dividerStrong },
    chartBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 100, minWidth: '100%', paddingHorizontal: 2, position: 'relative' },
    flowGroup: { alignItems: 'center', gap: 5, width: 30 },
    bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 78 },
    bar: { borderRadius: 4, width: 7 },
    inBar: { backgroundColor: theme.colors.scannerCyan },
    outBar: { backgroundColor: theme.colors.goldBright },
    flowLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700' },
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
    yAxis: [
      staticStyles.yAxis,
      {
        height: responsiveHeight(78),
        width: responsiveWidth(42),
      },
    ],
    yAxisLabel: [
      staticStyles.yAxisLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    gridLayer: [
      staticStyles.gridLayer,
      {
        height: responsiveHeight(78),
      },
    ],
    gridLine: [
      staticStyles.gridLine,
      {
        height: responsiveHeight(1),
      },
    ],
    flowGroup: [
      staticStyles.flowGroup,
      {
        width: responsiveWidth(30),
      },
    ],
    bars: [
      staticStyles.bars,
      {
        height: responsiveHeight(78),
      },
    ],
    bar: [
      staticStyles.bar,
      {
        width: responsiveWidth(7),
      },
    ],
    flowLabel: [
      staticStyles.flowLabel,
      {
        fontSize: responsiveFont(9),
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
