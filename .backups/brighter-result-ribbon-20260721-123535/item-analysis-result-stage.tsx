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
      style={[styles.ribbonModule, { width }]}
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
    <Text style={[styles.moduleLabel, { color: accent }]}>
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
          snapToAlignment="start"
          snapToInterval={244}
          style={styles.ribbonScroller}
        >
          {result.valuation ? (
            <RibbonModule
              accent={theme.colors.goldBright}
              width={290}
            >
              <ModuleLabel accent={theme.colors.goldBright}>
                MARKET VALUE
              </ModuleLabel>

              <View style={styles.valueLayout}>
                <View style={styles.primaryValue}>
                  <Text style={styles.primaryValueLabel}>MEDIAN</Text>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    selectable
                    style={styles.primaryValueText}
                  >
                    {formatMoney(
                      Number(result.valuation.median),
                      result.valuation.currency,
                    )}
                  </Text>
                </View>

                <View style={styles.rangeStack}>
                  <View>
                    <Text style={styles.rangeLabel}>LOW</Text>
                    <Text
                      numberOfLines={1}
                      selectable
                      style={styles.rangeValue}
                    >
                      {formatMoney(
                        Number(result.valuation.low),
                        result.valuation.currency,
                      )}
                    </Text>
                  </View>

                  <View>
                    <Text style={styles.rangeLabel}>HIGH</Text>
                    <Text
                      numberOfLines={1}
                      selectable
                      style={styles.rangeValue}
                    >
                      {formatMoney(
                        Number(result.valuation.high),
                        result.valuation.currency,
                      )}
                    </Text>
                  </View>
                </View>
              </View>

              {result.valuation.comparableCount != null ? (
                <Text style={styles.moduleFootnote}>
                  {result.valuation.comparableCount} sold comp
                  {result.valuation.comparableCount === 1 ? "" : "s"} used
                </Text>
              ) : null}
            </RibbonModule>
          ) : null}

          {result.summary ? (
            <RibbonModule
              accent={theme.colors.scannerCyan}
              delay={30}
              width={254}
            >
              <ModuleLabel accent={theme.colors.scannerCyan}>
                ANALYSIS
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

          <RibbonModule
            accent={readinessAccent}
            delay={60}
            width={218}
          >
            <ModuleLabel accent={readinessAccent}>
              READINESS
            </ModuleLabel>

            <View style={styles.readinessHeading}>
              <Text
                numberOfLines={2}
                selectable
                style={[styles.readinessTitle, { color: readinessAccent }]}
              >
                {result.valuationReadiness.label ?? "Valuation readiness"}
              </Text>

              {percentage(result.valuationReadiness.score) != null ? (
                <Text
                  style={[
                    styles.readinessScore,
                    { color: readinessAccent },
                  ]}
                >
                  {percentage(result.valuationReadiness.score)}%
                </Text>
              ) : null}
            </View>

            {result.valuationReadiness.reason ? (
              <Text
                numberOfLines={3}
                selectable
                style={styles.moduleBody}
              >
                {result.valuationReadiness.reason}
              </Text>
            ) : null}
          </RibbonModule>

          {result.condition ? (
            <RibbonModule
              accent={theme.colors.scannerViolet}
              delay={90}
              width={222}
            >
              <ModuleLabel accent={theme.colors.scannerViolet}>
                CONDITION
              </ModuleLabel>

              <View style={styles.conditionHeading}>
                <Text
                  numberOfLines={1}
                  selectable
                  style={styles.conditionGrade}
                >
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
                  style={styles.moduleBody}
                >
                  {result.condition.summary}
                </Text>
              ) : null}
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
              label={saving ? "Savingâ€¦" : saveLabel}
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
    right: 60,
    left: 60,
    zIndex: 8,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  identityTitle: {
    width: "100%",
    color: theme.colors.cream,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 9,
  },
  identityMeta: {
    marginTop: 4,
    color: "rgba(255, 248, 231, 0.72)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "300",
    letterSpacing: 0.55,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.94)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  closeButton: {
    position: "absolute",
    left: 16,
    zIndex: 14,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 248, 231, 0.28)",
    backgroundColor: "rgba(4, 4, 8, 0.42)",
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.38)",
  },
  bottomFade: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 168,
    opacity: 0.82,
    experimental_backgroundImage: `
      linear-gradient(
        to bottom,
        rgba(3, 2, 8, 0) 0%,
        rgba(3, 2, 8, 0.12) 34%,
        rgba(3, 2, 8, 0.38) 72%,
        rgba(3, 2, 8, 0.56) 100%
      )
    `,
  },
  bottomStage: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    gap: 6,
  },
  ribbonScroller: {
    width: "100%",
    maxHeight: 108,
    flexGrow: 0,
  },
  ribbonContent: {
    alignItems: "stretch",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 5,
    paddingBottom: 3,
  },
  ribbonModule: {
    height: 100,
    flexDirection: "row",
    overflow: "hidden",
  },
  moduleAccent: {
    width: 2,
    marginVertical: 4,
    borderRadius: 2,
  },
  moduleContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(255, 248, 231, 0.16)",
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
    color: theme.colors.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    letterSpacing: 0.9,
  },
  primaryValueText: {
    width: "100%",
    color: theme.colors.goldBright,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900",
  },
  rangeStack: {
    minWidth: 78,
    gap: 5,
  },
  rangeLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  rangeValue: {
    color: theme.colors.cream,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  summaryText: {
    color: theme.colors.cream,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
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
    fontWeight: "800",
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
    color: theme.colors.cream,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
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
    color: theme.colors.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "400",
  },
  moduleBody: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "400",
  },
  evidenceValue: {
    color: theme.colors.cream,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  moduleFootnote: {
    marginTop: "auto",
    color: theme.colors.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "400",
  },
  suggestionLine: {
    color: theme.colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "400",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 18,
  },
  compactAction: {
    minWidth: 132,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  compactActionText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
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
