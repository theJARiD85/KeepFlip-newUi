import { useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import type {
  ItemIdentificationSnapshot,
  ItemAnalysisStage,
} from "@/types/item-analysis";

export type Thought = {
  confidence?: string;
  id: string;
  label: string;
  prominence?: "hero" | "standard" | "micro";
  text: string;
  type?: "analysis" | "market" | "success" | "warning";
};

export type AnalysisThoughtContext = {
  localDetection?: {
    label: string;
    score: number;
  };
  modeLabel: string;
  partialResult?: ItemIdentificationSnapshot;
  photoCount: number;
  stage: ItemAnalysisStage;
};

type ThoughtAnchor = {
  driftX: number;
  driftY: number;
  enterX: number;
  left?: `${number}%`;
  right?: `${number}%`;
  textAlign: "left" | "right";
  top: `${number}%`;
  width: number;
};

type ScannerThoughtStreamProps = {
  thoughts: Thought[];
};

const MAX_VISIBLE_THOUGHTS = 7;
const MAX_COMPACT_THOUGHTS = 5;

const THOUGHT_ANCHORS: ThoughtAnchor[] = [
  {
    driftX: 5,
    driftY: -6,
    enterX: -22,
    left: "5%",
    textAlign: "left",
    top: "15%",
    width: 184,
  },
  {
    driftX: -4,
    driftY: 7,
    enterX: 24,
    right: "4%",
    textAlign: "right",
    top: "22%",
    width: 168,
  },
  {
    driftX: 6,
    driftY: 5,
    enterX: -18,
    left: "3%",
    textAlign: "left",
    top: "39%",
    width: 148,
  },
  {
    driftX: -6,
    driftY: -5,
    enterX: 20,
    right: "3%",
    textAlign: "right",
    top: "45%",
    width: 164,
  },
  {
    driftX: 4,
    driftY: -7,
    enterX: -16,
    left: "8%",
    textAlign: "left",
    top: "58%",
    width: 176,
  },
  {
    driftX: -5,
    driftY: 6,
    enterX: 18,
    right: "6%",
    textAlign: "right",
    top: "63%",
    width: 156,
  },
  {
    driftX: 4,
    driftY: 5,
    enterX: -14,
    left: "28%",
    textAlign: "left",
    top: "31%",
    width: 142,
  },
  {
    driftX: -4,
    driftY: -5,
    enterX: 16,
    right: "24%",
    textAlign: "right",
    top: "54%",
    width: 144,
  },
];

const COMPACT_THOUGHT_ANCHORS: ThoughtAnchor[] = [
  {
    driftX: 4,
    driftY: -4,
    enterX: -18,
    left: "4%",
    textAlign: "left",
    top: "14%",
    width: 154,
  },
  {
    driftX: -4,
    driftY: 5,
    enterX: 20,
    right: "4%",
    textAlign: "right",
    top: "25%",
    width: 150,
  },
  {
    driftX: 4,
    driftY: 4,
    enterX: -16,
    left: "3%",
    textAlign: "left",
    top: "37%",
    width: 146,
  },
  {
    driftX: -4,
    driftY: -4,
    enterX: 18,
    right: "3%",
    textAlign: "right",
    top: "48%",
    width: 152,
  },
  {
    driftX: 3,
    driftY: -5,
    enterX: -14,
    left: "7%",
    textAlign: "left",
    top: "59%",
    width: 150,
  },
];

const PROCESS_THOUGHTS: Record<ItemAnalysisStage, Thought[]> = {
  authenticating: [
    {
      id: "pipeline-auth",
      label: "PRIVATE PIPELINE",
      prominence: "standard",
      text: "VERIFYING SESSION",
      type: "analysis",
    },
    {
      id: "evidence-seal",
      label: "EVIDENCE CHAIN",
      prominence: "micro",
      text: "SEALING PRIVATE CHANNEL",
      type: "analysis",
    },
  ],
  uploading: [
    {
      id: "multiview-register",
      label: "MULTI-VIEW REGISTER",
      prominence: "standard",
      text: "ALIGNING ITEM ANGLES",
      type: "analysis",
    },
    {
      id: "detail-preservation",
      label: "DETAIL CHANNEL",
      prominence: "micro",
      text: "LABELS + MARKS PRESERVED",
      type: "success",
    },
  ],
  analyzing: [
    {
      id: "identity-correlation",
      label: "IDENTITY CORRELATION",
      prominence: "hero",
      text: "SEEKING MAKER + MODEL",
      type: "analysis",
    },
    {
      id: "label-intelligence",
      label: "LABEL INTELLIGENCE",
      prominence: "standard",
      text: "MARKS · SERIALS · OCR",
      type: "analysis",
    },
    {
      id: "condition-signals",
      label: "CONDITION PASS",
      prominence: "micro",
      text: "WEAR + CONSTRUCTION SIGNALS",
      type: "warning",
    },
  ],
  cleaning: [
    {
      id: "ephemeral-cleanup",
      label: "PRIVACY PASS",
      prominence: "micro",
      text: "PURGING TEMP FILES",
      type: "analysis",
    },
  ],
  researching_comps: [
    {
      id: "market-filter",
      label: "SOLD-MARKET FILTER",
      prominence: "standard",
      text: "FILTERING COMPLETED SALES",
      type: "market",
    },
    {
      id: "profit-calibration",
      label: "PROFIT CALIBRATION",
      prominence: "micro",
      text: "CALIBRATING CONDITION + OUTLIERS",
      type: "market",
    },
  ],
};

function percentage(value?: number) {
  if (value == null || !Number.isFinite(value)) return undefined;
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.max(0, Math.min(100, normalized)))}% CONF`;
}

function compactText(value: string, maxLength = 58) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizedConfidence(value?: number) {
  if (value == null || !Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function hasDirectTextEvidence(
  result: ItemIdentificationSnapshot,
  value: string,
) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return false;

  return result.analysis.evidence.some(
    (evidence) => {
      const evidenceValue = evidence.value.trim().toLowerCase();
      return (
        evidence.source === "photo_text" &&
        evidence.strength !== "low" &&
        evidenceValue.length > 0 &&
        (evidenceValue.includes(normalizedValue) ||
          normalizedValue.includes(evidenceValue))
      );
    },
  );
}

function identityThoughts(result: ItemIdentificationSnapshot): Thought[] {
  const { analysis } = result;
  const { confidence, condition, identification } = analysis;
  const thoughts: Thought[] = [];
  const isIdentified = result.status === "identified";

  if (identification.brand) {
    const isLocked =
      isIdentified &&
      (normalizedConfidence(confidence.brand) >= 0.72 ||
        hasDirectTextEvidence(result, identification.brand));
    thoughts.push({
      confidence: percentage(confidence.brand),
      id: "identity-brand",
      label: isLocked ? "MAKER LOCK" : "MAKER CANDIDATE",
      prominence: "hero",
      text: compactText(identification.brand, 34),
      type: isLocked ? "success" : "warning",
    });
  }

  if (identification.model) {
    const isLocked =
      isIdentified &&
      (normalizedConfidence(confidence.model) >= 0.7 ||
        hasDirectTextEvidence(result, identification.model));
    thoughts.push({
      confidence: percentage(confidence.model),
      id: "identity-model",
      label: isLocked ? "MODEL CORRELATION" : "MODEL CANDIDATE",
      prominence: "hero",
      text: compactText(identification.model, 38),
      type: isLocked ? "success" : "warning",
    });
  }

  if (identification.variant) {
    thoughts.push({
      id: "identity-variant",
      label: "VARIANT SIGNAL",
      prominence: "standard",
      text: compactText(identification.variant, 42),
      type: "analysis",
    });
  }

  if (identification.serialNumber) {
    const isDirectRead = hasDirectTextEvidence(
      result,
      identification.serialNumber,
    );
    thoughts.push({
      id: "identity-serial",
      label: isDirectRead ? "IDENTIFIER READ" : "IDENTIFIER CANDIDATE",
      prominence: "standard",
      text: compactText(identification.serialNumber, 36),
      type: isDirectRead ? "success" : "warning",
    });
  }

  const category = identification.itemType ?? identification.category;
  if (category && thoughts.length < 4) {
    thoughts.push({
      confidence: percentage(confidence.itemType),
      id: "identity-category",
      label: "ITEM CLASS",
      prominence: "standard",
      text: compactText(category, 36),
      type: "analysis",
    });
  }

  if (condition.grade !== "unknown") {
    const isStrongCondition =
      normalizedConfidence(condition.confidence) >= 0.65;
    thoughts.push({
      confidence: percentage(condition.confidence),
      id: "condition-grade",
      label: isStrongCondition ? "CONDITION READ" : "CONDITION SIGNAL",
      prominence: "standard",
      text: condition.grade.replaceAll("_", " ").toUpperCase(),
      type: isStrongCondition ? "success" : "warning",
    });
  }

  const strongestEvidence = analysis.evidence
    .filter((evidence) => evidence.strength !== "low")
    .slice(0, 2);

  strongestEvidence.forEach((evidence, index) => {
    thoughts.push({
      confidence: evidence.source.replaceAll("_", " ").toUpperCase(),
      id: `evidence-${evidence.claim}-${index}`,
      label: compactText(evidence.claim, 28).toUpperCase(),
      prominence: "micro",
      text: compactText(evidence.value),
      type: evidence.strength === "high" ? "success" : "analysis",
    });
  });

  return thoughts;
}

function marketThought(
  result: ItemIdentificationSnapshot,
): Thought | null {
  const searchTerms = result.analysis.valuationSignals.searchTerms
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 3);
  const fallback = [
    result.analysis.identification.brand,
    result.analysis.identification.model,
  ]
    .filter(Boolean)
    .join(" ");
  const query = searchTerms.join(" · ") || fallback;

  if (!query) return null;
  return {
    id: "market-query",
    label: "SOLD-MARKET QUERY",
    prominence: "standard",
    text: compactText(query, 54),
    type: "market",
  };
}

export function buildAnalysisThoughts({
  localDetection,
  modeLabel,
  partialResult,
  photoCount,
  stage,
}: AnalysisThoughtContext): Thought[] {
  const thoughts: Thought[] = [];

  if (partialResult) {
    thoughts.push(...identityThoughts(partialResult));
    if (stage === "researching_comps") {
      const queryThought = marketThought(partialResult);
      if (queryThought) thoughts.push(queryThought);
    }
  } else {
    if (localDetection?.label) {
      thoughts.push({
        confidence: percentage(localDetection.score),
        id: "local-detection",
        label: "LOCAL OBJECT CLASS",
        prominence: "standard",
        text: compactText(localDetection.label, 34),
        type: "analysis",
      });
    }

    thoughts.push({
      id: "photo-evidence-count",
      label: "PHOTO EVIDENCE",
      prominence: "standard",
      text: `${photoCount} ${photoCount === 1 ? "VIEW" : "VIEWS"} · ${modeLabel.toUpperCase()}`,
      type: "success",
    });
  }

  thoughts.push(...PROCESS_THOUGHTS[stage]);

  const unique = new Map<string, Thought>();
  thoughts.forEach((thought) => {
    if (!unique.has(thought.id)) unique.set(thought.id, thought);
  });

  return [...unique.values()].slice(0, MAX_VISIBLE_THOUGHTS);
}

function hashThoughtId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function accentForThought(thought: Thought) {
  if (thought.type === "success") return theme.colors.goldBright;
  if (thought.type === "market") return theme.colors.scannerViolet;
  if (thought.type === "warning") return theme.colors.scannerAmber;
  return theme.colors.scannerCyan;
}

function typographyForThought(
  thought: Thought,
  anchorIndex: number,
): Pick<TextStyle, "fontSize" | "letterSpacing" | "lineHeight"> {
  const variance = (anchorIndex % 3) - 1;
  if (thought.prominence === "hero") {
    return {
      fontSize: 17 + variance,
      letterSpacing: 0.45,
      lineHeight: 21 + variance,
    };
  }
  if (thought.prominence === "micro") {
    return {
      fontSize: 11 + Math.max(0, variance),
      letterSpacing: 0.85,
      lineHeight: 15,
    };
  }
  return {
    fontSize: 12 + variance,
    letterSpacing: 0.65,
    lineHeight: 16 + variance,
  };
}

function ThoughtCard({
  anchor,
  anchorIndex,
  sequenceIndex,
  thought,
}: {
  anchor: ThoughtAnchor;
  anchorIndex: number;
  sequenceIndex: number;
  thought: Thought;
}) {
  const reduceMotion = useReducedMotion();
  const entry = useSharedValue(reduceMotion ? 1 : 0);
  const drift = useSharedValue(0);
  const accent = accentForThought(thought);
  const textAlign = anchor.textAlign;
  const typography = typographyForThought(thought, anchorIndex);

  useEffect(() => {
    if (reduceMotion) {
      entry.value = 1;
      drift.value = 0.5;
      return;
    }

    entry.value = 0;
    entry.value = withDelay(
      90 + sequenceIndex * 150,
      withTiming(1, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      }),
    );
    drift.value = withRepeat(
      withTiming(1, {
        duration: 2500 + (anchorIndex % 4) * 430,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(entry);
      cancelAnimation(drift);
    };
  }, [
    anchorIndex,
    drift,
    entry,
    reduceMotion,
    sequenceIndex,
    thought.id,
  ]);

  const floatingStyle = useAnimatedStyle(() => {
    const breathing = (drift.value - 0.5) * 2;
    return {
      opacity: entry.value,
      transform: [
        {
          translateX:
            (1 - entry.value) * anchor.enterX +
            breathing * anchor.driftX,
        },
        {
          translateY:
            (1 - entry.value) * 12 + breathing * anchor.driftY,
        },
        {
          scale:
            0.88 +
            entry.value * 0.12 +
            (reduceMotion ? 0 : breathing * 0.012),
        },
      ],
    };
  });

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        {
          left: anchor.left,
          right: anchor.right,
          top: anchor.top,
          width: anchor.width,
        },
        textAlign === "right" && styles.cardRight,
        {
          borderColor: `${accent}66`,
          boxShadow: `0 13px 22px rgba(0, 0, 0, 0.58), 0 0 18px ${accent}20`,
        },
        floatingStyle,
      ]}
    >
      <View
        style={[
          styles.signalNotch,
          textAlign === "right"
            ? styles.signalNotchRight
            : styles.signalNotchLeft,
          { backgroundColor: accent, boxShadow: `0 0 9px ${accent}` },
        ]}
      />
      <NativeText
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.label, { color: accent, textAlign }]}
      >
        {thought.label}
      </NativeText>
      <View style={styles.valueStack}>
        <NativeText
          allowFontScaling={false}
          numberOfLines={2}
          style={[
            styles.valueGlow,
            typography,
            { color: accent, textAlign, textShadowColor: accent },
          ]}
        >
          {thought.text}
        </NativeText>
        <NativeText
          allowFontScaling={false}
          numberOfLines={2}
          style={[
            styles.value,
            styles.valueFront,
            typography,
            { textAlign },
          ]}
        >
          {thought.text}
        </NativeText>
      </View>
      {thought.confidence ? (
        <NativeText
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.confidence, { color: accent, textAlign }]}
        >
          {thought.confidence}
        </NativeText>
      ) : null}
    </Animated.View>
  );
}

export function ScannerThoughtStream({
  thoughts,
}: ScannerThoughtStreamProps) {
  const { height, width } = useWindowDimensions();
  const isCompact = height < 720 || width < 380;
  const anchors = isCompact
    ? COMPACT_THOUGHT_ANCHORS
    : THOUGHT_ANCHORS;
  const maxThoughts = isCompact
    ? MAX_COMPACT_THOUGHTS
    : MAX_VISIBLE_THOUGHTS;
  const transcript = useMemo(
    () =>
      thoughts
        .slice(0, 3)
        .map((thought) => `${thought.label}: ${thought.text}`)
        .join(". "),
    [thoughts],
  );
  const arrangedThoughts = useMemo(() => {
    const visible = thoughts.slice(0, maxThoughts);
    const occupiedAnchors = new Set<number>();

    return visible.map((thought) => {
      let anchorIndex =
        hashThoughtId(thought.id) % anchors.length;
      while (occupiedAnchors.has(anchorIndex)) {
        anchorIndex = (anchorIndex + 3) % anchors.length;
      }
      occupiedAnchors.add(anchorIndex);

      return {
        anchor: {
          ...anchors[anchorIndex],
          width: Math.min(
            anchors[anchorIndex].width,
            width * (isCompact ? 0.43 : 0.48),
          ),
        },
        anchorIndex,
        thought,
      };
    });
  }, [anchors, isCompact, maxThoughts, thoughts, width]);

  return (
    <View pointerEvents="none" style={styles.container}>
      {transcript ? (
        <NativeText
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
          style={styles.accessibleTranscript}
        >
          {`KeepFlip AI analysis. ${transcript}`}
        </NativeText>
      ) : null}
      {arrangedThoughts.map(
        ({ anchor, anchorIndex, thought }, sequenceIndex) => (
          <ThoughtCard
            anchor={anchor}
            anchorIndex={anchorIndex}
            key={thought.id}
            sequenceIndex={sequenceIndex}
            thought={thought}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  card: {
    position: "absolute",
    minHeight: 54,
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 8,
    overflow: "visible",
    borderLeftWidth: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 5,
    backgroundColor: "rgba(1, 7, 11, 0.68)",
  },
  cardRight: {
    alignItems: "flex-end",
    borderLeftWidth: 0,
    borderRightWidth: 1,
  },
  signalNotch: {
    position: "absolute",
    top: -2,
    width: 18,
    height: 2,
  },
  signalNotchLeft: { left: -1 },
  signalNotchRight: { right: -1 },
  label: {
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
    opacity: 0.88,
  },
  valueStack: {
    position: "relative",
    alignSelf: "stretch",
  },
  valueGlow: {
    fontFamily: theme.fonts.analysis,
    fontWeight: "900",
    opacity: 0.62,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  value: {
    color: "#E9FDFF",
    fontFamily: theme.fonts.analysis,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.98)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },
  valueFront: {
    ...StyleSheet.absoluteFill,
  },
  confidence: {
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.72,
    opacity: 0.76,
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  accessibleTranscript: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
