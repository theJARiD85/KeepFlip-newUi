import { useMemo } from "react";
import {
  Text as NativeText,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextProps,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut } from "react-native-reanimated";

import type { ItemAnalysisState } from "@/components/scanner/item-analysis-overlay";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

type ItemAnalysisResultStageProps = {
  bottomInset: number;
  doneLabel?: string;
  embedded?: boolean;
  onDone: () => void;
  onSave?: () => void;
  projectionLabel?: string;
  saveLabel?: string;
  saving?: boolean;
  state: ResultState;
  topInset: number;
  viewportWidth?: number;
};

const analysisTextStyle = { fontFamily: theme.fonts.radar } as const;

function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[analysisTextStyle, style]} />;
}

function percentage(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function ActionButton({
  disabled,
  label,
  onPress,
  secondary = false,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.actionSecondary,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ItemAnalysisResultStage({
  bottomInset,
  doneLabel = "Start new scan",
  onDone,
  onSave,
  saveLabel = "Save to inventory",
  saving = false,
  state,
  topInset,
}: ItemAnalysisResultStageProps) {
  const result = state.data;
  const identityMeta = useMemo(
    () =>
      [
        result.identity.brand,
        result.identity.model,
        result.identity.variant,
        result.identity.category,
      ]
        .filter(Boolean)
        .join("  •  "),
    [result.identity],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      style={styles.overlay}
    >
      <View style={[styles.header, { top: topInset + 14 }]}>
        <View style={styles.headerCopy}>
          <Text numberOfLines={2} selectable style={styles.title}>
            {result.identity.title}
          </Text>
          {identityMeta ? (
            <Text numberOfLines={2} selectable style={styles.meta}>
              {identityMeta}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel="Close item analysis"
          accessibilityRole="button"
          disabled={saving}
          onPress={onDone}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && !saving && styles.pressed,
            saving && styles.disabled,
          ]}
        >
          <IconSymbol color={theme.colors.cream} name="xmark" size={19} />
        </Pressable>
      </View>

      <Animated.View
        entering={FadeInUp.duration(260).delay(70)}
        style={[styles.bottomStage, { paddingBottom: bottomInset + 10 }]}
      >
        <ScrollView
          contentContainerStyle={styles.rail}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {result.summary ? (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>ITEM SUMMARY</Text>
              <Text numberOfLines={6} selectable style={styles.body}>
                {result.summary}
              </Text>
            </View>
          ) : null}

          {result.valuation ? (
            <View style={[styles.card, styles.valuationCard]}>
              <Text style={styles.eyebrow}>SOLD MARKET VALUATION</Text>
              <View style={styles.valuationRow}>
                {[
                  ["LOW", result.valuation.low],
                  ["MEDIAN", result.valuation.median],
                  ["HIGH", result.valuation.high],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.valuationMetric}>
                    <Text style={styles.metricLabel}>{label}</Text>
                    <Text
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      selectable
                      style={
                        label === "MEDIAN"
                          ? styles.metricValueFeatured
                          : styles.metricValue
                      }
                    >
                      {formatMoney(Number(value), result.valuation?.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.eyebrow}>CONFIDENCE</Text>
            <Text style={styles.confidenceValue}>
              {percentage(result.confidence?.overall) ?? "--"}%
            </Text>
            <Text style={styles.body}>
              {result.valuationReadiness.reason ??
                result.valuationReadiness.label ??
                "KeepFlip completed the available evidence review."}
            </Text>
          </View>

          {result.condition ? (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>OBSERVED CONDITION</Text>
              <Text selectable style={styles.conditionGrade}>
                {result.condition.label}
              </Text>
              {result.condition.summary ? (
                <Text numberOfLines={4} selectable style={styles.body}>
                  {result.condition.summary}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          {onSave ? (
            <ActionButton
              disabled={saving}
              label={saving ? "Saving…" : saveLabel}
              onPress={onSave}
            />
          ) : null}
          <ActionButton
            disabled={saving}
            label={doneLabel}
            onPress={onDone}
            secondary={Boolean(onSave)}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 44,
  },
  header: {
    position: "absolute",
    right: 16,
    left: 22,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingLeft: 42,
  },
  title: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.4)",
    backgroundColor: "rgba(4, 4, 8, 0.78)",
  },
  bottomStage: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    gap: 10,
  },
  rail: {
    alignItems: "stretch",
    gap: 14,
    paddingHorizontal: 18,
  },
  card: {
    width: 270,
    height: 146,
    gap: 9,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.28)",
    backgroundColor: "rgba(5, 5, 10, 0.88)",
  },
  valuationCard: {
    width: 310,
    borderColor: "rgba(242, 211, 138, 0.34)",
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  body: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  valuationRow: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
  },
  valuationMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 12,
    backgroundColor: "rgba(242, 211, 138, 0.05)",
  },
  metricLabel: {
    color: theme.colors.goldMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  metricValue: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  metricValueFeatured: {
    width: "100%",
    color: theme.colors.goldBright,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  confidenceValue: {
    color: theme.colors.goldBright,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  conditionGrade: {
    color: theme.colors.scannerViolet,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
  },
  action: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.goldBright,
    backgroundColor: theme.colors.goldBright,
  },
  actionSecondary: {
    backgroundColor: "rgba(4, 4, 8, 0.82)",
  },
  actionText: {
    color: theme.colors.backgroundDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  actionTextSecondary: {
    color: theme.colors.goldBright,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
