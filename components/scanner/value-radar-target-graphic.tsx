import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type ValueRadarTargetGraphicProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  animationKey?: string | number;
  disabled?: boolean;
  height: number;
  label: string;
  onPress?: () => void;
  scoreText: string;
  style?: StyleProp<ViewStyle>;
  width: number;
};

/** The shared target used for both live acquisition and item analysis. */
export function ValueRadarTargetGraphic({
  accessibilityHint,
  accessibilityLabel,
  animationKey,
  disabled = false,
  height,
  label,
  onPress,
  scoreText,
  style,
  width,
}: ValueRadarTargetGraphicProps) {
  const orbitProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const orbitSize = Math.max(48, Math.min(width, height) - 18);

  useEffect(() => {
    cancelAnimation(orbitProgress);
    cancelAnimation(pulseProgress);
    orbitProgress.value = 0;
    pulseProgress.value = 0;

    pulseProgress.value = withRepeat(
      withTiming(1, {
        duration: 980,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    orbitProgress.value = withRepeat(
      withTiming(1, {
        duration: 3200,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(orbitProgress);
      cancelAnimation(pulseProgress);
    };
  }, [animationKey, orbitProgress, pulseProgress]);

  const orbitAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitProgress.value * 360}deg` }],
  }));
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.38 + pulseProgress.value * 0.62,
    transform: [{ scale: 0.88 + pulseProgress.value * 0.18 }],
  }));
  const scanBeamAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: orbitProgress.value * Math.max(0, height - 2),
        },
      ],
    }),
    [height],
  );

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(140)}
      pointerEvents={onPress ? "auto" : "none"}
      style={[styles.targetHost, { height, width }, style]}
    >
      {onPress ? (
        <Pressable
          accessibilityHint={accessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onPress}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[styles.targetHalo, pulseAnimatedStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.targetOrbit,
          {
            height: orbitSize,
            left: (width - orbitSize) / 2,
            top: (height - orbitSize) / 2,
            width: orbitSize,
          },
          orbitAnimatedStyle,
        ]}
      />
      <View pointerEvents="none" style={styles.targetInnerRing} />
      <View
        pointerEvents="none"
        style={[styles.targetCorner, styles.targetCornerTopLeft]}
      />
      <View
        pointerEvents="none"
        style={[styles.targetCorner, styles.targetCornerTopRight]}
      />
      <View
        pointerEvents="none"
        style={[styles.targetCorner, styles.targetCornerBottomLeft]}
      />
      <View
        pointerEvents="none"
        style={[styles.targetCorner, styles.targetCornerBottomRight]}
      />
      <View pointerEvents="none" style={styles.crosshairHorizontal} />
      <View pointerEvents="none" style={styles.crosshairVertical} />
      <View pointerEvents="none" style={styles.targetCore}>
        <View style={styles.targetCoreDot} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[styles.targetScanBeam, scanBeamAnimatedStyle]}
      />
      <View pointerEvents="none" style={styles.targetCaption}>
        <Text numberOfLines={1} style={styles.targetCaptionLabel}>
          {label.toUpperCase()}
        </Text>
        <Text style={styles.targetCaptionScore}>{scoreText}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  targetHost: {
    position: "absolute",
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  targetHalo: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    experimental_backgroundImage: `
      radial-gradient(circle at center, rgba(88, 223, 232, 0.19) 0%, rgba(141, 114, 255, 0.08) 38%, transparent 72%)
    `,
  },
  targetOrbit: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(141, 114, 255, 0.66)",
    boxShadow: "0 0 12px rgba(141, 114, 255, 0.18)",
  },
  targetInnerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(3, 8, 13, 0.16)",
  },
  targetCorner: {
    position: "absolute",
    width: 25,
    height: 25,
    borderColor: theme.colors.scannerCyan,
  },
  targetCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    boxShadow: "-2px -2px 10px rgba(88, 223, 232, 0.34)",
  },
  targetCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.colors.scannerViolet,
    boxShadow: "2px -2px 10px rgba(141, 114, 255, 0.34)",
  },
  targetCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.goldBright,
    boxShadow: "-2px 2px 10px rgba(242, 211, 138, 0.26)",
  },
  targetCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    boxShadow: "2px 2px 10px rgba(88, 223, 232, 0.34)",
  },
  crosshairHorizontal: {
    position: "absolute",
    left: "31%",
    right: "31%",
    height: 1,
    backgroundColor: "rgba(88, 223, 232, 0.42)",
  },
  crosshairVertical: {
    position: "absolute",
    top: "31%",
    bottom: "31%",
    width: 1,
    backgroundColor: "rgba(88, 223, 232, 0.42)",
  },
  targetCore: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.64)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 10px rgba(242, 211, 138, 0.34)",
  },
  targetCoreDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.goldBright,
  },
  targetScanBeam: {
    position: "absolute",
    top: 0,
    right: 5,
    left: 5,
    height: 1,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  targetCaption: {
    position: "absolute",
    right: 8,
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  targetCaptionLabel: {
    flexShrink: 1,
    color: theme.colors.text,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.8,
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  targetCaptionScore: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.35,
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
