import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import type {
  EbaySoldComp,
  EbaySoldCompsResult,
} from "@/services/ebaySoldCompsService";

type MarketPricingDashboardProps = {
  /**
   * The exact item query to pass to the live-comp loader. The component never
   * starts a request by itself; it uses this only after the reseller taps
   * Refresh live comps.
   */
  query?: string | null;
  title?: string | null;
  /**
   * Controlled result state. Pass null while a parent-owned request is loading.
   * Omit this prop to let loadComps manage the last successful result locally.
   */
  result?: EbaySoldCompsResult | null;
  loading?: boolean;
  error?: string | null;
  /**
   * Uncontrolled refresh path. Return only a completed sold-comps result.
   */
  loadComps?: (query: string) => Promise<EbaySoldCompsResult>;
  /**
   * Controlled refresh path. The parent can update result, loading, and error.
   * Returning a result is also supported for convenience.
   */
  onRefresh?: (
    query: string,
  ) =>
    | EbaySoldCompsResult
    | null
    | undefined
    | Promise<EbaySoldCompsResult | null | undefined | void>
    | void;
};

type UnknownRecord = Record<string, unknown>;

type ConditionBand = {
  ceiling: number | null;
  comparableCount: number | null;
  condition: string;
  deltaVsBaseline: number | null;
  floor: number | null;
  median: number | null;
};

type TrendPoint = {
  date: Date;
  price: number;
};

type DaysOnMarket = {
  average: number | null;
  high: number | null;
  low: number | null;
};

type MarketDashboardData = {
  activeListings: number | null;
  analysisAvailable: boolean;
  comparableCount: number | null;
  conditionBands: ConditionBand[];
  currency: string;
  daysOnMarket: DaysOnMarket | null;
  evidenceNote: string | null;
  high: number | null;
  lastUpdated: Date | null;
  low: number | null;
  median: number | null;
  observedRatio: number | null;
  periodDays: number | null;
  periodEnd: string | null;
  periodStart: string | null;
  ratioNote: string | null;
  returnedSoldListings: number | null;
  seasonality: {
    peakMonths: string[];
    slowMonths: string[];
  } | null;
  trend: TrendPoint[];
  average: number | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "—";

  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 0,
      style: "currency",
    }).format(value);
  } catch {
    return "$" + Math.round(value).toLocaleString("en-US");
  }
}

function formatDelta(value: number | null, currency: string) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + formatMoney(Math.abs(value), currency);
}

function formatRatio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value * 100) + "%";
}

function formatDate(value: Date | null) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(value);
  } catch {
    return value.toLocaleDateString();
  }
}

function formatPeriod(
  days: number | null,
  start: string | null,
  end: string | null,
) {
  if (days != null) return String(days) + "-DAY SOLD WINDOW";

  const startDate = formatDate(parseDate(start));
  const endDate = formatDate(parseDate(end));
  if (startDate && endDate) return startDate + " – " + endDate;

  return "SOLD-COMP SNAPSHOT";
}

function resultMarketAnalysis(
  result: EbaySoldCompsResult,
): UnknownRecord | null {
  return asRecord(
    (
      result as EbaySoldCompsResult & {
        marketAnalysis?: unknown;
      }
    ).marketAnalysis,
  );
}

function trendFromComps(comps: EbaySoldComp[]) {
  return comps
    .map((comp) => {
      const date = parseDate(comp.soldDate);
      const price =
        positiveNumber(comp.totalPrice) ?? positiveNumber(comp.soldPrice);

      return date && price ? { date, price } : null;
    })
    .filter((point): point is TrendPoint => point != null)
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-12);
}

function conditionBandsFrom(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const band = asRecord(entry);
      const condition = asString(band?.condition);
      const floor = positiveNumber(band?.floor);
      const median = positiveNumber(band?.median);
      const ceiling = positiveNumber(band?.ceiling);

      if (!condition || (floor == null && median == null && ceiling == null)) {
        return null;
      }

      return {
        ceiling,
        comparableCount: nonNegativeNumber(band?.comparableCount),
        condition,
        deltaVsBaseline: finiteNumber(band?.deltaVsBaseline),
        floor,
        median,
      };
    })
    .filter((band): band is ConditionBand => band != null);
}

function dashboardFromResult(result: EbaySoldCompsResult): MarketDashboardData {
  const marketAnalysis = resultMarketAnalysis(result);
  const marketValue = asRecord(marketAnalysis?.marketValue);
  const marketVelocity = asRecord(marketAnalysis?.marketVelocity);
  const period = asRecord(marketValue?.period);
  const daysOnMarket = asRecord(marketVelocity?.daysOnMarket);
  const seasonality = asRecord(marketVelocity?.seasonality);

  const activeListings = nonNegativeNumber(marketVelocity?.activeListings);
  const returnedSoldListings = nonNegativeNumber(
    marketVelocity?.returnedSoldListings,
  );
  const reportedRatio = finiteNumber(
    marketVelocity?.observedSoldToActiveRatio,
  );
  const observedRatio =
    activeListings != null &&
      returnedSoldListings != null &&
      activeListings > 0
      ? reportedRatio ?? returnedSoldListings / activeListings
      : null;

  const peakMonths = stringList(seasonality?.peakMonths);
  const slowMonths = stringList(seasonality?.slowMonths);
  const dayValues = {
    average: nonNegativeNumber(daysOnMarket?.average),
    high: nonNegativeNumber(daysOnMarket?.high),
    low: nonNegativeNumber(daysOnMarket?.low),
  };

  return {
    activeListings,
    analysisAvailable: marketAnalysis != null,
    average:
      positiveNumber(marketValue?.average) ??
      positiveNumber(result.summary.average),
    comparableCount:
      nonNegativeNumber(marketValue?.comparableCount) ??
      nonNegativeNumber(result.summary.count),
    conditionBands: conditionBandsFrom(marketValue?.conditionBands),
    currency:
      asString(marketValue?.currency) ||
      asString(result.summary.currency) ||
      "USD",
    daysOnMarket:
      dayValues.average != null ||
        dayValues.low != null ||
        dayValues.high != null
        ? dayValues
        : null,
    evidenceNote: asString(marketValue?.evidenceNote) || null,
    high:
      positiveNumber(marketValue?.ceiling) ??
      positiveNumber(result.summary.high),
    lastUpdated: parseDate(result.searchedAt),
    low:
      positiveNumber(marketValue?.floor) ??
      positiveNumber(result.summary.low),
    median:
      positiveNumber(marketValue?.median) ??
      positiveNumber(result.summary.median),
    observedRatio,
    periodDays: positiveNumber(period?.days),
    periodEnd: asString(period?.end) || null,
    periodStart: asString(period?.start) || null,
    ratioNote: asString(marketVelocity?.evidenceNote) || null,
    returnedSoldListings,
    seasonality:
      peakMonths.length || slowMonths.length
        ? { peakMonths, slowMonths }
        : null,
    trend: trendFromComps(result.comps),
  };
}

function publicError(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return null;

  if (
    /(?:api[\s-]?key|token|secret|authorization|serpapi|google ai)/i.test(
      normalized,
    )
  ) {
    return "KeepFlip AI market research could not complete. Try again.";
  }

  return normalized.length > 180
    ? normalized.slice(0, 177).trimEnd() + "…"
    : normalized;
}

function PriceMetric({
  currency,
  label,
  value,
}: {
  currency: string;
  label: string;
  value: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.priceMetric}>
      <Text style={[styles.metricLabel, { fontSize: responsiveFont(7) }]}>{label}</Text>
      <Text selectable style={[styles.priceValue, { fontSize: responsiveFont(19), lineHeight: 23 }]}>
        {formatMoney(value, currency)}
      </Text>
    </View>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.detailMetric}>
      <Text style={[styles.metricLabel, { fontSize: responsiveFont(7) }]}>{label}</Text>
      <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(15) }]}>
        {value}
      </Text>
    </View>
  );
}

function PriceTrend({
  currency,
  points,
}: {
  currency: string;
  points: TrendPoint[];
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const minimum = Math.min(...points.map((point) => point.price));
  const maximum = Math.max(...points.map((point) => point.price));
  const span = maximum - minimum;

  return (
    <View style={styles.trendSection}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionLabel, { fontSize: responsiveFont(7) }]}>DATED SOLD-PRICE TREND</Text>
          <Text selectable style={[styles.sectionSubcopy, { fontSize: responsiveFont(8), lineHeight: 11 }]}>
            Returned completed sales with reliable dates
          </Text>
        </View>
        <Text selectable style={[styles.sectionValue, { fontSize: responsiveFont(7) }]}>
          {points.length} SALE{points.length === 1 ? "" : "S"}
        </Text>
      </View>
      <View style={styles.trendChart}>
        {points.map((point, index) => {
          const progress = span > 0 ? (point.price - minimum) / span : 0.5;
          const showPrice =
            index === 0 ||
            index === points.length - 1 ||
            index === Math.floor(points.length / 2);

          return (
            <View
              key={point.date.toISOString() + "-" + String(index)}
              style={styles.trendPoint}
            >
              <View style={styles.trendPriceSlot}>
                {showPrice ? (
                  <Text selectable style={styles.trendPrice}>
                    {formatMoney(point.price, currency)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.trendBarSlot}>
                <View
                  style={[
                    styles.trendBar,
                    {
                      height: 24 + Math.round(progress * 56),
                    },
                  ]}
                />
              </View>
              <Text selectable style={[styles.trendDate, { fontSize: responsiveFont(6), lineHeight: 8 }]}>
                {formatDate(point.date)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.trendAxis}>
        <Text selectable style={[styles.trendAxisText, { fontSize: responsiveFont(6) }]}>
          LOW {formatMoney(minimum, currency)}
        </Text>
        <Text selectable style={[styles.trendAxisText, { fontSize: responsiveFont(6) }]}>
          HIGH {formatMoney(maximum, currency)}
        </Text>
      </View>
    </View>
  );
}

function ConditionVariance({
  bands,
  currency,
}: {
  bands: ConditionBand[];
  currency: string;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionLabel, { fontSize: responsiveFont(7) }]}>CONDITION VARIANCE</Text>
          <Text selectable style={[styles.sectionSubcopy, { fontSize: responsiveFont(8), lineHeight: 11 }]}>
            Price ranges from the returned sold sample
          </Text>
        </View>
      </View>
      <View style={styles.conditionRows}>
        {bands.map((band) => (
          <View key={band.condition} style={styles.conditionRow}>
            <View style={styles.conditionLead}>
              <Text selectable style={[styles.conditionName, { fontSize: responsiveFont(10) }]}>
                {band.condition}
              </Text>
              {band.comparableCount != null ? (
                <Text selectable style={styles.conditionCount}>
                  {band.comparableCount} COMP{band.comparableCount === 1 ? "" : "S"}
                </Text>
              ) : null}
            </View>
            <View style={styles.conditionValues}>
              {band.median != null ? (
                <Text selectable style={styles.conditionMedian}>
                  {formatMoney(band.median, currency)}
                </Text>
              ) : null}
              {band.deltaVsBaseline != null ? (
                <Text
                  selectable
                  style={[
                    styles.conditionDelta,
                    {
                      color:
                        band.deltaVsBaseline >= 0
                          ? theme.colors.success
                          : theme.colors.danger,
                    },
                  ]}
                >
                  {formatDelta(band.deltaVsBaseline, currency)} VS MID
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SupplyDemand({
  activeListings,
  observedRatio,
  ratioNote,
  returnedSoldListings,
}: {
  activeListings: number;
  observedRatio: number | null;
  ratioNote: string | null;
  returnedSoldListings: number;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionLabel, { fontSize: responsiveFont(7) }]}>SUPPLY / DEMAND SNAPSHOT</Text>
          <Text selectable style={[styles.sectionSubcopy, { fontSize: responsiveFont(8), lineHeight: 11 }]}>
            Current active listings paired with returned sold results
          </Text>
        </View>
      </View>
      <View style={styles.detailMetricRow}>
        <DetailMetric label="ACTIVE" value={String(activeListings)} />
        <DetailMetric label="RETURNED SOLD" value={String(returnedSoldListings)} />
        {observedRatio != null ? (
          <DetailMetric
            label="OBSERVED SAMPLE / ACTIVE"
            value={formatRatio(observedRatio)}
          />
        ) : null}
      </View>
      <Text selectable style={styles.caveat}>
        NOT AN EXACT STR · This is a returned sold-listing sample compared with
        the current active snapshot.
      </Text>
      {ratioNote ? (
        <Text selectable style={[styles.evidenceText, { fontSize: responsiveFont(8), lineHeight: 12 }]}>
          {ratioNote}
        </Text>
      ) : null}
    </View>
  );
}

function MarketTiming({
  daysOnMarket,
  seasonality,
}: {
  daysOnMarket: DaysOnMarket | null;
  seasonality: MarketDashboardData["seasonality"];
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  if (!daysOnMarket && !seasonality) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { fontSize: responsiveFont(7) }]}>MARKET TIMING</Text>
      {daysOnMarket ? (
        <View style={styles.detailMetricRow}>
          {daysOnMarket.low != null ? (
            <DetailMetric
              label="LOW DAYS"
              value={String(Math.round(daysOnMarket.low))}
            />
          ) : null}
          {daysOnMarket.average != null ? (
            <DetailMetric
              label="AVG DAYS"
              value={String(Math.round(daysOnMarket.average))}
            />
          ) : null}
          {daysOnMarket.high != null ? (
            <DetailMetric
              label="HIGH DAYS"
              value={String(Math.round(daysOnMarket.high))}
            />
          ) : null}
        </View>
      ) : null}
      {seasonality ? (
        <View style={styles.seasonality}>
          {seasonality.peakMonths.length ? (
            <Text selectable style={[styles.seasonalityText, { fontSize: responsiveFont(7), lineHeight: 11 }]}>
              PEAK MONTHS · {seasonality.peakMonths.join(", ")}
            </Text>
          ) : null}
          {seasonality.slowMonths.length ? (
            <Text selectable style={[styles.seasonalityText, { fontSize: responsiveFont(7), lineHeight: 11 }]}>
              SLOW MONTHS · {seasonality.slowMonths.join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A no-autoload visual market dashboard. The component starts from real sold
 * comps and only renders optional V2 metrics when they are present in the
 * completed response.
 */
export function MarketPricingDashboard({
  error,
  loadComps,
  loading = false,
  onRefresh,
  query,
  result,
  title,
}: MarketPricingDashboardProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localResult, setLocalResult] = useState<EbaySoldCompsResult | null>(
    null,
  );
  const normalizedQuery = query?.trim() || title?.trim() || "";
  const resultIsControlled = result !== undefined;

  useEffect(() => {
    if (!resultIsControlled) {
      setLocalError(null);
      setLocalResult(null);
    }
  }, [normalizedQuery, resultIsControlled]);

  const activeResult = resultIsControlled ? result : localResult;
  const dashboard = useMemo(
    () => (activeResult ? dashboardFromResult(activeResult) : null),
    [activeResult],
  );
  const busy = loading || localLoading;
  const canRefresh =
    Boolean(normalizedQuery) && Boolean(loadComps || onRefresh) && !busy;
  const refreshError = publicError(error) ?? localError;

  const refresh = async () => {
    if (!canRefresh) return;

    setLocalError(null);
    setLocalLoading(true);

    try {
      const next = onRefresh
        ? await onRefresh(normalizedQuery)
        : await loadComps?.(normalizedQuery);

      if (next && !resultIsControlled) {
        setLocalResult(next);
      }
    } catch {
      setLocalError(
        "KeepFlip AI market research could not complete. Try again.",
      );
    } finally {
      setLocalLoading(false);
    }
  };

  const priceMetrics = dashboard
    ? [
      { label: "LOW", value: dashboard.low },
      { label: "MEDIAN", value: dashboard.median },
      { label: "AVERAGE", value: dashboard.average },
      { label: "HIGH", value: dashboard.high },
    ].filter(
      (metric): metric is { label: string; value: number } =>
        metric.value != null,
    )
    : [];

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>LIVE MARKET DASHBOARD</Text>
          <Text selectable style={[styles.title, { fontSize: responsiveFont(15), lineHeight: 19 }]}>
            {title?.trim() || "Current item"}
          </Text>
          {normalizedQuery ? (
            <Text selectable numberOfLines={2} style={styles.query}>
              {normalizedQuery}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityHint="Requests a new sold-comp snapshot only when you tap it."
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: !canRefresh }}
          disabled={!canRefresh}
          onPress={refresh}
          style={({ pressed }) => [
            styles.refreshButton,
            !canRefresh && styles.refreshButtonDisabled,
            pressed && styles.refreshButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
          ) : null}
          <Text style={[styles.refreshButtonText, { fontSize: responsiveFont(7) }]}>
            {busy
              ? "REFRESHING"
              : loadComps || onRefresh
                ? "REFRESH LIVE COMPS"
                : "LIVE COMPS UNAVAILABLE"}
          </Text>
        </Pressable>
      </View>

      {refreshError ? (
        <Text selectable style={[styles.error, { fontSize: responsiveFont(8), lineHeight: 12 }]}>
          {refreshError}
        </Text>
      ) : null}

      {!dashboard ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { fontSize: responsiveFont(8) }]}>NO LIVE COMPS LOADED</Text>
          <Text selectable style={[styles.emptyCopy, { fontSize: responsiveFont(9), lineHeight: 13 }]}>
            Refresh live comps when you want a new sold-market snapshot. It
            will not run automatically.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.snapshotHeader}>
            <View>
              <Text style={[styles.sectionLabel, { fontSize: responsiveFont(7) }]}>
                {formatPeriod(
                  dashboard.periodDays,
                  dashboard.periodStart,
                  dashboard.periodEnd,
                )}
              </Text>
              {dashboard.comparableCount != null ? (
                <Text selectable style={[styles.snapshotCopy, { fontSize: responsiveFont(7) }]}>
                  {dashboard.comparableCount} SOLD COMP
                  {dashboard.comparableCount === 1 ? "" : "S"}
                  {dashboard.lastUpdated
                    ? " · UPDATED " + formatDate(dashboard.lastUpdated)
                    : ""}
                </Text>
              ) : null}
            </View>
            <Text selectable style={[styles.snapshotStatus, { fontSize: responsiveFont(7) }]}>
              {dashboard.analysisAvailable ? "LIVE SOLD DATA" : "SOLD SUMMARY"}
            </Text>
          </View>

          {priceMetrics.length ? (
            <View style={styles.priceGrid}>
              {priceMetrics.map((metric) => (
                <PriceMetric
                  currency={dashboard.currency}
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                />
              ))}
            </View>
          ) : (
            <Text selectable style={styles.unavailable}>
              No usable sold-price values were returned for this item yet.
            </Text>
          )}

          {dashboard.evidenceNote ? (
            <Text selectable style={[styles.evidenceText, { fontSize: responsiveFont(8), lineHeight: 12 }]}>
              {dashboard.evidenceNote}
            </Text>
          ) : null}

          {dashboard.trend.length ? (
            <PriceTrend
              currency={dashboard.currency}
              points={dashboard.trend}
            />
          ) : (
            <Text selectable style={styles.unavailable}>
              A dated sale trend will appear when the returned comps include
              reliable sold dates.
            </Text>
          )}

          {dashboard.conditionBands.length ? (
            <ConditionVariance
              bands={dashboard.conditionBands}
              currency={dashboard.currency}
            />
          ) : null}

          {dashboard.activeListings != null &&
            dashboard.returnedSoldListings != null ? (
            <SupplyDemand
              activeListings={dashboard.activeListings}
              observedRatio={dashboard.observedRatio}
              ratioNote={dashboard.ratioNote}
              returnedSoldListings={dashboard.returnedSoldListings}
            />
          ) : null}

          <MarketTiming
            daysOnMarket={dashboard.daysOnMarket}
            seasonality={dashboard.seasonality}
          />

          <Text selectable style={styles.disclaimer}>
            SOLD DATA IS EVIDENCE, NOT A GUARANTEED SALE PRICE. Confirm the
            exact model, condition, shipping, and marketplace terms before
            buying or listing.
          </Text>
        </>
      )}
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    shell: {
      gap: 13,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.numbers,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.02,
    },
    title: {
      color: "#FFFFFF",
      fontFamily: theme.fonts.radar,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 19,
    },
    query: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.35,
      lineHeight: 11,
    },
    refreshButton: {
      minHeight: 32,
      maxWidth: 120,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(0, 255, 255, 0.62)",
      borderRadius: 4,
      backgroundColor: "rgba(0, 255, 255, 0.07)",
    },
    refreshButtonDisabled: {
      borderColor: "rgba(255, 255, 255, 0.14)",
      backgroundColor: "rgba(255, 255, 255, 0.025)",
    },
    refreshButtonPressed: {
      opacity: 0.72,
    },
    refreshButtonText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.5,
      textAlign: "center",
    },
    error: {
      padding: 9,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(232, 97, 88, 0.44)",
      borderRadius: 4,
      color: "#FFD8D5",
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      lineHeight: 12,
    },
    emptyState: {
      gap: 6,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    emptyTitle: {
      color: "rgba(255, 255, 255, 0.72)",
      fontFamily: theme.fonts.numbers,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.78,
    },
    emptyCopy: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      lineHeight: 13,
    },
    snapshotHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    snapshotCopy: {
      marginTop: 3,
      color: "rgba(247, 242, 232, 0.58)",
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.42,
    },
    snapshotStatus: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.56,
      textAlign: "right",
    },
    priceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    priceMetric: {
      flexGrow: 1,
      flexBasis: "42%",
      minWidth: 116,
      gap: 3,
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    metricLabel: {
      color: "rgba(247, 242, 232, 0.49)",
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.58,
    },
    priceValue: {
      color: "#FFFFFF",
      fontFamily: theme.fonts.radar,
      fontSize: 19,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
      lineHeight: 23,
    },
    evidenceText: {
      color: "rgba(247, 242, 232, 0.56)",
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      lineHeight: 12,
    },
    unavailable: {
      paddingVertical: 7,
      color: "rgba(247, 242, 232, 0.5)",
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      lineHeight: 12,
    },
    trendSection: {
      gap: 9,
      paddingTop: 2,
    },
    section: {
      gap: 9,
      paddingTop: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    sectionCopy: {
      flex: 1,
      gap: 3,
    },
    sectionLabel: {
      color: "rgba(247, 242, 232, 0.54)",
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.86,
    },
    sectionSubcopy: {
      color: "rgba(247, 242, 232, 0.46)",
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      lineHeight: 11,
    },
    sectionValue: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.56,
    },
    trendChart: {
      minHeight: 116,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 2,
      paddingTop: 2,
      paddingBottom: 3,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.dividerStrong,
    },
    trendPoint: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      gap: 3,
    },
    trendPriceSlot: {
      height: 16,
      justifyContent: "flex-end",
    },
    trendPrice: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    trendBarSlot: {
      width: "100%",
      height: 80,
      justifyContent: "flex-end",
      paddingHorizontal: 1,
    },
    trendBar: {
      width: "100%",
      minHeight: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.scannerCyan,
    },
    trendDate: {
      minHeight: 18,
      color: "rgba(247, 242, 232, 0.45)",
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      lineHeight: 8,
      textAlign: "center",
    },
    trendAxis: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    trendAxisText: {
      color: "rgba(247, 242, 232, 0.45)",
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.35,
    },
    conditionRows: {
      gap: 7,
    },
    conditionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingBottom: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    conditionLead: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    conditionName: {
      color: "rgba(255, 255, 255, 0.86)",
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
    },
    conditionCount: {
      color: "rgba(247, 242, 232, 0.42)",
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.38,
    },
    conditionValues: {
      alignItems: "flex-end",
      gap: 2,
    },
    conditionMedian: {
      color: "#FFFFFF",
      fontFamily: theme.fonts.radar,
      fontSize: 11,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    conditionDelta: {
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.32,
    },
    detailMetricRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    detailMetric: {
      flexGrow: 1,
      flexBasis: "29%",
      minWidth: 88,
      gap: 3,
    },
    detailValue: {
      color: "#FFFFFF",
      fontFamily: theme.fonts.radar,
      fontSize: 15,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    caveat: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.43,
      lineHeight: 10,
    },
    seasonality: {
      gap: 4,
    },
    seasonalityText: {
      color: "rgba(247, 242, 232, 0.61)",
      fontFamily: theme.fonts.numbers,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.35,
      lineHeight: 11,
    },
    disclaimer: {
      paddingTop: 4,
      color: "rgba(247, 242, 232, 0.42)",
      fontFamily: theme.fonts.numbers,
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.35,
      lineHeight: 10,
    },
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
        fontSize: responsiveFont(15),
      },
    ],
    query: [
      staticStyles.query,
      {
        fontSize: responsiveFont(7),
      },
    ],
    refreshButtonText: [
      staticStyles.refreshButtonText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(8),
      },
    ],
    emptyTitle: [
      staticStyles.emptyTitle,
      {
        fontSize: responsiveFont(8),
      },
    ],
    emptyCopy: [
      staticStyles.emptyCopy,
      {
        fontSize: responsiveFont(9),
      },
    ],
    snapshotCopy: [
      staticStyles.snapshotCopy,
      {
        fontSize: responsiveFont(7),
      },
    ],
    snapshotStatus: [
      staticStyles.snapshotStatus,
      {
        fontSize: responsiveFont(7),
      },
    ],
    metricLabel: [
      staticStyles.metricLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    priceValue: [
      staticStyles.priceValue,
      {
        fontSize: responsiveFont(19),
      },
    ],
    evidenceText: [
      staticStyles.evidenceText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    unavailable: [
      staticStyles.unavailable,
      {
        fontSize: responsiveFont(8),
      },
    ],
    sectionLabel: [
      staticStyles.sectionLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    sectionSubcopy: [
      staticStyles.sectionSubcopy,
      {
        fontSize: responsiveFont(8),
      },
    ],
    sectionValue: [
      staticStyles.sectionValue,
      {
        fontSize: responsiveFont(7),
      },
    ],
    trendPriceSlot: [
      staticStyles.trendPriceSlot,
      {
        height: responsiveHeight(16),
      },
    ],
    trendPrice: [
      staticStyles.trendPrice,
      {
        fontSize: responsiveFont(6),
      },
    ],
    trendBarSlot: [
      staticStyles.trendBarSlot,
      {
        height: responsiveHeight(80),
      },
    ],
    trendDate: [
      staticStyles.trendDate,
      {
        fontSize: responsiveFont(6),
      },
    ],
    trendAxisText: [
      staticStyles.trendAxisText,
      {
        fontSize: responsiveFont(6),
      },
    ],
    conditionName: [
      staticStyles.conditionName,
      {
        fontSize: responsiveFont(10),
      },
    ],
    conditionCount: [
      staticStyles.conditionCount,
      {
        fontSize: responsiveFont(6),
      },
    ],
    conditionMedian: [
      staticStyles.conditionMedian,
      {
        fontSize: responsiveFont(11),
      },
    ],
    conditionDelta: [
      staticStyles.conditionDelta,
      {
        fontSize: responsiveFont(6),
      },
    ],
    detailValue: [
      staticStyles.detailValue,
      {
        fontSize: responsiveFont(15),
      },
    ],
    caveat: [
      staticStyles.caveat,
      {
        fontSize: responsiveFont(6),
      },
    ],
    seasonalityText: [
      staticStyles.seasonalityText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    disclaimer: [
      staticStyles.disclaimer,
      {
        fontSize: responsiveFont(6),
      },
    ],
  };
}
