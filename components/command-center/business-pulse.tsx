import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  buildMoneyFlowBuckets,
  getDefaultMoneyFlowGranularity,
  getDefaultMoneyFlowRange,
  moneyFlowRangeOptions,
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

function metricTone(value: number) {
  if (value < 0) return styles.metricNegativeValue;
  return styles.metricValue;
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

export function BusinessPulse({
  errorMessage,
  loading,
  overview,
  onOpenBooks,
  onOpenFlipPlan,
  onOpenInventory,
}: BusinessPulseProps) {
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
          <Text style={styles.eyebrow}>BUSINESS PULSE</Text>
          <Text style={styles.loadingText}>Loading your saved money and inventory records</Text>
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
          <Text style={styles.eyebrow}>BUSINESS PULSE</Text>
          <Text style={styles.emptyTitle}>Your working numbers will show here</Text>
          <Text style={styles.emptyText}>
            Add an item with its real cost, then record a sale or expense to see a clear picture of your business.
          </Text>
          <Pressable
            accessibilityHint="Opens a private calculator for planning a possible flip"
            accessibilityRole="button"
            onPress={onOpenFlipPlan}
            style={({ pressed }) => [styles.emptyPlanAction, pressed && styles.pressed]}
          >
            <Text style={styles.emptyPlanActionText}>Plan a possible flip</Text>
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
  const moneyFlow = buildMoneyFlowBuckets({
    bucketCount: rangeCount,
    entries: overview.moneyFlowEntries,
    granularity,
    now: chartNow,
  });
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
          <Text style={styles.eyebrow}>BUSINESS PULSE</Text>
          <Text style={styles.title}>The numbers that matter</Text>
        </View>
      </View>

      <Text style={styles.description}>
        Real money stays separate from item estimates, so you can see what happened without the sometimes confusing accounting-speak.
      </Text>

      <View style={styles.metricGrid}>
        <Metric label="MONEY IN" value={money(overview.currentMonth.moneyInCents)} tone="cyan" />
        <Metric label="COSTS" value={money(overview.currentMonth.moneyOutCents)} tone="gold" />
        <Metric
          label="LEFT AFTER COSTS"
          value={money(overview.currentMonth.leftAfterCostsCents)}
          valueStyle={metricTone(overview.currentMonth.leftAfterCostsCents)}
          tone="violet"
        />
        <Metric label="CASH TIED UP" value={money(overview.inventory.cashTiedUpCents)} tone="muted" />
      </View>

      <View style={styles.chartSurface}>
        <View style={styles.chartHeading}>
          <View>
            <Text style={styles.chartLabel}>MONEY MOVEMENT</Text>
            <Text style={styles.chartTitle}>{selectedRange.label}</Text>
          </View>
          <View style={styles.legend}>
            <Legend color={theme.colors.scannerCyan} label="In" />
            <Legend color={theme.colors.goldBright} label="Out" />
          </View>
        </View>
        <View style={styles.chartControls}>
          <View style={styles.controlHeading}>
            <Text style={styles.controlLabel}>BAR UNIT</Text>
            <Text style={styles.controlValue}>
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
            <Text style={styles.controlLabel}>TIME SPAN</Text>
            <Text style={styles.controlValue}>{selectedRange.label}</Text>
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
              <Text key={fraction} style={styles.yAxisLabel}>
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
                    <Text style={styles.flowLabel}>{date.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <View style={styles.splitRow}>
        <View style={styles.inventorySurface}>
          <Text style={styles.chartLabel}>ITEMS ON HAND</Text>
          <Text style={styles.inventoryValue}>{overview.inventory.onHandCount}</Text>
          <Text style={styles.inventoryCopy}>
            {overview.inventory.readyToFlipCount} ready to flip · {overview.inventory.undecidedCount} to decide
          </Text>
          <Text style={styles.estimateCopy}>
            Est. item value {money(overview.inventory.estimatedOnHandValueCents)} · not money earned
          </Text>
        </View>
        <View style={styles.costSurface}>
          <Text style={styles.chartLabel}>BIGGEST COSTS</Text>
          {overview.topCostsThisMonth.length ? (
            overview.topCostsThisMonth.map((cost) => (
              <View key={cost.entryType} style={styles.costRow}>
                <Text numberOfLines={1} style={styles.costLabel}>{cost.label}</Text>
                <Text style={styles.costValue}>{money(cost.amountCents)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noCostsText}>No costs saved for this month yet.</Text>
          )}
        </View>
      </View>

      {attention.length ? (
        <View style={styles.attentionSurface}>
          <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={18} />
          <View style={styles.attentionCopy}>
            <Text style={styles.attentionTitle}>A couple things need your eyes</Text>
            {attention.slice(0, 2).map((message) => (
              <Text key={message} style={styles.attentionText}>• {message}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

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
          <Text style={styles.planActionTitle}>Plan the next flip</Text>
          <Text style={styles.planActionText}>Test the buy, fix-up, selling costs, and an optional partner split.</Text>
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
          <Text style={styles.primaryActionText}>Open books</Text>
          <IconSymbol color={theme.colors.backgroundDeep} name="chart.bar.fill" size={15} />
        </Pressable>
        <Pressable
          accessibilityHint="Opens your inventory items"
          accessibilityRole="button"
          onPress={onOpenInventory}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryActionText}>See inventory</Text>
        </Pressable>
      </View>
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
  const toneStyle = {
    cyan: styles.metricCyan,
    gold: styles.metricGold,
    muted: styles.metricMuted,
    violet: styles.metricViolet,
  }[tone];
  return (
    <View style={[styles.metric, toneStyle]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderColor: 'rgba(88, 223, 232, 0.27)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    backgroundColor: 'rgba(5, 13, 19, 0.86)',
  },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  eyebrow: { color: theme.colors.goldBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: theme.colors.cream, fontSize: 19, fontWeight: '900', letterSpacing: -0.25, lineHeight: 24 },
  description: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
  livePill: { alignItems: 'center', backgroundColor: 'rgba(88, 223, 232, 0.10)', borderColor: 'rgba(88, 223, 232, 0.24)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  liveDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: 4, height: 6, width: 6 },
  liveText: { color: theme.colors.scannerCyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { borderRadius: 11, borderWidth: 1, flexGrow: 1, flexBasis: '46%', gap: 4, minWidth: 125, padding: 11 },
  metricCyan: { backgroundColor: 'rgba(43, 213, 226, 0.09)', borderColor: 'rgba(88, 223, 232, 0.25)' },
  metricGold: { backgroundColor: 'rgba(215, 168, 74, 0.10)', borderColor: 'rgba(242, 211, 138, 0.24)' },
  metricViolet: { backgroundColor: 'rgba(160, 111, 255, 0.10)', borderColor: 'rgba(190, 154, 255, 0.24)' },
  metricMuted: { backgroundColor: 'rgba(255, 255, 255, 0.035)', borderColor: 'rgba(255, 255, 255, 0.10)' },
  metricLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  metricValue: { color: theme.colors.cream, fontSize: 21, fontWeight: '900', letterSpacing: -0.45, lineHeight: 25 },
  metricNegativeValue: { color: '#FFB8B1' },
  chartSurface: { backgroundColor: 'rgba(0, 0, 0, 0.20)', borderColor: 'rgba(88, 223, 232, 0.16)', borderRadius: 12, borderWidth: 1, gap: 11, padding: 12 },
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
  segmentRow: { backgroundColor: 'rgba(255, 255, 255, 0.035)', borderColor: 'rgba(255, 255, 255, 0.10)', borderRadius: 9, borderWidth: 1, flexDirection: 'row', padding: 3 },
  segmentButton: { alignItems: 'center', borderRadius: 6, flex: 1, minHeight: 28, justifyContent: 'center', paddingHorizontal: 7 },
  segmentButtonActive: { backgroundColor: 'rgba(88, 223, 232, 0.18)', borderColor: 'rgba(88, 223, 232, 0.32)', borderWidth: 1 },
  segmentText: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  segmentTextActive: { color: theme.colors.scannerCyan },
  rangeRow: { alignItems: 'center', gap: 7, paddingVertical: 1 },
  rangeChip: { alignItems: 'center', borderColor: 'rgba(242, 211, 138, 0.22)', borderRadius: 999, borderWidth: 1, minHeight: 28, justifyContent: 'center', paddingHorizontal: 11 },
  rangeChipActive: { backgroundColor: 'rgba(215, 168, 74, 0.16)', borderColor: 'rgba(242, 211, 138, 0.58)' },
  rangeChipText: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '900' },
  rangeChipTextActive: { color: theme.colors.goldBright },
  chartPlotRow: { flexDirection: 'row', minHeight: 100 },
  yAxis: { height: 78, justifyContent: 'space-between', marginTop: 6, paddingRight: 6, width: 42 },
  yAxisLabel: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '700', lineHeight: 10, textAlign: 'right' },
  chartScroll: { flex: 1 },
  chartBarsViewport: { minWidth: '100%' },
  chartPlotContent: { minHeight: 100, minWidth: '100%', position: 'relative' },
  gridLayer: { height: 78, left: 2, position: 'absolute', right: 2, top: 6 },
  gridLine: { backgroundColor: 'rgba(173, 167, 178, 0.18)', height: 1, left: 0, position: 'absolute', right: 0 },
  gridBaseline: { backgroundColor: 'rgba(242, 211, 138, 0.32)' },
  chartBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 100, minWidth: '100%', paddingHorizontal: 2, position: 'relative' },
  flowGroup: { alignItems: 'center', gap: 5, width: 30 },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 78 },
  bar: { borderRadius: 4, width: 7 },
  inBar: { backgroundColor: theme.colors.scannerCyan },
  outBar: { backgroundColor: theme.colors.goldBright },
  flowLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700' },
  splitRow: { flexDirection: 'row', gap: 8 },
  inventorySurface: { backgroundColor: 'rgba(78, 41, 147, 0.16)', borderColor: 'rgba(190, 154, 255, 0.20)', borderRadius: 12, borderWidth: 1, flex: 1, gap: 3, padding: 11 },
  costSurface: { backgroundColor: 'rgba(21, 16, 5, 0.56)', borderColor: 'rgba(242, 211, 138, 0.17)', borderRadius: 12, borderWidth: 1, flex: 1, gap: 5, padding: 11 },
  inventoryValue: { color: theme.colors.cream, fontSize: 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: 30 },
  inventoryCopy: { color: theme.colors.text, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  estimateCopy: { color: theme.colors.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  costRow: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  costLabel: { color: theme.colors.textMuted, flex: 1, fontSize: 10, lineHeight: 14 },
  costValue: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '900' },
  noCostsText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  attentionSurface: { alignItems: 'flex-start', backgroundColor: 'rgba(215, 168, 74, 0.11)', borderColor: 'rgba(242, 211, 138, 0.28)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 11 },
  attentionCopy: { flex: 1, gap: 2 },
  attentionTitle: { color: theme.colors.goldBright, fontSize: 11, fontWeight: '900', lineHeight: 15 },
  attentionText: { color: theme.colors.text, fontSize: 10, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  planAction: { alignItems: 'center', backgroundColor: 'rgba(88, 223, 232, 0.06)', borderColor: 'rgba(88, 223, 232, 0.26)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58, paddingHorizontal: 10, paddingVertical: 8 },
  planActionIcon: { alignItems: 'center', backgroundColor: 'rgba(88, 223, 232, 0.12)', borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  planActionCopy: { flex: 1, gap: 1 },
  planActionTitle: { color: theme.colors.cream, fontSize: 12, fontWeight: '900' },
  planActionText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
  primaryAction: { alignItems: 'center', backgroundColor: theme.colors.scannerCyan, borderRadius: 10, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  primaryActionText: { color: theme.colors.backgroundDeep, fontSize: 12, fontWeight: '900' },
  secondaryAction: { alignItems: 'center', borderColor: 'rgba(242, 211, 138, 0.35)', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  secondaryActionText: { color: theme.colors.goldBright, fontSize: 12, fontWeight: '900' },
  errorText: { color: '#FFB8B1', fontSize: 10, lineHeight: 14 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  loadingCard: { alignItems: 'center', backgroundColor: 'rgba(5, 13, 19, 0.86)', borderColor: 'rgba(88, 223, 232, 0.27)', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 16 },
  loadingCopy: { flex: 1, gap: 3 },
  loadingText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  emptyCard: { alignItems: 'flex-start', backgroundColor: 'rgba(5, 13, 19, 0.86)', borderColor: 'rgba(88, 223, 232, 0.27)', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 16 },
  emptyIcon: { alignItems: 'center', backgroundColor: 'rgba(215, 168, 74, 0.12)', borderRadius: 10, height: 39, justifyContent: 'center', width: 39 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: theme.colors.cream, fontSize: 15, fontWeight: '900', lineHeight: 20 },
  emptyText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  emptyPlanAction: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 5, marginTop: 5, minHeight: 28 },
  emptyPlanActionText: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: '900' },
});
