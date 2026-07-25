import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarTargetOverlay,
  type ValueRadarTargetOverlayProps,
} from "./value-radar-chrome.native.android";
import { useValueRadar } from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export { useValueRadar };

export type ValueRadarOverlayProps = ValueRadarTargetOverlayProps;

const POTENTIAL_FIND_ASPECT_RATIO = 323.56247 / 165.70309;
const PANEL_GAP = 12;
const PANEL_MARGIN = 10;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
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
  const markerCenterX = rawMarkerLeft + rawMarkerWidth / 2;
  const markerCenterY = rawMarkerTop + rawMarkerHeight / 2;

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
    markerCenterX - targetWidth / 2,
    focusX + 8,
    Math.max(focusX + 8, focusX + focusWidth - targetWidth - 8),
  );
  const targetTop = clamp(
    markerCenterY - targetHeight / 2,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - targetHeight - 8),
  );

  const panelWidth = Math.min(300, Math.max(180, focusWidth - 18));
  const panelHeight = panelWidth / POTENTIAL_FIND_ASPECT_RATIO;
  const panelLeft = clamp(
    focusX + focusWidth / 2 - panelWidth / 2,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, width - panelWidth - PANEL_MARGIN),
  );

  const belowFocusTop = focusY + focusHeight + PANEL_GAP;
  const aboveFocusTop = focusY - panelHeight - PANEL_GAP;
  const canPlaceBelow =
    belowFocusTop + panelHeight <= height - PANEL_MARGIN;
  const canPlaceAbove = aboveFocusTop >= PANEL_MARGIN;
  const topDock = PANEL_MARGIN;
  const bottomDock = Math.max(
    PANEL_MARGIN,
    height - panelHeight - PANEL_MARGIN,
  );
  const targetCenterY = targetTop + targetHeight / 2;
  const panelTop = canPlaceBelow
    ? belowFocusTop
    : canPlaceAbove
      ? aboveFocusTop
      : targetCenterY < height / 2
        ? bottomDock
        : topDock;

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
              height: panelHeight,
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
            <Image
              accessibilityIgnoresInvertColors
              contentFit="fill"
              pointerEvents="none"
              source={require("@/assets/potential-find.svg")}
              style={StyleSheet.absoluteFill}
            />

            <View pointerEvents="none" style={styles.markerContent}>
              <View style={styles.markerHeading}>
                <Text style={styles.markerEyebrow}>POTENTIAL FIND</Text>
                <Text style={styles.confidenceText}>
                  {Math.round(marker.score * 100)
                    .toString()
                    .padStart(2, "0")}
                  % LOCK
                </Text>
              </View>

              <Text numberOfLines={1} style={styles.markerLabel}>
                {marker.label}
              </Text>

              <View style={styles.markerFooter}>
                <Text numberOfLines={1} style={styles.markerAction}>
                  CLASS {marker.classId.toString().padStart(2, "0")} {"//"} TAP
                  TO ANALYZE VALUE
                </Text>
                <Text style={styles.markerChevron}>›</Text>
              </View>
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
    zIndex: 22,
    elevation: 22,
  },
  markerPanel: {
    flex: 1,
    overflow: "hidden",
  },
  markerContent: {
    flex: 1,
    justifyContent: "center",
    gap: 5,
    paddingTop: 22,
    paddingRight: 28,
    paddingBottom: 20,
    paddingLeft: 35,
  },
  markerHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  markerEyebrow: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.25,
  },
  confidenceText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.45,
  },
  markerLabel: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  markerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  markerAction: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.52)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.5,
  },
  markerChevron: {
    color: theme.colors.scannerViolet,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "800",
  },
  markerPanelPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  markerPanelDisabled: {
    opacity: 0.46,
  },
});
