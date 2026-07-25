import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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

export {
  ValueRadarBar,
  ValueRadarBubble,
  ValueRadarOverlay,
} from "./value-radar-chrome.native.tsx";
export type {
  ValueRadarBarProps,
  ValueRadarBubbleProps,
  ValueRadarOverlayProps,
} from "./value-radar-chrome.native.tsx";

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
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

  const panelWidth = Math.min(238, Math.max(154, focusWidth - 18));
  const panelHeight = 78;
  const panelLeft = clamp(
    targetLeft + targetWidth / 2 - panelWidth / 2,
    focusX + 8,
    Math.max(focusX + 8, focusX + focusWidth - panelWidth - 8),
  );
  const canPlacePanelAbove = targetTop - panelHeight - 12 >= focusY + 8;
  const panelTop = clamp(
    canPlacePanelAbove
      ? targetTop - panelHeight - 12
      : targetTop + targetHeight + 12,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - panelHeight - 8),
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
        <>
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(140)}
            pointerEvents="none"
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
            <Animated.View style={[styles.targetHalo, pulseAnimatedStyle]} />
            <Animated.View
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
            <View style={styles.targetInnerRing} />
            <View style={[styles.targetCorner, styles.targetCornerTopLeft]} />
            <View style={[styles.targetCorner, styles.targetCornerTopRight]} />
            <View style={[styles.targetCorner, styles.targetCornerBottomLeft]} />
            <View style={[styles.targetCorner, styles.targetCornerBottomRight]} />
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairVertical} />
            <View style={styles.targetCore}>
              <View style={styles.targetCoreDot} />
            </View>
            <Animated.View
              style={[styles.targetScanBeam, scanBeamAnimatedStyle]}
            />
            <View style={styles.targetId}>
              <Text style={styles.targetIdText}>T-01</Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(70).duration(220)}
            exiting={FadeOut.duration(120)}
            style={[
              styles.markerPanelHost,
              {
                left: panelLeft,
                top: panelTop,
                width: panelWidth,
              },
            ]}
          >
            <Pressable
              accessibilityHint="Captures this item for full KeepFlip identification and current market analysis"
              accessibilityLabel={`Analyze potential ${marker.label}`}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => onMarkerPress(marker)}
              style={({ pressed }) => [
                styles.markerPanel,
                pressed && styles.markerPanelPressed,
                disabled && styles.markerPanelDisabled,
              ]}
            >
              <View style={styles.markerPanelAccent} />
              <View style={styles.markerPanelHeading}>
                <View style={styles.lockGlyph}>
                  <View style={styles.lockGlyphCore} />
                </View>
                <Text style={styles.markerEyebrow}>POTENTIAL FIND</Text>
                <View style={styles.confidencePill}>
                  <Text style={styles.confidenceText}>
                    {Math.round(marker.score * 100)
                      .toString()
                      .padStart(2, "0")}
                    % LOCK
                  </Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.markerLabel}>
                {marker.label}
              </Text>
              <View style={styles.markerPanelFooter}>
                <Text numberOfLines={1} style={styles.markerAction}>
                  CLASS {marker.classId.toString().padStart(2, "0")} {"//"} TAP
                  TO ANALYZE VALUE
                </Text>
                <Text style={styles.markerChevron}>›</Text>
              </View>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  targetId: {
    position: "absolute",
    top: 5,
    left: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "rgba(3, 7, 12, 0.76)",
    borderWidth: 0.5,
    borderColor: "rgba(88, 223, 232, 0.34)",
  },
  targetIdText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 6,
    lineHeight: 7,
    letterSpacing: 0.6,
  },
  markerPanelHost: {
    position: "absolute",
    zIndex: 12,
  },
  markerPanel: {
    width: "100%",
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.52)",
    backgroundColor: "rgba(3, 7, 12, 0.94)",
    experimental_backgroundImage: `
      radial-gradient(circle at 100% 0%, rgba(141, 114, 255, 0.17) 0%, transparent 44%),
      linear-gradient(115deg, rgba(88, 223, 232, 0.10) 0%, rgba(3, 7, 12, 0.02) 54%)
    `,
    boxShadow:
      "0 0 28px rgba(88, 223, 232, 0.18), 0 8px 22px rgba(0, 0, 0, 0.52)",
    gap: 3,
  },
  markerPanelAccent: {
    position: "absolute",
    top: 9,
    bottom: 9,
    left: 0,
    width: 2,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  markerPanelHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockGlyph: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 7px rgba(88, 223, 232, 0.46)",
  },
  lockGlyphCore: {
    width: 3,
    height: 3,
    backgroundColor: theme.colors.goldBright,
  },
  markerEyebrow: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 1.1,
  },
  confidencePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "rgba(242, 211, 138, 0.38)",
    backgroundColor: "rgba(242, 211, 138, 0.08)",
  },
  confidenceText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.35,
  },
  markerLabel: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  markerPanelFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  markerAction: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.5)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.48,
  },
  markerChevron: {
    color: theme.colors.scannerViolet,
    fontSize: 16,
    lineHeight: 16,
    fontWeight: "800",
  },
  markerPanelPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  markerPanelDisabled: {
    opacity: 0.46,
  },
});