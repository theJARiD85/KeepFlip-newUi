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
  anchorY: number;
  badge?: number;
  centerX: number;
  controlCoreSize: number;
  controlSize: number;
  disabled: boolean;
  index: number;
  onActivate: () => void;
  orbitDepthY: number;
  orbitDepthZ: number;
  orbitRadiusX: number;
  position: SharedValue<number>;
  selected: boolean;
  tool: ScannerTool;
};

const TOOL_COUNT = scannerTools.length;
const MAX_VISIBLE_PROGRESS = 1.22;
const CYLINDER_MAX_ANGLE = Math.PI * 0.42;
const SIDE_SCALE = 0.48;
const ACTIVE_SCALE = 1.12;

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
  anchorY,
  badge,
  centerX,
  controlCoreSize,
  controlSize,
  disabled,
  index,
  onActivate,
  orbitDepthY,
  orbitDepthZ,
  orbitRadiusX,
  position,
  selected,
  tool,
}: ToolControlProps) {
  const direction = I18nManager.isRTL ? -1 : 1;

  const orbitStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const distance = Math.abs(wrappedDelta);
    const clampedProgress = Math.max(
      -MAX_VISIBLE_PROGRESS,
      Math.min(MAX_VISIBLE_PROGRESS, wrappedDelta),
    );

    /*
     * The tool is mounted to the OUTSIDE of a virtual cylinder:
     * its back faces the cylinder wall and its front-facing normal points
     * radially outward. Position and face rotation therefore use the exact
     * same cylinder angle. This prevents the icon from counter-spinning.
     */
    const cylinderAngle =
      clampedProgress * CYLINDER_MAX_ANGLE * direction;
    const orbitX = Math.sin(cylinderAngle) * orbitRadiusX;
    const orbitY = -(1 - Math.cos(cylinderAngle)) * orbitDepthY;
    const orbitZ = (Math.cos(cylinderAngle) - 1) * orbitDepthZ;
    const opacity = interpolate(
      distance,
      [0, 0.55, 0.92, 1.08, MAX_VISIBLE_PROGRESS],
      [1, 0.78, 0.42, 0.14, 0],
      "clamp",
    );
    const scale = interpolate(
      distance,
      [0, 0.62, 1, MAX_VISIBLE_PROGRESS],
      [ACTIVE_SCALE, 0.84, SIDE_SCALE, 0.36],
      "clamp",
    );

    return {
      opacity,
      zIndex: Math.round(
        interpolate(distance, [0, MAX_VISIBLE_PROGRESS], [100, 1], "clamp"),
      ),
      transform: [
        { perspective: 760 },
        { translateX: orbitX },
        { translateY: orbitY },
        { scale },
      ],
    };
  }, [
    direction,
    index,
    orbitDepthY,
    orbitDepthZ,
    orbitRadiusX,
    position,
  ]);

  const cylinderFaceStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const clampedProgress = Math.max(
      -MAX_VISIBLE_PROGRESS,
      Math.min(MAX_VISIBLE_PROGRESS, wrappedDelta),
    );
    const cylinderAngle =
      clampedProgress * CYLINDER_MAX_ANGLE * direction;
    const rotationDegrees = cylinderAngle * (180 / Math.PI);

    return {
      transform: [
        { perspective: 760 },
        { rotateY: `${rotationDegrees}deg` },
      ],
    };
  }, [direction, index, position]);

  const animatedIconOpacity = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) -
      halfCount;
    const distance = Math.abs(wrappedDelta);

    return {
      opacity: interpolate(
        distance,
        [0, 0.65, 1, MAX_VISIBLE_PROGRESS],
        [0.92, 0.7, 0.42, 0],
        "clamp",
      ),
    };
  }, [index, position]);

  const concealed = !selected;
  const badgeSize = Math.max(20, controlSize * 0.24);
  const iconSize = Math.round(controlCoreSize * 0.58);

  return (
    <Animated.View
      accessibilityElementsHidden={concealed}
      importantForAccessibility={concealed ? "no-hide-descendants" : "auto"}
      pointerEvents={concealed ? "none" : "auto"}
      style={[
        styles.controlPosition,
        {
          width: controlSize,
          height: controlSize,
          left: centerX,
          top: anchorY,
        },
        orbitStyle,
      ]}
    >
      <Animated.View style={[styles.cylinderFace, cylinderFaceStyle]}>
        <Pressable
        accessibilityHint="Activates the selected scanner mode"
        accessibilityLabel={`${tool.label}, activate`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: disabled || concealed,
          selected,
        }}
        disabled={disabled || concealed}
        onPress={onActivate}
        style={({ pressed }) => [
          styles.control,
          {
            width: controlSize,
            height: controlSize,
            borderColor: tool.accent,
            borderWidth: 3,
            borderRadius: controlSize / 2,
            boxShadow: selected
              ? `0 0 24px ${tool.glow}`
              : `0 0 10px ${tool.glow}`,
          },
          pressed && styles.controlPressed,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.iconStack,
            {
              width: controlCoreSize,
              height: controlCoreSize,
            },
            animatedIconOpacity,
          ]}
        >
          <View style={[styles.iconGhost, styles.iconGhostCyan]}>
            <IconSymbol color="#4FEFFF" name={tool.icon} size={iconSize} />
          </View>

          <View style={[styles.iconGhost, styles.iconGhostViolet]}>
            <IconSymbol color="#A885FF" name={tool.icon} size={iconSize} />
          </View>

          <IconSymbol color={tool.accent} name={tool.icon} size={iconSize} />
        </Animated.View>

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
  const centerX = Math.max(0, (controlDockWidth - scannerControlSize) / 2);
  const bottomInset = moderateScale(8, 0.3);
  const anchorY = Math.max(
    0,
    scannerCarouselHeight - scannerControlSize - bottomInset,
  );
  const orbitDepthY = Math.max(
    moderateScale(18, 0.35),
    Math.min(
      scannerControlSize * 0.5,
      Math.max(0, anchorY - moderateScale(4, 0.25)),
    ),
  );
  const orbitRadiusX = Math.max(
    scannerControlSize * 1.65,
    Math.min(
      scannerWheelRadius,
      Math.max(0, (controlDockWidth - scannerControlSize) * 0.46),
    ),
  );
  const orbitDepthZ = Math.max(
    scannerControlSize * 0.62,
    orbitRadiusX * 0.74,
  );

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
          position.value = withSpring(
            nextPosition,
            SPRING,
            (finished) => {
              if (finished && nextPosition !== previousPosition) {
                scheduleOnRN(commitMode, nextPosition);
              }
            },
          );
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
    anchorY,
    centerX,
      controlCoreSize,
    controlSize: scannerControlSize,
    orbitDepthY,
    orbitDepthZ,
    orbitRadiusX,
    position,
  } as const;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.root,
          {
            width: controlDockWidth,
            height: scannerCarouselHeight,
          },
          disabled && styles.rootDisabled,
        ]}
      >
        {scannerTools.map((tool, index) => (
          <ToolControl
            {...controlProps}
            badge={badges?.[tool.id]}
            disabled={disabled}
            index={index}
            key={tool.id}
            onActivate={activateSelected}
            selected={tool.id === selectedTool}
            tool={tool}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    overflow: "visible",
  },
  rootDisabled: {
    opacity: 0.58,
  },
  controlPosition: {
    position: "absolute",
  },
  cylinderFace: {
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
  },
  control: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  controlPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  iconStack: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconGhost: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  iconGhostCyan: {
    opacity: 0.3,
    transform: [{ translateX: -1.2 }],
  },
  iconGhostViolet: {
    opacity: 0.24,
    transform: [{ translateX: 1.2 }],
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: theme.radii.pill,
    borderWidth: 3,
    borderColor: '4FEFFF',
    backgroundColor: "rgba(3, 7, 12, 0.9)",
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.32)",
  },
  badgeText: {
    color: theme.colors.cream,
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
});
