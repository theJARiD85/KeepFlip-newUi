import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarTargetOverlay,
  type ValueRadarTargetOverlayProps,
} from "./value-radar-chrome.native.android";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function ValueRadarPresentationOverlay(
  props: ValueRadarTargetOverlayProps,
) {
  const {
    disabled = false,
    focusBounds,
    height,
    marker,
    onMarkerPress,
    status,
    width,
  } = props;

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

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ValueRadarTargetOverlay {...props} />

      {marker && status === "ready" ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
