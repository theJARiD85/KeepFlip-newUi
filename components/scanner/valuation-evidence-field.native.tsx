import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type {
  AnalysisProfitPlan,
  AnalysisValuation,
  AnalysisValuationReadiness,
} from "@/components/scanner/analysis-visual-types";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const MAX_NODES = 36;
const RANGE_SPRING = {
  damping: 11,
  mass: 0.62,
  stiffness: 280,
  overshootClamping: false,
} as const;
const PROFIT_SPRING = {
  damping: 13,
  mass: 0.7,
  stiffness: 220,
  overshootClamping: false,
} as const;

type EvidenceNode = {
  depth: number;
  id: number;
  phase: number;
  radius: number;
  x: number;
  y: number;
};

export type ValuationEvidenceFieldProps = {
  /** Loading / error: soft field only, no range/profit POPs. */
  ambient?: boolean;
  photoUri?: string | null;
  profitPlan: AnalysisProfitPlan;
  style?: StyleProp<ViewStyle>;
  valuation?: AnalysisValuation;
  valuationReadiness: AnalysisValuationReadiness;
};

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

function hash01(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function nodeCountFor(
  readiness: AnalysisValuationReadiness["status"],
  comparableCount?: number,
) {
  if (comparableCount != null && Number.isFinite(comparableCount)) {
    return Math.max(8, Math.min(MAX_NODES, 8 + Math.round(comparableCount * 1.4)));
  }
  if (readiness === "ready") return 28;
  if (readiness === "limited") return 16;
  return 10;
}

function buildNodes(
  count: number,
  width: number,
  height: number,
): EvidenceNode[] {
  const cx = width * 0.5;
  const cy = height * 0.38;
  const nodes: EvidenceNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const angle = t * Math.PI * 2 * 1.618 + hash01(index + 3) * 1.2;
    const orbit = 0.14 + hash01(index + 11) * 0.34;
    const depth = 0.22 + hash01(index + 29) * 0.78;
    const parallax = 0.55 + depth * 0.7;
    nodes.push({
      depth,
      id: index,
      phase: hash01(index + 47) * Math.PI * 2,
      radius: 1.6 + depth * 3.4,
      x: cx + Math.cos(angle) * width * orbit * parallax,
      y: cy + Math.sin(angle) * height * orbit * 0.72 * parallax,
    });
  }

  return nodes;
}

function readinessAccent(
  status: AnalysisValuationReadiness["status"],
) {
  if (status === "ready") return theme.colors.scannerCyan;
  if (status === "limited") return theme.colors.goldBright;
  return theme.colors.danger;
}

function fireRangeHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
    () => undefined,
  );
}

function fireProfitHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function EvidenceStar({
  drift,
  fieldProgress,
  node,
  primary,
}: {
  drift: ReturnType<typeof useSharedValue<number>>;
  fieldProgress: ReturnType<typeof useSharedValue<number>>;
  node: EvidenceNode;
  primary: string;
}) {
  const cx = useDerivedValue(() => {
    const bloom = interpolate(
      fieldProgress.get(),
      [0, 1],
      [0.35, 1],
      Extrapolation.CLAMP,
    );
    const wobble =
      Math.sin(drift.get() * (0.55 + node.depth * 0.35) + node.phase) *
      (4 + node.depth * 5) *
      (0.35 + fieldProgress.get() * 0.65);
    return node.x * bloom + wobble * (1.15 - node.depth * 0.4);
  });
  const cy = useDerivedValue(() => {
    const bloom = interpolate(
      fieldProgress.get(),
      [0, 1],
      [0.42, 1],
      Extrapolation.CLAMP,
    );
    const wobble =
      Math.cos(drift.get() * (0.4 + node.depth * 0.3) + node.phase) *
      (3 + node.depth * 4) *
      (0.35 + fieldProgress.get() * 0.65);
    return node.y * bloom + wobble * (1.1 - node.depth * 0.35);
  });
  const opacity = useDerivedValue(() =>
    interpolate(
      fieldProgress.get(),
      [0, 0.2 + node.depth * 0.35, 1],
      [0, 0, 0.28 + node.depth * 0.55],
      Extrapolation.CLAMP,
    ),
  );
  const r = useDerivedValue(
    () => node.radius * (0.55 + fieldProgress.get() * 0.55),
  );

  return (
    <Circle cx={cx} cy={cy} opacity={opacity} r={r} color={primary}>
      <BlurMask blur={node.depth > 0.6 ? 3.5 : 1.4} style="solid" />
    </Circle>
  );
}

export function ValuationEvidenceField({
  ambient = false,
  photoUri,
  profitPlan,
  style,
  valuation,
  valuationReadiness,
}: ValuationEvidenceFieldProps) {
  const reduceMotion = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [layout, setLayout] = useState({
    height: windowHeight,
    width: windowWidth,
  });

  const fieldProgress = useSharedValue(0);
  const rangePop = useSharedValue(0);
  const profitPop = useSharedValue(0);
  const drift = useSharedValue(0);

  const status = valuationReadiness.status;
  const accent = readinessAccent(status);
  const firmReady = status === "ready";
  const currency =
    profitPlan.currency ?? valuation?.currency ?? "USD";
  const quickSale = profitPlan.quickSale ?? valuation?.low;
  const expectSale = profitPlan.expectedSale ?? valuation?.median;
  const listTarget = profitPlan.listTarget ?? valuation?.high;
  const hasRange =
    quickSale != null &&
    expectSale != null &&
    listTarget != null &&
    Number.isFinite(quickSale) &&
    Number.isFinite(expectSale) &&
    Number.isFinite(listTarget);
  const canProfitPop =
    hasRange &&
    firmReady &&
    listTarget! > expectSale! &&
    !ambient;

  const count = nodeCountFor(status, valuation?.comparableCount);
  const nodes = useMemo(
    () => buildNodes(count, layout.width, layout.height),
    [count, layout.height, layout.width],
  );

  const bandY = layout.height * 0.36;
  const bandLeft = layout.width * 0.14;
  const bandRight = layout.width * 0.86;
  const bandWidth = bandRight - bandLeft;
  const expectX =
    hasRange && listTarget !== quickSale
      ? bandLeft +
      ((expectSale! - quickSale!) / Math.max(1, listTarget! - quickSale!)) *
      bandWidth
      : layout.width * 0.5;
  const quickX = bandLeft;
  const listX = bandRight;

  const rangePath = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(quickX, bandY);
    path.lineTo(listX, bandY);
    return path;
  }, [bandY, listX, quickX]);

  const profitArc = useMemo(() => {
    const path = Skia.Path.Make();
    const midX = (expectX + listX) / 2;
    const peakY = bandY - layout.height * 0.08;
    path.moveTo(expectX, bandY);
    path.quadTo(midX, peakY, listX, bandY);
    return path;
  }, [bandY, expectX, layout.height, listX]);

  const links = useMemo(() => {
    const edges: { a: EvidenceNode; b: EvidenceNode }[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < Math.min(layout.width, layout.height) * 0.16) {
          edges.push({ a, b });
        }
      }
    }
    return edges.slice(0, 42);
  }, [layout.height, layout.width, nodes]);

  const linkPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const edge of links) {
      path.moveTo(edge.a.x, edge.a.y);
      path.lineTo(edge.b.x, edge.b.y);
    }
    return path;
  }, [links]);

  useEffect(() => {
    cancelAnimation(fieldProgress);
    cancelAnimation(rangePop);
    cancelAnimation(profitPop);
    cancelAnimation(drift);

    fieldProgress.set(0);
    rangePop.set(0);
    profitPop.set(0);

    if (reduceMotion) {
      fieldProgress.set(ambient ? 0.55 : 1);
      if (!ambient && hasRange) {
        rangePop.set(1);
        if (canProfitPop) profitPop.set(1);
      }
      return;
    }

    drift.set(0);
    drift.set(
      withRepeat(
        withTiming(Math.PI * 2, {
          duration: ambient ? 14000 : 10000,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );

    fieldProgress.set(
      withTiming(ambient ? 0.62 : 1, {
        duration: ambient ? 1400 : 900,
        easing: Easing.out(Easing.cubic),
      }),
    );

    if (ambient || !hasRange) return;

    rangePop.set(
      withDelay(
        520,
        withSpring(1, RANGE_SPRING, (finished) => {
          if (finished) scheduleOnRN(fireRangeHaptic);
        }),
      ),
    );

    if (!canProfitPop) return;

    profitPop.set(
      withDelay(
        1280,
        withSpring(1, PROFIT_SPRING, (finished) => {
          if (finished) scheduleOnRN(fireProfitHaptic);
        }),
      ),
    );

    return () => {
      cancelAnimation(fieldProgress);
      cancelAnimation(rangePop);
      cancelAnimation(profitPop);
      cancelAnimation(drift);
    };
  }, [
    ambient,
    canProfitPop,
    drift,
    fieldProgress,
    hasRange,
    profitPop,
    rangePop,
    reduceMotion,
    status,
    valuation?.comparableCount,
    valuation?.median,
  ]);

  useAnimatedReaction(
    () => rangePop.get(),
    () => {
      // Keeps rangePop subscribed for overlay styles; haptics fire from spring callback.
    },
  );

  const rangeBandOpacity = useDerivedValue(() =>
    interpolate(rangePop.get(), [0, 0.35, 1], [0, 0.55, 1], Extrapolation.CLAMP),
  );
  const rangeBandScale = useDerivedValue(() =>
    interpolate(rangePop.get(), [0, 0.55, 1], [0.55, 1.12, 1], Extrapolation.CLAMP),
  );
  const profitOpacity = useDerivedValue(() =>
    interpolate(profitPop.get(), [0, 0.4, 1], [0, 0.7, 1], Extrapolation.CLAMP),
  );
  const linkOpacity = useDerivedValue(() =>
    interpolate(fieldProgress.get(), [0, 1], [0, firmReady ? 0.22 : 0.12], Extrapolation.CLAMP),
  );

  const rangeTransform = useDerivedValue(() => {
    const scale = rangeBandScale.get();
    return [
      { translateX: layout.width / 2 },
      { translateY: bandY },
      { scale },
      { translateX: -layout.width / 2 },
      { translateY: -bandY },
    ];
  });

  const rangeLabelStyle = useAnimatedStyle(() => ({
    opacity: rangeBandOpacity.get(),
    transform: [
      {
        scale: interpolate(
          rangePop.get(),
          [0, 0.55, 1],
          [0.72, 1.08, 1],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          rangePop.get(),
          [0, 1],
          [18, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const profitLabelStyle = useAnimatedStyle(() => ({
    opacity: profitOpacity.get(),
    transform: [
      {
        scale: interpolate(
          profitPop.get(),
          [0, 0.55, 1],
          [0.7, 1.1, 1],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          profitPop.get(),
          [0, 1],
          [12, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((prev) => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  };

  const upside =
    canProfitPop && listTarget != null && expectSale != null
      ? listTarget - expectSale
      : null;
  const actionSparks = profitPlan.actions.slice(0, 2);

  if (layout.width <= 0 || layout.height <= 0) {
    return <View onLayout={onLayout} style={[styles.root, style]} />;
  }

  return (
    <View onLayout={onLayout} style={[styles.root, style]}>
      <View pointerEvents="none" style={styles.ambientWash} />

      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={linkPath}
          style="stroke"
          strokeWidth={1}
          color={accent}
          opacity={linkOpacity}
        />

        {nodes.map((node) => (
          <EvidenceStar
            drift={drift}
            fieldProgress={fieldProgress}
            key={node.id}
            node={node}
            primary={accent}
          />
        ))}

        {hasRange && !ambient ? (
          <Group opacity={rangeBandOpacity} transform={rangeTransform}>
            <Path
              path={rangePath}
              style="stroke"
              strokeWidth={3}
              strokeCap="round"
            >
              <LinearGradient
                colors={[
                  theme.colors.scannerViolet,
                  theme.colors.goldBright,
                  theme.colors.scannerCyan,
                ]}
                start={vec(quickX, bandY)}
                end={vec(listX, bandY)}
              />
              <BlurMask blur={4} style="solid" />
            </Path>

            <Circle cx={quickX} cy={bandY} r={7} color={theme.colors.scannerViolet}>
              <BlurMask blur={5} style="solid" />
            </Circle>
            <Circle cx={expectX} cy={bandY} r={11} color={theme.colors.goldBright}>
              <BlurMask blur={7} style="solid" />
            </Circle>
            <Circle cx={listX} cy={bandY} r={7} color={theme.colors.scannerCyan}>
              <BlurMask blur={5} style="solid" />
            </Circle>
          </Group>
        ) : null}

        {canProfitPop ? (
          <Group opacity={profitOpacity}>
            <Path
              path={profitArc}
              style="stroke"
              strokeWidth={2.5}
              strokeCap="round"
              color={theme.colors.scannerCyan}
            >
              <BlurMask blur={6} style="solid" />
            </Path>
            <Circle
              cx={(expectX + listX) / 2}
              cy={bandY - layout.height * 0.08}
              r={5}
              color={theme.colors.goldBright}
            >
              <BlurMask blur={4} style="solid" />
            </Circle>
            {actionSparks.map((action, index) => {
              const t = (index + 1) / (actionSparks.length + 1);
              const sparkX = expectX + (listX - expectX) * t;
              const sparkY = bandY - layout.height * 0.08 * Math.sin(Math.PI * t);
              return (
                <Circle
                  key={action.id}
                  cx={sparkX}
                  cy={sparkY}
                  r={3.5}
                  color={theme.colors.scannerCyan}
                />
              );
            })}
          </Group>
        ) : null}
      </Canvas>

      {photoUri ? (
        <View
          pointerEvents="none"
          style={[
            styles.thumbFrame,
            {
              borderColor: accent,
              left: layout.width / 2 - 34,
              top: bandY - 92,
            },
          ]}
        >
          <Image
            accessibilityLabel="Item evidence"
            contentFit="cover"
            source={{ uri: photoUri }}
            style={styles.thumbImage}
            transition={160}
          />
        </View>
      ) : null}

      {hasRange && !ambient ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeLabels,
            { top: bandY + 18, width: layout.width },
            rangeLabelStyle,
          ]}
        >
          <View style={[styles.rangeCell, { left: quickX - 36 }]}>
            <Text style={[styles.rangeEyebrow, { color: theme.colors.scannerViolet }]}>
              QUICK
            </Text>
            <Text style={styles.rangeValue}>
              {formatMoney(quickSale!, currency)}
            </Text>
          </View>
          <View style={[styles.rangeCell, styles.rangeCellCenter, { left: expectX - 42 }]}>
            <Text style={[styles.rangeEyebrow, { color: theme.colors.goldBright }]}>
              EXPECT
            </Text>
            <Text style={[styles.rangeValue, styles.rangeValueHero]}>
              {formatMoney(expectSale!, currency)}
            </Text>
          </View>
          <View style={[styles.rangeCell, { left: listX - 36 }]}>
            <Text style={[styles.rangeEyebrow, { color: theme.colors.scannerCyan }]}>
              LIST
            </Text>
            <Text style={styles.rangeValue}>
              {firmReady ? formatMoney(listTarget!, currency) : "—"}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {canProfitPop && upside != null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.profitCallout,
            {
              left: (expectX + listX) / 2 - 78,
              top: bandY - layout.height * 0.14,
            },
            profitLabelStyle,
          ]}
        >
          <Text style={styles.profitEyebrow}>MAX PROFIT UPSIDE</Text>
          <Text style={styles.profitValue}>+{formatMoney(upside, currency)}</Text>
          {actionSparks[0] ? (
            <Text numberOfLines={1} style={styles.profitHint}>
              {actionSparks[0].label}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      <View pointerEvents="none" style={styles.floorFade} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
  },
  ambientWash: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 34%, rgba(88, 223, 232, 0.14) 0%, transparent 42%),
      radial-gradient(circle at 22% 58%, rgba(141, 114, 255, 0.12) 0%, transparent 38%),
      radial-gradient(circle at 78% 48%, rgba(215, 168, 74, 0.10) 0%, transparent 36%),
      linear-gradient(160deg, #07050C 0%, ${theme.colors.backgroundDeep} 55%, #030208 100%)
    `,
  },
  thumbFrame: {
    position: "absolute",
    zIndex: 2,
    width: 68,
    height: 68,
    overflow: "hidden",
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "rgba(1, 6, 10, 0.72)",
    opacity: 0.78,
  },
  thumbImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0.7,
  },
  rangeLabels: {
    position: "absolute",
    zIndex: 3,
    height: 44,
  },
  rangeCell: {
    position: "absolute",
    width: 84,
    alignItems: "center",
    gap: 2,
  },
  rangeCellCenter: {
    width: 96,
  },
  rangeEyebrow: {
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  rangeValue: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 11,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  rangeValueHero: {
    color: theme.colors.goldBright,
    fontSize: 14,
  },
  profitCallout: {
    position: "absolute",
    zIndex: 4,
    width: 156,
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.28)",
    backgroundColor: "rgba(0, 8, 18, 0.72)",
  },
  profitEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.85,
  },
  profitValue: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 15,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  profitHint: {
    maxWidth: 140,
    color: "rgba(255, 255, 255, 0.62)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "700",
  },
  floorFade: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    height: "42%",
    experimental_backgroundImage: `
      linear-gradient(to bottom, transparent 0%, rgba(1, 1, 3, 0.55) 48%, rgba(1, 1, 3, 0.92) 100%)
    `,
  },
});
