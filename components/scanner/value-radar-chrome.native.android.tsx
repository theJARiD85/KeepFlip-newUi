import type { ReactNode } from "react";
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

import type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export type ValueRadarBubbleProps = {
  status: ValueRadarStatus;
  style?: StyleProp<ViewStyle>;
  width?: number;
};

export type ValueRadarBarProps = {
  marker: ValueRadarMarker | null;
  status: ValueRadarStatus;
  style?: StyleProp<ViewStyle>;
  width?: number;
};

export type ValueRadarTargetOverlayProps = {
  disabled?: boolean;
  flashButton?: ReactNode;
  focusBounds?: ValueRadarViewport | null;
  height: number;
  marker: ValueRadarMarker | null;
  onMarkerPress: (marker: ValueRadarMarker) => void;
  status: ValueRadarStatus;
  width: number;
};

export type ValueRadarOverlayProps = ValueRadarTargetOverlayProps;

const READY_COLOR = "#67F7A5";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function statusPresentation(status: ValueRadarStatus) {
  if (status === "ready") {
    return {
      color: READY_COLOR,
      label: "ONLINE",
      meta: "MODEL READY",
      glow: "0 0 10px rgba(103, 247, 165, 0.9)",
    };
  }

  if (status === "error") {
    return {
      color: theme.colors.danger,
      label: "OFFLINE",
      meta: "MODEL RETRY",
      glow: "0 0 10px rgba(232, 97, 88, 0.82)",
    };
  }

  return {
    color: theme.colors.goldBright,
    label: "CALIBRATING",
    meta: "MODEL LOADING",
    glow: "0 0 10px rgba(242, 211, 138, 0.8)",
  };
}

export function ValueRadarBubble({
  status,
  style,
  width = 194,
}: ValueRadarBubbleProps) {
  const cue = statusPresentation(status);

  return (
    <View
      pointerEvents="none"
      style={[styles.readinessCue, { maxWidth: width }, style]}
    >
      <View
        style={[
          styles.readinessLight,
          { backgroundColor: cue.color, boxShadow: cue.glow },
        ]}
      />
      <Text style={styles.readinessName}>VALUE RADAR</Text>
      <Text style={styles.readinessSeparator}>{"//"}</Text>
      <Text style={[styles.readinessState, { color: cue.color }]}> 
        {cue.label}
      </Text>
      <View style={styles.signalBars}>
        <View style={[styles.signalBar, styles.signalBarLow, { backgroundColor: cue.color }]} />
        <View style={[styles.signalBar, styles.signalBarMid, { backgroundColor: cue.color }]} />
        <View style={[styles.signalBar, styles.signalBarHigh, { backgroundColor: cue.color }]} />
      </View>
    </View>
  );
}

export function ValueRadarBar({
  marker,
  status,
  style,
  width = 224,
}: ValueRadarBarProps) {
  const cue = statusPresentation(status);
  const targetCopy =
    status === "ready"
      ? marker
        ? "TARGET LOCKED"
        : "MODEL READY"
      : cue.meta;

  return (
    <View
      pointerEvents="none"
      style={[styles.modelCue, { maxWidth: width }, style]}
    >
      <Text style={[styles.modelCueIndex, { color: cue.color }]}> 
        {marker && status === "ready" ? "T-01" : "VR"}
      </Text>
      <View style={styles.modelCueLine} />
      <View
        style={[
          styles.modelCueLight,
          { backgroundColor: cue.color, boxShadow: cue.glow },
        ]}
      />
      <Text numberOfLines={1} style={styles.modelCueText}>
        {targetCopy} {"//"} {cue.label}
      </Text>
    </View>
  );
}

export function ValueRadarTargetOverlay({
  disabled = false,
  flashButton,
  focusBounds,
  height,
  marker,
  onMarkerPress,
  status,
  width,
}: ValueRadarTargetOverlayProps) {
  const hasMarker = marker != null;
  const markerClassId = marker?.classId;
  const orbitProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(orbitProgress);
    cancelAnimation(pulseProgress);
    orbitProgress.value = 0;
    pulseProgress.value = 0;

    if (status !== "error") {
      pulseProgress.value = withRepeat(
        withTiming(1, {
          duration: 980,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      );
    }

    if (hasMarker && status === "ready") {
      orbitProgress.value = withRepeat(
        withTiming(1, {
          duration: 3200,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    }

    return () => {
      cancelAnimation(orbitProgress);
      cancelAnimation(pulseProgress);
    };
  }, [
    hasMarker,
    markerClassId,
    orbitProgress,
    pulseProgress,
    status,
  ]);

  const orbitAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitProgress.value * 360}deg` }],
  }));
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.38 + pulseProgress.value * 0.62,
    transform: [{ scale: 0.88 + pulseProgress.value * 0.18 }],
  }));

  const focusScaleX =
    focusBounds != null
      ? width / Math.max(focusBounds.previewWidth, 1)
      : 1;
  const focusScaleY =
    focusBounds != null
      ? height / Math.max(focusBounds.previewHeight, 1)
      : 1;
  const focusX = focusBounds ? focusBounds.x * focusScaleX : 12;
  const focusY = focusBounds
    ? focusBounds.y * focusScaleY
    : Math.max(96, height * 0.22);
  const focusWidth = focusBounds
    ? focusBounds.width * focusScaleX
    : width - 24;
  const focusHeight = focusBounds
    ? focusBounds.height * focusScaleY
    : Math.min(360, height * 0.48);

  const sourceWidth = Math.max(marker?.sourceWidth ?? width, 1);
  const sourceHeight = Math.max(marker?.sourceHeight ?? height, 1);
  const previewScale = Math.max(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * previewScale;
  const renderedHeight = sourceHeight * previewScale;
  const previewOffsetX = (width - renderedWidth) / 2;
  const previewOffsetY = (height - renderedHeight) / 2;
  const rawMarkerLeft = marker
    ? previewOffsetX + marker.x * renderedWidth
    : focusX;
  const rawMarkerTop = marker
    ? previewOffsetY + marker.y * renderedHeight
    : focusY;
  const rawMarkerWidth = marker ? marker.width * renderedWidth : 0;
  const rawMarkerHeight = marker ? marker.height * renderedHeight : 0;
  const rawMarkerCenterX = rawMarkerLeft + rawMarkerWidth / 2;
  const rawMarkerCenterY = rawMarkerTop + rawMarkerHeight / 2;

  const maxTargetWidth = Math.max(56, Math.min(196, focusWidth - 18));
  const maxTargetHeight = Math.max(56, Math.min(184, focusHeight - 18));
  const minTargetWidth = Math.min(92, maxTargetWidth);
  const minTargetHeight = Math.min(92, maxTargetHeight);
  const targetWidth = clamp(
    rawMarkerWidth + 26,
    minTargetWidth,
    maxTargetWidth,
  );
  const targetHeight = clamp(
    rawMarkerHeight + 26,
    minTargetHeight,
    maxTargetHeight,
  );
  const targetLeft = clamp(
    rawMarkerCenterX - targetWidth / 2,
    focusX + 8,
    Math.max(focusX + 8, focusX + focusWidth - targetWidth - 8),
  );
  const targetTop = clamp(
    rawMarkerCenterY - targetHeight / 2,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - targetHeight - 8),
  );
  const orbitSize = Math.max(48, Math.min(targetWidth, targetHeight) - 18);
  const scanBeamAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: orbitProgress.value * Math.max(0, targetHeight - 2),
        },
      ],
    }),
    [targetHeight],
  );

  const flashTop = clamp(focusY + 18, 8, Math.max(8, height - 60));
  const flashLeft = clamp(focusX + 18, 8, Math.max(8, width - 60));

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {flashButton ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.flashButtonHost,
            {
              left: flashLeft,
              top: flashTop,
            },
          ]}
        >
          {flashButton}
        </View>
      ) : null}

      {marker && status === "ready" ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(140)}
          style={[
            styles.targetHost,
            {
              height: targetHeight,
              left: targetLeft,
              top: targetTop,
              width: targetWidth,
            },
          ]}
        >
          <Pressable
            accessibilityHint="Captures this item for full KeepFlip identification and current market analysis"
            accessibilityLabel={`Analyze potential ${marker.label}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onMarkerPress(marker)}
            style={StyleSheet.absoluteFill}
          />

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
                left: (targetWidth - orbitSize) / 2,
                top: (targetHeight - orbitSize) / 2,
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
              {marker.label.toUpperCase()}
            </Text>
            <Text style={styles.targetCaptionScore}>
              {Math.round(marker.score * 100)}% LOCK
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  return <ValueRadarTargetOverlay {...props} />;
}

const styles = StyleSheet.create({
  readinessCue: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  readinessLight: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  readinessName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: 1.15,
  },
  readinessSeparator: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
  },
  readinessState: {
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.8,
  },
  signalBars: {
    marginLeft: 2,
    height: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 2,
    borderRadius: 1,
  },
  signalBarLow: {
    height: 3,
    opacity: 0.45,
  },
  signalBarMid: {
    height: 6,
    opacity: 0.7,
  },
  signalBarHigh: {
    height: 9,
  },
  modelCue: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  modelCueIndex: {
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.8,
  },
  modelCueLine: {
    width: 25,
    height: 1,
    backgroundColor: "rgba(88, 223, 232, 0.42)",
  },
  modelCueLight: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modelCueText: {
    flexShrink: 1,
    color: "rgba(247, 242, 232, 0.7)",
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.72,
  },
  flashButtonHost: {
    position: "absolute",
    zIndex: 80,
    elevation: 80,
  },
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
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.8,
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  targetCaptionScore: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.35,
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});