import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ValueRadarTargetGraphic } from "@/components/scanner/value-radar-target-graphic";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "@/components/scanner/value-radar-visual.native";

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
        <ValueRadarTargetGraphic
          accessibilityHint="Captures this item for full KeepFlip identification and current market analysis"
          accessibilityLabel={`Analyze potential ${marker.label}`}
          animationKey={marker.classId}
          disabled={disabled}
          height={targetHeight}
          label={marker.label}
          onPress={() => onMarkerPress(marker)}
          scoreText={`${Math.round(marker.score * 100)}% LOCK`}
          style={[
            {
              left: targetLeft,
              top: targetTop,
            },
          ]}
          width={targetWidth}
        />
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
});
