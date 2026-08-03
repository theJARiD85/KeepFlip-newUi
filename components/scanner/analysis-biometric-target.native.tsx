import { Image } from "expo-image";
import { useEffect, useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import type { AnalysisCallout } from "@/components/scanner/analysis-visual-types";
import { ValueRadarTargetGraphic } from "@/components/scanner/value-radar-target-graphic";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type AnalysisBiometricTargetProps = {
  active: boolean;
  callouts?: AnalysisCallout[];
  photoUri?: string;
  progress?: number;
  topInset: number;
  viewportHeight: number;
  viewportWidth: number;
};

const CALLOUT_POSITIONS = [
  { left: 10, top: 18 },
  { right: 10, top: 92 },
  { left: 10, bottom: 38 },
  { right: 10, bottom: 8 },
] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function accentColor(accent: AnalysisCallout["accent"]) {
  if (accent === "gold") return theme.colors.goldBright;
  if (accent === "violet") return theme.colors.scannerViolet;
  return theme.colors.scannerCyan;
}

function FrameCorner({
  horizontal,
  vertical,
}: {
  horizontal: "left" | "right";
  vertical: "top" | "bottom";
}) {
  return (
    <View
      style={[
        styles.frameCorner,
        horizontal === "left" ? { left: 7 } : { right: 7 },
        vertical === "top" ? { top: 7 } : { bottom: 7 },
      ]}
    >
      <View style={styles.cornerHorizontal} />
      <View style={styles.cornerVertical} />
    </View>
  );
}

function ActiveBiometricTarget({
  callouts = [],
  photoUri,
  progress = 0.1,
  topInset,
  viewportHeight,
  viewportWidth,
}: Omit<AnalysisBiometricTargetProps, "active">) {
  const reduceMotion = useReducedMotion();
  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  const scan = useSharedValue(0);
  const evidenceFlash = useSharedValue(0);
  const progressReveal = useSharedValue(clamp01(progress));
  const frameWidth = Math.min(382, Math.max(284, viewportWidth - 28));
  const frameHeight = Math.min(390, Math.max(278, viewportHeight * 0.48));
  const frameTop = Math.max(topInset + 72, viewportHeight * 0.115);
  const targetSize = Math.min(176, frameWidth * 0.48);
  const visibleCallouts = useMemo(() => callouts.slice(0, 4), [callouts]);
  const resolvedPhotoUri = photoUri?.trim();

  useEffect(() => {
    progressReveal.value = withTiming(clamp01(progress), {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, progressReveal]);

  useEffect(() => {
    if (reduceMotion) {
      reveal.value = 1;
      return;
    }

    reveal.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
    scan.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.quad) }),
        withDelay(520, withTiming(0, { duration: 1 })),
      ),
      -1,
      false,
    );
    evidenceFlash.value = withRepeat(
      withSequence(
        withDelay(760, withTiming(1, { duration: 150 })),
        withTiming(0.22, { duration: 330 }),
        withDelay(980, withTiming(0.22, { duration: 1 })),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(reveal);
      cancelAnimation(scan);
      cancelAnimation(evidenceFlash);
      cancelAnimation(progressReveal);
    };
  }, [evidenceFlash, progressReveal, reduceMotion, reveal, scan]);

  const frameStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: (1 - reveal.value) * 34 },
      { scale: 0.94 + reveal.value * 0.06 },
    ],
  }));
  const scanStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + Math.sin(scan.value * Math.PI) * 0.65,
    transform: [{ translateY: scan.value * Math.max(1, frameHeight - 4) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: evidenceFlash.value,
    transform: [{ scale: 0.96 + evidenceFlash.value * 0.04 }],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.015, progressReveal.value) }],
  }));

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.atmosphere} />

      <Animated.View
        style={[
          styles.frame,
          {
            height: frameHeight,
            top: frameTop,
            width: frameWidth,
          },
          frameStyle,
        ]}
      >
        {resolvedPhotoUri ? (
          <View style={[StyleSheet.absoluteFill, styles.monochromeImage]}>
            <Image
              accessibilityLabel="Captured item valuation evidence"
              contentFit="cover"
              contentPosition="center"
              source={{ uri: resolvedPhotoUri }}
              style={StyleSheet.absoluteFill}
              transition={100}
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>SALE EVIDENCE ACQUIRING</Text>
          </View>
        )}

        <View style={styles.monochromeWash} />
        <View style={styles.imageContrast} />
        <View style={styles.grid} />

        <ValueRadarTargetGraphic
          animationKey="analysis"
          height={targetSize}
          label="valuation target"
          scoreText={`${Math.round(clamp01(progress) * 100)}% SCAN`}
          style={{
            left: (frameWidth - targetSize) / 2,
            top: frameHeight * 0.26,
          }}
          width={targetSize}
        />

        <Animated.View style={[styles.featureZone, styles.featureZoneA, flashStyle]} />
        <Animated.View style={[styles.featureZone, styles.featureZoneB, flashStyle]} />

        <Animated.View style={[styles.scanLine, scanStyle]} />

        {visibleCallouts.map((callout, index) => {
          const accent = accentColor(callout.accent);
          return (
            <View
              key={callout.id}
              style={[
                styles.callout,
                CALLOUT_POSITIONS[index],
                { borderColor: `${accent}99` },
              ]}
            >
              <View style={[styles.calloutSignal, { backgroundColor: accent }]} />
              <Text numberOfLines={1} style={[styles.calloutLabel, { color: accent }]}>
                {callout.label}
              </Text>
              <Text numberOfLines={1} style={styles.calloutValue}>
                {callout.value}
              </Text>
            </View>
          );
        })}

        <FrameCorner horizontal="left" vertical="top" />
        <FrameCorner horizontal="right" vertical="top" />
        <FrameCorner horizontal="left" vertical="bottom" />
        <FrameCorner horizontal="right" vertical="bottom" />

        <View style={styles.telemetryHeader}>
          <Text style={styles.telemetryTitle}>BIOMETRIC VALUE TARGET</Text>
          <Text style={styles.telemetryCode}>KF / VAL-01</Text>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </Animated.View>
    </View>
  );
}

export function AnalysisBiometricTarget(props: AnalysisBiometricTargetProps) {
  if (!props.active) return null;
  return <ActiveBiometricTarget {...props} />;
}

const monoFont = Platform.OS === "ios" ? "Courier New" : "monospace";

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#01040A",
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 42%, rgba(0, 255, 255, 0.10) 0%, transparent 38%),
      radial-gradient(circle at 14% 72%, rgba(141, 114, 255, 0.09) 0%, transparent 34%),
      linear-gradient(to bottom, #020307 0%, #01040A 58%, #061126 100%)
    `,
  },
  frame: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.56)",
    borderRadius: 3,
    backgroundColor: "#05070A",
    boxShadow: "0 18px 52px rgba(0, 0, 0, 0.78), 0 0 24px rgba(0, 255, 255, 0.12)",
  },
  monochromeImage: {
    filter: "grayscale(1) contrast(1.24)",
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: theme.colors.scannerCyan,
    fontFamily: monoFont,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  monochromeWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(4, 12, 20, 0.22)",
    mixBlendMode: "color",
  },
  imageContrast: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(ellipse at center, transparent 0%, transparent 44%, rgba(0, 3, 8, 0.36) 72%, rgba(0, 2, 6, 0.86) 100%),
      linear-gradient(to bottom, rgba(0, 0, 0, 0.20) 0%, transparent 42%, rgba(0, 6, 16, 0.34) 100%)
    `,
  },
  grid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.27,
    experimental_backgroundImage: `
      repeating-linear-gradient(to right, transparent 0px, transparent 39px, rgba(0, 255, 255, 0.10) 40px),
      repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, rgba(0, 255, 255, 0.08) 32px)
    `,
  },
  featureZone: {
    position: "absolute",
    borderWidth: 2,
    borderColor: theme.colors.goldBright,
    backgroundColor: "rgba(242, 211, 138, 0.09)",
    boxShadow: "0 0 14px rgba(242, 211, 138, 0.52)",
  },
  featureZoneA: {
    top: "31%",
    right: "16%",
    width: 64,
    height: 42,
  },
  featureZoneB: {
    bottom: "21%",
    left: "18%",
    width: 78,
    height: 36,
    borderColor: theme.colors.scannerViolet,
    backgroundColor: "rgba(141, 114, 255, 0.10)",
  },
  scanLine: {
    position: "absolute",
    zIndex: 8,
    top: 0,
    right: 2,
    left: 2,
    height: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 12px rgba(0, 255, 255, 0.96), 0 0 26px rgba(0, 255, 255, 0.44)",
  },
  callout: {
    position: "absolute",
    zIndex: 12,
    maxWidth: "58%",
    minWidth: 112,
    gap: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderLeftWidth: 2,
    backgroundColor: "rgba(0, 4, 11, 0.78)",
  },
  calloutSignal: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  calloutLabel: {
    paddingRight: 8,
    fontFamily: monoFont,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 1,
  },
  calloutValue: {
    color: "#FFFFFF",
    fontFamily: monoFont,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0, 0, 0, 0.96)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  frameCorner: {
    position: "absolute",
    zIndex: 14,
    width: 24,
    height: 24,
  },
  cornerHorizontal: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 22,
    height: 2,
    backgroundColor: theme.colors.scannerCyan,
  },
  cornerVertical: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 2,
    height: 22,
    backgroundColor: theme.colors.scannerCyan,
  },
  telemetryHeader: {
    position: "absolute",
    zIndex: 12,
    top: 10,
    right: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  telemetryTitle: {
    color: theme.colors.scannerCyan,
    fontFamily: monoFont,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  telemetryCode: {
    color: theme.colors.goldBright,
    fontFamily: monoFont,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  progressTrack: {
    position: "absolute",
    zIndex: 12,
    right: 10,
    bottom: 9,
    left: 10,
    height: 3,
    overflow: "hidden",
    backgroundColor: "rgba(0, 255, 255, 0.12)",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.goldBright,
    transformOrigin: "left",
    boxShadow: "0 0 8px rgba(242, 211, 138, 0.82)",
  },
});
