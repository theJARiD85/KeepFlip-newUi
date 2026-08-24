import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AnalysisValuation } from "@/components/scanner/analysis-visual-types";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  calculateMarketplaceProjections,
  type ProfitCalculatorInput,
  type ProfitMarketplaceId,
  PROFIT_MARKETPLACES,
  findBestProfitProjection,
  findBestRoiProjection,
  type ProfitProjection,
} from "@/lib/reseller-profit-calculator";

type SmartProfitCalculatorProps = {
  initialCost?: number;
  valuation: Pick<AnalysisValuation, "currency" | "high" | "low" | "median">;
};

type CalculatorDraft = Record<keyof ProfitCalculatorInput, string>;
type DraftField = keyof ProfitCalculatorInput;

const POSITIVE_PROFIT = "#46F5A2";
const BAR_COST = "rgba(247, 242, 232, 0.22)";
const BAR_FEE = "rgba(232, 97, 88, 0.78)";
const BAR_LOSS = "rgba(232, 97, 88, 0.94)";

function safeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function inputValue(value: number | undefined) {
  const normalized = safeNumber(value);
  if (!normalized) return "";
  return normalized
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function parseDraftValue(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createDraft(
  valuation: SmartProfitCalculatorProps["valuation"],
  initialCost?: number,
): CalculatorDraft {
  return {
    targetSalePrice: inputValue(valuation.median),
    buyerPaidShipping: "",
    costOfGoods: inputValue(initialCost),
    outboundShipping: "",
    prepAndRepair: "",
    returnReserve: "",
    packageWeightOz: "",
    customFeePercent: "",
    customFixedFee: "",
  };
}

function numericInputFrom(draft: CalculatorDraft): ProfitCalculatorInput {
  return {
    targetSalePrice: parseDraftValue(draft.targetSalePrice),
    buyerPaidShipping: parseDraftValue(draft.buyerPaidShipping),
    costOfGoods: parseDraftValue(draft.costOfGoods),
    outboundShipping: parseDraftValue(draft.outboundShipping),
    prepAndRepair: parseDraftValue(draft.prepAndRepair),
    returnReserve: parseDraftValue(draft.returnReserve),
    packageWeightOz: parseDraftValue(draft.packageWeightOz),
    customFeePercent: parseDraftValue(draft.customFeePercent),
    customFixedFee: parseDraftValue(draft.customFixedFee),
  };
}

function formatMoney(value: number | null | undefined, currency: string) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(normalized);
  } catch {
    return `$${normalized.toFixed(0)}`;
  }
}

function formatExactMoney(value: number | null | undefined, currency: string) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalized);
  } catch {
    return `$${normalized.toFixed(2)}`;
  }
}

function formatRoi(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`;
}

function Metric({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: accent }]}>{label}</Text>
      <Text selectable style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CalculatorField({
  label,
  onChangeText,
  prefix,
  value,
}: {
  label: string;
  onChangeText: (next: string) => void;
  prefix?: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          placeholder="0.00"
          placeholderTextColor="rgba(247, 242, 232, 0.28)"
          selectTextOnFocus
          selectionColor={theme.colors.scannerCyan}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
}

function MarketBar({
  currency,
  projection,
  scale,
}: {
  currency: string;
  projection: ProfitProjection;
  scale: number;
}) {
  const hasPositiveProfit = projection.netProfit >= 0;
  const costFlex = Math.max(projection.operatingCosts / scale, 0.001);
  const feeFlex = Math.max(projection.platformFee / scale, 0.001);
  const returnFlex = Math.max(Math.abs(projection.netProfit) / scale, 0.001);

  return (
    <View style={styles.marketRow}>
      <View style={styles.marketRowLead}>
        <Text selectable style={styles.marketName}>{projection.marketplace.shortLabel}</Text>
        <Text selectable style={styles.marketFee}>{projection.feeSummary}</Text>
      </View>
      <View style={styles.marketBarAndValue}>
        <View style={styles.marketBarTrack}>
          <View style={[styles.barSegment, { backgroundColor: BAR_COST, flex: costFlex }]} />
          <View style={[styles.barSegment, { backgroundColor: BAR_FEE, flex: feeFlex }]} />
          <View
            style={[
              styles.barSegment,
              {
                backgroundColor: hasPositiveProfit ? POSITIVE_PROFIT : BAR_LOSS,
                flex: returnFlex,
              },
            ]}
          />
        </View>
        <Text
          selectable
          style={[
            styles.marketNet,
            { color: hasPositiveProfit ? POSITIVE_PROFIT : theme.colors.danger },
          ]}
        >
          {formatExactMoney(projection.netProfit, currency)}
        </Text>
      </View>
    </View>
  );
}

/**
 * A local, estimate-only pricing planner. It never writes financial records or
 * invents a shipping quote: the reseller supplies the physical label cost.
 */
export function SmartProfitCalculator({
  initialCost,
  valuation,
}: SmartProfitCalculatorProps) {
  const [selectedMarketplace, setSelectedMarketplace] =
    useState<ProfitMarketplaceId>("ebay_standard");
  const [targetEdited, setTargetEdited] = useState(false);
  const [draft, setDraft] = useState<CalculatorDraft>(() =>
    createDraft(valuation, initialCost),
  );

  useEffect(() => {
    if (targetEdited) return;
    setDraft((current) => ({
      ...current,
      targetSalePrice: inputValue(valuation.median),
    }));
  }, [targetEdited, valuation.median]);

  const input = useMemo(() => numericInputFrom(draft), [draft]);
  const projections = useMemo(
    () => calculateMarketplaceProjections(input),
    [input],
  );
  const selectedProjection =
    projections.find(
      (projection) => projection.marketplace.id === selectedMarketplace,
    ) ?? projections[0];
  const bestProfit = findBestProfitProjection(projections);
  const bestRoi = findBestRoiProjection(projections);
  const scale = Math.max(
    1,
    ...projections.map((projection) =>
      Math.max(projection.grossRevenue, projection.totalOutlay),
    ),
  );
  const currency = valuation.currency || "USD";

  const updateField = (field: DraftField, next: string) => {
    if (field === "targetSalePrice") setTargetEdited(true);
    setDraft((current) => ({ ...current, [field]: next }));
  };

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SMART PROFIT CALCULATOR</Text>
          <Text selectable style={styles.title}>Price the flip before you list it.</Text>
        </View>
        <View style={styles.rangeReadout}>
          <Text style={styles.rangeLabel}>MARKET MID</Text>
          <Text selectable style={styles.rangeValue}>
            {formatMoney(valuation.median, currency)}
          </Text>
        </View>
      </View>

      <View style={styles.rangeLine}>
        <Text selectable style={styles.rangeDetail}>
          RANGE {formatMoney(valuation.low, currency)} – {formatMoney(valuation.high, currency)}
        </Text>
        <Text selectable style={styles.rangeDetail}>TARGET {formatMoney(input.targetSalePrice, currency)}</Text>
      </View>

      <View style={styles.presetSection}>
        <Text style={styles.sectionLabel}>SELLING CHANNEL</Text>
        <View style={styles.presetGrid}>
          {PROFIT_MARKETPLACES.map((marketplace) => {
            const selected = marketplace.id === selectedMarketplace;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={marketplace.id}
                onPress={() => setSelectedMarketplace(marketplace.id)}
                style={({ pressed }) => [
                  styles.preset,
                  selected && styles.presetSelected,
                  pressed && styles.presetPressed,
                ]}
              >
                <Text style={[styles.presetName, selected && styles.presetNameSelected]}>
                  {marketplace.shortLabel}
                </Text>
                <Text style={[styles.presetFee, selected && styles.presetFeeSelected]}>
                  {marketplace.id === "custom" && input.customFeePercent > 0
                    ? `${input.customFeePercent}% + ${formatExactMoney(input.customFixedFee, currency)}`
                    : marketplace.feeSummary}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text selectable style={styles.presetNote}>{selectedProjection.marketplace.note}</Text>
      </View>

      <View style={styles.inputGrid}>
        <CalculatorField
          label="TARGET SALE"
          onChangeText={(next) => updateField("targetSalePrice", next)}
          prefix="$"
          value={draft.targetSalePrice}
        />
        <CalculatorField
          label="COGS"
          onChangeText={(next) => updateField("costOfGoods", next)}
          prefix="$"
          value={draft.costOfGoods}
        />
        <CalculatorField
          label="BUYER SHIPPING"
          onChangeText={(next) => updateField("buyerPaidShipping", next)}
          prefix="$"
          value={draft.buyerPaidShipping}
        />
        <CalculatorField
          label="LABEL COST"
          onChangeText={(next) => updateField("outboundShipping", next)}
          prefix="$"
          value={draft.outboundShipping}
        />
        <CalculatorField
          label="PREP / REPAIR"
          onChangeText={(next) => updateField("prepAndRepair", next)}
          prefix="$"
          value={draft.prepAndRepair}
        />
        <CalculatorField
          label="RETURN RESERVE"
          onChangeText={(next) => updateField("returnReserve", next)}
          prefix="$"
          value={draft.returnReserve}
        />
        <CalculatorField
          label="PACKAGE WT. (OZ)"
          onChangeText={(next) => updateField("packageWeightOz", next)}
          value={draft.packageWeightOz}
        />
      </View>

      {selectedMarketplace === "custom" ? (
        <View style={styles.customGrid}>
          <CalculatorField
            label="CUSTOM FEE %"
            onChangeText={(next) => updateField("customFeePercent", next)}
            value={draft.customFeePercent}
          />
          <CalculatorField
            label="CUSTOM FIXED FEE"
            onChangeText={(next) => updateField("customFixedFee", next)}
            prefix="$"
            value={draft.customFixedFee}
          />
        </View>
      ) : null}

      <Text selectable style={styles.shippingNote}>
        Package weight is here for your workflow. Enter the actual label cost—KeepFlip does not guess a shipping quote.
      </Text>

      <View style={styles.selectedProjection}>
        <View style={styles.selectedProjectionHeader}>
          <Text style={styles.sectionLabel}>{selectedProjection.marketplace.label.toUpperCase()} PROJECTION</Text>
          <Text selectable style={styles.feeBase}>
            FEES ON {formatExactMoney(selectedProjection.feeBase, currency)}
          </Text>
        </View>
        <View style={styles.metricRow}>
          <Metric
            accent={selectedProjection.netProfit >= 0 ? POSITIVE_PROFIT : theme.colors.danger}
            label="NET PROFIT"
            value={formatMoney(selectedProjection.netProfit, currency)}
          />
          <Metric
            accent={theme.colors.scannerCyan}
            label="ROI"
            value={formatRoi(selectedProjection.roiPercent)}
          />
          <Metric
            accent={theme.colors.goldBright}
            label="BREAK-EVEN"
            value={
              selectedProjection.breakEvenPrice == null
                ? "—"
                : formatMoney(selectedProjection.breakEvenPrice, currency)
            }
          />
        </View>
        <View style={styles.breakdownRow}>
          <Text selectable style={styles.breakdownText}>
            Revenue {formatExactMoney(selectedProjection.grossRevenue, currency)}
          </Text>
          <Text selectable style={styles.breakdownText}>
            Fees {formatExactMoney(selectedProjection.platformFee, currency)}
          </Text>
          <Text selectable style={styles.breakdownText}>
            Costs {formatExactMoney(selectedProjection.operatingCosts, currency)}
          </Text>
        </View>
      </View>

      <View style={styles.comparisonHeader}>
        <View>
          <Text style={styles.sectionLabel}>CHANNEL COMPARISON</Text>
          <Text selectable style={styles.legend}>
            COSTS <Text style={styles.legendDot}>●</Text> FEES <Text style={styles.legendFee}>●</Text> NET <Text style={styles.legendProfit}>●</Text>
          </Text>
        </View>
        <View style={styles.comparisonSummary}>
          <Text style={styles.summaryLabel}>BEST TAKE-HOME</Text>
          <Text selectable style={styles.summaryValue}>
            {bestProfit ? `${bestProfit.marketplace.shortLabel} · ${formatMoney(bestProfit.netProfit, currency)}` : "—"}
          </Text>
          <Text selectable style={styles.summaryRoi}>
            BEST ROI {bestRoi ? `${bestRoi.marketplace.shortLabel} ${formatRoi(bestRoi.roiPercent)}` : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.marketRows}>
        {projections.map((projection) => (
          <MarketBar
            currency={currency}
            key={projection.marketplace.id}
            projection={projection}
            scale={scale}
          />
        ))}
      </View>

      <Text selectable style={styles.disclaimer}>
        ESTIMATE ONLY · U.S. fee presets can change and may vary by category, seller plan, payment method, tax, and fulfillment. Confirm platform terms before listing.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 13,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.14)",
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
  rangeReadout: { alignItems: "flex-end", gap: 2 },
  rangeLabel: {
    color: "rgba(255, 255, 255, 0.46)",
    fontFamily: theme.fonts.numbers,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  rangeValue: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  rangeLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  rangeDetail: {
    color: "rgba(255, 255, 255, 0.66)",
    fontFamily: theme.fonts.numbers,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  presetSection: { gap: 8 },
  sectionLabel: {
    color: "rgba(255, 255, 255, 0.50)",
    fontFamily: theme.fonts.numbers,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.92,
  },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  preset: {
    flexGrow: 1,
    minWidth: 96,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.025)",
  },
  presetSelected: {
    borderColor: "rgba(0, 255, 255, 0.78)",
    backgroundColor: "rgba(0, 255, 255, 0.08)",
  },
  presetPressed: { opacity: 0.74 },
  presetName: { color: "rgba(255, 255, 255, 0.78)", fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900" },
  presetNameSelected: { color: "#FFFFFF" },
  presetFee: { color: "rgba(255, 255, 255, 0.44)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", lineHeight: 9 },
  presetFeeSelected: { color: theme.colors.scannerCyan },
  presetNote: { color: "rgba(255, 255, 255, 0.54)", fontFamily: theme.fonts.radar, fontSize: 8, lineHeight: 12 },
  inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  customGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { flexGrow: 1, flexBasis: "45%", minWidth: 112, gap: 5 },
  fieldLabel: { color: "rgba(255, 255, 255, 0.52)", fontFamily: theme.fonts.numbers, fontSize: 7, fontWeight: "900", letterSpacing: 0.55 },
  inputShell: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.26)",
  },
  inputPrefix: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 11, fontWeight: "900" },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  shippingNote: { color: "rgba(255, 255, 255, 0.54)", fontFamily: theme.fonts.radar, fontSize: 8, lineHeight: 12 },
  selectedProjection: {
    gap: 10,
    padding: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.30)",
    borderRadius: 4,
    backgroundColor: "rgba(242, 211, 138, 0.045)",
  },
  selectedProjectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  feeBase: { color: "rgba(255, 255, 255, 0.52)", fontFamily: theme.fonts.numbers, fontSize: 7, fontWeight: "900", letterSpacing: 0.45 },
  metricRow: { flexDirection: "row", gap: 6 },
  metric: { flex: 1, minWidth: 0, gap: 3, alignItems: "center" },
  metricLabel: { fontFamily: theme.fonts.numbers, fontSize: 7, fontWeight: "900", letterSpacing: 0.55, textAlign: "center" },
  metricValue: { color: "#FFFFFF", fontFamily: theme.fonts.radar, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"], textAlign: "center" },
  breakdownRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255, 255, 255, 0.10)" },
  breakdownText: { color: "rgba(255, 255, 255, 0.56)", fontFamily: theme.fonts.numbers, fontSize: 7, fontWeight: "900", letterSpacing: 0.35 },
  comparisonHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  legend: { marginTop: 4, color: "rgba(255, 255, 255, 0.48)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", letterSpacing: 0.38 },
  legendDot: { color: BAR_COST },
  legendFee: { color: theme.colors.danger },
  legendProfit: { color: POSITIVE_PROFIT },
  comparisonSummary: { alignItems: "flex-end", gap: 2 },
  summaryLabel: { color: "rgba(255, 255, 255, 0.45)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", letterSpacing: 0.55 },
  summaryValue: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900", fontVariant: ["tabular-nums"], textAlign: "right" },
  summaryRoi: { color: "rgba(255, 255, 255, 0.56)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", letterSpacing: 0.35, textAlign: "right" },
  marketRows: { gap: 7 },
  marketRow: { gap: 5 },
  marketRowLead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  marketName: { color: "rgba(255, 255, 255, 0.86)", fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: "900" },
  marketFee: { flexShrink: 1, color: "rgba(255, 255, 255, 0.42)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", letterSpacing: 0.25, textAlign: "right" },
  marketBarAndValue: { flexDirection: "row", alignItems: "center", gap: 8 },
  marketBarTrack: { height: 18, flex: 1, flexDirection: "row", overflow: "hidden", borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.06)" },
  barSegment: { minWidth: 2, height: "100%" },
  marketNet: { width: 68, fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"], textAlign: "right" },
  disclaimer: { color: "rgba(255, 255, 255, 0.42)", fontFamily: theme.fonts.numbers, fontSize: 6, fontWeight: "900", lineHeight: 10, letterSpacing: 0.36 },
});
