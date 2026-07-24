import type { ComponentProps, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarOverlay as ValueRadarVisualOverlay,
  type ValueRadarMarker,
  type ValueRadarStatus,
  type ValueRadarViewport,
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

type ValueRadarVisualProps = ComponentProps<typeof ValueRadarVisualOverlay>;

export type ValueRadarTargetOverlayProps = ValueRadarVisualProps & {
  flashButton?: ReactNode;
};

export type ValueRadarOverlayProps = ValueRadarTargetOverlayProps;

type RadarGeometry = {
  focusHeight: number;
  focusWidth: number;
  focusX: number;
  focusY: number;
  originalBarLeft: number;
  originalBarTop: number;
  originalBarWidth: number;
  originalBubbleLeft: number;
  originalBubbleTop: number;
  originalBubbleWidth: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getRadarGeometry(
  width: number,
  height: number,
  focusBounds: ValueRadarViewport | null | undefined,
  marker: ValueRadarMarker | null,
  status: ValueRadarStatus,
): RadarGeometry {
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

  const originalBubbleWidth = Math.min(
    194,
    Math.max(154, focusWidth - 24),
  );
  const originalBubbleLeft = clamp(
    focusX + focusWidth - originalBubbleWidth - 12,
    8,
    Math.max(8, width - originalBubbleWidth - 8),
  );
  const originalBubbleTop = clamp(
    marker && status === "ready" ? focusY - 58 : focusY + 12,
    8,
    Math.max(8, height - 60),
  );

  const originalBarWidth = Math.min(224, Math.max(150, focusWidth - 24));
  const originalBarLeft = clamp(
    focusX + 12,
    8,
    Math.max(8, width - originalBarWidth - 8),
  );
  const originalBarTop = clamp(
    focusY + focusHeight - 34,
    8,
    Math.max(8, height - 28),
  );

  return {
    focusHeight,
    focusWidth,
    focusX,
    focusY,
    originalBarLeft,
    originalBarTop,
    originalBarWidth,
    originalBubbleLeft,
    originalBubbleTop,
    originalBubbleWidth,
  };
}

function statusCopy(status: ValueRadarStatus) {
  if (status === "ready") {
    return {
      label: "ONLINE",
      meta: "LOCAL VISION // PASSIVE",
    };
  }

  if (status === "error") {
    return {
      label: "OFFLINE",
      meta: "MODEL RETRY REQUIRED",
    };
  }

  return {
    label: "CALIBRATING",
    meta: "LOADING ON-DEVICE MODEL",
  };
}

function acquisitionCopy(
  marker: ValueRadarMarker | null,
  status: ValueRadarStatus,
) {
  if (status === "ready") {
    return marker ? "TARGET 01 // LOCKED" : "SEARCHING OBJECT FIELD";
  }

  return status === "error"
    ? "SENSOR PATH INTERRUPTED"
    : "INITIALIZING SENSOR PATH";
}

export function ValueRadarBubble({
  status,
  style,
  width = 194,
}: ValueRadarBubbleProps) {
  const copy = statusCopy(status);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.statusModule,
        { width },
        status === "error" && styles.statusModuleError,
        style,
      ]}
    >
      <View
        style={[
          styles.statusAccent,
          status === "loading" && styles.statusAccentLoading,
          status === "error" && styles.statusAccentError,
        ]}
      />

      <View style={styles.statusHeading}>
        <View
          style={[
            styles.statusPulse,
            status === "loading" && styles.statusPulseLoading,
            status === "error" && styles.statusPulseError,
          ]}
        />
        <Text style={styles.statusName}>VALUE RADAR</Text>
        <Text style={styles.statusSeparator}>{"//"}</Text>
        <Text
          style={[
            styles.statusState,
            status === "loading" && styles.statusStateLoading,
            status === "error" && styles.statusStateError,
          ]}
        >
          {copy.label}
        </Text>
      </View>

      <View style={styles.statusFooter}>
        <Text numberOfLines={1} style={styles.statusMeta}>
          {copy.meta}
        </Text>
        <View style={styles.signalBars}>
          <View style={[styles.signalBar, styles.signalBarLow]} />
          <View style={[styles.signalBar, styles.signalBarMid]} />
          <View
            style={[
              styles.signalBar,
              styles.signalBarHigh,
              status === "error" && styles.signalBarError,
            ]}
          />
        </View>
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
  return (
    <View
      pointerEvents="none"
      style={[
        styles.acquisitionRail,
        { width },
        status === "error" && styles.acquisitionRailError,
        style,
      ]}
    >
      <View style={styles.acquisitionIndex}>
        <Text style={styles.acquisitionIndexText}>
          {marker && status === "ready" ? "01" : "--"}
        </Text>
      </View>

      <View style={styles.acquisitionTrack}>
        <View style={styles.acquisitionTrackLine} />
        <View
          style={[
            styles.acquisitionTrackNode,
            status === "error" && styles.acquisitionTrackNodeError,
          ]}
        />
      </View>

      <Text numberOfLines={1} style={styles.acquisitionText}>
        {acquisitionCopy(marker, status)}
      </Text>
    </View>
  );
}

export function ValueRadarTargetOverlay({
  flashButton,
  focusBounds,
  height,
  marker,
  status,
  width,
  ...visualProps
}: ValueRadarTargetOverlayProps) {
  const geometry = getRadarGeometry(
    width,
    height,
    focusBounds,
    marker,
    status,
  );
  const flashTop = clamp(
    geometry.focusY + 18,
    8,
    Math.max(8, height - 60),
  );
  const flashLeft = clamp(
    geometry.focusX + 18,
    8,
    Math.max(8, width - 60),
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ValueRadarVisualOverlay
        {...visualProps}
        focusBounds={focusBounds}
        height={height}
        marker={marker}
        status={status}
        width={width}
      />

      <View
        pointerEvents="none"
        style={[
          styles.chromeMask,
          {
            height: 64,
            left: geometry.originalBubbleLeft - 5,
            top: geometry.originalBubbleTop - 5,
            width: geometry.originalBubbleWidth + 10,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.chromeMask,
          {
            height: 32,
            left: geometry.originalBarLeft - 5,
            top: geometry.originalBarTop - 5,
            width: geometry.originalBarWidth + 10,
          },
        ]}
      />

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
    </View>
  );
}

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  const geometry = getRadarGeometry(
    props.width,
    props.height,
    props.focusBounds,
    props.marker,
    props.status,
  );
  const bubbleWidth = Math.min(
    194,
    Math.max(154, geometry.focusWidth - 24),
  );
  const bubbleLeft = clamp(
    geometry.focusX + 12,
    8,
    Math.max(8, props.width - bubbleWidth - 8),
  );
  const bubbleTop = clamp(
    geometry.focusY - 58,
    8,
    Math.max(8, props.height - 60),
  );
  const barWidth = Math.min(224, Math.max(150, geometry.focusWidth - 24));
  const barLeft = clamp(
    geometry.focusX + (geometry.focusWidth - barWidth) / 2,
    8,
    Math.max(8, props.width - barWidth - 8),
  );
  const barTop = clamp(
    geometry.focusY + geometry.focusHeight - 30,
    8,
    Math.max(8, props.height - 28),
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ValueRadarTargetOverlay {...props} />
      <ValueRadarBubble
        status={props.status}
        style={{ left: bubbleLeft, position: "absolute", top: bubbleTop }}
        width={bubbleWidth}
      />
      <ValueRadarBar
        marker={props.marker}
        status={props.status}
        style={{ left: barLeft, position: "absolute", top: barTop }}
        width={barWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chromeMask: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.12)",
    backgroundColor: "rgba(2, 5, 9, 0.96)",
    experimental_backgroundImage: `
      linear-gradient(90deg, rgba(88, 223, 232, 0.07) 0%, rgba(3, 6, 11, 0.98) 42%, rgba(141, 114, 255, 0.07) 100%)
    `,
    zIndex: 60,
  },
  statusModule: {
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(3, 7, 12, 0.94)",
    experimental_backgroundImage: `
      radial-gradient(circle at 100% 0%, rgba(141, 114, 255, 0.18) 0%, transparent 48%),
      linear-gradient(110deg, rgba(88, 223, 232, 0.09) 0%, rgba(4, 6, 11, 0.02) 48%)
    `,
    boxShadow:
      "0 0 24px rgba(88, 223, 232, 0.12), 0 7px 20px rgba(0, 0, 0, 0.36)",
    gap: 5,
  },
  statusModuleError: {
    borderColor: "rgba(232, 97, 88, 0.48)",
  },
  statusAccent: {
    position: "absolute",
    top: 7,
    bottom: 7,
    left: 0,
    width: 2,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  statusAccentLoading: {
    backgroundColor: theme.colors.goldBright,
  },
  statusAccentError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "0 0 8px rgba(232, 97, 88, 0.72)",
  },
  statusHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.88)",
  },
  statusPulseLoading: {
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 8px rgba(242, 211, 138, 0.72)",
  },
  statusPulseError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "none",
  },
  statusName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.2,
  },
  statusSeparator: {
    color: "rgba(141, 114, 255, 0.78)",
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
  },
  statusState: {
    marginLeft: "auto",
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.9,
  },
  statusStateLoading: {
    color: theme.colors.goldBright,
  },
  statusStateError: {
    color: theme.colors.danger,
  },
  statusFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  statusMeta: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.52)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.72,
  },
  signalBars: {
    height: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.scannerCyan,
  },
  signalBarLow: {
    height: 3,
    opacity: 0.4,
  },
  signalBarMid: {
    height: 6,
    opacity: 0.66,
  },
  signalBarHigh: {
    height: 9,
  },
  signalBarError: {
    backgroundColor: theme.colors.danger,
  },
  acquisitionRail: {
    minHeight: 22,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(2, 5, 9, 0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  acquisitionRailError: {
    borderColor: "rgba(232, 97, 88, 0.38)",
  },
  acquisitionIndex: {
    width: 19,
    height: 14,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(141, 114, 255, 0.16)",
    borderWidth: 0.5,
    borderColor: "rgba(141, 114, 255, 0.38)",
  },
  acquisitionIndexText: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    fontVariant: ["tabular-nums"],
  },
  acquisitionTrack: {
    width: 25,
    height: 8,
    justifyContent: "center",
  },
  acquisitionTrackLine: {
    height: 1,
    backgroundColor: "rgba(88, 223, 232, 0.34)",
  },
  acquisitionTrackNode: {
    position: "absolute",
    left: 9,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  acquisitionTrackNodeError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "none",
  },
  acquisitionText: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.58)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.66,
  },
  flashButtonHost: {
    position: "absolute",
    zIndex: 80,
    elevation: 80,
  },
});