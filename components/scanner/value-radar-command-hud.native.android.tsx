import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import {
  scannerHudCopy,
  useScannerHudSnapshot,
} from "@/components/scanner/scanner-hud-store";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

import {
  ValueRadarTargetOverlay,
  type ValueRadarTargetOverlayProps,
} from "./value-radar-chrome.native.android";

const READY_COLOR = "#67F7A5";

type PressState = {
  pressed: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function statusPresentation(status: ValueRadarTargetOverlayProps["status"]) {
  if (status === "ready") {
    return {
      color: READY_COLOR,
      label: "ONLINE",
      meta: "LOCAL VISION // MODEL READY",
      glow: "0 0 10px rgba(103, 247, 165, 0.88)",
    };
  }

  if (status === "error") {
    return {
      color: theme.colors.danger,
      label: "OFFLINE",
      meta: "MODEL PATH // RETRY REQUIRED",
      glow: "0 0 10px rgba(232, 97, 88, 0.82)",
    };
  }

  return {
    color: theme.colors.goldBright,
    label: "CALIBRATING",
    meta: "LOCAL VISION // MODEL LOADING",
    glow: "0 0 10px rgba(242, 211, 138, 0.80)",
  };
}

function tintFlashChildren(node: ReactNode, color: string): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child;

    const element = child as ReactElement<any>;
    const props = element.props as {
      children?: ReactNode;
      color?: string;
    };
    const nextProps: Record<string, unknown> = {};

    if (props.color != null) nextProps.color = color;
    if (props.children != null) {
      nextProps.children = tintFlashChildren(props.children, color);
    }

    return cloneElement(element, nextProps);
  });
}

function restyleFlashButton(node: ReactNode, color: string, glow: string) {
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<any>;
  const disabled = Boolean(element.props.disabled);

  return cloneElement(element, {
    style: ({ pressed }: PressState) => [
      styles.flashControl,
      {
        borderColor: `${color}B8`,
        boxShadow: `${glow}, inset 0 0 14px rgba(88, 223, 232, 0.08)`,
      },
      pressed && styles.controlPressed,
      disabled && styles.controlDisabled,
    ],
    children: tintFlashChildren(element.props.children, color),
  });
}

export function ValueRadarCommandHud(
  props: ValueRadarTargetOverlayProps,
) {
  const {
    disabled = false,
    flashButton,
    focusBounds,
    height,
    marker,
    onMarkerPress,
    status,
    width,
  } = props;
  const hudSnapshot = useScannerHudSnapshot();
  const copy = scannerHudCopy(hudSnapshot);
  const cue = statusPresentation(status);

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
    : Math.max(300, height * 0.3);
  const focusWidth = focusBounds
    ? focusBounds.width * focusScaleX
    : width - 24;
  const focusHeight = focusBounds
    ? focusBounds.height * focusScaleY
    : Math.min(360, height * 0.48);

  const commandTop = clamp(focusY - 252, 64, 112);
  const commandBottom = Math.max(commandTop + 152, focusY - 10);
  const commandHeight = commandBottom - commandTop;
  const commandLeft = clamp(focusX, 8, 24);
  const commandWidth = clamp(
    width - commandLeft - 8,
    260,
    Math.max(260, width - 16),
  );

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
      <ValueRadarTargetOverlay {...props} flashButton={undefined} />

      <View
        pointerEvents="box-none"
        style={[
          styles.commandHost,
          {
            height: commandHeight,
            left: commandLeft,
            top: commandTop,
            width: commandWidth,
          },
        ]}
      >
        <View pointerEvents="box-none" style={styles.commandPanel}>
          <View pointerEvents="none" style={styles.commandAccent} />
          <View pointerEvents="none" style={styles.commandBloomCyan} />
          <View pointerEvents="none" style={styles.commandBloomViolet} />
          <View pointerEvents="none" style={styles.commandTopRule} />
          <View pointerEvents="none" style={styles.commandCornerTopLeft} />
          <View pointerEvents="none" style={styles.commandCornerBottomRight} />

          <View pointerEvents="none" style={styles.commandCopy}>
            <View style={styles.commandEyebrowRow}>
              <Text style={styles.brandCode}>KEEPFLIP AI</Text>
              <Text style={styles.commandSlash}>//</Text>
              <Text style={styles.commandEyebrow}>{copy.eyebrow}</Text>
            </View>

            <Text numberOfLines={1} style={styles.commandTitle}>
              {copy.title}
            </Text>

            <Text numberOfLines={2} style={styles.commandHelper}>
              {copy.helper}
            </Text>

            <View style={styles.telemetryRow}>
              <View
                style={[
                  styles.statusLight,
                  {
                    backgroundColor: cue.color,
                    boxShadow: cue.glow,
                  },
                ]}
              />
              <Text style={styles.radarName}>VALUE RADAR</Text>
              <Text style={styles.commandSlash}>//</Text>
              <Text style={[styles.radarState, { color: cue.color }]}> 
                {cue.label}
              </Text>
              <View style={styles.telemetryDivider} />
              <Text numberOfLines={1} style={styles.radarMeta}>
                {cue.meta}
              </Text>
              <View style={styles.signalBars}>
                <View
                  style={[
                    styles.signalBar,
                    styles.signalBarLow,
                    { backgroundColor: cue.color },
                  ]}
                />
                <View
                  style={[
                    styles.signalBar,
                    styles.signalBarMid,
                    { backgroundColor: cue.color },
                  ]}
                />
                <View
                  style={[
                    styles.signalBar,
                    styles.signalBarHigh,
                    { backgroundColor: cue.color },
                  ]}
                />
              </View>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.actionBay}>
            <View pointerEvents="none" style={styles.actionBayDivider} />
            <View pointerEvents="none" style={styles.menuDock}>
              <Text style={styles.menuDockLabel}>NAV</Text>
              <Text style={styles.menuDockCode}>MENU // 01</Text>
            </View>

            {flashButton ? (
              <View pointerEvents="box-none" style={styles.flashSlot}>
                <Text pointerEvents="none" style={styles.flashLabel}>
                  ILLUM
                </Text>
                {restyleFlashButton(flashButton, cue.color, cue.glow)}
              </View>
            ) : null}
          </View>
        </View>
      </View>

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
  commandHost: {
    position: "absolute",
    zIndex: 28,
    elevation: 28,
  },
  commandPanel: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.48)",
    backgroundColor: "rgba(2, 5, 9, 0.985)",
    experimental_backgroundImage: `
      radial-gradient(circle at 95% 10%, rgba(141, 114, 255, 0.18) 0%, transparent 35%),
      radial-gradient(circle at 0% 100%, rgba(88, 223, 232, 0.10) 0%, transparent 42%),
      linear-gradient(112deg, rgba(8, 18, 24, 0.99) 0%, rgba(3, 7, 12, 0.99) 58%, rgba(9, 7, 20, 0.99) 100%)
    `,
    boxShadow:
      "0 0 34px rgba(88, 223, 232, 0.16), 0 12px 34px rgba(0, 0, 0, 0.62)",
  },
  commandAccent: {
    position: "absolute",
    top: 12,
    bottom: 12,
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 12px rgba(88, 223, 232, 0.92)",
  },
  commandBloomCyan: {
    position: "absolute",
    bottom: -62,
    left: -38,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(88, 223, 232, 0.035)",
  },
  commandBloomViolet: {
    position: "absolute",
    top: -72,
    right: -50,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(141, 114, 255, 0.05)",
  },
  commandTopRule: {
    position: "absolute",
    top: 0,
    right: 34,
    left: 34,
    height: 1,
    experimental_backgroundImage:
      "linear-gradient(90deg, transparent 0%, rgba(88, 223, 232, 0.62) 36%, rgba(141, 114, 255, 0.56) 72%, transparent 100%)",
  },
  commandCornerTopLeft: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 16,
    height: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.48)",
  },
  commandCornerBottomRight: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 16,
    height: 16,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(141, 114, 255, 0.44)",
  },
  commandCopy: {
    position: "absolute",
    top: 18,
    right: 116,
    bottom: 16,
    left: 20,
    justifyContent: "center",
    gap: 7,
  },
  commandEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  brandCode: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.9,
  },
  commandSlash: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
  },
  commandEyebrow: {
    color: "rgba(247, 242, 232, 0.48)",
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 1.25,
  },
  commandTitle: {
    color: theme.colors.text,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  commandHelper: {
    maxWidth: 420,
    color: "rgba(247, 242, 232, 0.68)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  telemetryRow: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusLight: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radarName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.15,
  },
  radarState: {
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.8,
  },
  telemetryDivider: {
    width: 1,
    height: 11,
    marginHorizontal: 2,
    backgroundColor: "rgba(88, 223, 232, 0.18)",
  },
  radarMeta: {
    flexShrink: 1,
    color: "rgba(247, 242, 232, 0.42)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.72,
  },
  signalBars: {
    height: 11,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 2,
    borderRadius: 1,
  },
  signalBarLow: {
    height: 4,
    opacity: 0.48,
  },
  signalBarMid: {
    height: 7,
    opacity: 0.72,
  },
  signalBarHigh: {
    height: 10,
  },
  actionBay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 104,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 16,
    gap: 9,
  },
  actionBayDivider: {
    position: "absolute",
    top: 16,
    bottom: 16,
    left: 0,
    width: 1,
    backgroundColor: "rgba(88, 223, 232, 0.16)",
  },
  menuDock: {
    position: "absolute",
    top: 12,
    right: 8,
    width: 88,
    height: 64,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.12)",
    backgroundColor: "rgba(3, 7, 12, 0.18)",
  },
  menuDockLabel: {
    color: "rgba(242, 211, 138, 0.54)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6,
    lineHeight: 8,
    letterSpacing: 1.1,
  },
  menuDockCode: {
    color: "rgba(247, 242, 232, 0.30)",
    fontFamily: theme.fonts.analysis,
    fontSize: 5.5,
    lineHeight: 7,
    letterSpacing: 0.7,
  },
  flashSlot: {
    alignItems: "center",
    gap: 4,
  },
  flashLabel: {
    color: "rgba(247, 242, 232, 0.38)",
    fontFamily: theme.fonts.analysis,
    fontSize: 5.5,
    lineHeight: 7,
    letterSpacing: 0.9,
  },
  flashControl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3, 7, 12, 0.90)",
  },
  controlPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  controlDisabled: {
    opacity: 0.36,
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
