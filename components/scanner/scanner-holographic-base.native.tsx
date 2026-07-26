import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

type HolographicToolBaseProps = {
  accents: readonly string[];
  height: number;
  position: SharedValue<number>;
  width: number;
};

type TickProps = {
  accents: readonly string[];
  angle: number;
  centerX: number;
  centerY: number;
  index: number;
  position: SharedValue<number>;
  radiusX: number;
  radiusY: number;
};

const TICK_COUNT = 48;
const MAX_VISIBLE_PROGRESS = 1.22;

function normalizeIndex(index: number, count: number) {
  "worklet";
  return ((index % count) + count) % count;
}

const HolographicTick = memo(function HolographicTick({
  accents,
  angle,
  centerX,
  centerY,
  index,
  position,
  radiusX,
  radiusY,
}: TickProps) {
  const isMajor = index % 6 === 0;
  const isMedium = !isMajor && index % 3 === 0;
  const tickHeight = isMajor ? 9 : isMedium ? 6 : 4;
  const tickWidth = isMajor ? 1.8 : 1.15;

  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const localProgress = cosine * MAX_VISIBLE_PROGRESS;

  // The lower/front half of the ellipse is slightly clearer than the rear half.
  const depthOpacity = sine >= 0 ? 1 : 0.48;
  const weightOpacity = isMajor ? 1 : isMedium ? 0.78 : 0.62;

  const left = centerX + cosine * radiusX - tickWidth / 2;
  const top = centerY + sine * radiusY - tickHeight / 2;
  const rotation = angle * (180 / Math.PI) + 90;

  const animatedStyle = useAnimatedStyle(() => {
    const count = accents.length;
    if (count === 0) {
      return { opacity: 0 };
    }

    /*
     * Each horizontal point on the base maps to the same virtual carousel
     * coordinate as the tools. At rest:
     *   -1 = previous tool
     *    0 = selected tool
     *   +1 = next tool
     *
     * Fractional positions blend between adjacent accent colors while dragging.
     */
    const virtualToolPosition = position.value + localProgress;
    const lowerVirtualIndex = Math.floor(virtualToolPosition);
    const blend = virtualToolPosition - lowerVirtualIndex;

    const lowerAccent =
      accents[normalizeIndex(lowerVirtualIndex, count)] ?? accents[0];
    const upperAccent =
      accents[normalizeIndex(lowerVirtualIndex + 1, count)] ?? lowerAccent;

    const distance = Math.abs(localProgress);
    const visibility = interpolate(
      distance,
      [0, 0.5, 0.88, 1.08, MAX_VISIBLE_PROGRESS],
      [0.32, 0.23, 0.105, 0.035, 0],
      "clamp",
    );

    return {
      backgroundColor: interpolateColor(
        blend,
        [0, 1],
        [lowerAccent, upperAccent],
      ),
      opacity: visibility * depthOpacity * weightOpacity,
      transform: [
        {
          scaleY: interpolate(
            distance,
            [0, 0.8, MAX_VISIBLE_PROGRESS],
            [1.14, 0.92, 0.68],
            "clamp",
          ),
        },
      ],
    };
  }, [
    accents,
    depthOpacity,
    localProgress,
    position,
    weightOpacity,
  ]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.tickCarrier,
        {
          height: tickHeight,
          left,
          top,
          transform: [{ rotate: `${rotation}deg` }],
          width: tickWidth,
        },
      ]}
    >
      <Animated.View style={[styles.tick, animatedStyle]} />
    </View>
  );
});

export const HolographicToolBase = memo(function HolographicToolBase({
  accents,
  height,
  position,
  width,
}: HolographicToolBaseProps) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.max(0, width / 2 - 10);
  const radiusY = Math.max(0, height / 2 - 5);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.root,
        {
          height,
          width,
        },
      ]}
    >
      {Array.from({ length: TICK_COUNT }, (_, index) => {
        const angle = (index / TICK_COUNT) * Math.PI * 2;

        return (
          <HolographicTick
            accents={accents}
            angle={angle}
            centerX={centerX}
            centerY={centerY}
            index={index}
            key={index}
            position={position}
            radiusX={radiusX}
            radiusY={radiusY}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  tickCarrier: {
    position: "absolute",
    alignItems: "stretch",
    justifyContent: "stretch",
  },
  tick: {
    flex: 1,
    borderRadius: 999,
  },
});
