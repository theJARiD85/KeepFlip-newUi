import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";

export type ScannerToolId = "single" | "multi" | "batch" | "upload";

type ScannerTool = {
  accent: string;
  glow: string;
  icon:
    | "viewfinder"
    | "rectangle.stack.fill"
    | "square.grid.2x2.fill"
    | "photo.on.rectangle.angled";
  id: ScannerToolId;
  label: string;
  shortLabel: string;
  surface: string;
};

export const scannerTools: ScannerTool[] = [
  {
    id: "single",
    label: "Single scan",
    shortLabel: "SINGLE",
    icon: "viewfinder",
    accent: theme.colors.goldBright,
    surface: "rgba(242, 211, 138, 0.12)",
    glow: "rgba(242, 211, 138, 0.42)",
  },
  {
    id: "multi",
    label: "Multi-scan",
    shortLabel: "MULTI",
    icon: "rectangle.stack.fill",
    accent: theme.colors.scannerCyan,
    surface: "rgba(88, 223, 232, 0.12)",
    glow: "rgba(88, 223, 232, 0.40)",
  },
  {
    id: "batch",
    label: "Batch-scan",
    shortLabel: "BATCH",
    icon: "square.grid.2x2.fill",
    accent: theme.colors.scannerViolet,
    surface: "rgba(141, 114, 255, 0.13)",
    glow: "rgba(141, 114, 255, 0.40)",
  },
  {
    id: "upload",
    label: "Upload photo",
    shortLabel: "UPLOAD",
    icon: "photo.on.rectangle.angled",
    accent: theme.colors.cream,
    surface: "rgba(247, 242, 232, 0.10)",
    glow: "rgba(247, 242, 232, 0.30)",
  },
];

type ScannerToolCarouselProps = {
  badges?: Partial<Record<ScannerToolId, number>>;
  disabled?: boolean;
  onActivate: (tool: ScannerToolId) => void;
  onSelect: (tool: ScannerToolId) => void;
  selectedTool: ScannerToolId;
};

type SideToolButtonProps = {
  badge?: number;
  disabled: boolean;
  onPress: () => void;
  side: "left" | "right";
  size: number;
  tool: ScannerTool;
};

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function activationHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function ToolBadge({
  accent,
  count,
}: {
  accent: string;
  count?: number;
}) {
  if (!count) return null;

  return (
    <View style={[styles.badge, { borderColor: accent }]}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

function SideToolButton({
  badge,
  disabled,
  onPress,
  side,
  size,
  tool,
}: SideToolButtonProps) {
  return (
    <Pressable
      accessibilityHint={`Selects ${tool.label}`}
      accessibilityLabel={tool.label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sideButton,
        side === "left" ? styles.sideButtonLeft : styles.sideButtonRight,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: `${tool.accent}88`,
          backgroundColor: "rgba(3, 7, 12, 0.88)",
          boxShadow: `0 0 16px ${tool.glow}`,
        },
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View
        style={[
          styles.sideButtonCore,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.36,
            borderColor: `${tool.accent}66`,
            backgroundColor: tool.surface,
          },
        ]}
      >
        <IconSymbol
          color={tool.accent}
          name={tool.icon}
          size={Math.round(size * 0.42)}
        />
      </View>
      <ToolBadge accent={tool.accent} count={badge} />
    </Pressable>
  );
}

export function ScannerToolCarousel({
  badges,
  disabled = false,
  onActivate,
  onSelect,
  selectedTool,
}: ScannerToolCarouselProps) {
  const {
    controlDockWidth,
    moderateScale,
    scannerCarouselHeight,
  } = useResponsiveLayout();

  const selectedIndex = Math.max(
    0,
    scannerTools.findIndex((tool) => tool.id === selectedTool),
  );
  const selected = scannerTools[selectedIndex] ?? scannerTools[0];
  const previous = scannerTools[modulo(selectedIndex - 1, scannerTools.length)];
  const next = scannerTools[modulo(selectedIndex + 1, scannerTools.length)];

  const panelHeight = moderateScale(88, 0.4);
  const primarySize = moderateScale(92, 0.52);
  const sideSize = moderateScale(48, 0.48);
  const primaryCoreSize = primarySize * 0.72;

  const selectRelative = useCallback(
    (step: number) => {
      const tool =
        scannerTools[modulo(selectedIndex + step, scannerTools.length)];
      if (!tool || tool.id === selectedTool) return;
      selectionHaptic();
      onSelect(tool.id);
    },
    [onSelect, selectedIndex, selectedTool],
  );

  const selectPrevious = useCallback(() => {
    if (disabled) return;
    selectRelative(-1);
  }, [disabled, selectRelative]);

  const selectNext = useCallback(() => {
    if (disabled) return;
    selectRelative(1);
  }, [disabled, selectRelative]);

  const activateSelected = useCallback(() => {
    if (disabled) return;
    activationHaptic();
    onActivate(selected.id);
  }, [disabled, onActivate, selected.id]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .activeOffsetX([-14, 14])
        .failOffsetY([-18, 18])
        .onEnd(({ translationX, velocityX }) => {
          const intent = translationX + velocityX * 0.12;
          if (Math.abs(intent) < 42) return;
          scheduleOnRN(selectRelative, intent < 0 ? 1 : -1);
        }),
    [disabled, selectRelative],
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.root,
          {
            width: controlDockWidth,
            height: scannerCarouselHeight,
          },
          disabled && styles.rootDisabled,
        ]}
      >
        <View
          style={[
            styles.hudPanel,
            {
              height: panelHeight,
              width: controlDockWidth,
            },
          ]}
        >
          <View style={styles.panelAccent} />
          <View pointerEvents="none" style={styles.panelTopLine} />
          <View pointerEvents="none" style={styles.panelBloom} />

          <View style={styles.sideControlsRow}>
            <SideToolButton
              badge={badges?.[previous.id]}
              disabled={disabled}
              onPress={selectPrevious}
              side="left"
              size={sideSize}
              tool={previous}
            />

            <View pointerEvents="none" style={styles.centerTelemetry}>
              <Text style={styles.telemetryEyebrow}>SCANNER TOOL</Text>
              <View style={styles.telemetryLabelRow}>
                <View
                  style={[
                    styles.telemetryLight,
                    {
                      backgroundColor: selected.accent,
                      boxShadow: `0 0 10px ${selected.glow}`,
                    },
                  ]}
                />
                <Text numberOfLines={1} style={styles.telemetryLabel}>
                  {selected.label.toUpperCase()}
                </Text>
              </View>
            </View>

            <SideToolButton
              badge={badges?.[next.id]}
              disabled={disabled}
              onPress={selectNext}
              side="right"
              size={sideSize}
              tool={next}
            />
          </View>

          <View pointerEvents="none" style={styles.modeTicks}>
            {scannerTools.map((tool) => (
              <View
                key={tool.id}
                style={[
                  styles.modeTick,
                  tool.id === selected.id && {
                    width: 16,
                    backgroundColor: selected.accent,
                    boxShadow: `0 0 8px ${selected.glow}`,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          key={selected.id}
          style={[
            styles.primaryButtonHost,
            {
              width: primarySize,
              height: primarySize,
              bottom: panelHeight - primarySize * 0.38,
            },
          ]}
        >
          <Pressable
            accessibilityHint={`Activates ${selected.label}`}
            accessibilityLabel={`${selected.label}, activate`}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: true }}
            disabled={disabled}
            onPress={activateSelected}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                width: primarySize,
                height: primarySize,
                borderRadius: primarySize / 2,
                borderColor: selected.accent,
                backgroundColor: "rgba(3, 7, 12, 0.94)",
                boxShadow: `0 0 30px ${selected.glow}, 0 12px 26px rgba(0, 0, 0, 0.54)`,
              },
              pressed && styles.primaryButtonPressed,
              disabled && styles.buttonDisabled,
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.primaryOrbit,
                {
                  borderColor: `${selected.accent}80`,
                  boxShadow: `inset 0 0 18px ${selected.glow}`,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.primaryCore,
                {
                  width: primaryCoreSize,
                  height: primaryCoreSize,
                  borderRadius: primaryCoreSize / 2,
                  borderColor: selected.accent,
                  backgroundColor: selected.surface,
                },
              ]}
            >
              <IconSymbol
                color={selected.accent}
                name={selected.icon}
                size={Math.round(primaryCoreSize * 0.56)}
              />
            </View>
            <ToolBadge accent={selected.accent} count={badges?.[selected.id]} />
          </Pressable>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  rootDisabled: {
    opacity: 0.56,
  },
  hudPanel: {
    position: "absolute",
    bottom: 0,
    overflow: "hidden",
    borderRadius: 18,
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
  },
  panelAccent: {
    position: "absolute",
    top: 10,
    bottom: 10,
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 9px rgba(88, 223, 232, 0.88)",
  },
  panelTopLine: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    experimental_backgroundImage:
      "linear-gradient(90deg, transparent 0%, rgba(88, 223, 232, 0.72) 42%, rgba(141, 114, 255, 0.58) 68%, transparent 100%)",
  },
  panelBloom: {
    position: "absolute",
    top: -34,
    right: -22,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(141, 114, 255, 0.08)",
    boxShadow: "0 0 34px rgba(141, 114, 255, 0.18)",
  },
  sideControlsRow: {
    flex: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sideButton: {
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sideButtonLeft: {
    marginLeft: 8,
  },
  sideButtonRight: {
    marginRight: 8,
  },
  sideButtonCore: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.75,
  },
  centerTelemetry: {
    width: "42%",
    minWidth: 118,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 30,
    gap: 3,
  },
  telemetryEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 1.15,
  },
  telemetryLabelRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  telemetryLight: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  telemetryLabel: {
    flexShrink: 1,
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 0.8,
  },
  modeTicks: {
    position: "absolute",
    bottom: 7,
    alignSelf: "center",
    height: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modeTick: {
    width: 5,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(247, 242, 232, 0.20)",
  },
  primaryButtonHost: {
    position: "absolute",
    zIndex: 30,
    alignSelf: "center",
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  primaryButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.96 }],
  },
  primaryOrbit: {
    ...StyleSheet.absoluteFill,
    margin: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryCore: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(3, 7, 12, 0.96)",
  },
  badgeText: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
