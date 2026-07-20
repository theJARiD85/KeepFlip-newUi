import {
  Canvas,
  DashPathEffect,
  Path,
  Skia,
  Group,
  Line,
  Rect,
  Circle,
  LinearGradient,
  vec,
} from "@shopify/react-native-skia";
import { memo, useEffect, useRef } from "react";
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
  contours: { points: number[] }[];
  detections: KeepFlipLiveObjectDetection[];
  frameHeight: number;
  frameWidth: number;
  viewHeight: number;
  viewWidth: number;
};

function getContourCentroid(points: number[]) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index];
    const y = points[index + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0.5, y: 0.5 };
}

function makeScaledContourPath(
  points: number[],
  renderedWidth: number,
  renderedHeight: number,
  offsetX: number,
  offsetY: number,
  scale: number,
  offsetPercentX: number,
  offsetPercentY: number,
  centroid: { x: number; y: number },
) {
  const mappedPoints: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const normalizedX = points[index];
    const normalizedY = points[index + 1];
    if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) continue;

    // Scale coordinates relative to the centroid, then apply offsets
    const scaledX = centroid.x + (normalizedX - centroid.x) * scale + offsetPercentX;
    const scaledY = centroid.y + (normalizedY - centroid.y) * scale + offsetPercentY;

    mappedPoints.push({
      x: offsetX + Math.min(1, Math.max(0, scaledX)) * renderedWidth,
      y: offsetY + Math.min(1, Math.max(0, scaledY)) * renderedHeight,
    });
  }

  if (mappedPoints.length < 3) return null;

  const path = Skia.Path.Make();
  const first = mappedPoints[0];
  const last = mappedPoints[mappedPoints.length - 1];
  path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

  for (let index = 0; index < mappedPoints.length; index += 1) {
    const point = mappedPoints[index];
    const next = mappedPoints[(index + 1) % mappedPoints.length];
    path.quadTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }

  path.close();
  return path;
}

function getMappedContourPoints(
  points: number[],
  renderedWidth: number,
  renderedHeight: number,
  offsetX: number,
  offsetY: number,
) {
  const mappedPoints: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    const normalizedX = points[index];
    const normalizedY = points[index + 1];
    if (Number.isFinite(normalizedX) && Number.isFinite(normalizedY)) {
      mappedPoints.push({
        x: offsetX + Math.min(1, Math.max(0, normalizedX)) * renderedWidth,
        y: offsetY + Math.min(1, Math.max(0, normalizedY)) * renderedHeight,
      });
    }
  }
  return mappedPoints;
}

export const KeepFlipObjectOverlay = memo(function KeepFlipObjectOverlay({
  contours,
  detections,
  frameHeight,
  frameWidth,
  viewHeight,
  viewWidth,
}: KeepFlipObjectOverlayProps) {
  const traceProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const dashProgress = useSharedValue(0);
  const sweepProgress = useSharedValue(0);

  const prevCountRef = useRef(0);
  const currentCount = contours.length + detections.length;

  const coreOpacity = useDerivedValue(() => 0.75 + pulseProgress.value * 0.25);

  useEffect(() => {
    if (currentCount > 0 && prevCountRef.current === 0) {
      traceProgress.value = 0;
      traceProgress.value = withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      });
    }
    prevCountRef.current = currentCount;
  }, [currentCount, traceProgress]);

  useEffect(() => {
    pulseProgress.value = withRepeat(
      withTiming(1, {
        duration: 800,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    dashProgress.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.linear }),
      -1,
      false,
    );
    sweepProgress.value = withRepeat(
      withTiming(1, {
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(traceProgress);
      cancelAnimation(pulseProgress);
      cancelAnimation(dashProgress);
      cancelAnimation(sweepProgress);
    };
  }, [dashProgress, pulseProgress, sweepProgress, traceProgress]);

  if (
    (contours.length === 0 && detections.length === 0) ||
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

  const contourLayers = contours.flatMap((contour, index) => {
    const centroid = getContourCentroid(contour.points);
    const key = `contour-${index}`;

    const viewCentroidX = offsetX + centroid.x * renderedWidth;
    const viewCentroidY = offsetY + centroid.y * renderedHeight;

    const ringScales = [1.0, 0.8, 0.6, 0.4, 0.2];

    // Generate concentric rings paths
    const ringPaths = ringScales.map((scale) => {
      return makeScaledContourPath(
        contour.points,
        renderedWidth,
        renderedHeight,
        offsetX,
        offsetY,
        scale,
        0,
        0,
        centroid,
      );
    });

    const outerPath = ringPaths[0];
    if (outerPath == null) return [];

    const bounds = outerPath.getBounds();

    // Get mapped points on the outer ring (scale 1.0)
    const outerPoints = getMappedContourPoints(
      contour.points,
      renderedWidth,
      renderedHeight,
      offsetX,
      offsetY,
    );

    const sweepY = useDerivedValue(() => bounds.y + sweepProgress.value * bounds.height);
    const trailY = useDerivedValue(() => sweepY.value - 28);

    const meshLines: any[] = [];
    const meshNodes: any[] = [];
    const sampleInterval = 5; // trace every 5th point for crisp mesh density

    outerPoints.forEach((pt, ptIdx) => {
      if (ptIdx % sampleInterval !== 0) return;

      // 1. Draw radial mesh line from outer point to the centroid
      meshLines.push(
        <Line
          key={`mesh-rad-${ptIdx}`}
          p1={vec(pt.x, pt.y)}
          p2={vec(viewCentroidX, viewCentroidY)}
          color="#00FFD2"
          strokeWidth={0.65}
          opacity={0.16}
        />,
      );

      // 2. Place vertices at each concentric intersection
      ringScales.forEach((scale, rIdx) => {
        const ix = viewCentroidX + (pt.x - viewCentroidX) * scale;
        const iy = viewCentroidY + (pt.y - viewCentroidY) * scale;

        meshNodes.push(
          <Circle
            key={`mesh-node-${ptIdx}-${rIdx}`}
            cx={ix}
            cy={iy}
            r={1.8}
            color="#FFFFFF"
            opacity={useDerivedValue(() => {
              const dy = Math.abs(iy - sweepY.value);
              const sweepHighlight = Math.max(0, 1 - dy / 45); // light up 45px around the laser sweep
              return (0.28 + sweepHighlight * 0.72) * traceProgress.value;
            })}
          />,
        );
      });
    });

    // Outer contour path itself - drawn thin and extremely sharp
    const ringLayers = ringPaths.map((path, rIdx) => {
      if (path == null) return null;
      const isBase = rIdx === 0;
      return (
        <Path
          key={`${key}-ring-${rIdx}`}
          path={path}
          start={0}
          end={traceProgress}
          antiAlias
          color="#00FFD2"
          opacity={isBase ? coreOpacity : 0.22}
          strokeCap="round"
          strokeJoin="round"
          strokeWidth={isBase ? 1.3 : 0.7}
          style="stroke"
        />
      );
    });

    return [
      // 1. Clipped scan glow inside the mesh boundary
      <Group key={`${key}-grid-group`} clip={outerPath}>
        <Rect
          x={bounds.x}
          y={trailY}
          width={bounds.width}
          height={28}
          opacity={0.25}
        >
          <LinearGradient
            start={useDerivedValue(() => vec(bounds.x, trailY.value))}
            end={useDerivedValue(() => vec(bounds.x, sweepY.value))}
            colors={["rgba(0, 255, 210, 0)", "rgba(0, 255, 210, 0.4)"]}
          />
        </Rect>
      </Group>,

      // 2. Radial wireframe grid lines
      ...meshLines,

      // 3. Concentric topographic wireframe rings
      ...ringLayers,

      // 4. Point-cloud vertices (nodes)
      ...meshNodes,

      // 5. Sharpened sweeping laser line slicing the mesh
      <Line
        key={`${key}-laser-line`}
        p1={useDerivedValue(() => vec(bounds.x, sweepY.value))}
        p2={useDerivedValue(() => vec(bounds.x + bounds.width, sweepY.value))}
        color="#00FFD2"
        strokeWidth={1.2}
        opacity={useDerivedValue(() => 0.88 * traceProgress.value)}
      />,
    ];
  });

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      {contourLayers.length > 0
        ? contourLayers
        : detections.flatMap((detection, index) => {
            const box = detection.boundingBox;
            const x = offsetX + box.x * renderedWidth;
            const y = offsetY + box.y * renderedHeight;
            const width = box.width * renderedWidth;
            const height = box.height * renderedHeight;
            const radius = Math.max(5, Math.min(width, height) * 0.04);
            const key = `${detection.trackingId ?? "object"}-${index}`;

            if (width < 4 || height < 4) return [];

            const rectPath = Skia.Path.RRect(
              Skia.RRectXY(
                Skia.XYWHRect(x, y, width, height),
                radius,
                radius,
              ),
            );

            const len = Math.max(12, Math.min(width, height) * 0.14);
            const cx = x + width / 2;
            const cy = y + height / 2;

            const sweepY = useDerivedValue(() => y + sweepProgress.value * height);
            const trailY = useDerivedValue(() => sweepY.value - 24);

            return [
              // 1. Fine dashed bounding box
              <Path
                key={`${key}-dash-frame`}
                path={rectPath}
                color="#00FFD2"
                strokeWidth={0.7}
                opacity={0.2}
                style="stroke"
              >
                <DashPathEffect intervals={[5, 4]} />
              </Path>,

              // 2. HUD Corner Brackets (sharp vector lines)
              // Top-Left
              <Line key={`${key}-bracket-tl-h`} p1={vec(x, y)} p2={vec(x + len, y)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              <Line key={`${key}-bracket-tl-v`} p1={vec(x, y)} p2={vec(x, y + len)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              
              // Top-Right
              <Line key={`${key}-bracket-tr-h`} p1={vec(x + width - len, y)} p2={vec(x + width, y)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              <Line key={`${key}-bracket-tr-v`} p1={vec(x + width, y)} p2={vec(x + width, y + len)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              
              // Bottom-Left
              <Line key={`${key}-bracket-bl-h`} p1={vec(x, y + height)} p2={vec(x + len, y + height)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              <Line key={`${key}-bracket-bl-v`} p1={vec(x, y + height - len)} p2={vec(x, y + height)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              
              // Bottom-Right
              <Line key={`${key}-bracket-br-h`} p1={vec(x + width - len, y + height)} p2={vec(x + width, y + height)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,
              <Line key={`${key}-bracket-br-v`} p1={vec(x + width, y + height - len)} p2={vec(x + width, y + height)} color="#00FFD2" strokeWidth={1.8} strokeCap="round" opacity={coreOpacity} />,

              // 3. Center Lock-On Crosshair Target
              <Circle key={`${key}-crosshair-center`} cx={cx} cy={cy} r={3.2} color="#00FFD2" opacity={0.4} style="stroke" strokeWidth={0.8} />,
              <Line key={`${key}-crosshair-lh`} p1={vec(cx - 9, cy)} p2={vec(cx - 3, cy)} color="#00FFD2" strokeWidth={0.8} opacity={0.4} />,
              <Line key={`${key}-crosshair-rh`} p1={vec(cx + 3, cy)} p2={vec(cx + 9, cy)} color="#00FFD2" strokeWidth={0.8} opacity={0.4} />,
              <Line key={`${key}-crosshair-tv`} p1={vec(cx, cy - 9)} p2={vec(cx, cy - 3)} color="#00FFD2" strokeWidth={0.8} opacity={0.4} />,
              <Line key={`${key}-crosshair-bv`} p1={vec(cx, cy + 3)} p2={vec(cx, cy + 9)} color="#00FFD2" strokeWidth={0.8} opacity={0.4} />,

              // 4. Laser Sweep Scanning Line
              <Line
                key={`${key}-sweep-line`}
                p1={useDerivedValue(() => vec(x, sweepY.value))}
                p2={useDerivedValue(() => vec(x + width, sweepY.value))}
                color="#00FFD2"
                strokeWidth={1.3}
                opacity={0.85}
              />,

              // 5. Clipped Laser Volumetric Glow Trail
              <Group key={`${key}-sweep-trail-group`} clip={rectPath}>
                <Rect x={x} y={trailY} width={width} height={24} opacity={0.18}>
                  <LinearGradient
                    start={useDerivedValue(() => vec(x, trailY.value))}
                    end={useDerivedValue(() => vec(x, sweepY.value))}
                    colors={["rgba(0, 255, 210, 0)", "rgba(0, 255, 210, 0.4)"]}
                  />
                </Rect>
              </Group>,
            ];
          })}
    </Canvas>
  );
});
