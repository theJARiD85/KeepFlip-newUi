import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

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
        boxShadow: `${glow}, inset 0 0 12px rgba(88, 223, 232, 0.08)`,
      },
      pressed && styles.flashControlPressed,
      disabled && styles.flashControlDisabled,
    ],
    children: tintFlashChildren(element.props.children, color),
  });
}

export function ValueRadarPresentationOverlay(
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
    : Math.max(96, height * 0.22);
  const focusWidth = focusBounds
    ? focusBounds.width * focusScaleX
    : width - 24;
  const focusHeight = focusBounds
    ? focusBounds.height * focusScaleY
    : Math.min(360, height * 0.48);

  const dividerHeight = 62;
  const dividerWidth = clamp(focusWidth, 210, Math.max(210, width - 16));
  const dividerLeft = clamp(
    focusX,
    8,
    Math.max(8, width - dividerWidth - 8),
  );
  const dividerTop = clamp(
    focusY - dividerHeight - 8,
    8,
    Math.max(8, height - dividerHeight - 8),
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
          styles.radarDividerHost,
          {
            height: dividerHeight,
            left: dividerLeft,
            top: dividerTop,
            width: dividerWidth,
          },
        ]}
      >
        <View pointerEvents="box-none" style={styles.radarDivider}>
          <View pointerEvents="none" style={styles.radarDividerAccent} />
          <View pointerEvents="none" style={styles.radarDividerBloom} />

          <View pointerEvents="none" style={styles.radarDividerCopy}>
            <View style={styles.radarHeading}>
              <View
                style={[
                  styles.radarStatusLight,
                  {
                    backgroundColor: cue.color,
                    boxShadow: cue.glow,
                  },
                ]}
              />
              <Text style={styles.radarName}>VALUE RADAR</Text>
              <Text style={styles.radarSeparator}>{"//"}</Text>
              <Text style={[styles.radarState, { color: cue.color }]}>
                {cue.label}
              </Text>
            </View>

            <View style={styles.radarFooter}>
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

          {flashButton ? (
            <View pointerEvents="box-none" style={styles.flashSlot}>
              <View pointerEvents="none" style={styles.flashDivider} />
              {restyleFlashButton(flashButton, cue.color, cue.glow)}
            </View>
          ) : null}
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
  radarDividerHost: {
    position: "absolute",
    zIndex: 28,
    elevation: 28,
  },
  radarDivider: {
    flex: 1,
    overflow: "hidden",
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 9,
    borderRadius: 10,
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
    flexDirection: "row",
    alignItems: "center",
  },
  radarDividerAccent: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 9px rgba(88, 223, 232, 0.88)",
  },
  radarDividerBloom: {
    position: "absolute",
    top: -34,
    right: -18,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(141, 114, 255, 0.08)",
    boxShadow: "0 0 34px rgba(141, 114, 255, 0.18)",
  },
  radarDividerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  radarHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  radarStatusLight: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radarName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.35,
  },
  radarSeparator: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
  },
  radarState: {
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.9,
  },
  radarFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  radarMeta: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.54)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.78,
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
  flashSlot: {
    height: "100%",
    paddingLeft: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  flashDivider: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    width: 1,
    backgroundColor: "rgba(88, 223, 232, 0.20)",
  },
  flashControl: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3, 7, 12, 0.84)",
  },
  flashControlPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  flashControlDisabled: {
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
