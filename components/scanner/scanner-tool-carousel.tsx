import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export type ScannerToolId = 'single' | 'multi' | 'batch' | 'upload' | '3d-scan';

type ScannerTool = {
  accent: string;
  glow: string;
  icon:
    | 'viewfinder'
    | 'rectangle.stack.fill'
    | 'square.grid.2x2.fill'
    | 'photo.on.rectangle.angled'
    | 'cube.transparent';
  id: ScannerToolId;
  label: string;
  surface: string;
};

export const scannerTools: ScannerTool[] = [
  {
    id: 'single',
    label: 'Single scan',
    icon: 'viewfinder',
    accent: theme.colors.goldBright,
    surface: 'rgba(215, 168, 74, 0.18)',
    glow: 'rgba(215, 168, 74, 0.38)',
  },
  {
    id: '3d-scan',
    label: '3D Mesh',
    icon: 'cube.transparent',
    accent: '#00FFD2',
    surface: 'rgba(0, 255, 210, 0.18)',
    glow: 'rgba(0, 255, 210, 0.38)',
  },
  {
    id: 'multi',
    label: 'Multi-scan',
    icon: 'rectangle.stack.fill',
    accent: theme.colors.scannerCyan,
    surface: 'rgba(88, 223, 232, 0.14)',
    glow: 'rgba(88, 223, 232, 0.34)',
  },
  {
    id: 'batch',
    label: 'Batch-scan',
    icon: 'square.grid.2x2.fill',
    accent: theme.colors.scannerViolet,
    surface: 'rgba(141, 114, 255, 0.15)',
    glow: 'rgba(141, 114, 255, 0.34)',
  },
  {
    id: 'upload',
    label: 'Upload photo',
    icon: 'photo.on.rectangle.angled',
    accent: theme.colors.cream,
    surface: 'rgba(250, 239, 207, 0.15)',
    glow: 'rgba(250, 239, 207, 0.34)',
  },
];

type ScannerToolCarouselProps = {
  badges?: Partial<Record<ScannerToolId, number>>;
  disabled?: boolean;
  onActivate: (tool: ScannerToolId) => void;
  onSelect: (tool: ScannerToolId) => void;
  selectedTool: ScannerToolId;
};

type ToolControlLayer = 'foreground' | 'rail';

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
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
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
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) - halfCount;
    const angle = wrappedDelta * ((Math.PI * 2) / TOOL_COUNT);
    const depth = Math.cos(angle);
    const orbitX = Math.sin(angle) * wheelRadius * direction;
    const orbitY = (1 - depth) * railY;
    const orbitOpacity = interpolate(
      depth,
      [-1, -0.55, 0, 1],
      [0, 0, 0.78, 1],
      'clamp',
    );
    const layerOpacity =
      layer === 'rail'
        ? interpolate(depth, [RAIL_CROSSOVER_DEPTH, 0.76], [1, 0], 'clamp')
        : interpolate(
            depth,
            [0.42, RAIL_CROSSOVER_DEPTH, 0.82, 1],
            [0, 0.18, 0.9, 1],
            'clamp',
          );

    return {
      opacity: orbitOpacity * layerOpacity,
      zIndex: layer === 'foreground' ? FOREGROUND_LAYER : 1,
      transform: [
        { translateX: orbitX },
        { translateY: orbitY },
        { rotateZ: `${wrappedDelta * 8 * direction}deg` },
        {
          scale: interpolate(depth, [-1, 0, 1], [0.28, COMPACT_SCALE, 1], 'clamp'),
        },
      ],
    };
  }, [direction, index, layer, railY, wheelRadius]);

  const animatedGlowStyle = useAnimatedStyle(() => {
    const rawDelta = index - position.value;
    const halfCount = TOOL_COUNT / 2;
    const wrappedDelta =
      ((((rawDelta + halfCount) % TOOL_COUNT) + TOOL_COUNT) % TOOL_COUNT) - halfCount;
    const angle = wrappedDelta * ((Math.PI * 2) / TOOL_COUNT);
    const depth = Math.cos(angle);

    return {
      opacity: interpolate(depth, [0.5, 0.82, 1], [0, 0.28, 1], 'clamp'),
    };
  }, [index]);

  const concealedByRail = layer === 'rail' || hidden || !selected;
  const badgeSize = Math.max(22, controlSize * 0.26);

  return (
    <Animated.View
      accessibilityElementsHidden={concealedByRail}
      importantForAccessibility={concealedByRail ? 'no-hide-descendants' : 'auto'}
      pointerEvents={concealedByRail ? 'none' : 'auto'}
      style={[
        styles.controlPosition,
        { width: controlSize, height: controlSize },
        animatedStyle,
      ]}>
      <Pressable
        accessibilityLabel={`${tool.label}, activate`}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || concealedByRail, selected }}
        disabled={disabled || concealedByRail}
        onPress={onActivate}
        style={({ pressed }) => [
          styles.control,
          {
            width: controlSize,
            height: controlSize,
            borderRadius: controlSize / 2,
            borderColor: tool.accent,
            backgroundColor: tool.surface,
            boxShadow: `0 0 12px ${tool.glow}`,
          },
          pressed && styles.controlPressed,
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.focusGlow,
            {
              borderRadius: controlSize / 2,
              borderColor: tool.accent,
              boxShadow: `0 0 30px ${tool.glow}, inset 0 0 18px ${tool.surface}`,
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
              borderColor: tool.accent,
              backgroundColor: tool.surface,
            },
          ]}>
          <IconSymbol
            color={tool.accent}
            name={tool.icon}
            size={Math.round(controlCoreSize * 0.62)}
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
            ]}>
            <Animated.Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Animated.Text>
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
  const selectedIndex = scannerTools.findIndex((tool) => tool.id === selectedTool);
  const committedPosition = useSharedValue(Math.max(0, selectedIndex));
  const position = useSharedValue(Math.max(0, selectedIndex));
  const dragStart = useSharedValue(Math.max(0, selectedIndex));
  const direction = I18nManager.isRTL ? -1 : 1;
  const controlCoreSize = scannerControlSize * 0.744;
  const dragDistance = moderateScale(140, 0.65);
  const dragThreshold = moderateScale(44, 0.45);
  const velocityThreshold = moderateScale(650, 0.25);

  useEffect(() => {
    const nextIndex = Math.max(0, scannerTools.findIndex((tool) => tool.id === selectedTool));
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
            Math.abs(translationX) > dragThreshold || Math.abs(velocityX) > velocityThreshold;
          const step = passed ? (intent > 0 ? 1 : -1) : 0;
          const previousPosition = committedPosition.value;
          const nextPosition = previousPosition + step;

          committedPosition.value = nextPosition;
          position.value = withSpring(nextPosition, SPRING);

          if (nextPosition !== previousPosition) scheduleOnRN(commitMode, nextPosition);
        })
        .onFinalize((_event, success) => {
          if (!success) position.value = withSpring(committedPosition.value, SPRING);
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
        ]}>
        <View
          pointerEvents="none"
          style={[
            styles.rail,
            {
              top: scannerRailTop,
              width: scannerRailWidth,
              height: scannerRailHeight,
            },
          ]}>
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
            ]}>
            {scannerTools.map((tool, index) => {
              const offset = modulo(index - Math.max(0, selectedIndex), TOOL_COUNT);
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
          <View style={styles.railHighlight} />
          <View style={styles.railNotch} />
        </View>

        {scannerTools.map((tool, index) => {
          const offset = modulo(index - Math.max(0, selectedIndex), TOOL_COUNT);
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
              onActivate={() => onActivate(tool.id)}
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
    alignItems: 'center',
  },
  rootDisabled: {
    opacity: 0.58,
  },
  rail: {
    position: 'absolute',
    zIndex: RAIL_LAYER,
    overflow: 'hidden',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(215, 168, 74, 0.26)',
    backgroundColor: 'rgba(5, 5, 9, 0.90)',
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 0%, rgba(215, 168, 74, 0.10) 0%, transparent 42%),
      linear-gradient(180deg, rgba(17, 14, 21, 0.96) 0%, rgba(3, 3, 6, 0.98) 100%)
    `,
    boxShadow: 'inset 0 0 22px rgba(0, 0, 0, 0.58), 0 10px 28px rgba(0, 0, 0, 0.42)',
  },
  railHighlight: {
    position: 'absolute',
    top: 0,
    right: 24,
    left: 24,
    zIndex: 4,
    height: 1,
    experimental_backgroundImage:
      'linear-gradient(90deg, transparent 0%, rgba(242, 211, 138, 0.58) 50%, transparent 100%)',
  },
  railOrbit: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.18)',
    transform: [{ scaleY: 0.64 }],
  },
  railWheelCanvas: {
    position: 'absolute',
    right: 0,
    left: 0,
    zIndex: 2,
    alignItems: 'center',
  },
  railShade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    experimental_backgroundImage: `
      linear-gradient(180deg, rgba(0, 0, 0, 0.48) 0%, transparent 34%, rgba(0, 0, 0, 0.26) 100%)
    `,
  },
  railNotch: {
    position: 'absolute',
    top: 8,
    zIndex: 4,
    alignSelf: 'center',
    width: 30,
    height: 3,
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(215, 168, 74, 0.16)',
  },
  controlPosition: {
    position: 'absolute',
    top: 0,
  },
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  controlPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  focusGlow: {
    position: 'absolute',
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
    borderWidth: 3,
  },
  controlCore: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    backgroundColor: theme.colors.background,
  },
  badgeText: {
    color: theme.colors.cream,
    fontSize: 10,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
