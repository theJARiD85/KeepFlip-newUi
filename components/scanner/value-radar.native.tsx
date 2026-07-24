import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarOverlay as ValueRadarVisualOverlay,
  useValueRadar,
} from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export { useValueRadar };

type ValueRadarOverlayProps = ComponentProps<
  typeof ValueRadarVisualOverlay
> & {
  flashButton?: ReactNode;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function ValueRadarOverlay({
  flashButton,
  focusBounds,
  marker,
  status,
  ...overlayProps
}: ValueRadarOverlayProps) {
  const { height, width } = overlayProps;
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

  const statusWidth = Math.min(194, Math.max(154, focusWidth - 24));
  const statusLeft = clamp(
    focusX + 12,
    8,
    Math.max(8, width - statusWidth - 8),
  );
  const statusTop = clamp(
    focusY - 58,
    8,
    Math.max(8, height - 60),
  );

  const railWidth = Math.min(224, Math.max(150, focusWidth - 24));
  const railLeft = clamp(
    focusX + (focusWidth - railWidth) / 2,
    8,
    Math.max(8, width - railWidth - 8),
  );
  const railTop = clamp(
    focusY + focusHeight - 30,
    8,
    Math.max(8, height - 28),
  );

  const flashTop = clamp(focusY + 18, 8, Math.max(8, height - 60));
  const flashLeft = clamp(focusX + 18, 8, Math.max(8, width - 60));

  const statusLabel =
    status === "ready"
      ? "ONLINE"
      : status === "error"
        ? "OFFLINE"
        : "CALIBRATING";
  const statusMeta =
    status === "ready"
      ? "LOCAL VISION // PASSIVE"
      : status === "error"
        ? "MODEL RETRY REQUIRED"
        : "LOADING ON-DEVICE MODEL";
  const acquisitionLabel =
    status === "ready"
      ? marker
        ? "TARGET 01 // LOCKED"
        : "SEARCHING OBJECT FIELD"
      : status === "error"
        ? "SENSOR PATH INTERRUPTED"
        : "INITIALIZING SENSOR PATH";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ValueRadarVisualOverlay
        {...overlayProps}
        focusBounds={focusBounds}
        marker={marker}
        status={status}
      />

      <View
        pointerEvents="none"
        style={[
          styles.staticHeaderBand,
          {
            left: focusX,
            top: Math.max(0, statusTop - 6),
            width: focusWidth,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.statusModule,
          { left: statusLeft, top: statusTop, width: statusWidth },
          status === "error" && styles.statusModuleError,
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
            {statusLabel}
          </Text>
        </View>
        <View style={styles.statusFooter}>
          <Text numberOfLines={1} style={styles.statusMeta}>
            {statusMeta}
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

      <View
        pointerEvents="none"
        style={[
          styles.staticFooterBand,
          {
            left: focusX,
            top: railTop - 5,
            width: focusWidth,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.acquisitionRail,
          { left: railLeft, top: railTop, width: railWidth },
          status === "error" && styles.acquisitionRailError,
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
          {acquisitionLabel}
        </Text>
      </View>

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

const styles = StyleSheet.create({
  staticHeaderBand: {
    position: "absolute",
    height: 128,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.12)",
    backgroundColor: "rgba(2, 5, 9, 0.94)",
    experimental_backgroundImage: `
      linear-gradient(90deg, rgba(88, 223, 232, 0.08) 0%, rgba(3, 6, 11, 0.96) 40%, rgba(141, 114, 255, 0.08) 100%)
    `,
    zIndex: 60,
  },
  staticFooterBand: {
    position: "absolute",
    height: 32,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.12)",
    backgroundColor: "rgba(2, 5, 9, 0.9)",
    zIndex: 60,
  },
  statusModule: {
    position: "absolute",
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
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
    zIndex: 70,
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
    position: "absolute",
    minHeight: 22,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(2, 5, 9, 0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    zIndex: 70,
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