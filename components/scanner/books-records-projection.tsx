import { Pressable, StyleSheet, View } from "react-native";

import type { ItemAnalysisResult } from "@/components/scanner/analysis-visual-types";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type BooksRecordsProjectionProps = {
  actualCost?: number | null;
  compact?: boolean;
  onAddToInventory?: () => void;
  result: ItemAnalysisResult;
};

function formatMoney(value: number | null | undefined, currency = "USD") {
  if (value == null || !Number.isFinite(value)) return "Pending";
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 0,
      style: "currency",
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
}

function formatActualCost(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function knownMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function matchesActualCost(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function formatRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currency: string,
) {
  if (low == null || high == null) return "Pending sold data";
  return `${formatMoney(low, currency)} — ${formatMoney(high, currency)}`;
}

export function BooksRecordsProjection({
  actualCost,
  compact = false,
  onAddToInventory,
  result,
}: BooksRecordsProjectionProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const valuation = result.valuation;
  const marketValue = result.marketAnalysis?.marketValue;
  const currency =
    result.profitPlan.currency ??
    valuation?.currency ??
    marketValue?.currency ??
    "USD";
  const expectedSale =
    result.profitPlan.expectedSale ??
    valuation?.median ??
    marketValue?.median;
  const projectedMargin = result.marketAnalysis?.netMarginViability;
  const buyCeiling = result.acquisitionGuidance?.maxBuyPrice;
  const low = valuation?.low ?? marketValue?.floor;
  const high = valuation?.high ?? marketValue?.ceiling;
  const savedCogs = knownMoney(actualCost);
  const analyzedCogs = knownMoney(projectedMargin?.cogs);
  const analysisUsesSavedCogs =
    savedCogs === null ||
    (analyzedCogs !== null && matchesActualCost(analyzedCogs, savedCogs));

  if (!hasBooksRecordsProjection(result)) {
    return null;
  }

  // A scan-time margin estimate cannot safely stand in for the actual amount
  // paid once an inventory record exists. Keep the saved COGS visible, and
  // only show a net figure when the analysis used that same cost basis.
  const netProfit = analysisUsesSavedCogs ? projectedMargin?.netProfit : null;
  const roi = projectedMargin?.roiPercent;
  const shippingKnown = knownMoney(projectedMargin?.outboundShipping) !== null;
  const pendingNetLabel =
    savedCogs === null
      ? "Needs actual cost + shipping"
      : shippingKnown
        ? "Net pending"
        : "Needs shipping";
  const netProfitLabel =
    netProfit == null
      ? pendingNetLabel
      : `${formatMoney(netProfit, currency)}${roi == null ? "" : ` · ${Math.round(roi)}% ROI`}`;
  const compactNetProfitLabel =
    netProfit == null && savedCogs !== null
      ? `COGS ${formatActualCost(savedCogs, currency)} · ${pendingNetLabel}`
      : netProfitLabel;

  if (compact) {
    return (
      <View style={styles.compactSection}>
        <View style={styles.compactHeader}>
          <Text style={[styles.compactEyebrow, { fontSize: responsiveFont(8) }]}>BOOKS &amp; RECORDS</Text>
          <Text style={styles.compactTag}>PROJECTION</Text>
        </View>
        <View style={styles.compactMetrics}>
          <View style={styles.compactMetric}>
            <Text style={[styles.compactLabel, { fontSize: responsiveFont(7) }]}>EXPECTED SALE</Text>
            <Text numberOfLines={1} style={[styles.compactValue, { fontSize: responsiveFont(10) }]}>
              {formatMoney(expectedSale, currency)}
            </Text>
          </View>
          <View style={styles.compactMetric}>
            <Text style={[styles.compactLabel, { fontSize: responsiveFont(7) }]}>BUY CEILING</Text>
            <Text numberOfLines={1} style={[styles.compactValue, { fontSize: responsiveFont(10) }]}>
              {formatMoney(buyCeiling, currency)}
            </Text>
          </View>
          <View style={styles.compactMetric}>
            <Text numberOfLines={1} style={[styles.compactLabel, { fontSize: responsiveFont(7) }]}>NET / ROI</Text>
            <Text numberOfLines={1} style={[styles.compactValue, netProfit == null && styles.compactPendingValue]}>
              {compactNetProfitLabel}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>BOOKS &amp; RECORDS</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(12) }]}>KEEPFLIP PROJECTION</Text>
        </View>
        <View style={styles.estimateTag}>
          <Text style={[styles.estimateTagText, { fontSize: responsiveFont(8) }]}>ESTIMATE</Text>
        </View>
      </View>
      <Text style={[styles.description, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
        Market assumptions are shown here for planning. They do not become a book entry until you confirm the purchase details.
      </Text>

      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>EXPECTED SALE</Text>
          <Text style={[styles.value, { fontSize: responsiveFont(11) }]}>{formatMoney(expectedSale, currency)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>OBSERVED SOLD RANGE</Text>
          <Text style={[styles.value, { fontSize: responsiveFont(11) }]}>{formatRange(low, high, currency)}</Text>
        </View>
        {savedCogs !== null ? (
          <View style={styles.row}>
            <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>COGS / ACTUAL PAID</Text>
            <Text style={[styles.value, { fontSize: responsiveFont(11) }]}>
              {formatActualCost(savedCogs, currency)}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>PROJECTED NET / ROI</Text>
          <Text numberOfLines={1} style={[styles.value, netProfit == null && styles.pendingValue]}>
            {netProfitLabel}
          </Text>
        </View>
        {buyCeiling != null ? (
          <View style={styles.row}>
            <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>PROVISIONAL BUY CEILING</Text>
            <Text style={[styles.value, { fontSize: responsiveFont(11) }]}>{formatMoney(buyCeiling, currency)}</Text>
          </View>
        ) : null}
      </View>

      {onAddToInventory ? (
        <Pressable
          accessibilityHint="Opens a form to confirm the actual purchase and record it in inventory and Books"
          accessibilityRole="button"
          onPress={onAddToInventory}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, { fontSize: responsiveFont(9) }]}>ADD TO INVENTORY</Text>
          <Text style={styles.actionArrow}>›</Text>
        </Pressable>
      ) : (
        <Text style={[styles.savedHint, { fontSize: responsiveFont(11) }]}>
          Actual acquisition details are already stored with this inventory item.
        </Text>
      )}
    </View>
  );
}

export function hasBooksRecordsProjection(result: ItemAnalysisResult) {
  const valuation = result.valuation;
  const marketValue = result.marketAnalysis?.marketValue;

  return Boolean(
    result.profitPlan.expectedSale != null ||
    valuation?.median != null ||
    marketValue?.median != null ||
    valuation?.low != null ||
    marketValue?.floor != null ||
    valuation?.high != null ||
    marketValue?.ceiling != null ||
    result.acquisitionGuidance?.maxBuyPrice != null,
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    compactSection: {
      marginTop: 6,
      paddingTop: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    compactHeader: {
      minHeight: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    compactEyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    compactTag: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    compactMetrics: {
      flexDirection: "row",
      gap: 8,
      marginTop: 7,
    },
    compactMetric: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    compactLabel: {
      color: "rgba(255,255,255,0.48)",
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.38,
    },
    compactValue: {
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    compactPendingValue: {
      color: theme.colors.goldBright,
      fontSize: 8,
    },
    section: {
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    headerCopy: { flex: 1, gap: 3 },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    title: {
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    estimateTag: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "rgba(242,211,138,0.44)",
    },
    estimateTagText: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    description: {
      marginTop: 6,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    },
    rows: {
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    label: {
      flex: 1,
      color: "rgba(255,255,255,0.54)",
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.55,
    },
    value: {
      maxWidth: "65%",
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: 11,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
      textAlign: "right",
    },
    pendingValue: { color: theme.colors.goldBright, fontSize: 9 },
    action: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      marginTop: 10,
      borderWidth: 1,
      borderColor: "rgba(0,255,255,0.42)",
      backgroundColor: "rgba(0,255,255,0.06)",
    },
    actionText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    actionArrow: {
      color: theme.colors.scannerCyan,
      fontSize: 20,
      fontWeight: "300",
      lineHeight: 18,
    },
    savedHint: {
      marginTop: 9,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
    },
    pressed: { opacity: 0.72 },
  });
  return {
    ...staticStyles,
    compactEyebrow: [
      staticStyles.compactEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    compactTag: [
      staticStyles.compactTag,
      {
        fontSize: responsiveFont(7),
      },
    ],
    compactLabel: [
      staticStyles.compactLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    compactValue: [
      staticStyles.compactValue,
      {
        fontSize: responsiveFont(10),
      },
    ],
    compactPendingValue: [
      staticStyles.compactPendingValue,
      {
        fontSize: responsiveFont(8),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(12),
      },
    ],
    estimateTagText: [
      staticStyles.estimateTagText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    description: [
      staticStyles.description,
      {
        fontSize: responsiveFont(11),
      },
    ],
    label: [
      staticStyles.label,
      {
        fontSize: responsiveFont(8),
      },
    ],
    value: [
      staticStyles.value,
      {
        fontSize: responsiveFont(11),
      },
    ],
    pendingValue: [
      staticStyles.pendingValue,
      {
        fontSize: responsiveFont(9),
      },
    ],
    actionText: [
      staticStyles.actionText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    actionArrow: [
      staticStyles.actionArrow,
      {
        fontSize: responsiveFont(20),
      },
    ],
    savedHint: [
      staticStyles.savedHint,
      {
        fontSize: responsiveFont(11),
      },
    ],
  };
}
