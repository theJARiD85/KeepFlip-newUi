import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
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
  surface: string;
};

export const scannerTools: ScannerTool[] = [
  {
    id: "single",
    label: "Single scan",
    icon: "viewfinder",
    accent: theme.colors.goldBright,
    surface: "rgba(242, 211, 138, 0.15)",
    glow: "rgba(242, 211, 138, 0.44)",
  },
  {
    id: "multi",
    label: "Multi-scan",
    icon: "rectangle.stack.fill",
    accent: theme.colors.scannerCyan,
    surface: "rgba(88, 223, 232, 0.14)",
    glow: "rgba(88, 223, 232, 0.42)",
  },
  {
    id: "batch",
    label: "Batch-scan",
    icon: "square.grid.2x2.fill",
    accent: theme.colors.scannerViolet,
    surface: "rgba(141, 114, 255, 0.15)",
    glow: "rgba(141, 114, 255, 0.42)",
  },
  {
    id: "upload",
    label: "Upload photo",
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

type ToolControlProps = {
  badge?: number;
  controlCoreSize: number;
  controlSize: number;
  disabled: boolean;
  hidden: boolean;
  housingTopY: number;
  index: number;
  onActivate: () => void;
  position: SharedValue<number>;
  railY: number;
  selected: boolean;
  tool: ScannerTool;
  wheelRadius: number;
};

const COMPACT_SCALE = 0.54;
const TOOL_LAYER_BASE = 10;
const HOUSING_TOP_LAYER = 30;
const TOOL_COUNT = scannerTools.length;
const TOOL_TOP_OFFSET = 12;
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
  housingTopY,
  index,
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
    const scale = interpolate(
      depth,
      [-1, 0, 1],
      [0.28, COMPACT_SCALE, 1],
      "clamp",
    );

    // The selected tool intentionally hangs about 75% above the housing.
    // Once an orbiting tool sinks farther than that, fade it over a very
    // short band at the SVG lip instead of letting it drift down the panel.
    const toolBottom = TOOL_TOP_OFFSET + orbitY + controlSize * scale;
    const allowedHousingInset = controlSize * 0.26;
    const fadeDistance = controlSize * 0.16;
    const lipOpacity = interpolate(
      toolBottom,
      [
        housingTopY + allowedHousingInset,
        housingTopY + allowedHousingInset + fadeDistance,
      ],
      [1, 0],
      "clamp",
    );

    return {
      opacity: hidden ? 0 : lipOpacity,
      zIndex: TOOL_LAYER_BASE + Math.round(Math.max(depth, 0) * 10),
      transform: [
        { translateX: orbitX },
        { translateY: orbitY },
        { rotateZ: `${wrappedDelta * 8 * direction}deg` },
        { scale },
      ],
    };
  }, [
    controlSize,
    direction,
    hidden,
    housingTopY,
    index,
    position,
    railY,
    wheelRadius,
  ]);

  const animatedGlowStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const angle = wrappedDelta * ((Math.PI * 2) / TOOL_COUNT);
    const depth = Math.cos(angle);

    return {
      opacity: interpolate(depth, [0.72, 0.9, 1], [0, 0.34, 1], "clamp"),
    };
  }, [index, position]);

  const concealedByHousing = hidden || !selected;
  const badgeSize = Math.max(20, controlSize * 0.24);

  return (
    <Animated.View
      accessibilityElementsHidden={concealedByHousing}
      importantForAccessibility={
        concealedByHousing ? "no-hide-descendants" : "auto"
      }
      pointerEvents={concealedByHousing ? "none" : "auto"}
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
          disabled: disabled || concealedByHousing,
          selected,
        }}
        disabled={disabled || concealedByHousing}
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
    scannerRailTop,
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
  const housingHeight = scannerCarouselHeight * 0.5;
  const housingTopY = scannerCarouselHeight - housingHeight;

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
    housingTopY,
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
        <Image
          accessibilityIgnoresInvertColors
          contentFit="fill"
          pointerEvents="none"
          source={require("@/assets/tool-carousel-bottom.svg")}
          style={[
            styles.housingBottom,
            { height: housingHeight, width: controlDockWidth },
          ]}
        />

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
              onActivate={activateSelected}
              selected={tool.id === selectedTool}
              tool={tool}
            />
          );
        })}

        <Image
          accessibilityIgnoresInvertColors
          contentFit="fill"
          pointerEvents="none"
          source={require("@/assets/tool-carousel-top.svg")}
          style={[
            styles.housingTop,
            { height: housingHeight, width: controlDockWidth },
          ]}
        />
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
  housingBottom: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  housingTop: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: HOUSING_TOP_LAYER,
  },
  controlPosition: {
    position: "absolute",
    top: TOOL_TOP_OFFSET,
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
