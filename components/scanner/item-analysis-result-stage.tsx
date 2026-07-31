/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentional mutable UI-thread state. */

import * as Haptics from "expo-haptics";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  type TextProps,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { ItemAnalysisState } from "@/components/scanner/item-analysis-overlay";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;
type ResultData = ResultState["data"];

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

type ResultReelId =
  | "identity"
  | "condition"
  | "evidence"
  | "confidence"
  | "value";

type ResultReel = {
  accent: string;
  eyebrow: string;
  icon:
    | "tag.fill"
    | "checkmark.shield.fill"
    | "chart.bar.fill"
    | "gauge.with.dots.needle.67percent"
    | "dollarsign.circle.fill";
  id: ResultReelId;
  label: string;
};

type ReelTabProps = {
  active: boolean;
  disabled: boolean;
  index: number;
  onPress: () => void;
  position: SharedValue<number>;
  reel: ResultReel;
};

type ReelPanelProps = {
  active: boolean;
  children: ReactNode;
  index: number;
  left: number;
  pageWidth: number;
  position: SharedValue<number>;
  reel: ResultReel;
};

const analysisTextStyle = {
  fontFamily: theme.fonts.analysis,
} as const;

const RESULT_REELS: ResultReel[] = [
  {
    accent: theme.colors.scannerCyan,
    eyebrow: "RESOLVED IDENTITY",
    icon: "tag.fill",
    id: "identity",
    label: "Identity",
  },
  {
    accent: theme.colors.scannerViolet,
    eyebrow: "CONDITION SIGNAL",
    icon: "checkmark.shield.fill",
    id: "condition",
    label: "Condition",
  },
  {
    accent: theme.colors.scannerCyan,
    eyebrow: "VERIFIED EVIDENCE",
    icon: "chart.bar.fill",
    id: "evidence",
    label: "Evidence",
  },
  {
    accent: theme.colors.goldBright,
    eyebrow: "CONFIDENCE MATRIX",
    icon: "gauge.with.dots.needle.67percent",
    id: "confidence",
    label: "Confidence",
  },
  {
    accent: theme.colors.scannerAmber,
    eyebrow: "MARKET INTELLIGENCE",
    icon: "dollarsign.circle.fill",
    id: "value",
    label: "Value",
  },
];

const LAST_REEL_INDEX = RESULT_REELS.length - 1;
const REEL_SPRING = {
  damping: 20,
  mass: 0.76,
  overshootClamping: true,
  stiffness: 245,
} as const;

function Text({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[analysisTextStyle, style]}
    />
  );
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
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
      style: "currency",
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function CompactAction({
  accent,
  disabled,
  label,
  onPress,
  primary = false,
}: {
  accent: string;
  disabled: boolean;
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
        styles.action,
        {
          backgroundColor: primary
            ? withAlpha(accent, 0.16)
            : "rgba(2, 4, 8, 0.58)",
          borderColor: primary
            ? withAlpha(accent, 0.6)
            : "rgba(255, 248, 231, 0.22)",
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.actionText,
          {
            color: primary
              ? accent
              : theme.colors.cream,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HudField({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: accent }]}>
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={styles.fieldValue}
      >
        {value || "Not resolved"}
      </Text>
    </View>
  );
}

function ScoreMeter({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value?: number;
}) {
  const score = percentage(value);
  const fill = score == null ? 0 : score;

  return (
    <View style={styles.meterRow}>
      <Text numberOfLines={1} style={styles.meterLabel}>
        {label}
      </Text>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            {
              backgroundColor: accent,
              boxShadow: `0 0 8px ${withAlpha(accent, 0.62)}`,
              width: `${fill}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.meterValue, { color: accent }]}>
        {score == null ? "--" : `${score}%`}
      </Text>
    </View>
  );
}

function ReelTab({
  active,
  disabled,
  index,
  onPress,
  position,
  reel,
}: ReelTabProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const delta = index - position.value;
    const distance = Math.min(Math.abs(delta), 2);

    return {
      opacity: interpolate(
        distance,
        [0, 1, 2],
        [1, 0.68, 0.42],
        "clamp",
      ),
      transform: [
        {
          translateY: interpolate(
            distance,
            [0, 1, 2],
            [-5, 1, 5],
            "clamp",
          ),
        },
        {
          rotateZ: `${delta * 5}deg`,
        },
        {
          scale: interpolate(
            distance,
            [0, 1, 2],
            [1, 0.82, 0.68],
            "clamp",
          ),
        },
      ],
    };
  }, [index, position]);

  return (
    <Animated.View style={[styles.tabPosition, animatedStyle]}>
      <View
        style={[
          styles.tabDot,
          {
            backgroundColor: active
              ? reel.accent
              : withAlpha(reel.accent, 0.2),
            boxShadow: active
              ? `0 0 8px ${reel.accent}`
              : "none",
          },
        ]}
      />
      <Pressable
        accessibilityLabel={`Show ${reel.label} results`}
        accessibilityRole="tab"
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tab,
          {
            backgroundColor: active
              ? "rgba(2, 6, 12, 0.97)"
              : "rgba(1, 3, 7, 0.93)",
            borderColor: active
              ? reel.accent
              : withAlpha(reel.accent, 0.24),
            boxShadow: active
              ? `0 8px 18px rgba(0, 0, 0, 0.72), 0 0 18px ${withAlpha(reel.accent, 0.38)}, inset 0 0 10px ${withAlpha(reel.accent, 0.14)}`
              : `0 7px 16px rgba(0, 0, 0, 0.68), inset 0 0 8px ${withAlpha(reel.accent, 0.06)}`,
          },
          pressed && !disabled && styles.tabPressed,
        ]}
      >
        <IconSymbol
          color={
            active
              ? reel.accent
              : withAlpha(reel.accent, 0.7)
          }
          name={reel.icon}
          size={18}
        />
      </Pressable>
    </Animated.View>
  );
}

function ReelPanel({
  active,
  children,
  index,
  left,
  pageWidth,
  position,
  reel,
}: ReelPanelProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const delta = index - position.value;
    const distance = Math.min(Math.abs(delta), 1.25);

    return {
      opacity: interpolate(
        distance,
        [0, 0.72, 1.15],
        [1, 0.62, 0],
        "clamp",
      ),
      zIndex: Math.round(
        interpolate(
          distance,
          [0, 1.25],
          [20, 1],
          "clamp",
        ),
      ),
      transform: [
        { perspective: 900 },
        {
          translateX: delta * pageWidth * 0.88,
        },
        {
          translateY: interpolate(
            distance,
            [0, 1.25],
            [0, 12],
            "clamp",
          ),
        },
        {
          rotateY: `${delta * -8}deg`,
        },
        {
          rotateZ: `${delta * 1.2}deg`,
        },
        {
          scale: interpolate(
            distance,
            [0, 1.25],
            [1, 0.84],
            "clamp",
          ),
        },
      ],
    };
  }, [index, pageWidth, position]);

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={
        active ? "yes" : "no-hide-descendants"
      }
      pointerEvents={active ? "auto" : "none"}
      style={[
        styles.panel,
        {
          borderColor: withAlpha(reel.accent, 0.42),
          boxShadow: `0 14px 34px rgba(0, 0, 0, 0.42), 0 0 22px ${withAlpha(reel.accent, 0.1)}`,
          left,
          width: pageWidth,
        },
        animatedStyle,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.panelAccent,
          {
            backgroundColor: reel.accent,
            boxShadow: `0 0 12px ${withAlpha(reel.accent, 0.78)}`,
          },
        ]}
      />

      <View style={styles.panelHeader}>
        <View
          style={[
            styles.panelIcon,
            {
              backgroundColor: withAlpha(reel.accent, 0.12),
              borderColor: withAlpha(reel.accent, 0.36),
            },
          ]}
        >
          <IconSymbol
            color={reel.accent}
            name={reel.icon}
            size={15}
          />
        </View>
        <Text style={[styles.panelEyebrow, { color: reel.accent }]}>
          {reel.eyebrow}
        </Text>
        <Text style={styles.panelIndex}>
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(RESULT_REELS.length).padStart(2, "0")}
        </Text>
      </View>

      <View style={styles.panelBody}>{children}</View>
    </Animated.View>
  );
}

function IdentityContent({ result }: { result: ResultData }) {
  return (
    <>
      <View style={styles.fieldRow}>
        <HudField
          accent={theme.colors.scannerCyan}
          label="BRAND"
          value={result.identity.brand}
        />
        <HudField
          accent={theme.colors.scannerCyan}
          label="MODEL"
          value={result.identity.model}
        />
        <HudField
          accent={theme.colors.scannerCyan}
          label="VARIANT"
          value={result.identity.variant ?? result.identity.category}
        />
      </View>
      <Text numberOfLines={2} style={styles.summary}>
        {result.summary ||
          "KeepFlip resolved the strongest identity supported by the captured evidence."}
      </Text>
    </>
  );
}

function ConditionContent({ result }: { result: ResultData }) {
  const condition = result.condition;
  const score = percentage(condition?.score);

  return (
    <>
      <View style={styles.heroMetricRow}>
        <View style={styles.heroMetricCopy}>
          <Text style={styles.metricLabel}>ASSESSED GRADE</Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.68}
            numberOfLines={1}
            style={[
              styles.conditionGrade,
              { color: theme.colors.scannerViolet },
            ]}
          >
            {condition?.label ?? "Condition pending"}
          </Text>
        </View>
        <Text
          style={[
            styles.heroScore,
            { color: theme.colors.scannerViolet },
          ]}
        >
          {score == null ? "--" : `${score}%`}
        </Text>
      </View>

      <View style={styles.detailStack}>
        {(condition?.details?.slice(0, 2) ?? []).map(
          (detail, index) => (
            <View key={`${detail}-${index}`} style={styles.detailRow}>
              <View
                style={[
                  styles.detailDot,
                  {
                    backgroundColor: theme.colors.scannerViolet,
                  },
                ]}
              />
              <Text numberOfLines={1} style={styles.detailText}>
                {detail}
              </Text>
            </View>
          ),
        )}
        {!condition?.details?.length ? (
          <Text numberOfLines={2} style={styles.summary}>
            {condition?.summary ??
              "No specific condition defects were returned by the analysis."}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function EvidenceContent({ result }: { result: ResultData }) {
  const evidence = result.evidence?.slice(0, 2) ?? [];

  if (evidence.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>NO CLAIMS AVAILABLE</Text>
        <Text numberOfLines={2} style={styles.summary}>
          KeepFlip completed the result without returning individual evidence
          claims.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.evidenceStack}>
      {evidence.map((item, index) => (
        <View
          key={item.id ?? `${item.label}-${index}`}
          style={styles.evidenceRow}
        >
          <View style={styles.evidenceIndex}>
            <Text style={styles.evidenceIndexText}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={styles.evidenceCopy}>
            <View style={styles.evidenceLabelRow}>
              <Text numberOfLines={1} style={styles.evidenceLabel}>
                {item.label}
              </Text>
              {item.source ? (
                <Text
                  numberOfLines={1}
                  style={styles.evidenceSource}
                >
                  {item.source}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={2} style={styles.evidenceValue}>
              {item.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ConfidenceContent({ result }: { result: ResultData }) {
  return (
    <View style={styles.meterStack}>
      <ScoreMeter
        accent={theme.colors.goldBright}
        label="Overall"
        value={result.confidence?.overall}
      />
      <ScoreMeter
        accent={theme.colors.scannerCyan}
        label="Identity"
        value={result.confidence?.identity}
      />
      <ScoreMeter
        accent={theme.colors.scannerViolet}
        label="Condition"
        value={result.confidence?.condition}
      />
      <ScoreMeter
        accent={theme.colors.scannerAmber}
        label="Valuation"
        value={result.confidence?.valuation}
      />
    </View>
  );
}

function ValueContent({
  readinessAccent,
  result,
}: {
  readinessAccent: string;
  result: ResultData;
}) {
  const valuation = result.valuation;
  const readinessScore = percentage(result.valuationReadiness.score);

  if (!valuation) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.readinessRow}>
          <View
            style={[
              styles.readinessSignal,
              { backgroundColor: readinessAccent },
            ]}
          />
          <Text
            numberOfLines={1}
            style={[styles.readinessTitle, { color: readinessAccent }]}
          >
            {result.valuationReadiness.label ?? "Market data pending"}
          </Text>
        </View>
        <Text numberOfLines={3} style={styles.summary}>
          {result.valuationReadiness.reason ??
            "More sold-market evidence is needed before KeepFlip can defend a price range."}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.valueRow}>
        <View style={styles.medianBlock}>
          <Text style={styles.metricLabel}>ESTIMATED MEDIAN</Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.68}
            numberOfLines={1}
            style={styles.medianValue}
          >
            {formatMoney(
              Number(valuation.median),
              valuation.currency,
            )}
          </Text>
        </View>
        <View style={styles.rangeBlock}>
          <Text style={styles.rangeLabel}>
            LOW{"  "}
            <Text style={styles.rangeValue}>
              {formatMoney(Number(valuation.low), valuation.currency)}
            </Text>
          </Text>
          <Text style={styles.rangeLabel}>
            HIGH{" "}
            <Text style={styles.rangeValue}>
              {formatMoney(Number(valuation.high), valuation.currency)}
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.readinessRow}>
        <View
          style={[
            styles.readinessSignal,
            {
              backgroundColor: readinessAccent,
              boxShadow: `0 0 9px ${withAlpha(readinessAccent, 0.78)}`,
            },
          ]}
        />
        <Text
          numberOfLines={1}
          style={[styles.readinessTitle, { color: readinessAccent }]}
        >
          {result.valuationReadiness.label ?? "Valuation readiness"}
        </Text>
        <Text
          style={[styles.readinessScore, { color: readinessAccent }]}
        >
          {readinessScore == null ? "--" : `${readinessScore}%`}
        </Text>
      </View>
    </>
  );
}

function ResultReelContent({
  readinessAccent,
  reel,
  result,
}: {
  readinessAccent: string;
  reel: ResultReel;
  result: ResultData;
}) {
  switch (reel.id) {
    case "identity":
      return <IdentityContent result={result} />;
    case "condition":
      return <ConditionContent result={result} />;
    case "evidence":
      return <EvidenceContent result={result} />;
    case "confidence":
      return <ConfidenceContent result={result} />;
    case "value":
      return (
        <ValueContent
          readinessAccent={readinessAccent}
          result={result}
        />
      );
  }
}

export function ItemAnalysisResultStage({
  bottomInset,
  doneLabel = "Start new scan",
  embedded = false,
  onDone,
  onSave,
  projectionLabel = "GENERATED MODEL / SKIA PROJECTION",
  saveLabel = "Save to inventory",
  saving = false,
  state,
  topInset,
  viewportWidth,
}: ItemAnalysisResultStageProps) {
  const result = state.data;
  const { width: windowWidth } = useWindowDimensions();
  const screenWidth = viewportWidth ?? windowWidth;
  const reduceMotion = useReducedMotion();
  const direction = I18nManager.isRTL ? -1 : 1;
  const pageWidth = Math.min(
    Math.max(screenWidth - 28, 272),
    460,
  );
  const panelLeft = (screenWidth - pageWidth) / 2;
  const dragDistance = Math.max(132, pageWidth * 0.58);
  const [activeIndex, setActiveIndex] = useState(0);
  const committedPosition = useSharedValue(0);
  const position = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const readinessAccent =
    result.valuationReadiness.status === "ready"
      ? theme.colors.scannerCyan
      : result.valuationReadiness.status === "limited"
        ? theme.colors.scannerAmber
        : theme.colors.danger;
  const overallConfidence = percentage(
    result.confidence?.overall,
  );

  const commitPage = useCallback((index: number) => {
    setActiveIndex(index);
    selectionHaptic();
  }, []);

  const selectPage = useCallback(
    (index: number) => {
      if (
        saving ||
        index === activeIndex ||
        index < 0 ||
        index > LAST_REEL_INDEX
      ) {
        return;
      }

      committedPosition.value = index;
      position.value = reduceMotion
        ? index
        : withSpring(index, REEL_SPRING);
      commitPage(index);
    },
    [
      activeIndex,
      commitPage,
      committedPosition,
      position,
      reduceMotion,
      saving,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!saving)
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          cancelAnimation(position);
          dragStart.value = committedPosition.value;
        })
        .onUpdate(({ translationX }) => {
          const progress =
            -(direction * translationX) / dragDistance;
          position.value = Math.max(
            -0.16,
            Math.min(
              LAST_REEL_INDEX + 0.16,
              dragStart.value + progress,
            ),
          );
        })
        .onEnd(({ translationX, velocityX }) => {
          const intent =
            -direction * (translationX + velocityX * 0.12);
          const passed =
            Math.abs(translationX) > 42 ||
            Math.abs(velocityX) > 620;
          const step = passed ? (intent > 0 ? 1 : -1) : 0;
          const previous = Math.round(committedPosition.value);
          const next = Math.max(
            0,
            Math.min(LAST_REEL_INDEX, previous + step),
          );

          committedPosition.value = next;
          position.value = reduceMotion
            ? next
            : withSpring(next, REEL_SPRING);

          if (next !== previous) {
            scheduleOnRN(commitPage, next);
          }
        })
        .onFinalize((_event, success) => {
          if (!success) {
            position.value = reduceMotion
              ? committedPosition.value
              : withSpring(
                  committedPosition.value,
                  REEL_SPRING,
                );
          }
        }),
    [
      commitPage,
      committedPosition,
      direction,
      dragDistance,
      dragStart,
      position,
      reduceMotion,
      saving,
    ],
  );

  useEffect(
    () => () => {
      cancelAnimation(position);
    },
    [position],
  );

  return (
    <Animated.View
      accessibilityViewIsModal={!embedded}
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      importantForAccessibility="yes"
      pointerEvents="box-none"
      style={styles.overlay}
    >
      <Animated.View
        entering={FadeInDown.duration(260)}
        pointerEvents="none"
        style={[
          styles.titleBlock,
          { top: topInset + 13 },
        ]}
      >
        <View style={styles.titleSignalRow}>
          <View style={styles.titleSignal} />
          <Text style={styles.titleEyebrow}>KEEPFLIP IDENTITY LOCK</Text>
          <View style={styles.titleRule} />
          <Text style={styles.titleConfidence}>
            {overallConfidence == null
              ? "VERIFIED"
              : `${overallConfidence}%`}
          </Text>
        </View>

        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.66}
          numberOfLines={2}
          style={styles.title}
        >
          {result.identity.title}
        </Text>

        <View style={styles.projectionRow}>
          <View style={styles.projectionSignal} />
          <Text numberOfLines={1} style={styles.projectionLabel}>
            {projectionLabel}
          </Text>
        </View>
      </Animated.View>

      <View pointerEvents="none" style={styles.bottomFade} />

      <Animated.View
        entering={FadeInUp.duration(280).delay(70)}
        pointerEvents="box-none"
        style={[
          styles.bottomStage,
          { paddingBottom: bottomInset + 7 },
        ]}
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.reelInteraction}>
            <View style={styles.carouselViewport}>
              {RESULT_REELS.map((reel, index) => (
                <ReelPanel
                  active={activeIndex === index}
                  index={index}
                  key={reel.id}
                  left={panelLeft}
                  pageWidth={pageWidth}
                  position={position}
                  reel={reel}
                >
                  <ResultReelContent
                    readinessAccent={readinessAccent}
                    reel={reel}
                    result={result}
                  />
                </ReelPanel>
              ))}
            </View>

            <View
              accessibilityRole="tablist"
              style={styles.tabRail}
            >
              {RESULT_REELS.map((reel, index) => (
                <ReelTab
                  active={activeIndex === index}
                  disabled={saving}
                  index={index}
                  key={reel.id}
                  onPress={() => selectPage(index)}
                  position={position}
                  reel={reel}
                />
              ))}
            </View>
          </Animated.View>
        </GestureDetector>

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
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    elevation: 40,
  },
  titleBlock: {
    position: "absolute",
    right: 66,
    left: 18,
    zIndex: 6,
    gap: 4,
  },
  titleSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  titleSignal: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 10px rgba(88, 223, 232, 0.92)",
  },
  titleEyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0, 0, 0, 0.96)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  titleRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginRight: 10,
    backgroundColor: "rgba(88, 223, 232, 0.28)",
  },
  titleConfidence: {
    color: theme.colors.goldBright,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0, 0, 0, 0.98)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 9,
  },
  projectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  projectionSignal: {
    width: 5,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerViolet,
    boxShadow: "0 0 8px rgba(141, 114, 255, 0.88)",
  },
  projectionLabel: {
    flexShrink: 1,
    color: "rgba(220, 248, 250, 0.82)",
    fontSize: 6,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
    textShadowColor: "rgba(0, 0, 0, 0.96)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  bottomFade: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 286,
    opacity: 0.86,
    experimental_backgroundImage: `
      linear-gradient(
        to bottom,
        rgba(1, 2, 6, 0) 0%,
        rgba(1, 2, 6, 0.10) 20%,
        rgba(1, 2, 6, 0.48) 64%,
        rgba(1, 2, 6, 0.90) 100%
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
    paddingTop: 4,
  },
  reelInteraction: {
    width: "100%",
  },
  tabRail: {
    height: 52,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 11,
    paddingHorizontal: 14,
  },
  tabPosition: {
    width: 42,
    alignItems: "center",
    gap: 4,
  },
  tab: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: 1,
  },
  tabPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.92 }],
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  carouselViewport: {
    width: "100%",
    height: 165,
    overflow: "hidden",
  },
  panel: {
    position: "absolute",
    top: 0,
    height: 144,
    overflow: "hidden",
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "rgba(2, 5, 10, 0.76)",
  },
  panelAccent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  panelHeader: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 12,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  panelIcon: {
    width: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  panelEyebrow: {
    flex: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  panelIndex: {
    color: "rgba(255, 248, 231, 0.46)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  panelBody: {
    flex: 1,
    gap: 7,
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 7,
  },
  field: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  fieldLabel: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  fieldValue: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  summary: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  heroMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroMetricCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricLabel: {
    color: "rgba(255, 248, 231, 0.52)",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  conditionGrade: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    textTransform: "capitalize",
    textShadowColor: "rgba(141, 114, 255, 0.46)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  heroScore: {
    fontSize: 25,
    lineHeight: 28,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  detailStack: {
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  detailDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  detailText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.76)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  evidenceStack: {
    gap: 7,
  },
  evidenceRow: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  evidenceIndex: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.36)",
    backgroundColor: "rgba(88, 223, 232, 0.07)",
  },
  evidenceIndexText: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  evidenceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  evidenceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  evidenceLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  evidenceSource: {
    maxWidth: 90,
    color: theme.colors.scannerCyan,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.45,
  },
  evidenceValue: {
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },
  meterStack: {
    gap: 7,
  },
  meterRow: {
    minHeight: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  meterLabel: {
    width: 58,
    color: "rgba(255, 255, 255, 0.76)",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  meterTrack: {
    flex: 1,
    height: 4,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  meterFill: {
    height: "100%",
    borderRadius: 2,
  },
  meterValue: {
    width: 35,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.scannerCyan,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  medianBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  medianValue: {
    color: theme.colors.goldBright,
    fontSize: 29,
    lineHeight: 32,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(242, 211, 138, 0.58)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
  rangeBlock: {
    minWidth: 102,
    gap: 5,
    paddingLeft: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(242, 211, 138, 0.22)",
  },
  rangeLabel: {
    color: "rgba(255, 248, 231, 0.52)",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  rangeValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  readinessSignal: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  readinessTitle: {
    flex: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.35,
  },
  readinessScore: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  action: {
    flex: 1,
    maxWidth: 226,
    minWidth: 0,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  actionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.85,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.48,
  },
});
