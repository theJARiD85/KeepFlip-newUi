import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  Canvas,
  Line,
  LinearGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import {
  Easing,
  cancelAnimation,
  interpolate,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

interface ScanAiOverlayProps {
  active?: boolean;
  height?: number;
  progress?: number;
  width?: number;
}

export function ScanAiOverlay({
  active = true,
  height,
  progress = 0,
  width,
}: ScanAiOverlayProps) {
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scanProgress = useSharedValue(0);
  const resolvedWidth = width ?? window.width;
  const resolvedHeight = height ?? window.height;
  const frameLeft = Math.max(28, resolvedWidth * 0.1);
  const frameRight = resolvedWidth - frameLeft;
  const frameTop = Math.max(108, resolvedHeight * 0.16);
  const frameBottom = Math.min(
    resolvedHeight - 150,
    resolvedHeight * 0.71,
  );
  const frameWidth = Math.max(80, frameRight - frameLeft);
  const scanTop = frameTop + 24;
  const scanBottom = Math.max(scanTop + 40, frameBottom - 24);
  const cornerLength = Math.min(38, frameWidth * 0.13);
  const resolvedProgress = Math.max(0, Math.min(1, progress));
  const cornerSegments = [
    [vec(frameLeft, frameTop + cornerLength), vec(frameLeft, frameTop)],
    [vec(frameLeft, frameTop), vec(frameLeft + cornerLength, frameTop)],
    [vec(frameRight - cornerLength, frameTop), vec(frameRight, frameTop)],
    [vec(frameRight, frameTop), vec(frameRight, frameTop + cornerLength)],
    [
      vec(frameLeft, frameBottom - cornerLength),
      vec(frameLeft, frameBottom),
    ],
    [
      vec(frameLeft, frameBottom),
      vec(frameLeft + cornerLength, frameBottom),
    ],
    [
      vec(frameRight - cornerLength, frameBottom),
      vec(frameRight, frameBottom),
    ],
    [
      vec(frameRight, frameBottom),
      vec(frameRight, frameBottom - cornerLength),
    ],
  ] as const;

  useEffect(() => {
    if (!active || reduceMotion) {
      scanProgress.value = 0.5;
      return;
    }

    scanProgress.value = 0;
    scanProgress.value = withRepeat(
      withTiming(1, {
        duration: 2250,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(scanProgress);
    };
  }, [active, reduceMotion, scanProgress]);

  const laserY = useDerivedValue(() =>
    interpolate(scanProgress.value, [0, 1], [scanTop, scanBottom]),
  );
  const laserGlowY = useDerivedValue(() => laserY.value - 7);
  const laserCoreY = useDerivedValue(() => laserY.value + 1);

  if (!active || resolvedWidth <= 0 || resolvedHeight <= 0) {
    return null;
  }

  return (
    <Canvas
      accessibilityElementsHidden
      accessible={false}
      pointerEvents="none"
      style={styles.canvas}
    >
      {cornerSegments.map(([p1, p2], index) => (
        <Line
          color="rgba(88, 223, 232, 0.76)"
          key={`corner-${index}`}
          p1={p1}
          p2={p2}
          strokeWidth={1.4}
        />
      ))}

      <Rect
        color="rgba(88, 223, 232, 0.05)"
        height={14}
        width={frameWidth}
        x={frameLeft}
        y={laserGlowY}
      />
      <Rect
        height={4}
        width={frameWidth}
        x={frameLeft}
        y={laserY}
      >
        <LinearGradient
          colors={[
            "rgba(88, 223, 232, 0)",
            theme.colors.scannerCyan,
            "#E9FDFF",
            theme.colors.scannerCyan,
            "rgba(88, 223, 232, 0)",
          ]}
          end={vec(frameRight, 0)}
          start={vec(frameLeft, 0)}
        />
      </Rect>
      <Rect
        color="rgba(233, 253, 255, 0.84)"
        height={1}
        width={frameWidth}
        x={frameLeft}
        y={laserCoreY}
      />

      <Rect
        color="rgba(88, 223, 232, 0.16)"
        height={2}
        width={frameWidth}
        x={frameLeft}
        y={frameBottom + 13}
      />
      <Rect
        color={theme.colors.goldBright}
        height={2}
        width={frameWidth * resolvedProgress}
        x={frameLeft}
        y={frameBottom + 13}
      />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFill,
  },
});
