import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type {
  AnalysisProfitPlan,
  AnalysisValuation,
  AnalysisValuationReadiness,
} from "@/components/scanner/analysis-visual-types";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

export type ValuationEvidenceFieldProps = {
  ambient?: boolean;
  photoUri?: string | null;
  profitPlan: AnalysisProfitPlan;
  style?: StyleProp<ViewStyle>;
  valuation?: AnalysisValuation;
  valuationReadiness: AnalysisValuationReadiness;
};

/** Web stub — native builds the Skia evidence constellation + dual POP sequence. */
export function ValuationEvidenceField({
  style,
  valuationReadiness,
}: ValuationEvidenceFieldProps) {
  const accent =
    valuationReadiness.status === "ready"
      ? theme.colors.scannerCyan
      : valuationReadiness.status === "limited"
        ? theme.colors.goldBright
        : theme.colors.danger;

  return (
    <View style={[styles.root, style]}>
      <View
        style={[
          styles.core,
          {
            borderColor: accent,
            boxShadow: `0 0 28px ${accent}55`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundDeep,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 36%, rgba(88, 223, 232, 0.12) 0%, transparent 42%),
      linear-gradient(160deg, #07050C 0%, ${theme.colors.backgroundDeep} 100%)
    `,
  },
  core: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    backgroundColor: "rgba(0, 255, 255, 0.06)",
  },
});
