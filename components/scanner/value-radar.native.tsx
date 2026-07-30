import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarTargetOverlay,
  type ValueRadarTargetOverlayProps,
} from "@/components/scanner/value-radar-chrome.native.android";
import { useValueRadar } from "@/components/scanner/value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "@/components/scanner/value-radar-visual.native";

export { useValueRadar };

export type ValueRadarOverlayProps = ValueRadarTargetOverlayProps & {
  avoidBottomAction?: boolean;
};

const PANEL_GAP = 12;
const PANEL_MARGIN = 10;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  const {
    avoidBottomAction = false,
    disabled = false,
    focusBounds,
    height,
    marker,
    onMarkerPress,
    status,
    width,
  } = props;

  const horizontalInset = 4;
  const fallbackFocusTop = Math.max(68, height * 0.1);
  const fallbackFocusBottom = 18;
  
  const focusScaleX =
    focusBounds != null
      ? width / Math.max(focusBounds.previewWidth, 1)
      : 1;
  
  const focusScaleY =
    focusBounds != null
      ? height / Math.max(focusBounds.previewHeight, 1)
      : 1;
  
  const focusX = focusBounds
    ? focusBounds.x * focusScaleX
    : horizontalInset;
  
  const focusY = focusBounds
    ? focusBounds.y * focusScaleY
    : fallbackFocusTop;
  
  const focusWidth = focusBounds
    ? focusBounds.width * focusScaleX
    : Math.max(0, width - horizontalInset * 2);
  
  const focusHeight = focusBounds
    ? focusBounds.height * focusScaleY
    : Math.max(
        120,
        height - fallbackFocusTop - fallbackFocusBottom,
      );

  const sourceWidth = Math.max(marker?.sourceWidth ?? width, 1);
  const sourceHeight = Math.max(marker?.sourceHeight ?? height, 1);
  const previewScale = Math.max(width / sourceWidth, height / sourceHeight);
  const renderedHeight = sourceHeight * previewScale;
  const previewOffsetY = (height - renderedHeight) / 2;
  const rawMarkerTop = marker
    ? previewOffsetY + marker.y * renderedHeight
    : focusY;
  const rawMarkerHeight = marker ? marker.height * renderedHeight : 0;
  const markerCenterY = rawMarkerTop + rawMarkerHeight / 2;

  const maxTargetHeight = Math.max(56, Math.min(184, focusHeight - 18));
  const minTargetHeight = Math.min(92, maxTargetHeight);
  const targetHeight = clamp(
    rawMarkerHeight + 26,
    minTargetHeight,
    maxTargetHeight,
  );
  const targetTop = clamp(
    markerCenterY - targetHeight / 2,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - targetHeight - 8),
  );

  const panelWidth = Math.min(300, Math.max(210, focusWidth - 18));
  const panelHeight = 122;
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
  const panelTop = avoidBottomAction
    ? clamp(
        focusY + 14,
        PANEL_MARGIN,
        Math.max(PANEL_MARGIN, height - panelHeight - PANEL_MARGIN),
      )
    : canPlaceBelow
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
            <View pointerEvents="none" style={styles.markerAccent} />

            <View pointerEvents="none" style={styles.markerHeading}>
              <View style={styles.markerIcon}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="viewfinder"
                  size={16}
                />
              </View>
              <Text style={styles.markerEyebrow}>POTENTIAL FIND</Text>
              <Text style={styles.confidenceText}>
                {Math.round(marker.score * 100)
                  .toString()
                  .padStart(2, "0")}
                % LOCK
              </Text>
            </View>

            <View pointerEvents="none" style={styles.markerContent}>
              <Text numberOfLines={1} style={styles.markerLabel}>
                {marker.label}
              </Text>

              <View style={styles.markerFooter}>
                <View style={styles.markerFooterSignal} />
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
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.46)",
    backgroundColor: "rgba(2, 5, 10, 0.96)",
    experimental_backgroundImage: `
      radial-gradient(circle at 92% 8%, rgba(141, 114, 255, 0.14) 0%, transparent 42%),
      linear-gradient(115deg, rgba(88, 223, 232, 0.08) 0%, rgba(2, 5, 10, 0.02) 52%)
    `,
    boxShadow:
      "0 14px 34px rgba(0, 0, 0, 0.58), 0 0 22px rgba(88, 223, 232, 0.14)",
  },
  markerAccent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 12px rgba(88, 223, 232, 0.78)",
  },
  markerContent: {
    flex: 1,
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  markerHeading: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 11,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  markerIcon: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.38)",
    backgroundColor: "rgba(88, 223, 232, 0.1)",
  },
  markerEyebrow: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  confidenceText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
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
  markerFooterSignal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerViolet,
    boxShadow: "0 0 8px rgba(141, 114, 255, 0.82)",
  },
  markerAction: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.64)",
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
