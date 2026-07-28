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
  projectionLabel?: string;
  saveLabel?: string;
  saving?: boolean;
  state: ResultState;
  topInset: number;
};

type RibbonModuleProps = {
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

function RibbonModule({
  accent,
  children,
  delay = 0,
  width = 230,
}: RibbonModuleProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(240).delay(delay)}
      exiting={FadeOut.duration(120)}
      style={[
        styles.ribbonModule,
        {
          width,
          borderColor: withAlpha(accent, 0.3),
          boxShadow: `0 8px 24px rgba(0, 0, 0, 0.32), 0 0 16px ${withAlpha(accent, 0.08)}`,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.moduleAccent,
          {
            backgroundColor: accent,
            boxShadow: `0 0 14px ${withAlpha(accent, 0.72)}`,
          },
        ]}
      />
      <View style={styles.moduleContent}>{children}</View>
    </Animated.View>
  );
}

function ModuleLabel({
  accent,
  children,
}: {
  accent: string;
  children: ReactNode;
}) {
  return (
    <Text
      style={[
        styles.moduleLabel,
        {
          color: accent,
          textShadowColor: withAlpha(accent, 0.72),
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 7,
        },
      ]}
    >
      {children}
    </Text>
  );
}

function CompactAction({
  accent,
  disabled = false,
  label,
  onPress,
  primary = false,
}: {
  accent: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactAction,
        primary && {
          borderColor: withAlpha(accent, 0.62),
          backgroundColor: withAlpha(accent, 0.16),
        },
        !primary && {
          borderColor: "rgba(255, 248, 231, 0.22)",
          backgroundColor: "rgba(5, 5, 10, 0.30)",
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.compactActionText,
          { color: primary ? accent : theme.colors.cream },
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
  projectionLabel = "GENERATED MODEL / SKIA PROJECTION",
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
        .join("  /  "),
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
        [
          "OVERALL",
          result.confidence?.overall,
          theme.colors.goldBright,
        ],
        [
          "IDENTITY",
          result.confidence?.identity,
          theme.colors.scannerCyan,
        ],
        [
          "CONDITION",
          result.confidence?.condition,
          theme.colors.scannerViolet,
        ],
        [
          "VALUATION",
          result.confidence?.valuation,
          theme.colors.scannerAmber,
        ],
      ] as const,
    [result.confidence],
  );

  const readinessAccent =
    result.valuationReadiness.status === "ready"
      ? theme.colors.scannerCyan
      : result.valuationReadiness.status === "limited"
        ? theme.colors.scannerAmber
        : theme.colors.danger;
  const overallConfidence = percentage(
    result.confidence?.overall,
  );

  return (
    <Animated.View
      accessibilityViewIsModal
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      importantForAccessibility="yes"
      pointerEvents="box-none"
      style={styles.overlay}
    >
      <Animated.View
        entering={FadeInDown.duration(240)}
        pointerEvents="none"
        style={[
          styles.identityHeader,
          { top: topInset + 14 },
        ]}
      >
        <View style={styles.identityStatusRow}>
          <View style={styles.identityStatusSignal} />
          <Text style={styles.identityStatusText}>
            IDENTITY LOCK
          </Text>
          <View style={styles.identityStatusRule} />
          <Text style={styles.identityStatusScore}>
            {overallConfidence == null
              ? "EVIDENCE VERIFIED"
              : `${overallConfidence}% CONF`}
          </Text>
        </View>

        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
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

      <Animated.View
        entering={FadeInDown.duration(220).delay(55)}
        pointerEvents="none"
        style={[
          styles.projectionBadge,
          { top: topInset + 126 },
        ]}
      >
        <View style={styles.projectionSignal} />
        <Text style={styles.projectionLabel}>
          {projectionLabel}
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(220).delay(80)}
        style={[
          styles.marketReadout,
          { top: topInset + 164 },
        ]}
      >
        <View style={styles.readoutBracketTop} />
        <ModuleLabel accent={theme.colors.goldBright}>
          MARKET SIGNAL
        </ModuleLabel>

        {result.valuation ? (
          <>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              selectable
              style={styles.marketMedian}
            >
              {formatMoney(
                Number(result.valuation.median),
                result.valuation.currency,
              )}
            </Text>
            {result.valuation.snapshot ? (
              <Text style={styles.readoutFootnote}>
                SAVED ANALYSIS MEDIAN
              </Text>
            ) : (
              <View style={styles.marketRangeRow}>
                <View style={styles.marketRangeCell}>
                  <Text style={styles.readoutMicroLabel}>LOW</Text>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    selectable
                    style={styles.readoutMicroValue}
                  >
                    {formatMoney(
                      Number(result.valuation.low),
                      result.valuation.currency,
                    )}
                  </Text>
                </View>
                <View style={styles.marketRangeCell}>
                  <Text style={styles.readoutMicroLabel}>HIGH</Text>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    selectable
                    style={styles.readoutMicroValue}
                  >
                    {formatMoney(
                      Number(result.valuation.high),
                      result.valuation.currency,
                    )}
                  </Text>
                </View>
              </View>
            )}
            {!result.valuation.snapshot &&
            result.valuation.comparableCount != null ? (
              <Text style={styles.readoutFootnote}>
                {String(
                  result.valuation.comparableCount,
                ).padStart(2, "0")}{" "}
                SOLD COMPS
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.readoutUnavailable}>
            MARKET DATA PENDING
          </Text>
        )}
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(220).delay(110)}
        style={[
          styles.statusReadout,
          { top: topInset + 164 },
        ]}
      >
        <View style={styles.readoutBracketTop} />
        <ModuleLabel accent={readinessAccent}>
          VALUE READINESS
        </ModuleLabel>
        <View style={styles.statusScoreRow}>
          <View
            style={[
              styles.statusSignal,
              {
                backgroundColor: readinessAccent,
                boxShadow: `0 0 12px ${withAlpha(readinessAccent, 0.8)}`,
              },
            ]}
          />
          <Text
            selectable
            style={[
              styles.statusScore,
              { color: readinessAccent },
            ]}
          >
            {`${percentage(result.valuationReadiness.score) ?? "--"}%`}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          selectable
          style={styles.statusLabel}
        >
          {result.valuationReadiness.label ??
            "Valuation readiness"}
        </Text>

        {result.condition ? (
          <View style={styles.conditionReadout}>
            <Text style={styles.readoutMicroLabel}>
              CONDITION
            </Text>
            <View style={styles.conditionReadoutRow}>
              <Text
                numberOfLines={1}
                selectable
                style={styles.conditionReadoutGrade}
              >
                {result.condition.label}
              </Text>
              {percentage(result.condition.score) != null ? (
                <Text style={styles.conditionReadoutScore}>
                  {percentage(result.condition.score)}%
                </Text>
              ) : null}
            </View>
          </View>
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
          { top: topInset + 12 },
          pressed && !saving && styles.pressed,
          saving && styles.disabled,
        ]}
      >
        <IconSymbol
          color={theme.colors.cream}
          name="xmark"
          size={18}
        />
      </Pressable>

      <View pointerEvents="none" style={styles.bottomFade} />

      <Animated.View
        entering={FadeInUp.duration(260).delay(70)}
        pointerEvents="box-none"
        style={[
          styles.bottomStage,
          { paddingBottom: bottomInset + 8 },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.ribbonContent}
          decelerationRate="fast"
          horizontal
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          style={styles.ribbonScroller}
        >
          {result.summary ? (
            <RibbonModule
              accent={theme.colors.scannerCyan}
              delay={30}
              width={272}
            >
              <ModuleLabel accent={theme.colors.scannerCyan}>
                INTELLIGENCE SUMMARY
              </ModuleLabel>
              <Text
                numberOfLines={4}
                selectable
                style={styles.summaryText}
              >
                {result.summary}
              </Text>
            </RibbonModule>
          ) : null}

          {confidenceEntries.map(([label, value, accent], index) => {
            const score = percentage(value);
            if (score == null) return null;

            return (
              <RibbonModule
                accent={accent}
                delay={115 + index * 22}
                key={label}
                width={132}
              >
                <ModuleLabel accent={accent}>{label}</ModuleLabel>
                <Text
                  style={[styles.confidenceValue, { color: accent }]}
                >
                  {score}%
                </Text>
                <Text style={styles.confidenceCaption}>
                  confidence
                </Text>
              </RibbonModule>
            );
          })}

          {result.evidence?.slice(0, 5).map((evidence, index) => (
            <RibbonModule
              accent={theme.colors.scannerCyan}
              delay={190 + index * 22}
              key={evidence.id ?? `${evidence.label}-${index}`}
              width={206}
            >
              <ModuleLabel accent={theme.colors.scannerCyan}>
                {evidence.label}
              </ModuleLabel>

              <Text
                numberOfLines={3}
                selectable
                style={styles.evidenceValue}
              >
                {evidence.value}
              </Text>

              {evidence.source ? (
                <Text numberOfLines={1} style={styles.moduleFootnote}>
                  {evidence.source}
                </Text>
              ) : null}
            </RibbonModule>
          ))}

          {result.suggestedPhotos?.length ? (
            <RibbonModule
              accent={theme.colors.scannerAmber}
              delay={260}
              width={232}
            >
              <ModuleLabel accent={theme.colors.scannerAmber}>
                BETTER PHOTOS
              </ModuleLabel>

              {result.suggestedPhotos.slice(0, 3).map((photo, index) => (
                <Text
                  key={photo.id ?? `${photo.label}-${index}`}
                  numberOfLines={1}
                  style={styles.suggestionLine}
                >
                  {String(index + 1).padStart(2, "0")}  {photo.label}
                </Text>
              ))}
            </RibbonModule>
          ) : null}
        </ScrollView>

        <View style={styles.actionRow}>
          {onSave ? (
            <CompactAction
              accent={theme.colors.goldBright}
              disabled={saving}
              label={saving ? "Saving..." : saveLabel}
              onPress={onSave}
              primary
            />
          ) : null}

          <CompactAction
            accent={theme.colors.goldBright}
            disabled={saving}
            label={doneLabel}
            onPress={onDone}
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
    right: 66,
    left: 66,
    zIndex: 8,
    alignItems: "stretch",
    gap: 4,
    minHeight: 82,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: "rgba(88, 223, 232, 0.22)",
    borderLeftColor: theme.colors.scannerCyan,
    borderRightColor: theme.colors.goldBright,
    backgroundColor: "rgba(2, 4, 8, 0.62)",
    boxShadow:
      "0 10px 28px rgba(0, 0, 0, 0.40), 0 0 18px rgba(88, 223, 232, 0.06)",
  },
  identityStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  identityStatusSignal: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 10px rgba(0, 255, 242, 0.90)",
  },
  identityStatusText: {
    color: theme.colors.scannerCyan,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  identityStatusRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(88, 223, 232, 0.25)",
  },
  identityStatusScore: {
    color: theme.colors.goldBright,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    fontVariant: ["tabular-nums"],
  },
  identityTitle: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: 0.25,
    textAlign: "left",
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
  },
  identityMeta: {
    color: "rgba(255, 248, 231, 0.72)",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textAlign: "left",
    textShadowColor: "rgba(0, 0, 0, 0.94)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  projectionBadge: {
    position: "absolute",
    left: "50%",
    zIndex: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.22)",
    backgroundColor: "rgba(1, 4, 8, 0.48)",
    transform: [{ translateX: "-50%" }],
  },
  projectionSignal: {
    width: 5,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerViolet,
    boxShadow: "0 0 8px rgba(141, 114, 255, 0.88)",
  },
  projectionLabel: {
    color: "rgba(200, 244, 247, 0.82)",
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  marketReadout: {
    position: "absolute",
    left: 12,
    zIndex: 7,
    width: 112,
    gap: 7,
    padding: 10,
    borderWidth: 1,
    borderLeftWidth: 2,
    borderColor: "rgba(242, 211, 138, 0.26)",
    borderLeftColor: theme.colors.goldBright,
    backgroundColor: "rgba(3, 3, 8, 0.56)",
    boxShadow:
      "0 10px 24px rgba(0, 0, 0, 0.34), 0 0 16px rgba(242, 211, 138, 0.07)",
  },
  statusReadout: {
    position: "absolute",
    right: 12,
    zIndex: 7,
    width: 112,
    gap: 7,
    padding: 10,
    borderWidth: 1,
    borderRightWidth: 2,
    borderColor: "rgba(88, 223, 232, 0.24)",
    borderRightColor: theme.colors.scannerCyan,
    backgroundColor: "rgba(3, 3, 8, 0.56)",
    boxShadow:
      "0 10px 24px rgba(0, 0, 0, 0.34), 0 0 16px rgba(88, 223, 232, 0.07)",
  },
  readoutBracketTop: {
    position: "absolute",
    top: -1,
    right: -1,
    left: -1,
    height: 1,
    backgroundColor: "rgba(255, 248, 231, 0.42)",
  },
  marketMedian: {
    color: theme.colors.goldBright,
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(242, 211, 138, 0.62)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
  marketRangeRow: {
    flexDirection: "row",
    gap: 7,
  },
  marketRangeCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(242, 211, 138, 0.22)",
  },
  readoutMicroLabel: {
    color: "rgba(255, 248, 231, 0.56)",
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  readoutMicroValue: {
    color: theme.colors.cream,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  readoutFootnote: {
    color: "rgba(242, 211, 138, 0.68)",
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  readoutUnavailable: {
    color: theme.colors.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: "800",
  },
  statusScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statusSignal: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
  },
  statusScore: {
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  statusLabel: {
    color: theme.colors.cream,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
  },
  conditionReadout: {
    gap: 3,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(141, 114, 255, 0.28)",
  },
  conditionReadoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  conditionReadoutGrade: {
    flex: 1,
    color: theme.colors.scannerViolet,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  conditionReadoutScore: {
    color: theme.colors.scannerViolet,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  closeButton: {
    position: "absolute",
    left: 16,
    zIndex: 14,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(2, 5, 9, 0.60)",
    boxShadow:
      "0 8px 20px rgba(0, 0, 0, 0.40), 0 0 12px rgba(88, 223, 232, 0.08)",
  },
  bottomFade: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 182,
    opacity: 0.9,
    experimental_backgroundImage: `
      linear-gradient(
        to bottom,
        rgba(3, 2, 8, 0) 0%,
        rgba(3, 2, 8, 0.14) 28%,
        rgba(3, 2, 8, 0.48) 68%,
        rgba(3, 2, 8, 0.82) 100%
      )
    `,
  },
  bottomStage: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    gap: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: "rgba(88, 223, 232, 0.20)",
  },
  ribbonScroller: {
    width: "100%",
    maxHeight: 102,
    flexGrow: 0,
  },
  ribbonContent: {
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 3,
    paddingBottom: 4,
  },
  ribbonModule: {
    height: 94,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 4,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "rgba(2, 5, 9, 0.66)",
  },
  moduleAccent: {
    width: 3,
  },
  moduleContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  moduleLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  valueLayout: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  primaryValue: {
    flex: 1,
    minWidth: 0,
  },
  primaryValueLabel: {
    color: "rgba(255, 248, 231, 0.88)",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  primaryValueText: {
    width: "100%",
    color: theme.colors.goldBright,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
    textShadowColor: "rgba(242, 211, 138, 0.72)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  rangeStack: {
    minWidth: 78,
    gap: 5,
  },
  rangeLabel: {
    color: "rgba(255, 248, 231, 0.82)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  rangeValue: {
    color: "#fffaf0",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  summaryText: {
    color: "#fffaf0",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    textShadowColor: "rgba(255, 255, 255, 0.14)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  readinessHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  readinessTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  readinessScore: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },
  conditionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  conditionGrade: {
    flex: 1,
    color: "#fffaf0",
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  conditionScore: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },
  confidenceValue: {
    marginTop: 5,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  confidenceCaption: {
    color: "rgba(255, 248, 231, 0.78)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  moduleBody: {
    color: "rgba(255, 248, 231, 0.84)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  evidenceValue: {
    color: "#fffaf0",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  moduleFootnote: {
    marginTop: "auto",
    color: "rgba(255, 248, 231, 0.72)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
  },
  suggestionLine: {
    color: "rgba(255, 248, 231, 0.84)",
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(88, 223, 232, 0.16)",
  },
  compactAction: {
    flex: 1,
    maxWidth: 244,
    minWidth: 0,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  compactActionText: {
    fontSize: 8,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
