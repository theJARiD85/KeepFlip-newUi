import { useMemo, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
} from "react-native-reanimated";

import type { ItemAnalysisState } from "@/components/scanner/item-analysis-overlay";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;

type ItemAnalysisResultStageProps = {
  bottomInset: number;
  doneLabel?: string;
  onDone: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  state: ResultState;
  topInset: number;
};

type DetailCardProps = {
  accent: string;
  children: ReactNode;
  delay?: number;
  width?: number;
};

const analysisTextStyle = { fontFamily: theme.fonts.analysis } as const;

function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[analysisTextStyle, style]} />;
}

function withAlpha(color: string, alpha: number) {
  const value = color.replace("#", "");
  if (value.length !== 6) return color;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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

function DetailCard({
  accent,
  children,
  delay = 0,
  width = 272,
}: DetailCardProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(260).delay(delay)}
      exiting={FadeOut.duration(140)}
      style={[
        styles.detailCard,
        {
          width,
          borderColor: withAlpha(accent, 0.46),
          boxShadow: `0 12px 30px rgba(0, 0, 0, 0.54), 0 0 22px ${withAlpha(
            accent,
            0.16,
          )}`,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function CardEyebrow({
  accent,
  children,
}: {
  accent: string;
  children: ReactNode;
}) {
  return (
    <Text style={[styles.cardEyebrow, { color: accent }]}>
      {children}
    </Text>
  );
}

function ActionButton({
  accent,
  disabled = false,
  label,
  onPress,
  secondary = false,
}: {
  accent: string;
  disabled?: boolean;
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
        styles.actionButton,
        {
          borderColor: withAlpha(accent, 0.58),
          backgroundColor: secondary
            ? "rgba(4, 4, 8, 0.88)"
            : withAlpha(accent, 0.92),
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.actionButtonText,
          {
            color: secondary
              ? accent
              : theme.colors.backgroundDeep,
          },
        ]}
      >
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
  const identity = result.identity;

  const identityMeta = useMemo(
    () =>
      [
        identity.brand,
        identity.model,
        identity.variant,
        identity.category,
      ]
        .filter(Boolean)
        .join("  â€¢  "),
    [
      identity.brand,
      identity.category,
      identity.model,
      identity.variant,
    ],
  );

  const confidenceEntries = useMemo(
    () =>
      [
        ["OVERALL CONFIDENCE", result.confidence?.overall, theme.colors.goldBright],
        ["IDENTITY CONFIDENCE", result.confidence?.identity, theme.colors.scannerCyan],
        ["CONDITION CONFIDENCE", result.confidence?.condition, theme.colors.scannerViolet],
        ["VALUATION CONFIDENCE", result.confidence?.valuation, theme.colors.scannerAmber],
      ] as const,
    [result.confidence],
  );

  const readinessAccent =
    result.valuationReadiness.status === "ready"
      ? theme.colors.scannerCyan
      : result.valuationReadiness.status === "limited"
        ? theme.colors.scannerAmber
        : theme.colors.danger;

  return (
    <Animated.View
      accessibilityViewIsModal
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      importantForAccessibility="yes"
      pointerEvents="box-none"
      style={styles.overlay}
    >
      <Animated.View
        entering={FadeInDown.duration(260)}
        pointerEvents="none"
        style={[
          styles.identityHeader,
          { top: topInset + 16 },
        ]}
      >
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={2}
          selectable
          style={styles.identityTitle}
        >
          {identity.title}
        </Text>

        {identityMeta ? (
          <Text
            numberOfLines={2}
            selectable
            style={styles.identityMeta}
          >
            {identityMeta}
          </Text>
        ) : null}
      </Animated.View>

      <Pressable
        accessibilityLabel="Close item analysis"
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        onPress={onDone}
        style={({ pressed }) => [
          styles.closeButton,
          { top: topInset + 14 },
          pressed && !saving && styles.pressed,
          saving && styles.disabled,
        ]}
      >
        <IconSymbol
          color={theme.colors.cream}
          name="xmark"
          size={19}
        />
      </Pressable>

      <Animated.View
        entering={FadeInUp.duration(280).delay(80)}
        pointerEvents="box-none"
        style={[
          styles.bottomStage,
          { paddingBottom: bottomInset + 10 },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.detailRail}
          decelerationRate="fast"
          horizontal
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={286}
          style={styles.detailScroller}
        >
          {result.summary ? (
            <DetailCard
              accent={theme.colors.scannerCyan}
              width={272}
            >
              <CardEyebrow accent={theme.colors.scannerCyan}>
                ITEM SUMMARY
              </CardEyebrow>
              <Text
                numberOfLines={5}
                selectable
                style={styles.summaryText}
              >
                {result.summary}
              </Text>
            </DetailCard>
          ) : null}

          {result.valuation ? (
            <DetailCard
              accent={theme.colors.goldBright}
              delay={35}
              width={304}
            >
              <CardEyebrow accent={theme.colors.goldBright}>
                {result.valuation.source === "ebay" ||
                result.valuation.source === "multi_market"
                  ? "SOLD MARKET VALUATION"
                  : "VALUATION RANGE"}
              </CardEyebrow>

              <View style={styles.valuationRow}>
                {[
                  ["LOW", result.valuation.low],
                  ["MEDIAN", result.valuation.median],
                  ["HIGH", result.valuation.high],
                ].map(([label, value]) => {
                  const featured = label === "MEDIAN";

                  return (
                    <View
                      key={label}
                      style={[
                        styles.valuationMetric,
                        featured && styles.valuationMetricFeatured,
                      ]}
                    >
                      <Text
                        style={[
                          styles.valuationLabel,
                          featured && styles.valuationLabelFeatured,
                        ]}
                      >
                        {label}
                      </Text>
                      <Text
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        selectable
                        style={[
                          styles.valuationValue,
                          featured && styles.valuationValueFeatured,
                        ]}
                      >
                        {formatMoney(
                          Number(value),
                          result.valuation?.currency,
                        )}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {result.valuation.comparableCount != null ? (
                <Text style={styles.cardFootnote}>
                  {result.valuation.comparableCount} sold comp
                  {result.valuation.comparableCount === 1 ? "" : "s"} used
                </Text>
              ) : null}
            </DetailCard>
          ) : null}

          <DetailCard
            accent={readinessAccent}
            delay={70}
            width={272}
          >
            <CardEyebrow accent={readinessAccent}>
              VALUATION READINESS
            </CardEyebrow>
            <View style={styles.readinessRow}>
              <Text
                numberOfLines={2}
                selectable
                style={[styles.readinessTitle, { color: readinessAccent }]}
              >
                {result.valuationReadiness.label ?? "Valuation readiness"}
              </Text>
              {percentage(result.valuationReadiness.score) != null ? (
                <Text
                  style={[styles.readinessScore, { color: readinessAccent }]}
                >
                  {percentage(result.valuationReadiness.score)}%
                </Text>
              ) : null}
            </View>
            {result.valuationReadiness.reason ? (
              <Text
                numberOfLines={4}
                selectable
                style={styles.cardBody}
              >
                {result.valuationReadiness.reason}
              </Text>
            ) : null}
          </DetailCard>

          {result.condition ? (
            <DetailCard
              accent={theme.colors.scannerViolet}
              delay={105}
              width={272}
            >
              <CardEyebrow accent={theme.colors.scannerViolet}>
                OBSERVED CONDITION
              </CardEyebrow>
              <View style={styles.conditionHeading}>
                <Text selectable style={styles.conditionGrade}>
                  {result.condition.label}
                </Text>
                {percentage(result.condition.score) != null ? (
                  <Text
                    style={[
                      styles.conditionScore,
                      { color: theme.colors.scannerViolet },
                    ]}
                  >
                    {percentage(result.condition.score)}%
                  </Text>
                ) : null}
              </View>
              {result.condition.summary ? (
                <Text
                  numberOfLines={3}
                  selectable
                  style={styles.cardBody}
                >
                  {result.condition.summary}
                </Text>
              ) : null}
              {result.condition.details?.slice(0, 2).map((detail, index) => (
                <Text
                  key={`${detail}-${index}`}
                  numberOfLines={1}
                  style={styles.detailLine}
                >
                  â€¢ {detail}
                </Text>
              ))}
            </DetailCard>
          ) : null}

          {confidenceEntries.map(([label, value, accent], index) => {
            const score = percentage(value);
            if (score == null) return null;

            return (
              <DetailCard
                accent={accent}
                delay={130 + index * 25}
                key={label}
                width={184}
              >
                <CardEyebrow accent={accent}>{label}</CardEyebrow>
                <Text style={[styles.confidenceValue, { color: accent }]}>
                  {score}%
                </Text>
              </DetailCard>
            );
          })}

          {result.evidence?.slice(0, 6).map((evidence, index) => (
            <DetailCard
              accent={theme.colors.scannerCyan}
              delay={200 + index * 24}
              key={evidence.id ?? `${evidence.label}-${index}`}
              width={238}
            >
              <CardEyebrow accent={theme.colors.scannerCyan}>
                {evidence.label}
              </CardEyebrow>
              <Text
                numberOfLines={4}
                selectable
                style={styles.evidenceValue}
              >
                {evidence.value}
              </Text>
              {evidence.source ? (
                <Text numberOfLines={1} style={styles.sourceText}>
                  {evidence.source}
                </Text>
              ) : null}
            </DetailCard>
          ))}

          {result.suggestedPhotos?.length ? (
            <DetailCard
              accent={theme.colors.scannerAmber}
              delay={280}
              width={272}
            >
              <CardEyebrow accent={theme.colors.scannerAmber}>
                IMPROVE THE READ
              </CardEyebrow>
              {result.suggestedPhotos.slice(0, 3).map((photo, index) => (
                <Text
                  key={photo.id ?? `${photo.label}-${index}`}
                  numberOfLines={2}
                  style={styles.detailLine}
                >
                  â€¢ {photo.label}
                </Text>
              ))}
            </DetailCard>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          {onSave ? (
            <ActionButton
              accent={theme.colors.goldBright}
              disabled={saving}
              label={saving ? "Savingâ€¦" : saveLabel}
              onPress={onSave}
            />
          ) : null}

          <ActionButton
            accent={theme.colors.goldBright}
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
  identityHeader: {
    position: "absolute",
    right: 72,
    left: 24,
    zIndex: 8,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  identityTitle: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: 0.25,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  identityMeta: {
    marginTop: 5,
    color: "rgba(255, 248, 231, 0.76)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "300",
    letterSpacing: 0.55,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 12,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.4)",
    backgroundColor: "rgba(4, 4, 8, 0.76)",
  },
  bottomStage: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    gap: 10,
  },
  detailScroller: {
    width: "100%",
    flexGrow: 0,
  },
  detailRail: {
    alignItems: "stretch",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 4,
  },
  detailCard: {
    height: 142,
    justifyContent: "flex-start",
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(5, 5, 10, 0.86)",
    experimental_backgroundImage: `
      radial-gradient(circle at 92% 8%, rgba(141, 114, 255, 0.13) 0%, transparent 34%),
      linear-gradient(145deg, rgba(15, 13, 23, 0.92) 0%, rgba(4, 5, 10, 0.92) 78%)
    `,
  },
  cardEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  summaryText: {
    color: theme.colors.cream,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  cardBody: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "400",
  },
  cardFootnote: {
    color: theme.colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
  },
  valuationRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 7,
  },
  valuationMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.17)",
    backgroundColor: "rgba(255, 255, 255, 0.025)",
  },
  valuationMetricFeatured: {
    borderColor: "rgba(242, 211, 138, 0.5)",
    backgroundColor: "rgba(242, 211, 138, 0.09)",
  },
  valuationLabel: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  valuationLabelFeatured: {
    color: theme.colors.goldBright,
  },
  valuationValue: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  valuationValueFeatured: {
    color: theme.colors.goldBright,
    fontSize: 17,
    fontWeight: "900",
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  readinessTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  readinessScore: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "900",
  },
  conditionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  conditionGrade: {
    flex: 1,
    color: theme.colors.cream,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  conditionScore: {
    fontSize: 18,
    fontWeight: "900",
  },
  confidenceValue: {
    marginTop: 8,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  evidenceValue: {
    color: theme.colors.cream,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  sourceText: {
    marginTop: "auto",
    color: theme.colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
  },
  detailLine: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "400",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.85,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
