import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo } from "react";
import {
  I18nManager,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { HUDSkiaPlatterRing } from "@/components/scanner/hud-skia-platter-ring.native";
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
    | "barcode.viewfinder"
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
    glow: "rgba(242, 211, 138, 0.5)",
  },
  {
    id: "barcode",
    label: "Barcode scanner",
    icon: "barcode.viewfinder",
    accent: theme.colors.scannerCyan,
    surface: "rgba(141, 114, 255, 0.16)",
    glow: "rgba(88, 223, 232, 0.5)",
  },
  {
    id: "multi",
    label: "Multi-scan",
    icon: "rectangle.stack.fill",
    accent: theme.colors.scannerMagenta,
    surface: "rgba(88, 223, 232, 0.14)",
    glow: "rgba(255, 0, 127, 0.5)",
  },
  {
    id: "batch",
    label: "Batch-scan",
    icon: "square.grid.2x2.fill",
    accent: theme.colors.cream,
    surface: "rgba(247, 242, 232, 0.12)",
    glow: "rgba(247, 242, 232, 0.5)",
  },
  {
    id: "upload",
    label: "Upload photo",
    icon: "photo.on.rectangle.angled",
    accent: theme.colors.scannerViolet,
    surface: "rgba(141, 114, 255, 0.15)",
    glow: "rgba(141, 114, 255, 0.5)",

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
  onSelect: () => void;
  orbitDepthY: number;
  orbitRadiusX: number;
  position: SharedValue<number>;
  selected: boolean;
  tool: ScannerTool;
};

const TOOL_COUNT = scannerTools.length;
const TOOL_ACCENTS = scannerTools.map((tool) => tool.accent);
const MAX_VISIBLE_PROGRESS = 1.35;
const ARC_STEP_RADIANS = Math.PI / 5;
const ACTIVE_SCALE = 1.16;
const SIDE_SCALE = 0.78;

const SPRING = {
  damping: 18,
  stiffness: 170,
  mass: 0.82,
  overshootClamping: true,
} as const;

function modulo(value: number, divisor: number) {
  "worklet";
  return ((value % divisor) + divisor) % divisor;
}

function wrappedDelta(
  index: number,
  position: number,
  count: number,
) {
  "worklet";

  const halfCount = count / 2;
  const rawDelta = index - position;

  return (
    ((((rawDelta + halfCount) % count) + count) % count) -
    halfCount
  );
}

function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function activationHaptic() {
  void Haptics.impactAsync(
    Haptics.ImpactFeedbackStyle.Light,
  ).catch(() => undefined);
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
  onSelect,
  orbitDepthY,
  orbitRadiusX,
  position,
  selected,
  tool,
}: ToolControlProps) {
  const direction = I18nManager.isRTL ? -1 : 1;
  const concealed = selected === false && false;
  const badgeSize = Math.max(20, controlSize * 0.24);
  const iconSize = Math.round(controlCoreSize * 0.58);

  const orbitalStyle = useAnimatedStyle(() => {
    const delta = wrappedDelta(
      index,
      position.value,
      TOOL_COUNT,
    );
    const distance = Math.abs(delta);
    const clampedDelta = Math.max(
      -MAX_VISIBLE_PROGRESS,
      Math.min(MAX_VISIBLE_PROGRESS, delta),
    );
    const angularPosition =
      clampedDelta * ARC_STEP_RADIANS * direction;

    const xCoord =
      orbitRadiusX * Math.sin(angularPosition);
    const yCoord =
      -(1 - Math.cos(angularPosition)) * orbitDepthY;

    const scale = interpolate(
      distance,
      [0, 0.68, 1, MAX_VISIBLE_PROGRESS],
      [ACTIVE_SCALE, 0.92, SIDE_SCALE, 0.48],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      distance,
      [0, 0.5, MAX_VISIBLE_PROGRESS],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );

    const rotateY = interpolate(
      clampedDelta,
      [-1, 0, 1],
      [75, 0, -75],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      zIndex: Math.round(
        interpolate(
          distance,
          [0, MAX_VISIBLE_PROGRESS],
          [100, 1],
          Extrapolation.CLAMP,
        ),
      ),
      transform: [
        { perspective: 760 },
        { translateX: xCoord },
        { translateY: yCoord },
        { scale },
        { rotateY: `${rotateY}deg` },
      ],
    };
  }, [
    direction,
    index,
    orbitDepthY,
    orbitRadiusX,
    position,
  ]);

  const iconOpacityStyle = useAnimatedStyle(() => {
    const distance = Math.abs(
      wrappedDelta(index, position.value, TOOL_COUNT),
    );

    return {
      opacity: interpolate(
        distance,
        [0, 0.5, MAX_VISIBLE_PROGRESS],
        [1, 0.5, 0],
        Extrapolation.CLAMP,
      ),
    };
  }, [index, position]);

  return (
    <Animated.View
      accessibilityElementsHidden={concealed}
      importantForAccessibility={
        concealed ? "no-hide-descendants" : "auto"
      }
      pointerEvents={concealed ? "none" : "auto"}
      style={[
        styles.controlPosition,
        {
          width: controlSize,
          height: controlSize,
          left: centerX,
          top: anchorY,
        },
        orbitalStyle,
        iconOpacityStyle,
      ]}
    >
      <Pressable
        accessibilityHint="Activates the selected scanner mode"
        accessibilityLabel={`${tool.label}, activate`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: disabled || concealed,
          selected,
        }}
        disabled={disabled || concealed}
        onPress={() => {
          if (!selected) {
            onSelect();
            return;
          }
        
          onActivate();
        }}
        style={({ pressed }) => [
          styles.control,
          {
            width: controlSize,
            height: controlSize,
            borderColor: tool.accent,
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
             iconOpacityStyle,
              orbitalStyle,
          ]}
        >
          <View
            style={[
              styles.iconGhost,
              styles.iconGhostCyan,
            ]}
          >
            <IconSymbol
              color="#4FEFFF"
              name={tool.icon}
              size={iconSize}
            />
          </View>

          <View
            style={[
              styles.iconGhost,
              styles.iconGhostViolet,
            ]}
          >
            <IconSymbol
              color="#A885FF"
              name={tool.icon}
              size={iconSize}
            />
          </View>

          <IconSymbol
            color={tool.accent}
            name={tool.icon}
            size={iconSize}
          />
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
            <Text style={styles.badgeText}>
              {badge > 99 ? "99+" : badge}
            </Text>
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
    scannerWheelRadius,
  } = useResponsiveLayout();

  const selectedIndex = Math.max(
    0,
    scannerTools.findIndex(
      (tool) => tool.id === selectedTool,
    ),
  );

  const selected =
    scannerTools[selectedIndex] ?? scannerTools[0];

  const committedPosition = useSharedValue(selectedIndex);
  const position = useSharedValue(selectedIndex);
  const dragStart = useSharedValue(selectedIndex);

  const direction = I18nManager.isRTL ? -1 : 1;
  const controlCoreSize = scannerControlSize * 0.72;
  const dragDistance = moderateScale(140, 0.65);
  const dragThreshold = moderateScale(44, 0.45);
  const velocityThreshold = moderateScale(650, 0.25);

  const centerX = Math.max(
    0,
    (controlDockWidth - scannerControlSize) / 2,
  );

  const bottomInset = moderateScale(8, 0.3);
  const toolLift = moderateScale(18, 0.35);

  // Keep a stable base position for the platter, then lift only the tools.
  const baseAnchorY = Math.max(
    0,
    scannerCarouselHeight -
      scannerControlSize -
      bottomInset,
  );

  const anchorY = Math.max(
    0,
    baseAnchorY - toolLift,
  );

  /*
   * One shared virtual ellipse drives both the Skia platter and the tool nodes.
   * The platter width is derived from the orbit radius, not calculated
   * independently, so the controls appear attached to the platter track.
   */
  const platterHorizontalInset = moderateScale(8, 0.2);
  const platterVerticalInset = moderateScale(6, 0.2);
  const availablePlatterWidth = Math.max(
    0,
    controlDockWidth - moderateScale(12, 0.2),
  );

  const maximumOrbitRadiusX = Math.max(
    0,
    availablePlatterWidth / 2 - platterHorizontalInset,
  );

  const desiredOrbitRadiusX = Math.max(
    scannerControlSize * 1.62,
    scannerWheelRadius,
  );

  const orbitRadiusX = Math.min(
    desiredOrbitRadiusX,
    maximumOrbitRadiusX,
  );

  const platterWidth =
    orbitRadiusX * 2 + platterHorizontalInset * 2;

  const platterHeight = Math.max(
    moderateScale(48, 0.4),
    scannerControlSize * 0.46,
  );

  const platterRadiusY = Math.max(
    0,
    platterHeight / 2 - platterVerticalInset,
  );

  // Exact ellipse relationship:
  // y = -radiusY * (1 - cos(angle))
  const orbitDepthY = platterRadiusY;

  const platterLeft = Math.max(
    0,
    (controlDockWidth - platterWidth) / 2,
  );

  const platterTop = Math.max(
    0,
    Math.min(
      scannerCarouselHeight - platterHeight,
      baseAnchorY + scannerControlSize * 0.68,
    ),
  );

  useEffect(() => {
    publishScannerHudSnapshot({
      selectedTool,
      badges: {
        single: badges?.single,
        barcode: badges?.barcode,
        multi: badges?.multi,
        batch: badges?.batch,
        upload: badges?.upload,
      },
    });
  }, [
    badges?.batch,
    badges?.barcode,
    badges?.multi,
    badges?.single,
    badges?.upload,
    selectedTool,
  ]);

  useEffect(() => {
    const currentPosition = Math.round(
      committedPosition.value,
    );
    const currentIndex = modulo(
      currentPosition,
      TOOL_COUNT,
    );

    let step = selectedIndex - currentIndex;

    if (step > TOOL_COUNT / 2) {
      step -= TOOL_COUNT;
    }

    if (step < -TOOL_COUNT / 2) {
      step += TOOL_COUNT;
    }

    const nextPosition = currentPosition + step;
    if (nextPosition === currentPosition) return;

    committedPosition.value = nextPosition;
    position.value = withSpring(nextPosition, SPRING);
  }, [
    committedPosition,
    position,
    selectedIndex,
  ]);

  const commitMode = useCallback(
    (nextPosition: number) => {
      const nextIndex = modulo(
        Math.round(nextPosition),
        TOOL_COUNT,
      );
      const nextTool = scannerTools[nextIndex];

      if (!nextTool || nextTool.id === selectedTool) {
        return;
      }

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
        .failOffsetY([-14, 14])
        .onBegin(() => {
          cancelAnimation(position);
          dragStart.value = position.value;
        })
        .onUpdate(({ translationX }) => {
          const progress = Math.min(
            1,
            Math.max(
              -1,
              -(direction * translationX) /
                dragDistance,
            ),
          );

          position.value = dragStart.value + progress;
        })
        .onEnd(({ translationX, velocityX }) => {
          const intent =
            -direction *
            (translationX + velocityX * 0.12);

          const passed =
            Math.abs(translationX) > dragThreshold ||
            Math.abs(velocityX) > velocityThreshold;

          const step = passed
            ? intent > 0
              ? 1
              : -1
            : 0;

          const previousPosition =
            committedPosition.value;
          const nextPosition =
            previousPosition + step;

          committedPosition.value = nextPosition;
          position.value = withSpring(
            nextPosition,
            SPRING,
            (finished) => {
              if (
                finished &&
                nextPosition !== previousPosition
              ) {
                scheduleOnRN(
                  commitMode,
                  nextPosition,
                );
              }
            },
          );
        })
        .onFinalize((_event, success) => {
          if (!success) {
            position.value = withSpring(
              committedPosition.value,
              SPRING,
            );
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
        <View
          pointerEvents="none"
          style={[
            styles.platterHost,
            {
              width: platterWidth,
              height: platterHeight,
              left: platterLeft,
              top: platterTop,
            },
          ]}
        >
          <HUDSkiaPlatterRing
            accents={TOOL_ACCENTS}
            height={platterHeight}
            position={position}
            radiusX={orbitRadiusX}
            radiusY={platterRadiusY}
            width={platterWidth}
          />
        </View>

        {scannerTools.map((tool, index) => (
          <ToolControl
            {...controlProps}
            badge={badges?.[tool.id]}
            disabled={disabled}
            index={index}
            key={tool.id}
            onActivate={activateSelected}
            onSelect={() => onSelect(tool.id)}
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
    opacity: 0.9,
  },
  platterHost: {
    position: "absolute",
    zIndex: 0,
    top: 5
  },
  controlPosition: {
    position: "absolute",
  },
  control: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
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
    transform: [{ translateX: 1}, {translateY: -1 }],
  },
  iconGhostViolet: {
    opacity: 0.3,
    transform: [{ translateX: -1}, {translateY: 1 }],
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
    backgroundColor: "rgba(3, 7, 12, 0.9)",
    boxShadow:
      "0 0 8px rgba(88, 223, 232, 0.32)",
  },
  badgeText: {
    color: theme.colors.cream,
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
});
