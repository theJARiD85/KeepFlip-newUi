import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo } from "react";
import { I18nManager, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  publishScannerHudSnapshot,
  type ScannerHudToolId,
} from "@/components/scanner/scanner-hud-store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";

export type ScannerToolId = ScannerHudToolId;

type ScannerTool = {
  accent: string;
  glow: string;
  icon:
    | "viewfinder"
    | "rectangle.stack.fill"
    | "square.grid.2x2.fill"
    | "photo.on.rectangle.angled";
  id: ScannerToolId;
  label: string;
  shortLabel: string;
  surface: string;
};

export const scannerTools: ScannerTool[] = [
  {
    id: "single",
    label: "Single scan",
    shortLabel: "SINGLE",
    icon: "viewfinder",
    accent: theme.colors.goldBright,
    surface: "rgba(242, 211, 138, 0.15)",
    glow: "rgba(242, 211, 138, 0.44)",
  },
  {
    id: "multi",
    label: "Multi-scan",
    shortLabel: "MULTI",
    icon: "rectangle.stack.fill",
    accent: theme.colors.scannerCyan,
    surface: "rgba(88, 223, 232, 0.14)",
    glow: "rgba(88, 223, 232, 0.42)",
  },
  {
    id: "batch",
    label: "Batch-scan",
    shortLabel: "BATCH",
    icon: "square.grid.2x2.fill",
    accent: theme.colors.scannerViolet,
    surface: "rgba(141, 114, 255, 0.15)",
    glow: "rgba(141, 114, 255, 0.42)",
  },
  {
    id: "upload",
    label: "Upload photo",
    shortLabel: "UPLOAD",
    icon: "photo.on.rectangle.angled",
    accent: theme.colors.cream,
    surface: "rgba(247, 242, 232, 0.12)",
    glow: "rgba(247, 242, 232, 0.32)",
  },
];

type ScannerToolCarouselProps = {
  badges?: Partial<Record<ScannerToolId, number>>;
  disabled?: boolean;
  onActivate: (tool: ScannerToolId) => void;
  onSelect: (tool: ScannerToolId) => void;
  selectedTool: ScannerToolId;
};

type ToolControlLayer = "foreground" | "rail";

type ToolControlProps = {
  badge?: number;
  controlCoreSize: number;
  controlSize: number;
  disabled: boolean;
  hidden: boolean;
  index: number;
  layer: ToolControlLayer;
  onActivate: () => void;
  position: SharedValue<number>;
  railY: number;
  selected: boolean;
  tool: ScannerTool;
  wheelRadius: number;
};

const COMPACT_SCALE = 0.54;
const RAIL_LAYER = 20;
const FOREGROUND_LAYER = 40;
const RAIL_CROSSOVER_DEPTH = 0.56;
const TOOL_COUNT = scannerTools.length;
const SPRING = {
  damping: 20,
  stiffness: 240,
  mass: 0.8,
  overshootClamping: true,
} as const;

function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function activationHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function ToolControl({
  badge,
  controlCoreSize,
  controlSize,
  disabled,
  hidden,
  index,
  layer,
  onActivate,
  position,
  railY,
  selected,
  tool,
  wheelRadius,
}: ToolControlProps) {
  const direction = I18nManager.isRTL ? -1 : 1;

  const animatedStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const angle = wrappedDelta * ((Math.PI * 2) / TOOL_COUNT);
    const depth = Math.cos(angle);
    const orbitX = Math.sin(angle) * wheelRadius * direction;
    const orbitY = (1 - depth) * railY;
    const orbitOpacity = interpolate(
      depth,
      [-1, -0.55, 0, 1],
      [0, 0, 0.78, 1],
      "clamp",
    );
    const layerOpacity =
      layer === "rail"
        ? interpolate(depth, [RAIL_CROSSOVER_DEPTH, 0.76], [1, 0], "clamp")
        : interpolate(
            depth,
            [0.42, RAIL_CROSSOVER_DEPTH, 0.82, 1],
            [0, 0.18, 0.9, 1],
            "clamp",
          );

    return {
      opacity: orbitOpacity * layerOpacity,
      zIndex: layer === "foreground" ? FOREGROUND_LAYER : 1,
      transform: [
        { translateX: orbitX },
        { translateY: orbitY },
        { rotateZ: `${wrappedDelta * 8 * direction}deg` },
        {
          scale: interpolate(
            depth,
            [-1, 0, 1],
            [0.28, COMPACT_SCALE, 1],
            "clamp",
          ),
        },
      ],
    };
  }, [direction, index, layer, railY, wheelRadius]);

  const animatedGlowStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const angle = wrappedDelta * ((Math.PI * 2) / TOOL_COUNT);
    const depth = Math.cos(angle);

    return {
      opacity: interpolate(depth, [0.5, 0.82, 1], [0, 0.28, 1], "clamp"),
    };
  }, [index, position]);

  const concealedByRail = layer === "rail" || hidden || !selected;
  const badgeSize = Math.max(20, controlSize * 0.24);

  return (
    <Animated.View
      accessibilityElementsHidden={concealedByRail}
      importantForAccessibility={
        concealedByRail ? "no-hide-descendants" : "auto"
      }
      pointerEvents={concealedByRail ? "none" : "auto"}
      style={[
        styles.controlPosition,
        { width: controlSize, height: controlSize },
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityHint="Activates the selected scanner mode"
        accessibilityLabel={`${tool.label}, activate`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: disabled || concealedByRail,
          selected,
        }}
        disabled={disabled || concealedByRail}
        onPress={onActivate}
        style={({ pressed }) => [
          styles.control,
          {
            width: controlSize,
            height: controlSize,
            borderRadius: controlSize / 2,
            borderColor: tool.accent,
            backgroundColor: "rgba(3, 7, 12, 0.94)",
            boxShadow: `0 0 16px ${tool.glow}, inset 0 0 18px ${tool.surface}`,
          },
          pressed && styles.controlPressed,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.focusGlow,
            {
              borderRadius: controlSize / 2,
              borderColor: tool.accent,
              boxShadow: `0 0 32px ${tool.glow}, inset 0 0 20px ${tool.surface}`,
            },
            animatedGlowStyle,
          ]}
        />

        <View
          pointerEvents="none"
          style={[
            styles.controlCore,
            {
              width: controlCoreSize,
              height: controlCoreSize,
              borderRadius: controlCoreSize / 2,
              borderColor: `${tool.accent}A8`,
              backgroundColor: tool.surface,
            },
          ]}
        >
          <IconSymbol
            color={tool.accent}
            name={tool.icon}
            size={Math.round(controlCoreSize * 0.58)}
          />
        </View>

        {badge ? (
          <View
            pointerEvents="none"
            style={[
              styles.badge,
              {
                minWidth: badgeSize,
                height: badgeSize,
                borderColor: tool.accent,
              },
            ]}
          >
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function ScannerToolCarousel({
  badges,
  disabled = false,
  onActivate,
  onSelect,
  selectedTool,
}: ScannerToolCarouselProps) {
  const {
    controlDockWidth,
    moderateScale,
    scannerCarouselHeight,
    scannerControlSize,
    scannerRailHeight,
    scannerRailTop,
    scannerRailWidth,
    scannerWheelRadius,
  } = useResponsiveLayout();

  const selectedIndex = scannerTools.findIndex(
    (tool) => tool.id === selectedTool,
  );
  const committedPosition = useSharedValue(Math.max(0, selectedIndex));
  const position = useSharedValue(Math.max(0, selectedIndex));
  const dragStart = useSharedValue(Math.max(0, selectedIndex));
  const direction = I18nManager.isRTL ? -1 : 1;
  const controlCoreSize = scannerControlSize * 0.72;
  const dragDistance = moderateScale(140, 0.65);
  const dragThreshold = moderateScale(44, 0.45);
  const velocityThreshold = moderateScale(650, 0.25);
  const selected = scannerTools[Math.max(0, selectedIndex)] ?? scannerTools[0];

  useEffect(() => {
    publishScannerHudSnapshot({
      selectedTool,
      badges: {
        single: badges?.single,
        multi: badges?.multi,
        batch: badges?.batch,
        upload: badges?.upload,
      },
    });
  }, [
    badges?.batch,
    badges?.multi,
    badges?.single,
    badges?.upload,
    selectedTool,
  ]);

  useEffect(() => {
    const nextIndex = Math.max(
      0,
      scannerTools.findIndex((tool) => tool.id === selectedTool),
    );
    const currentPosition = Math.round(committedPosition.value);
    const currentIndex = modulo(currentPosition, TOOL_COUNT);
    let step = nextIndex - currentIndex;

    if (step > TOOL_COUNT / 2) step -= TOOL_COUNT;
    if (step < -TOOL_COUNT / 2) step += TOOL_COUNT;

    const nextPosition = currentPosition + step;
    if (nextPosition === currentPosition) return;

    committedPosition.value = nextPosition;
    position.value = withSpring(nextPosition, SPRING);
  }, [committedPosition, position, selectedTool]);

  const commitMode = useCallback(
    (nextPosition: number) => {
      const nextIndex = modulo(Math.round(nextPosition), TOOL_COUNT);
      const nextTool = scannerTools[nextIndex];
      if (!nextTool || nextTool.id === selectedTool) return;
      selectionHaptic();
      onSelect(nextTool.id);
    },
    [onSelect, selectedTool],
  );

  const activateSelected = useCallback(() => {
    if (disabled) return;
    activationHaptic();
    onActivate(selected.id);
  }, [disabled, onActivate, selected.id]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          cancelAnimation(position);
          dragStart.value = position.value;
        })
        .onUpdate(({ translationX }) => {
          const progress = Math.min(
            1,
            Math.max(-1, -(direction * translationX) / dragDistance),
          );
          position.value = dragStart.value + progress;
        })
        .onEnd(({ translationX, velocityX }) => {
          const intent = -direction * (translationX + velocityX * 0.12);
          const passed =
            Math.abs(translationX) > dragThreshold ||
            Math.abs(velocityX) > velocityThreshold;
          const step = passed ? (intent > 0 ? 1 : -1) : 0;
          const previousPosition = committedPosition.value;
          const nextPosition = previousPosition + step;

          committedPosition.value = nextPosition;
          position.value = withSpring(nextPosition, SPRING);

          if (nextPosition !== previousPosition) {
            scheduleOnRN(commitMode, nextPosition);
          }
        })
        .onFinalize((_event, success) => {
          if (!success) {
            position.value = withSpring(committedPosition.value, SPRING);
          }
        }),
    [
      commitMode,
      committedPosition,
      direction,
      disabled,
      dragDistance,
      dragStart,
      dragThreshold,
      position,
      velocityThreshold,
    ],
  );

  const controlProps = {
    controlCoreSize,
    controlSize: scannerControlSize,
    position,
    railY: scannerRailTop,
    wheelRadius: scannerWheelRadius,
  } as const;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.root,
          { width: controlDockWidth, height: scannerCarouselHeight },
          disabled && styles.rootDisabled,
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.hudPanel,
            {
              top: Math.max(0, scannerRailTop - 9),
              width: Math.min(controlDockWidth, scannerRailWidth + 18),
              height: scannerRailHeight + 18,
            },
          ]}
        >
          <View style={styles.hudAccent} />
          <View style={styles.hudBloom} />
          <View style={styles.hudTopRule} />
          <View style={styles.hudTelemetry}>
            <Text style={styles.hudKicker}>SCANNER WHEEL</Text>
            <Text style={[styles.hudMode, { color: selected.accent }]}> 
              {selected.shortLabel} // ARMED
            </Text>
          </View>
          <View style={styles.hudTicks}>
            {scannerTools.map((tool) => (
              <View
                key={`tick-${tool.id}`}
                style={[
                  styles.hudTick,
                  tool.id === selectedTool && {
                    width: 18,
                    backgroundColor: selected.accent,
                    boxShadow: `0 0 8px ${selected.glow}`,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <View
          pointerEvents="none"
          style={[
            styles.rail,
            {
              top: scannerRailTop,
              width: scannerRailWidth,
              height: scannerRailHeight,
            },
          ]}
        >
          <View
            style={[
              styles.railOrbit,
              {
                top: -scannerRailHeight * 0.62,
                width: scannerRailWidth * 0.82,
                height: scannerRailHeight * 1.6,
              },
            ]}
          />

          <View
            style={[
              styles.railWheelCanvas,
              {
                top: -scannerRailTop,
                height: scannerCarouselHeight,
              },
            ]}
          >
            {scannerTools.map((tool, index) => {
              const offset = modulo(
                index - Math.max(0, selectedIndex),
                TOOL_COUNT,
              );
              const hidden = offset === TOOL_COUNT / 2;

              return (
                <ToolControl
                  {...controlProps}
                  badge={badges?.[tool.id]}
                  disabled
                  hidden={hidden}
                  index={index}
                  key={`rail-${tool.id}`}
                  layer="rail"
                  onActivate={() => undefined}
                  selected={false}
                  tool={tool}
                />
              );
            })}
          </View>
          <View style={styles.railShade} />
          <View style={styles.railNotch} />
        </View>

        {scannerTools.map((tool, index) => {
          const offset = modulo(
            index - Math.max(0, selectedIndex),
            TOOL_COUNT,
          );
          const hidden = offset === TOOL_COUNT / 2;

          return (
            <ToolControl
              {...controlProps}
              badge={badges?.[tool.id]}
              disabled={disabled}
              hidden={hidden}
              index={index}
              key={tool.id}
              layer="foreground"
              onActivate={activateSelected}
              selected={tool.id === selectedTool}
              tool={tool}
            />
          );
        })}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
  },
  rootDisabled: {
    opacity: 0.58,
  },
  hudPanel: {
    position: "absolute",
    zIndex: 8,
    overflow: "hidden",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.48)",
    backgroundColor: "rgba(3, 7, 12, 0.94)",
    experimental_backgroundImage: `
      radial-gradient(circle at 100% 0%, rgba(141, 114, 255, 0.20) 0%, transparent 42%),
      linear-gradient(115deg, rgba(88, 223, 232, 0.10) 0%, rgba(3, 7, 12, 0.02) 54%)
    `,
    boxShadow:
      "0 0 28px rgba(88, 223, 232, 0.16), 0 10px 28px rgba(0, 0, 0, 0.52)",
  },
  hudAccent: {
    position: "absolute",
    top: 10,
    bottom: 10,
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 10px rgba(88, 223, 232, 0.88)",
  },
  hudBloom: {
    position: "absolute",
    top: -32,
    right: -28,
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: "rgba(141, 114, 255, 0.07)",
  },
  hudTopRule: {
    position: "absolute",
    top: 0,
    right: 24,
    left: 24,
    height: 1,
    experimental_backgroundImage:
      "linear-gradient(90deg, transparent 0%, rgba(88, 223, 232, 0.54) 35%, rgba(141, 114, 255, 0.48) 72%, transparent 100%)",
  },
  hudTelemetry: {
    position: "absolute",
    right: 18,
    bottom: 11,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  hudKicker: {
    color: "rgba(247, 242, 232, 0.48)",
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 1.1,
  },
  hudMode: {
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.9,
  },
  hudTicks: {
    position: "absolute",
    right: 18,
    bottom: 3,
    left: 18,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  hudTick: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(247, 242, 232, 0.18)",
  },
  rail: {
    position: "absolute",
    zIndex: RAIL_LAYER,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.18)",
    backgroundColor: "rgba(2, 5, 9, 0.40)",
    boxShadow: "inset 0 0 24px rgba(0, 0, 0, 0.54)",
  },
  railOrbit: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(141, 114, 255, 0.20)",
    transform: [{ scaleY: 0.64 }],
  },
  railWheelCanvas: {
    position: "absolute",
    right: 0,
    left: 0,
    zIndex: 2,
    alignItems: "center",
  },
  railShade: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
    experimental_backgroundImage: `
      linear-gradient(180deg, rgba(0, 0, 0, 0.46) 0%, transparent 34%, rgba(0, 0, 0, 0.22) 100%)
    `,
  },
  railNotch: {
    position: "absolute",
    top: 7,
    zIndex: 4,
    alignSelf: "center",
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(88, 223, 232, 0.34)",
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.34)",
  },
  controlPosition: {
    position: "absolute",
    top: 0,
  },
  control: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  controlPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  focusGlow: {
    position: "absolute",
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
    borderWidth: 2,
  },
  controlCore: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    backgroundColor: "rgba(3, 7, 12, 0.96)",
  },
  badgeText: {
    color: theme.colors.cream,
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
});
