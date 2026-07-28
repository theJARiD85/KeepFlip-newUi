import { memo, useMemo } from "react";

import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  LinearGradient,
  Path,
  interpolateColors,
  vec,
} from "@shopify/react-native-skia";
import {
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

type HUDSkiaPlatterRingProps = {
  accents: readonly string[];
  height: number;
  position: SharedValue<number>;
  radiusX: number;
  radiusY: number;
  width: number;
};
function modulo(value: number, divisor: number) {
  "worklet";
  return ((value % divisor) + divisor) % divisor;
}

function colorAtPosition(
  position: number,
  accents: readonly string[],
) {
  "worklet";

  const count = accents.length;
  if (count === 0) return "#FFFFFF";

  const lowerIndex = Math.floor(position);
  const blend = position - lowerIndex;
  const lowerColor = accents[modulo(lowerIndex, count)] ?? accents[0];
  const upperColor =
    accents[modulo(lowerIndex + 1, count)] ?? lowerColor;

  return interpolateColors(
    blend,
    [0, 1],
    [lowerColor, upperColor],
  );
}

/**
 * A GPU-rendered holographic platter that sits beneath the scanner tool wheel.
 *
 * It deliberately receives the carousel's one continuous position value rather
 * than a separate activeIndex + translateX pair. That keeps the platter color
 * transition perfectly synchronized with drag and spring motion.
 */
export const HUDSkiaPlatterRing = memo(
  function HUDSkiaPlatterRing({
    accents,
    height,
    position,
    radiusX,
    radiusY,
    width,
  }: HUDSkiaPlatterRingProps) {
    const geometry = useMemo(() => {
      const centerX = width / 2;
      const centerY = height * 0.46;

      const left = centerX - radiusX;
      const right = centerX + radiusX;

      const fullEllipse = [
        `M ${left} ${centerY}`,
        `A ${radiusX} ${radiusY} 0 1 0 ${right} ${centerY}`,
        `A ${radiusX} ${radiusY} 0 1 0 ${left} ${centerY}`,
      ].join(" ");

      // Sweep flag 0 draws the lower/front half from left to right.
      const frontArc = [
        `M ${left} ${centerY}`,
        `A ${radiusX} ${radiusY} 0 0 0 ${right} ${centerY}`,
      ].join(" ");

      const innerRadiusX = radiusX * 0.86;
      const innerRadiusY = radiusY * 0.74;
      const innerLeft = centerX - innerRadiusX;
      const innerRight = centerX + innerRadiusX;
      const innerCenterY = centerY + radiusY * 0.08;

      const innerFrontArc = [
        `M ${innerLeft} ${innerCenterY}`,
        `A ${innerRadiusX} ${innerRadiusY} 0 0 0 ${innerRight} ${innerCenterY}`,
      ].join(" ");

      return {
        centerX,
        centerY,
        frontArc,
        fullEllipse,
        innerFrontArc,
        radiusY,
      };
    }, [height, radiusX, radiusY, width]);

    const gradientColors = useDerivedValue(() => [
      colorAtPosition(position.value - 1, accents),
      colorAtPosition(position.value - 0.38, accents),
      colorAtPosition(position.value, accents),
      colorAtPosition(position.value + 0.38, accents),
      colorAtPosition(position.value + 1, accents),
    ]);

    const centerColor = useDerivedValue(() =>
      colorAtPosition(position.value, accents),
    );

    const frontOpacity = useDerivedValue(() => {
      const nearest = Math.round(position.value);
      const fractionalDistance = Math.min(
        0.5,
        Math.abs(position.value - nearest),
      );

      return 0.78 - fractionalDistance * 0.44;
    });

    const glowOpacity = useDerivedValue(
      () => frontOpacity.value * 0.72,
    );

    const dashPhase = useDerivedValue(
      () => modulo(position.value * 18, 18),
    );

    return (
      <Canvas
        pointerEvents="none"
        style={{
          width,
          height,
        }}
      >
        {/* Barely visible rear geometry gives the platter depth. */}
        <Path
          path={geometry.fullEllipse}
          style="stroke"
          strokeWidth={1}
          opacity={0.1}
        >
          <LinearGradient
            start={vec(0, geometry.centerY)}
            end={vec(width, geometry.centerY)}
            colors={gradientColors}
          />
        </Path>

        {/* Broad light bloom beneath the visible front arc. */}
        <Path
          path={geometry.frontArc}
          style="stroke"
          strokeWidth={7}
          opacity={glowOpacity}
        >
          <LinearGradient
            start={vec(0, geometry.centerY)}
            end={vec(width, geometry.centerY)}
            colors={gradientColors}
          />
          <BlurMask blur={10} style="normal" />
        </Path>

        {/* Crisp front rim. */}
        <Path
          path={geometry.frontArc}
          style="stroke"
          strokeWidth={1.5}
          opacity={frontOpacity}
          strokeCap="round"
        >
          <LinearGradient
            start={vec(0, geometry.centerY)}
            end={vec(width, geometry.centerY)}
            colors={gradientColors}
          />
        </Path>

        {/* Instrument-like segmented inner track. */}
        <Path
          path={geometry.innerFrontArc}
          style="stroke"
          strokeWidth={1.2}
          opacity={0.42}
          strokeCap="round"
        >
          <LinearGradient
            start={vec(0, geometry.centerY)}
            end={vec(width, geometry.centerY)}
            colors={gradientColors}
          />
          <DashPathEffect
            intervals={[3, 7]}
            phase={dashPhase}
          />
        </Path>

        {/* A tiny projector core under the selected tool. */}
        <Circle
          cx={geometry.centerX}
          cy={geometry.centerY + geometry.radiusY * 0.86}
          r={3.5}
          color={centerColor}
          opacity={0.62}
        >
          <BlurMask blur={8} style="solid" />
        </Circle>
      </Canvas>
    );
  },
);
