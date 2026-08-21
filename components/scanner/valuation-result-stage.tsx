/* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated SharedValues are intentionally mutated inside UI-thread gesture worklets. */
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type {
  AnalysisDecisionCard,
  AnalysisProfitAction,
  AnalysisValuation,
  ItemAnalysisState,
} from "@/components/scanner/analysis-visual-types";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  runSerpApiProfitabilityGuidance,
  type SerpApiProfitabilityGuidance,
} from "@/services/ebaySoldCompsService";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";

type ResultState = Extract<ItemAnalysisState, { status: "result" }>;
type ResultData = ResultState["data"];
type ResultTab = "valuation" | "profit" | "identifiers";

type ValuationResultStageProps = {
  bottomInset: number;
  embedded?: boolean;
  onRefine?: (
    answers: Record<string, string>,
  ) => void | Promise<void>;
  onScanMorePhotos?: () => void | Promise<void>;
  onProfitabilityGuidance?: (
    guidance: SerpApiProfitabilityGuidance,
  ) => void | Promise<void>;
  onSaveToDealShelf?: () => void;
  onSave?: () => void;
  projectionLabel?: string;
  refining?: boolean;
  refinementPhotoReady?: boolean;
  savingDeal?: boolean;
  saveDealLabel?: string;
  scanningMorePhotos?: boolean;
  saveLabel?: string;
  saving?: boolean;
  showMarketDecisionStamp?: boolean;
  state: ResultState;
  topInset: number;
  viewportWidth?: number;
};

const TABS: { id: ResultTab; label: string }[] = [
  { id: "valuation", label: "VALUATION" },
  { id: "profit", label: "MAX PROFIT" },
  { id: "identifiers", label: "IDENTIFIERS" },
];

// The collapsed sheet includes its in-card drag header, tab rail, and summary.
const COLLAPSED_HEIGHT = 284;
const COLLAPSED_HEIGHT_WITH_SAVE = 335;
const MAX_EXPANDED_HEIGHT = 720;
const FLIP_ACCENT = "#46F5A2";
const MARKET_DECISION_STAMP_HEIGHT = 68;
const MARKET_DECISION_IMAGE_TOP_GAP = 116;
const SHEET_SPRING = {
  damping: 24,
  mass: 0.82,
  overshootClamping: true,
  stiffness: 250,
} as const;

function formatMoney(value: number, currency = "USD") {
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

function percentage(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value : value * 100;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

function marketSourceLabel(source?: string) {
  if (source === "serpapi_ai") return "Visual market research";
  if (source === "multi_market") return "Multi-market sold data";
  if (source === "ebay") return "Sold market data";
  if (source === "supplied") return "Supplied market data";
  return "Market analysis";
}

function valuationBasisLine(result: ResultData) {
  const valuation = result.valuation;
  if (!valuation) return null;

  const parts: string[] = [];
  if (valuation.comparableCount != null && valuation.comparableCount > 0) {
    parts.push(
      `${valuation.comparableCount} sold comp${valuation.comparableCount === 1 ? "" : "s"}`,
    );
  }
  if (valuation.source) {
    parts.push(marketSourceLabel(valuation.source));
  } else if (valuation.basis) {
    const clipped = valuation.basis.replace(/\s+/g, " ").trim();
    if (clipped) {
      parts.push(
        clipped.length > 72 ? `${clipped.slice(0, 71).trimEnd()}…` : clipped,
      );
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function isUnresolvedDisplayValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return (
    !normalized ||
    /^(?:unknown|undetermined|unidentified|unavailable|not available|not determined|unable to determine|n\/a|null|none|condition unknown)[.!:;]*$/.test(
      normalized,
    ) ||
    /\b(?:unknown|undetermined|unidentified|unavailable)\b/.test(normalized) ||
    /\b(?:could not|cannot|can't|unable to|not able to)\s+(?:be\s+)?(?:determine|identify|verify)/.test(
      normalized,
    )
  );
}

function DetailFact({
  confidence,
  label,
  value,
}: {
  confidence?: number;
  label: string;
  value?: string;
}) {
  const normalized = value?.trim() ?? "";
  if (isUnresolvedDisplayValue(normalized)) {
    return null;
  }
  const score = percentage(confidence);

  return (
    <View style={styles.detailFact}>
      <Text style={styles.detailFactLabel}>{label}</Text>
      <View style={styles.detailFactValueRow}>
        <Text selectable style={styles.detailFactValue}>{normalized}</Text>
        {score == null ? null : (
          <Text style={styles.detailFactConfidence}>{score}%</Text>
        )}
      </View>
    </View>
  );
}

function readinessColor(result: ResultData) {
  if (result.valuationReadiness.status === "ready") {
    return theme.colors.scannerCyan;
  }
  if (result.valuationReadiness.status === "limited") {
    return theme.colors.goldBright;
  }
  return theme.colors.danger;
}

function ValuationGauge({
  accent,
  result,
  valuation,
}: {
  accent: string;
  result: ResultData;
  valuation: AnalysisValuation;
}) {
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(reduceMotion ? 1 : 0);
  const resolved = useSharedValue(reduceMotion ? 1 : 0);
  const quickSale = result.profitPlan.quickSale ?? valuation.low;
  const listTarget = result.profitPlan.listTarget ?? valuation.high;
  const expectSale = result.profitPlan.expectedSale ?? valuation.median;
  const range = Math.max(1, listTarget - quickSale);
  const medianPosition = Math.max(
    0.08,
    Math.min(0.92, (expectSale - quickSale) / range),
  );
  const medianLeft = `${medianPosition * 100}%` as const;
  const firmLock = result.valuationReadiness.status === "ready";

  useEffect(() => {
    if (reduceMotion) {
      sweep.set(1);
      resolved.set(1);
      return;
    }

    sweep.set(0);
    resolved.set(0);
    sweep.set(
      withTiming(1, {
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
      }),
    );
    resolved.set(
      withDelay(
        850,
        withTiming(1, {
          duration: 340,
          easing: Easing.out(Easing.cubic),
        }),
      ),
    );

    return () => {
      cancelAnimation(sweep);
      cancelAnimation(resolved);
    };
  }, [reduceMotion, resolved, sweep, valuation.median]);

  const bandStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + sweep.get() * 0.72,
    transform: [{ scaleX: Math.max(0.012, sweep.get()) }],
  }));
  const needleStyle = useAnimatedStyle(() => ({
    opacity: resolved.get(),
    transform: [
      { translateY: (1 - resolved.get()) * -12 },
      { scale: 0.76 + resolved.get() * 0.24 },
    ],
  }));
  const medianStyle = useAnimatedStyle(() => ({
    opacity: resolved.get(),
    transform: [{ scale: 0.84 + resolved.get() * 0.16 }],
  }));

  return (
    <View style={styles.gauge}>
      <Animated.View style={[styles.gaugeHeader, medianStyle]}>
        <View>
          <Text style={styles.microLabel}>EXPECTED SALE</Text>
          <Text style={styles.gaugeStatus}>
            {firmLock ? "MARKET LOCK" : "RANGE PROVISIONAL"}
          </Text>
        </View>
        <Animated.View style={medianStyle}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={styles.medianValue}
          >
            {formatMoney(expectSale, valuation.currency)}
          </Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.gaugeTrack}>
        <Animated.View style={[styles.gaugeBand, bandStyle]}>
          <LinearGradient
            colors={[
              theme.colors.scannerViolet,
              theme.colors.goldBright,
              theme.colors.scannerCyan,
            ]}
            end={{ x: 1, y: 0.5 }}
            locations={[0, medianPosition, 1]}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {Array.from({ length: 11 }, (_, index) => (
          <View
            key={index}
            style={[styles.gaugeTick, { left: `${index * 10}%` }]}
          />
        ))}

        <Animated.View
          style={[
            styles.gaugeNeedle,
            { left: medianLeft, borderTopColor: accent },
            needleStyle,
          ]}
        />
      </View>

      <View style={styles.gaugeLabels}>
        <View>
          <Text style={[styles.gaugeLabel, { color: theme.colors.scannerViolet }]}>
            QUICK SALE
          </Text>
          <Text style={styles.gaugeAmount}>
            {formatMoney(quickSale, valuation.currency)}
          </Text>
        </View>
        <View style={styles.gaugeLabelCenter}>
          <Text style={[styles.gaugeLabel, { color: theme.colors.goldBright }]}>
            EXPECT
          </Text>
          <Text style={styles.gaugeAmount}>
            {formatMoney(expectSale, valuation.currency)}
          </Text>
        </View>
        <View style={styles.gaugeLabelRight}>
          <Text style={[styles.gaugeLabel, { color: theme.colors.scannerCyan }]}>
            LIST
          </Text>
          <Text style={styles.gaugeAmount}>
            {formatMoney(listTarget, valuation.currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ValuePanel({ result }: { result: ResultData }) {
  const accent = readinessColor(result);
  const readiness = percentage(
    result.confidence?.valuation ?? result.valuationReadiness.score,
  );
  const basis = valuationBasisLine(result);
  const ladder = result.valuationLadder;
  const acquisitionGuidance = result.acquisitionGuidance;
  const acquisitionAccent =
    acquisitionGuidance?.status === "not_viable"
      ? theme.colors.danger
      : theme.colors.scannerCyan;
  const ladderLine = ladder
    ? `VALUATION LADDER · ${ladder.level.toUpperCase()}${
      percentage(ladder.confidence) == null
        ? ""
        : ` · ${percentage(ladder.confidence)}%`
    }`
    : basis;

  if (!result.valuation) {
    return (
      <View style={styles.emptyPanel}>
        <Text style={[styles.emptyTitle, { color: accent }]}>
          {ladder
            ? `VALUATION LADDER · ${ladder.level.toUpperCase()}`
            : "REFINE WITH VERIFIED DETAILS"}
        </Text>
        {result.refinementQuestions?.length ? (
          <Text numberOfLines={2} style={styles.emptyBody}>
            Add a requested photo or answer below to tighten this valuation.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.valuePanel}>
      <ValuationGauge
        accent={accent}
        result={result}
        valuation={result.valuation}
      />
      {acquisitionGuidance ? (
        <View
          style={[
            styles.buyCeilingRow,
            { borderColor: `${acquisitionAccent}66` },
          ]}
        >
          <View style={styles.buyCeilingCopy}>
            <Text numberOfLines={1} style={[styles.buyCeilingLabel, { color: acquisitionAccent }]}>
              {acquisitionGuidance.label.toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={styles.buyCeilingStatus}>
              {acquisitionGuidance.status === "not_viable"
                ? "DO NOT BUY"
                : "PROVISIONAL CEILING"}
            </Text>
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[styles.buyCeilingValue, { color: acquisitionAccent }]}
          >
            {formatMoney(
              acquisitionGuidance.maxBuyPrice,
              acquisitionGuidance.currency ?? result.valuation.currency,
            )}
          </Text>
        </View>
      ) : null}
      <View style={styles.readinessRow}>
        <View style={[styles.readinessSignal, { backgroundColor: accent }]} />
        <Text numberOfLines={1} style={[styles.readinessText, { color: accent }]}>
          {result.valuationReadiness.label ?? "Valuation calibrated"}
        </Text>
        {readiness != null ? (
          <Text style={[styles.readinessScore, { color: accent }]}>
            {`${readiness}%`}
          </Text>
        ) : null}
      </View>
      {ladderLine ? (
        <Text numberOfLines={1} style={styles.basisLine}>
          {ladderLine}
        </Text>
      ) : null}
    </View>
  );
}

function decisionTone(kind: AnalysisDecisionCard["kind"]) {
  if (kind === "flip") {
    return {
      accent: FLIP_ACCENT,
      background: "rgba(70, 245, 162, 0.075)",
      border: "rgba(70, 245, 162, 0.54)",
      label: "MARKET SIGNAL CONFIRMED",
    };
  }
  if (kind === "skip") {
    return {
      accent: theme.colors.danger,
      background: "rgba(255, 75, 94, 0.065)",
      border: "rgba(255, 94, 110, 0.44)",
      label: "MARKET RISK OUTWEIGHS UPSIDE",
    };
  }
  return {
    accent: theme.colors.goldBright,
    background: "rgba(242, 211, 138, 0.065)",
    border: "rgba(242, 211, 138, 0.42)",
    label: "MORE EVIDENCE NEEDED",
  };
}

function decisionCardForResult(result: ResultData): AnalysisDecisionCard {
  if (result.decisionCard) return result.decisionCard;

  const needsMoreEvidence = result.valuationReadiness.status !== "ready";
  const missingInputs = (result.refinementQuestions ?? [])
    .map((question) => question.prompt)
    .filter(Boolean)
    .slice(0, 6);

  return {
    confidence: result.confidence?.valuation,
    kind: "undetermined",
    label: "UNDETERMINED",
    missingInputs,
    reasons: [],
    status: needsMoreEvidence ? "needs_more_evidence" : "provisional",
    summary: needsMoreEvidence
      ? "KeepFlip needs more market or item evidence before it can make a Flip or Skip decision."
      : "A market range is available, but this saved result does not include a Flip or Skip decision.",
  };
}

function MarketDecisionStamp({
  card,
  top,
}: {
  card: AnalysisDecisionCard;
  top: number;
}) {
  const reduceMotion = useReducedMotion();
  const tone = decisionTone(card.kind);
  const confidence = percentage(card.confidence);
  const flash = useSharedValue(reduceMotion ? 1 : 0.24);
  const scale = useSharedValue(reduceMotion ? 1 : 0.86);

  useEffect(() => {
    cancelAnimation(flash);
    cancelAnimation(scale);

    if (reduceMotion) {
      flash.set(1);
      scale.set(1);
      return;
    }

    flash.set(0.24);
    scale.set(0.86);
    scale.set(
      withSpring(1, {
        damping: 12,
        mass: 0.5,
        stiffness: 220,
      }),
    );
    flash.set(
      withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0.38, { duration: 80 }),
        withTiming(1, { duration: 110 }),
        withTiming(0.48, { duration: 80 }),
        withTiming(1, { duration: 140 }),
      ),
    );

    return () => {
      cancelAnimation(flash);
      cancelAnimation(scale);
    };
  }, [card.kind, flash, reduceMotion, scale]);

  const animatedStampStyle = useAnimatedStyle(() => ({
    opacity: flash.get(),
    transform: [{ scale: scale.get() }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.marketDecisionStampHost, { top }]}
    >
      <Animated.View
        accessibilityLabel={`Market decision: ${card.label}`}
        accessibilityLiveRegion="polite"
        entering={reduceMotion ? undefined : FadeInDown.duration(140)}
        key={`market-decision-stamp-${card.kind}`}
        style={[
          styles.marketDecisionStamp,
          {
            backgroundColor: tone.background,
            borderColor: tone.border,
            boxShadow:
              card.kind === "flip"
                ? "0 0 20px rgba(70, 245, 162, 0.52)"
                : "0 0 20px rgba(232, 97, 88, 0.48)",
          },
          animatedStampStyle,
        ]}
      >
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[
            styles.marketDecisionStampWord,
            {
              color: tone.accent,
              textShadowColor:
                card.kind === "flip"
                  ? "rgba(70, 245, 162, 0.76)"
                  : "rgba(232, 97, 88, 0.72)",
            },
          ]}
        >
          {card.label}
        </Text>
        <View style={styles.marketDecisionStampMeta}>
          <Text
            numberOfLines={1}
            style={[styles.marketDecisionStampSignal, { color: tone.accent }]}
          >
            {tone.label}
          </Text>
          {confidence != null ? (
            <Text
              style={[
                styles.marketDecisionStampConfidence,
                { color: tone.accent },
              ]}
            >
              {`${confidence}% CONF`}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function profitabilityPauseMessage(card: AnalysisDecisionCard) {
  if (card.kind === "skip") {
    return "No profitability tasks are shown because the market decision is Skip.";
  }
  if (card.kind === "undetermined") {
    return "Resolve the missing market evidence before KeepFlip prepares profitability tasks.";
  }
  return "KeepFlip did not find a supported profitability task for this item.";
}

function compactProfitabilityActionLimit(result: ResultData) {
  const firmPricing = result.valuationReadiness.status === "ready";
  const hasStrategy =
    (result.profitPlan.listTarget != null && firmPricing) ||
    result.profitPlan.expectedSale != null ||
    (result.profitPlan.quickSale != null && firmPricing);

  return hasStrategy ? 2 : 3;
}

type ProfitabilityGuidanceState = {
  error?: string;
  status: "error" | "loading" | "ready";
  value?: NonNullable<AnalysisProfitAction["guidance"]>;
};

function ProfitabilityActionRow({
  action,
  expanded,
  guidanceState,
  index,
  onPress,
}: {
  action: AnalysisProfitAction;
  expanded: boolean;
  guidanceState?: ProfitabilityGuidanceState;
  index: number;
  onPress: (action: AnalysisProfitAction) => void;
}) {
  const guidance = guidanceState?.value ?? action.guidance;
  const loading = guidanceState?.status === "loading";
  const error = guidanceState?.status === "error" ? guidanceState.error : null;

  return (
    <View style={styles.profitActionWrap}>
      <Pressable
        accessibilityHint="Requests concise item-specific resale preparation guidance"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => onPress(action)}
        style={({ pressed }) => [
          styles.profitRow,
          pressed && styles.pressed,
          expanded && styles.profitRowExpanded,
        ]}
      >
        <View style={styles.profitIndex}>
          <Text style={styles.profitIndexText}>{String(index + 1).padStart(2, "0")}</Text>
        </View>
        <View style={styles.profitCopy}>
          <Text numberOfLines={expanded ? undefined : 1} style={styles.profitTitle}>
            {action.label}
          </Text>
          <Text numberOfLines={expanded ? undefined : 2} style={styles.profitDetail}>
            {action.detail}
          </Text>
        </View>
        <Text style={styles.profitExpandMark}>{expanded ? "−" : "+"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.profitGuidance}>
          {loading ? (
            <Text style={styles.profitGuidanceStatus}>RESEARCHING ITEM-SPECIFIC HOW-TO...</Text>
          ) : null}
          {error ? (
            <Text selectable style={styles.profitGuidanceError}>{error}</Text>
          ) : null}
          {guidance?.summary ? (
            <Text selectable style={styles.detailBody}>{guidance.summary}</Text>
          ) : null}
          {guidance?.steps.map((step, stepIndex) => (
            <View key={`${action.id}-step-${stepIndex}`} style={styles.detailBulletRow}>
              <Text style={styles.detailBullet}>{stepIndex + 1}.</Text>
              <Text selectable style={styles.detailBulletText}>{step}</Text>
            </View>
          ))}
          {guidance?.toolsOrParts.length ? (
            <Text selectable style={styles.profitGuidanceMeta}>
              TOOLS / PARTS: {guidance.toolsOrParts.join(" · ")}
            </Text>
          ) : null}
          {guidance?.safetyWarnings.length ? (
            <Text selectable style={styles.profitGuidanceWarning}>
              SAFETY: {guidance.safetyWarnings.join(" · ")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ProfitPanel({
  expandedActionId,
  guidance,
  onPressAction,
  result,
}: {
  expandedActionId: string | null;
  guidance: Record<string, ProfitabilityGuidanceState>;
  onPressAction: (action: AnalysisProfitAction) => void;
  result: ResultData;
}) {
  const currency =
    result.profitPlan.currency ?? result.valuation?.currency ?? "USD";
  const listTarget = result.profitPlan.listTarget;
  const expectedSale = result.profitPlan.expectedSale;
  const quickSale = result.profitPlan.quickSale;
  const firmPricing = result.valuationReadiness.status === "ready";
  const showListTarget = listTarget != null && firmPricing;
  const showExpectedSale = expectedSale != null;
  const showQuickSale = quickSale != null && firmPricing;
  const hasStrategy = showListTarget || showExpectedSale || showQuickSale;
  const enhancements = result.profitPlan.actions.filter(
    (action) => action.kind !== "decision",
  );
  const compactActionLimit = compactProfitabilityActionLimit(result);
  const hasEnhancements = enhancements.length > 0;
  const decisionCard = decisionCardForResult(result);
  const emptyMessage = profitabilityPauseMessage(decisionCard);

  return (
    <View style={styles.profitList}>
      {hasStrategy ? (
        <View style={styles.profitStrategyRow}>
          {showListTarget ? <View style={styles.profitStrategyCell}>
            <Text style={[styles.profitStrategyLabel, { color: theme.colors.scannerCyan }]}>
              LIST
            </Text>
            <Text style={styles.profitStrategyValue}>
              {formatMoney(listTarget!, currency)}
            </Text>
          </View> : null}
          {showExpectedSale ? <View style={styles.profitStrategyCell}>
            <Text style={[styles.profitStrategyLabel, { color: theme.colors.goldBright }]}>
              EXPECT
            </Text>
            <Text style={styles.profitStrategyValue}>
              {formatMoney(expectedSale!, currency)}
            </Text>
          </View> : null}
          {showQuickSale ? <View style={styles.profitStrategyCell}>
            <Text style={[styles.profitStrategyLabel, { color: theme.colors.scannerViolet }]}>
              QUICK
            </Text>
            <Text style={styles.profitStrategyValue}>
              {formatMoney(quickSale!, currency)}
            </Text>
          </View> : null}
        </View>
      ) : null}

      {hasEnhancements ? (
        <>
          <Text style={styles.profitTapHint}>TAP AN ENHANCEMENT FOR ITS ITEM-SPECIFIC HOW-TO</Text>
          {enhancements.slice(0, compactActionLimit).map((action, index) => (
            <ProfitabilityActionRow
              action={action}
              expanded={expandedActionId === action.id}
              guidanceState={guidance[action.id]}
              index={index}
              key={action.id}
              onPress={onPressAction}
            />
          ))}
        </>
      ) : (
        <View style={styles.profitEmpty}>
          <Text style={styles.profitEmptyTitle}>PROFIT TASKS PAUSED</Text>
          <Text selectable style={styles.profitEmptyBody}>{emptyMessage}</Text>
        </View>
      )}
    </View>
  );
}

function profitabilityTaskContext(result: ResultData, action: AnalysisProfitAction) {
  const currency =
    result.profitPlan.currency ?? result.valuation?.currency ?? "USD";
  const pricing = [
    result.profitPlan.quickSale != null
      ? `Quick-sale signal: ${formatMoney(result.profitPlan.quickSale, currency)}`
      : null,
    result.profitPlan.expectedSale != null
      ? `Expected-sale signal: ${formatMoney(result.profitPlan.expectedSale, currency)}`
      : null,
    result.profitPlan.listTarget != null
      ? `List-target signal: ${formatMoney(result.profitPlan.listTarget, currency)}`
      : null,
  ].filter(Boolean);
  const condition = [
    result.condition?.label,
    result.condition?.details?.[0],
  ]
    .filter(Boolean)
    .join(" — ");

  return [
    action.detail ? `Action-card detail: ${action.detail}` : null,
    pricing.length ? pricing.join("; ") : null,
    condition ? `Observed condition: ${condition}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function IdentifierPanel({ result }: { result: ResultData }) {
  const titleConfidence = percentage(
    result.confidence?.itemType ??
      result.confidence?.identity ??
      result.identity.confidence,
  );
  const brandConfidence = percentage(result.confidence?.brand);
  const modelConfidence = percentage(result.confidence?.model);
  const conditionConfidence = percentage(
    result.confidence?.condition ?? result.condition?.score,
  );

  return (
    <View style={styles.identifierPanel}>
      <View style={styles.identifierLead}>
        <Text style={styles.microLabel}>{result.identity.titleLabel ?? "Exact Item Name"}</Text>
        <Text numberOfLines={2} style={styles.identifierTitle}>
          {result.identity.title}
        </Text>
        {titleConfidence != null ? (
          <Text style={styles.identifierConfidence}>
            {`${titleConfidence}% CONF`}
          </Text>
        ) : null}
      </View>
      {[
        ["BRAND", result.identity.brand, brandConfidence],
        ["MODEL", result.identity.model, modelConfidence],
        ["VARIANT", result.identity.variant, null],
        [result.condition?.titleLabel ?? "Observed Condition", result.condition?.label, conditionConfidence],
      ].filter((entry) =>
        Boolean(entry[1]) &&
        !isUnresolvedDisplayValue(String(entry[1]).trim()),
      ).map(([label, value, confidence]) => (
        <View key={String(label)} style={styles.identifierFactRow}>
          <Text style={styles.identifierFactLabel}>{label}</Text>
          <Text numberOfLines={1} style={styles.identifierFactValue}>
            {value}
          </Text>
          <Text style={styles.identifierFactConfidence}>
            {typeof confidence === "number" ? `${confidence}%` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ExpandedResultDetails({
  activeTab,
  answers,
  expandedActionId,
  guidance,
  onAnswerChange,
  onPressAction,
  onRefine,
  onScanMorePhotos,
  onSubmitRefinement,
  refining,
  refinementPhotoReady,
  scanningMorePhotos,
  result,
}: {
  activeTab: ResultTab;
  answers: Record<string, string>;
  expandedActionId: string | null;
  guidance: Record<string, ProfitabilityGuidanceState>;
  onAnswerChange: (questionId: string, answer: string) => void;
  onPressAction: (action: AnalysisProfitAction) => void;
  onRefine?: ValuationResultStageProps["onRefine"];
  onScanMorePhotos?: ValuationResultStageProps["onScanMorePhotos"];
  onSubmitRefinement: () => void;
  refining: boolean;
  refinementPhotoReady: boolean;
  scanningMorePhotos: boolean;
  result: ResultData;
}) {
  const conditionDetails = result.condition?.details ?? [];
  const evidence = result.evidence ?? [];
  const references = result.marketReferences ?? [];
  const questions = result.refinementQuestions ?? [];
  const requestedPhotos = result.suggestedPhotos ?? [];
  const decisionCard = decisionCardForResult(result);
  const acquisitionGuidance = result.acquisitionGuidance;
  const canSubmit =
    Boolean(onRefine) &&
    !refining &&
    (refinementPhotoReady ||
      questions.some((question) => answers[question.id]?.trim()));
  const enhancements = result.profitPlan.actions.filter(
    (action) => action.kind !== "decision",
  );
  const compactActionLimit = compactProfitabilityActionLimit(result);
  const additionalEnhancements = enhancements.slice(compactActionLimit);

  return (
    <View style={styles.expandedDetails}>
      {activeTab === "identifiers" ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>DISTINCT ITEM IDENTIFIERS</Text>
        <DetailFact
          confidence={
            result.confidence?.itemType ??
            result.confidence?.identity ??
            result.identity.confidence
          }
          label={result.identity.titleLabel ?? "Exact Item Name"}
          value={result.identity.title}
        />
        <DetailFact
          confidence={result.confidence?.brand}
          label="BRAND"
          value={result.identity.brand}
        />
        <DetailFact
          confidence={result.confidence?.model}
          label="MODEL"
          value={result.identity.model}
        />
        <DetailFact
          confidence={result.confidence?.itemType}
          label="CATEGORY"
          value={result.identity.category}
        />
        <DetailFact label="VARIANT" value={result.identity.variant} />
        <DetailFact
          confidence={result.confidence?.condition ?? result.condition?.score}
          label={result.condition?.titleLabel ?? "Observed Condition"}
          value={result.condition?.label}
        />
        </View>
      ) : null}

      {activeTab === "valuation" ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>MARKET DECISION DETAIL</Text>
          <Text selectable style={styles.detailBody}>{decisionCard.summary}</Text>

          {decisionCard.kind === "skip" ? (
            <>
              <Text style={styles.decisionDetailHeading}>WHY THIS IS A SKIP</Text>
              {decisionCard.reasons.map((reason, index) => (
                <View key={`${reason.factor}-${index}`} style={styles.decisionEvidenceRow}>
                  <Text style={styles.decisionEvidenceCode}>
                    S{index + 1}
                  </Text>
                  <View style={styles.decisionEvidenceCopy}>
                    <Text selectable style={styles.decisionEvidenceFactor}>
                      {reason.factor}
                    </Text>
                    <Text selectable style={styles.detailBody}>{reason.evidence}</Text>
                    <Text selectable style={styles.decisionEvidenceImpact}>
                      {reason.impact}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          {decisionCard.kind === "flip" ? (
            <Text selectable style={styles.decisionActionHint}>
              This is a market-first Flip decision. Open Max Profit for the supported preparation tasks.
            </Text>
          ) : null}

          {decisionCard.kind === "undetermined" ? (
            <>
              <Text style={styles.decisionDetailHeading}>WHAT WOULD RESOLVE IT</Text>
              {decisionCard.missingInputs.length > 0 ? (
                decisionCard.missingInputs.map((input, index) => (
                  <View key={`${input}-${index}`} style={styles.detailBulletRow}>
                    <Text style={styles.detailBullet}>+</Text>
                    <Text selectable style={styles.detailBulletText}>{input}</Text>
                  </View>
                ))
              ) : (
                <Text selectable style={styles.detailBody}>
                  Add a requested identifying or functionality detail so KeepFlip can make a market decision.
                </Text>
              )}
            </>
          ) : null}
        </View>
      ) : null}

      {activeTab === "valuation" && (result.valuationLadder || result.summary || conditionDetails.length > 0) ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>VALUATION REASONS + CONFIDENCE</Text>
          {result.valuationLadder ? (
            <>
              <DetailFact
                confidence={result.valuationLadder.confidence}
                label="VALUATION LADDER"
                value={result.valuationLadder.level}
              />
              {result.valuationLadder.reason &&
              !["Level 4", "Level 5"].includes(result.valuationLadder.level) ? (
                <Text selectable style={styles.detailBody}>
                  {result.valuationLadder.reason}
                </Text>
              ) : null}
            </>
          ) : null}
          {result.valuation ? (
            <DetailFact
              confidence={result.confidence?.valuation}
              label={result.valuation.titleLabel ?? "Current Resale Market Value"}
              value={formatMoney(
                result.valuation.median,
                result.valuation.currency,
              )}
            />
          ) : null}
          {result.valuation && result.valuationReadiness.reason ? (
            <Text selectable style={styles.detailBody}>
              {result.valuationReadiness.reason}
            </Text>
          ) : null}
          {result.valuation && result.summary ? (
            <Text selectable style={styles.detailBody}>{result.summary}</Text>
          ) : null}
          {conditionDetails.map((detail, index) => (
            <View key={`${detail}-${index}`} style={styles.detailBulletRow}>
              <Text style={styles.detailBullet}>+</Text>
              <Text selectable style={styles.detailBulletText}>{detail}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "valuation" && acquisitionGuidance ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>ACQUISITION CEILING</Text>
          <DetailFact
            label={acquisitionGuidance.label}
            value={formatMoney(
              acquisitionGuidance.maxBuyPrice,
              acquisitionGuidance.currency ?? result.valuation?.currency,
            )}
          />
          {acquisitionGuidance.summary ? (
            <Text selectable style={styles.detailBody}>
              {acquisitionGuidance.summary}
            </Text>
          ) : null}
          {acquisitionGuidance.formula ? (
            <Text selectable style={styles.detailBody}>
              {acquisitionGuidance.formula}
            </Text>
          ) : null}
          {acquisitionGuidance.assumptions.length > 0 ? (
            <>
              <Text style={styles.decisionDetailHeading}>FORMULA ASSUMPTIONS</Text>
              {acquisitionGuidance.assumptions.map((assumption, index) => (
                <View key={`${assumption}-${index}`} style={styles.detailBulletRow}>
                  <Text style={styles.detailBullet}>+</Text>
                  <Text selectable style={styles.detailBulletText}>{assumption}</Text>
                </View>
              ))}
            </>
          ) : null}
          {acquisitionGuidance.missingInputs.length > 0 ? (
            <>
              <Text style={styles.decisionDetailHeading}>CHECK BEFORE BUYING</Text>
              {acquisitionGuidance.missingInputs.map((input, index) => (
                <View key={`${input}-${index}`} style={styles.detailBulletRow}>
                  <Text style={styles.detailBullet}>+</Text>
                  <Text selectable style={styles.detailBulletText}>{input}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {activeTab === "profit" && additionalEnhancements.length > 0 ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>MORE PROFITABILITY ENHANCEMENTS</Text>
          {additionalEnhancements.map((action, index) => (
            <ProfitabilityActionRow
              action={action}
              expanded={expandedActionId === action.id}
              guidanceState={guidance[action.id]}
              index={compactActionLimit + index}
              key={action.id}
              onPress={onPressAction}
            />
          ))}
        </View>
      ) : null}
      {activeTab === "valuation" && evidence.length > 0 ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>SUPPORTING EVIDENCE</Text>
          {evidence.map((item, index) => {
            const score = percentage(item.confidence);
            return (
              <View key={item.id ?? `${item.label}-${index}`} style={styles.expandedEvidenceRow}>
                <Text style={styles.expandedEvidenceCode}>E{index + 1}</Text>
                <View style={styles.expandedEvidenceCopy}>
                  <View style={styles.expandedEvidenceHeader}>
                    <Text style={styles.expandedEvidenceLabel}>{item.label}</Text>
                    {score == null ? null : (
                      <Text style={styles.detailFactConfidence}>{score}% CONF</Text>
                    )}
                  </View>
                  <Text selectable style={styles.detailBody}>{item.value}</Text>
                  {item.source ? (
                    <Text style={styles.detailSource}>{item.source.toUpperCase()}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {activeTab === "valuation" && references.length > 0 ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>MARKET REFERENCES</Text>
          {references.map((reference, index) => (
            <View key={reference.id} style={styles.referenceRow}>
              <Text style={styles.referenceCode}>R{index + 1}</Text>
              <View style={styles.referenceCopy}>
                <Text selectable style={styles.referenceTitle}>{reference.title}</Text>
                {reference.source ? (
                  <Text style={styles.detailSource}>{reference.source.toUpperCase()}</Text>
                ) : null}
                {reference.snippet ? (
                  <Text selectable style={styles.detailBody}>{reference.snippet}</Text>
                ) : null}
                {reference.link ? (
                  <Text numberOfLines={1} selectable style={styles.referenceLink}>
                    MARKET REFERENCE AVAILABLE
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === "valuation" && decisionCard.kind === "undetermined" && questions.length > 0 && (onRefine || onScanMorePhotos) ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>RESOLVE THIS DECISION</Text>
          <Text style={styles.detailBody}>
            Add only what you can verify. KeepFlip can use these details to make a tighter market decision.
          </Text>
          {requestedPhotos.slice(0, 4).map((photo, index) => (
            <Text key={photo.id ?? `${photo.label}-${index}`} style={styles.photoRequest}>
              {`PHOTO ${index + 1} · ${photo.label}`}
            </Text>
          ))}
          {onScanMorePhotos ? (
            <Pressable
              accessibilityHint="Opens the camera to capture a requested identifying detail"
              accessibilityRole="button"
              disabled={refining || scanningMorePhotos}
              onPress={() => {
                try {
                  void Promise.resolve(onScanMorePhotos()).catch(() => undefined);
                } catch {
                  // The host screen presents the capture error.
                }
              }}
              style={({ pressed }) => [
                styles.scanDetailButton,
                pressed && styles.pressed,
                (refining || scanningMorePhotos) && styles.disabled,
              ]}
            >
              <IconSymbol
                color={theme.colors.scannerCyan}
                name="camera.fill"
                size={15}
              />
              <Text style={styles.scanDetailButtonText}>
                {scanningMorePhotos
                  ? "OPENING CAMERA..."
                  : refinementPhotoReady
                    ? "DETAIL PHOTO READY · SCAN ANOTHER"
                    : "SCAN A DETAIL PHOTO"}
              </Text>
            </Pressable>
          ) : null}
          {onRefine ? questions.map((question, index) => (
            <View key={question.id} style={styles.questionBlock}>
              <Text style={styles.questionLabel}>
                Q{index + 1} / {question.prompt}
              </Text>
              {question.reason ? (
                <Text style={styles.questionReason}>{question.reason}</Text>
              ) : null}
              <TextInput
                editable={!refining}
                maxLength={500}
                multiline
                onChangeText={(answer) => onAnswerChange(question.id, answer)}
                placeholder="Enter a verified detail"
                placeholderTextColor="rgba(255, 255, 255, 0.28)"
                selectionColor={theme.colors.scannerCyan}
                style={styles.questionInput}
                value={answers[question.id] ?? ""}
              />
            </View>
          )) : null}
          {onRefine ? <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={onSubmitRefinement}
            style={({ pressed }) => [
              styles.refineButton,
              pressed && styles.pressed,
              !canSubmit && styles.disabled,
            ]}
          >
            <Text style={styles.refineButtonText}>
              {refining ? "REFINING VALUATION..." : "REFINE VALUATION"}
            </Text>
          </Pressable>
          : null}
        </View>
      ) : null}
    </View>
  );
}

export function ValuationResultStage({
  bottomInset,
  embedded = false,
  onProfitabilityGuidance,
  onRefine,
  onScanMorePhotos,
  onSave,
  onSaveToDealShelf,
  projectionLabel = "GENERATED ITEM PROJECTION",
  refining = false,
  refinementPhotoReady = false,
  saveDealLabel = "Park on Deal Shelf",
  savingDeal = false,
  scanningMorePhotos = false,
  saveLabel = "Save to inventory",
  saving = false,
  showMarketDecisionStamp = false,
  state,
  topInset,
  viewportWidth,
}: ValuationResultStageProps) {
  const result = state.data;
  const marketDecision = decisionCardForResult(result);
  const hasSaveAction = Boolean(onSave || onSaveToDealShelf);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth ?? windowWidth, 520);
  const collapsedHeight =
    (hasSaveAction ? COLLAPSED_HEIGHT_WITH_SAVE : COLLAPSED_HEIGHT) + bottomInset;
  const stampImageTop = topInset + MARKET_DECISION_IMAGE_TOP_GAP;
  const stampImageBottom = Math.max(
    stampImageTop + MARKET_DECISION_STAMP_HEIGHT,
    windowHeight - collapsedHeight,
  );
  const marketDecisionStampTop =
    stampImageTop +
    Math.max(
      0,
      (stampImageBottom -
        stampImageTop -
        MARKET_DECISION_STAMP_HEIGHT) /
        2,
    );
  const expandedHeight = Math.max(
    collapsedHeight,
    Math.min(MAX_EXPANDED_HEIGHT, windowHeight - topInset - 14),
  );
  const expansionEnabled =
    !embedded && expandedHeight - collapsedHeight >= 56;
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<ResultTab>("valuation");
  const [answerState, setAnswerState] = useState<{
    questionKey: string;
    values: Record<string, string>;
  }>({ questionKey: "", values: {} });
  const [expanded, setExpanded] = useState(false);
  const [expandedProfitActionId, setExpandedProfitActionId] = useState<
    string | null
  >(null);
  const [profitabilityGuidance, setProfitabilityGuidance] = useState<
    Record<string, ProfitabilityGuidanceState>
  >({});
  const refinementQuestionKey = (result.refinementQuestions ?? [])
    .map((question) => `${question.id}:${question.prompt}`)
    .join("|");
  const answers = useMemo(
    () =>
      answerState.questionKey === refinementQuestionKey
        ? answerState.values
        : {},
    [answerState, refinementQuestionKey],
  );
  const profitabilityRequestsRef = useRef(new Set<string>());
  const scrollRef = useRef<ScrollView>(null);
  const sheetHeight = useSharedValue(collapsedHeight);
  const dragStartHeight = useSharedValue(collapsedHeight);
  const collapsedSnap = useSharedValue(collapsedHeight);
  const expandedSnap = useSharedValue(expandedHeight);
  const settledExpanded = useSharedValue(0);

  useEffect(() => {
    collapsedSnap.value = collapsedHeight;
    expandedSnap.value = expandedHeight;

    if (!expansionEnabled) {
      settledExpanded.value = 0;
      sheetHeight.value = collapsedHeight;
      return;
    }

    sheetHeight.value = expanded ? expandedHeight : collapsedHeight;
  }, [
    collapsedHeight,
    collapsedSnap,
    expanded,
    expandedHeight,
    expandedSnap,
    expansionEnabled,
    settledExpanded,
    sheetHeight,
  ]);

  useEffect(
    () => () => {
      cancelAnimation(sheetHeight);
    },
    [sheetHeight],
  );

  const commitExpansion = useCallback((nextExpanded: boolean) => {
    if (!nextExpanded) {
      scrollRef.current?.scrollTo({ animated: false, y: 0 });
    }
    setExpanded(nextExpanded);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const sheetPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(expansionEnabled)
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onBegin(() => {
          cancelAnimation(sheetHeight);
          dragStartHeight.value = sheetHeight.value;
        })
        .onUpdate(({ translationY }) => {
          sheetHeight.value = Math.max(
            collapsedSnap.value,
            Math.min(
              expandedSnap.value,
              dragStartHeight.value - translationY,
            ),
          );
        })
        .onEnd(({ velocityY }) => {
          const projectedHeight = sheetHeight.value - velocityY * 0.12;
          const threshold =
            collapsedSnap.value +
            (expandedSnap.value - collapsedSnap.value) * 0.46;
          const shouldExpand = projectedHeight >= threshold;
          const target = shouldExpand
            ? expandedSnap.value
            : collapsedSnap.value;

          settledExpanded.value = shouldExpand ? 1 : 0;
          if (reduceMotion) {
            sheetHeight.value = target;
            scheduleOnRN(commitExpansion, shouldExpand);
            return;
          }

          sheetHeight.value = withSpring(
            target,
            SHEET_SPRING,
            (finished) => {
              if (finished) {
                scheduleOnRN(commitExpansion, shouldExpand);
              }
            },
          );
        })
        .onFinalize((_event, success) => {
          if (success) return;
          const target = settledExpanded.value
            ? expandedSnap.value
            : collapsedSnap.value;
          sheetHeight.value = reduceMotion
            ? target
            : withSpring(target, SHEET_SPRING);
        }),
    [
      collapsedSnap,
      commitExpansion,
      dragStartHeight,
      expandedSnap,
      expansionEnabled,
      reduceMotion,
      settledExpanded,
      sheetHeight,
    ],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() =>
    expansionEnabled ? { height: sheetHeight.value } : {},
  );
  const titleAnimatedStyle = useAnimatedStyle(() => {
    if (!expansionEnabled || expandedSnap.value <= collapsedSnap.value) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const progress = interpolate(
      sheetHeight.value,
      [collapsedSnap.value, expandedSnap.value],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(
        progress,
        [0, 0.58, 1],
        [1, 0.18, 0],
        Extrapolation.CLAMP,
      ),
      transform: [{ translateY: -14 * progress }],
    };
  });

  const toggleExpanded = useCallback(() => {
    if (!expansionEnabled) return;
    const nextExpanded = !expanded;
    const target = nextExpanded ? expandedHeight : collapsedHeight;
    settledExpanded.value = nextExpanded ? 1 : 0;
    commitExpansion(nextExpanded);
    cancelAnimation(sheetHeight);
    sheetHeight.value = reduceMotion
      ? target
      : withSpring(target, SHEET_SPRING);
  }, [
    collapsedHeight,
    commitExpansion,
    expanded,
    expandedHeight,
    expansionEnabled,
    reduceMotion,
    settledExpanded,
    sheetHeight,
  ]);

  const updateAnswer = useCallback((questionId: string, answer: string) => {
    setAnswerState((current) => ({
      questionKey: refinementQuestionKey,
      values: {
        ...(current.questionKey === refinementQuestionKey ? current.values : {}),
        [questionId]: answer,
      },
    }));
  }, [refinementQuestionKey]);

  const submitRefinement = useCallback(() => {
    if (!onRefine || refining) return;
    const submitted: Record<string, string> = {};
    for (const question of result.refinementQuestions ?? []) {
      const answer = answers[question.id]?.trim();
      if (answer) submitted[question.id] = answer;
    }
    if (Object.keys(submitted).length === 0 && !refinementPhotoReady) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
    try {
      void Promise.resolve(onRefine(submitted)).catch(() => undefined);
    } catch {
      // The screen owns any user-facing refinement error state.
    }
  }, [
    answers,
    onRefine,
    refining,
    refinementPhotoReady,
    result.refinementQuestions,
  ]);

  const requestProfitabilityGuidance = useCallback(
    (action: AnalysisProfitAction) => {
      const currentlyExpanded = expandedProfitActionId === action.id;
      setExpandedProfitActionId(currentlyExpanded ? null : action.id);
      if (!currentlyExpanded && !expanded) {
        toggleExpanded();
      }
      if (currentlyExpanded || action.guidance) return;

      const existing = profitabilityGuidance[action.id];
      if (
        existing?.status === "loading" ||
        existing?.status === "ready" ||
        profitabilityRequestsRef.current.has(action.id)
      ) {
        return;
      }

      profitabilityRequestsRef.current.add(action.id);
      setProfitabilityGuidance((current) => ({
        ...current,
        [action.id]: { status: "loading" },
      }));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => undefined,
      );

      void runSerpApiProfitabilityGuidance({
        actionTitle: action.label,
        itemTitle: result.identity.title,
        profitabilityContext: profitabilityTaskContext(result, action),
      })
        .then((response) => {
          const value: NonNullable<AnalysisProfitAction["guidance"]> = {
            references: response.references.map((reference, index) => ({
              id: `${action.id}-guidance-reference-${index}`,
              link: reference.link,
              snippet: reference.snippet
                ? neutralizeMarketplaceBrand(reference.snippet)
                : undefined,
              source: reference.source
                ? neutralizeMarketplaceBrand(reference.source)
                : undefined,
              title: neutralizeMarketplaceBrand(reference.title),
            })),
            safetyWarnings: response.safetyWarnings.map((warning) =>
              neutralizeMarketplaceBrand(warning),
            ),
            searchedAt: response.searchedAt,
            steps: response.steps.map((step) => neutralizeMarketplaceBrand(step)),
            summary: response.summary
              ? neutralizeMarketplaceBrand(response.summary)
              : null,
            toolsOrParts: response.toolsOrParts.map((item) =>
              neutralizeMarketplaceBrand(item),
            ),
          };
          setProfitabilityGuidance((current) => ({
            ...current,
            [action.id]: { status: "ready", value },
          }));

          try {
            void Promise.resolve(onProfitabilityGuidance?.(response)).catch(
              (error) => {
                console.warn("KeepFlip could not cache profitability guidance.", error);
              },
            );
          } catch (error) {
            console.warn("KeepFlip could not cache profitability guidance.", error);
          }
        })
        .catch((caught) => {
          setProfitabilityGuidance((current) => ({
            ...current,
            [action.id]: {
              error:
                caught instanceof Error
                  ? neutralizeMarketplaceBrand(caught.message)
                  : "KeepFlip could not research this enhancement.",
              status: "error",
            },
          }));
        })
        .finally(() => {
          profitabilityRequestsRef.current.delete(action.id);
        });
    },
    [
      expandedProfitActionId,
      expanded,
      onProfitabilityGuidance,
      profitabilityGuidance,
      result,
      toggleExpanded,
    ],
  );

  const selectTab = (tab: ResultTab) => {
    if (tab === activeTab || saving) return;
    setActiveTab(tab);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const panel = (
    <Animated.View
      entering={FadeIn.duration(150)}
      key={activeTab}
      style={styles.panelBody}
    >
      {activeTab === "valuation" ? <ValuePanel result={result} /> : null}
      {activeTab === "profit" ? (
        <ProfitPanel
          expandedActionId={expandedProfitActionId}
          guidance={profitabilityGuidance}
          onPressAction={requestProfitabilityGuidance}
          result={result}
        />
      ) : null}
      {activeTab === "identifiers" ? <IdentifierPanel result={result} /> : null}
    </Animated.View>
  );

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        entering={FadeInDown.duration(220)}
        pointerEvents="none"
        style={[
          styles.titleBlock,
          { top: topInset + 12 },
          titleAnimatedStyle,
        ]}
      >
        <View style={styles.titleHeader}>
          <View style={styles.titleSignal} />
          <Text style={styles.titleEyebrow}>KEEPFLIP / VALUATION COMPLETE</Text>
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={11} numberOfLines={2} style={styles.itemTitle}>
          {result.identity.title}
        </Text>
      </Animated.View>

      {showMarketDecisionStamp &&
      (marketDecision.kind === "flip" || marketDecision.kind === "skip") ? (
        <MarketDecisionStamp card={marketDecision} top={marketDecisionStampTop} />
      ) : null}

      <Animated.View
        entering={FadeInUp.duration(260).delay(60)}
        style={[
          styles.resultDock,
          sheetAnimatedStyle,
          {
            paddingBottom: bottomInset + 8,
            width,
          },
          embedded && styles.resultDockEmbedded,
        ]}
      >
        <View style={styles.sheetHeader}>
          {expansionEnabled ? (
            <GestureDetector gesture={sheetPan}>
              <Pressable
                accessibilityLabel={
                  expanded
                    ? "Collapse analysis details"
                    : "Expand analysis details"
                }
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                hitSlop={8}
                onPress={toggleExpanded}
                style={styles.sheetHandleHitbox}
              >
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetHandleLabel}>
                  {expanded ? "SWIPE DOWN" : "SWIPE UP FOR FULL INTELLIGENCE"}
                </Text>
              </Pressable>
            </GestureDetector>
          ) : null}

          <View accessibilityRole="tablist" style={styles.tabRail}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  disabled={saving}
                  key={tab.id}
                  onPress={() => selectTab(tab.id)}
                  style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {expansionEnabled ? (
          <Animated.ScrollView
            contentContainerStyle={styles.panelScrollContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            ref={scrollRef}
            scrollEnabled={expanded}
            showsVerticalScrollIndicator={expanded}
            style={styles.panelScroll}
          >
            {panel}
            {expanded ? (
              <ExpandedResultDetails
                activeTab={activeTab}
                answers={answers}
                expandedActionId={expandedProfitActionId}
                guidance={profitabilityGuidance}
                onAnswerChange={updateAnswer}
                onPressAction={requestProfitabilityGuidance}
                onRefine={onRefine}
                onScanMorePhotos={onScanMorePhotos}
                onSubmitRefinement={submitRefinement}
                refining={refining}
                refinementPhotoReady={refinementPhotoReady}
                scanningMorePhotos={scanningMorePhotos}
                result={result}
              />
            ) : null}
          </Animated.ScrollView>
        ) : (
          panel
        )}

        {hasSaveAction ? (
          <View style={styles.saveActions}>
            {onSaveToDealShelf ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving || savingDeal || refining}
                onPress={onSaveToDealShelf}
                style={({ pressed }) => [
                  styles.saveButton,
                  styles.saveButtonSecondary,
                  pressed && styles.pressed,
                  (saving || savingDeal || refining) && styles.disabled,
                ]}
              >
                <IconSymbol color={theme.colors.goldBright} name="tag.fill" size={16} />
                <Text style={styles.saveButtonTextSecondary}>
                  {savingDeal ? "PARKING..." : saveDealLabel.toUpperCase()}
                </Text>
              </Pressable>
            ) : null}

            {onSave ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving || savingDeal || refining}
                onPress={onSave}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  (saving || savingDeal || refining) && styles.disabled,
                ]}
              >
                <IconSymbol color={theme.colors.backgroundDeep} name="save.fill" size={16} />
                <Text style={styles.saveButtonText}>
                  {saving ? "SAVING..." : saveLabel.toUpperCase()}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundGradience: {
    experimental_backgroundImage: `
    radial-gradient(circle at 84% 8%, rgba(224, 172, 75, 0.10) 0%, transparent 34%),
    radial-gradient(circle at 5% 68%, rgba(88, 223, 232, 0.075) 0%, transparent 38%),
    radial-gradient(circle at 92% 90%, rgba(141, 114, 255, 0.10) 0%, transparent 40%),
    linear-gradient(160deg, #050506 0%, #020204 48%, #06040A 100%)
  `
  },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 40, elevation: 40 },
  titleBlock: { position: "absolute", right: 54, left: 18, zIndex: 5, gap: 4 },
  titleHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  titleSignal: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.goldBright, boxShadow: "0 0 9px rgba(242, 211, 138, 0.88)" },
  titleEyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.numbers, fontSize: 8, fontWeight: "900", letterSpacing: 1.15 },
  itemTitle: { maxWidth: "88%", color: "#FFFFFF", fontFamily: theme.fonts.bold, fontSize: 25, lineHeight: 28, fontWeight: "900", textShadowColor: "rgba(0, 0, 0, 0.96)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  projectionLabel: { color: "rgba(0, 255, 255, 0.74)", fontFamily: theme.fonts.numbers, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  resultDock: {
    position: "absolute",
    zIndex: 10,
    elevation: 10,
    alignSelf: "center",
    bottom: 0,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    overflow: "visible",
    borderTopLeftRadius: theme.radii.large,
    borderTopRightRadius: theme.radii.large,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(242, 211, 138, 0.24)",
    backgroundColor: "rgba(5, 4, 7, 0.985)",
    experimental_backgroundImage: `
      radial-gradient(
        circle at 16% 0%,
        rgba(141, 114, 255, 0.14) 0%,
        rgba(141, 114, 255, 0.04) 28%,
        transparent 52%
      ),
      radial-gradient(
        circle at 84% 0%,
        rgba(215, 168, 74, 0.12) 0%,
        rgba(215, 168, 74, 0.03) 26%,
        transparent 48%
      ),
      linear-gradient(
        to bottom,
        rgba(15, 11, 17, 0.99) 0%,
        rgba(8, 6, 10, 0.995) 48%,
        rgba(3, 3, 5, 1) 100%
      )
    `,
    boxShadow:
      "0 -18px 52px rgba(0, 0, 0, 0.64), 0 -1px 18px rgba(141, 114, 255, 0.10), 0 0 16px rgba(215, 168, 74, 0.06)",
  },
  resultDockEmbedded: { borderBottomWidth: 1, borderBottomLeftRadius: theme.radii.large, borderBottomRightRadius: theme.radii.large },
  sheetHeader: { gap: 4 },
  sheetHandleHitbox: {
    alignSelf: "stretch",
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sheetHandle: {
    width: 52,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 10px rgba(242, 211, 138, 0.68)",
  },
  sheetHandleLabel: {
    color: "rgba(242, 211, 138, 0.90)",
    fontFamily: theme.fonts.numbers,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.96)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tabRail: {
    height: 34,
    flexDirection: "row",
    gap: 6,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.14)",
    borderRadius: 5,
    backgroundColor: "rgba(8, 6, 10, 0.88)",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 3 },
  tabActive: { borderWidth: 1, borderColor: "rgba(242, 211, 138, 0.42)", backgroundColor: "rgba(242, 211, 138, 0.10)" },
  tabText: { color: "rgba(255, 255, 255, 0.46)", fontFamily: theme.fonts.display, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  tabTextActive: { color: theme.colors.goldBright },
  panelScroll: { flex: 1 },
  panelScrollContent: { paddingBottom: 12 },
  panelBody: { height: 186, paddingHorizontal: 3 },
  gauge: { flex: 1, justifyContent: "center", gap: 10 },
  gaugeHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  microLabel: { color: "rgba(255, 255, 255, 0.48)", fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: "900", letterSpacing: 0.9 },
  gaugeStatus: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  medianValue: { maxWidth: 210, color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 40, lineHeight: 44, fontWeight: "900", fontVariant: ["tabular-nums"], textShadowColor: "rgba(242, 211, 138, 0.52)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 7 },
  gaugeTrack: { height: 28, justifyContent: "center" },
  gaugeBand: { position: "absolute", right: 0, left: 0, height: 9, overflow: "hidden", borderRadius: 5, transformOrigin: "left", boxShadow: "0 0 14px rgba(0, 255, 255, 0.18)" },
  gaugeTick: { position: "absolute", top: 5, width: StyleSheet.hairlineWidth, height: 18, backgroundColor: "rgba(255, 255, 255, 0.34)" },
  gaugeNeedle: { position: "absolute", top: 0, width: 0, height: 0, marginLeft: -5, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent" },
  gaugeLabels: { flexDirection: "row", justifyContent: "space-between" },
  gaugeLabelCenter: { alignItems: "center" },
  gaugeLabelRight: { alignItems: "flex-end" },
  gaugeLabel: { fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  gaugeAmount: { color: "#FFFFFF", fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  valuePanel: { flex: 1 },
  buyCeilingRow: {
    minHeight: 31,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 5,
    backgroundColor: "rgba(0, 255, 255, 0.045)",
  },
  buyCeilingCopy: { flex: 1, minWidth: 0, gap: 1 },
  buyCeilingLabel: {
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  buyCeilingStatus: {
    color: "rgba(255, 255, 255, 0.52)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.55,
  },
  buyCeilingValue: {
    minWidth: 56,
    fontFamily: theme.fonts.radar,
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  marketDecisionStampHost: {
    position: "absolute",
    zIndex: 2,
    elevation: 2,
    right: 0,
    left: 0,
    alignItems: "center",
  },
  marketDecisionStamp: {
    minWidth: 126,
    minHeight: MARKET_DECISION_STAMP_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  marketDecisionStampWord: {
    alignSelf: "stretch",
    fontFamily: theme.fonts.display,
    fontSize: 36,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: 2.8,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  marketDecisionStampMeta: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  marketDecisionStampSignal: {
    flex: 1,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.65,
    textAlign: "center",
  },
  marketDecisionStampConfidence: {
    fontFamily: theme.fonts.numbers,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  readinessRow: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255, 255, 255, 0.10)" },
  readinessSignal: { width: 6, height: 6, borderRadius: 3 },
  readinessText: { flex: 1, fontFamily: theme.fonts.radar, fontSize: 8, fontWeight: "900" },
  readinessScore: { fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900", fontVariant: ["tabular-nums"] },
  basisLine: {
    color: "rgba(255, 255, 255, 0.48)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  emptyPanel: { flex: 1, justifyContent: "center", gap: 9, paddingHorizontal: 8 },
  emptyTitle: { fontFamily: theme.fonts.radar, fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  emptyBody: { color: "rgba(255, 255, 255, 0.68)", fontFamily: theme.fonts.radar, fontSize: 11, lineHeight: 17 },
  profitList: { flex: 1, justifyContent: "center", gap: 7 },
  profitStrategyRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.14)",
    borderRadius: 4,
    backgroundColor: "rgba(0, 255, 255, 0.035)",
  },
  profitStrategyCell: { flex: 1, minWidth: 0, gap: 2, alignItems: "center" },
  profitStrategyLabel: {
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  profitStrategyValue: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 11,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  profitTapHint: {
    color: "rgba(0, 255, 255, 0.66)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  profitEmpty: {
    gap: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.20)",
    borderRadius: 4,
    backgroundColor: "rgba(242, 211, 138, 0.04)",
  },
  profitEmptyTitle: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  profitEmptyBody: {
    color: "rgba(255, 255, 255, 0.62)",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 13,
  },
  profitActionWrap: { gap: 5 },
  profitRow: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 8, borderLeftWidth: 2, borderLeftColor: theme.colors.scannerCyan, backgroundColor: "rgba(0, 255, 255, 0.035)" },
  profitRowExpanded: {
    borderLeftColor: theme.colors.goldBright,
    backgroundColor: "rgba(242, 211, 138, 0.08)",
  },
  profitIndex: { width: 25, height: 25, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0, 255, 255, 0.34)", borderRadius: 13 },
  profitIndexText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: "900" },
  profitCopy: { flex: 1, minWidth: 0, gap: 1 },
  profitTitle: { color: "#FFFFFF", fontFamily: theme.fonts.radar, fontSize: 10, fontWeight: "900" },
  profitDetail: { color: "rgba(255, 255, 255, 0.62)", fontFamily: theme.fonts.radar, fontSize: 8, lineHeight: 11 },
  profitExpandMark: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 18,
    fontWeight: "900",
  },
  profitGuidance: {
    gap: 7,
    marginLeft: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.16)",
    backgroundColor: "rgba(0, 255, 255, 0.025)",
  },
  profitGuidanceStatus: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  profitGuidanceError: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 14,
  },
  profitGuidanceMeta: {
    color: "rgba(0, 255, 255, 0.72)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    lineHeight: 13,
  },
  profitGuidanceWarning: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    lineHeight: 13,
  },
  identifierPanel: { flex: 1, justifyContent: "center", gap: 7 },
  identifierLead: { gap: 2, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255, 255, 255, 0.10)" },
  identifierTitle: { color: "#FFFFFF", fontFamily: theme.fonts.radar, fontSize: 15, lineHeight: 19, fontWeight: "900" },
  identifierConfidence: { color: theme.colors.scannerViolet, fontFamily: theme.fonts.numbers, fontSize: 8, fontWeight: "900", letterSpacing: 0.55 },
  identifierFactRow: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 7 },
  identifierFactLabel: { width: 96, color: "rgba(255, 255, 255, 0.45)", fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  identifierFactValue: { flex: 1, color: "rgba(255, 255, 255, 0.84)", fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "800" },
  identifierFactConfidence: { width: 28, color: theme.colors.scannerViolet, fontFamily: theme.fonts.numbers, fontSize: 8, fontWeight: "900", textAlign: "right" },
  expandedDetails: { gap: 10, paddingHorizontal: 3, paddingTop: 10 },
  detailSection: {
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.14)",
    borderRadius: 5,
    backgroundColor: "rgba(0, 4, 15, 0.58)",
  },
  detailSectionTitle: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  detailFact: {
    gap: 3,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  detailFactLabel: {
    color: "rgba(255, 255, 255, 0.42)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  detailFactValueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  detailFactValue: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  detailFactConfidence: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.numbers,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  detailBody: {
    color: "rgba(255, 255, 255, 0.68)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 15,
  },
  detailBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailBullet: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 11,
    fontWeight: "900",
  },
  detailBulletText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 15,
  },
  detailSignal: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  detailSource: {
    color: "rgba(0, 255, 255, 0.58)",
    fontFamily: theme.fonts.radar,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  decisionDetailHeading: {
    paddingTop: 3,
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  decisionEvidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  decisionEvidenceCode: {
    width: 22,
    color: theme.colors.danger,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
  },
  decisionEvidenceCopy: { flex: 1, minWidth: 0, gap: 3 },
  decisionEvidenceFactor: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
  },
  decisionEvidenceImpact: {
    color: "rgba(255, 121, 133, 0.86)",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 13,
  },
  decisionActionHint: {
    color: "rgba(0, 255, 255, 0.72)",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 14,
  },
  expandedProfitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  expandedProfitCode: {
    width: 24,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
  },
  expandedProfitCopy: { flex: 1, minWidth: 0, gap: 3 },
  expandedProfitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  expandedProfitTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
  },
  expandedEvidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  expandedEvidenceCode: {
    width: 22,
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
  },
  expandedEvidenceCopy: { flex: 1, minWidth: 0, gap: 3 },
  expandedEvidenceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  expandedEvidenceLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
  },
  referenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  referenceCode: {
    width: 22,
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
  },
  referenceCopy: { flex: 1, minWidth: 0, gap: 3 },
  referenceTitle: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  referenceLink: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    lineHeight: 11,
  },
  questionBlock: {
    gap: 5,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  questionLabel: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "900",
  },
  questionReason: {
    color: "rgba(255, 255, 255, 0.46)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    lineHeight: 12,
  },
  photoRequest: {
    color: "rgba(242, 211, 138, 0.78)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 13,
  },
  scanDetailButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 3,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.48)",
    borderRadius: 4,
    backgroundColor: "rgba(0, 255, 255, 0.07)",
  },
  scanDetailButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  questionInput: {
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.24)",
    borderRadius: 4,
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 255, 255, 0.035)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 15,
    textAlignVertical: "top",
  },
  refineButton: {
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.46)",
    borderRadius: 4,
    backgroundColor: "rgba(0, 255, 255, 0.10)",
  },
  refineButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  saveActions: { flexDirection: "row", gap: 8 },
  saveButton: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8, borderRadius: 4, backgroundColor: theme.colors.goldBright },
  saveButtonSecondary: { borderWidth: 1, borderColor: "rgba(242, 211, 138, 0.38)", backgroundColor: "rgba(4, 4, 8, 0.72)" },
  saveButtonText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  saveButtonTextSecondary: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.48 },
});
