import {
  Canvas,
  DashPathEffect,
  Path,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";
import { memo, useEffect } from "react";
import { StyleSheet } from "react-native";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { KeepFlipLiveObjectDetection } from "@/services/live-object-detection";

type KeepFlipObjectOverlayProps = {
  detections: KeepFlipLiveObjectDetection[];
  frameHeight: number;
  frameWidth: number;
  viewHeight: number;
  viewWidth: number;
};

export const KeepFlipObjectOverlay = memo(function KeepFlipObjectOverlay({
  detections,
  frameHeight,
  frameWidth,
  viewHeight,
  viewWidth,
}: KeepFlipObjectOverlayProps) {
  const traceProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const dashProgress = useSharedValue(0);
  const glowOpacity = useDerivedValue(
    () => traceProgress.value * (0.14 + pulseProgress.value * 0.18),
  );
  const coreOpacity = useDerivedValue(
    () => 0.72 + pulseProgress.value * 0.26,
  );
  const dashPhase = useDerivedValue(() => -48 * dashProgress.value);

  useEffect(() => {
    traceProgress.value = 0;
    pulseProgress.value = 0;
    dashProgress.value = 0;
    traceProgress.value = withTiming(1, {
      duration: 680,
      easing: Easing.out(Easing.cubic),
    });
    pulseProgress.value = withDelay(
      460,
      withRepeat(
        withTiming(1, {
          duration: 520,
          easing: Easing.inOut(Easing.quad),
        }),
        4,
        true,
      ),
    );
    dashProgress.value = withDelay(
      320,
      withRepeat(
        withTiming(1, { duration: 920, easing: Easing.linear }),
        3,
        false,
      ),
    );

    return () => {
      cancelAnimation(traceProgress);
      cancelAnimation(pulseProgress);
      cancelAnimation(dashProgress);
    };
  }, [dashProgress, detections, pulseProgress, traceProgress]);

  if (
    detections.length === 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    viewWidth <= 0 ||
    viewHeight <= 0
  ) {
    return null;
  }

  const coverScale = Math.max(viewWidth / frameWidth, viewHeight / frameHeight);
  const renderedWidth = frameWidth * coverScale;
  const renderedHeight = frameHeight * coverScale;
  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      {detections.map((detection, index) => {
        const box = detection.boundingBox;
        const x = offsetX + box.x * renderedWidth;
        const y = offsetY + box.y * renderedHeight;
        const width = box.width * renderedWidth;
        const height = box.height * renderedHeight;
        const radius = Math.max(8, Math.min(width, height) * 0.075);
        const key = `${detection.trackingId ?? "object"}-${index}`;

        if (width < 4 || height < 4) return null;

        const path = Skia.Path.RRect(
          Skia.RRectXY(
            Skia.XYWHRect(x, y, width, height),
            radius,
            radius,
          ),
        );

        return [
          <RoundedRect
            key={`${key}-glow`}
            x={x}
            y={y}
            width={width}
            height={height}
            r={radius}
            antiAlias
            color="#28E9FF"
            opacity={glowOpacity}
            strokeWidth={10}
            style="stroke"
          />,
          <Path
            key={`${key}-core`}
            path={path}
            start={0}
            end={traceProgress}
            antiAlias
            color="#B8FBFF"
            opacity={coreOpacity}
            strokeWidth={3.25}
            style="stroke"
          />,
          <Path
            key={`${key}-accent`}
            path={path}
            start={0}
            end={traceProgress}
            antiAlias
            color="#FFBC38"
            opacity={0.88}
            strokeWidth={1.4}
            style="stroke"
          >
            <DashPathEffect intervals={[13, 8]} phase={dashPhase} />
          </Path>,
        ];
      })}
    </Canvas>
  );
});
