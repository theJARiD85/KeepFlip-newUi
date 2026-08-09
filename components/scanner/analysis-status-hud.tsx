import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";

import type { ItemAnalysisState } from "@/components/scanner/analysis-visual-types";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type AnalysisStatusHudProps = {
  bottomInset: number;
  doneLabel?: string;
  onDone: () => void;
  onRetry: () => void;
  retryLabel?: string;
  state: ItemAnalysisState;
  topInset: number;
};

type IncompleteAnalysisState = Exclude<
  ItemAnalysisState,
  { status: "analyzing" | "result" }
>;

function HudButton({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AnalysisFooter({
  bottomInset,
  state,
}: {
  bottomInset: number;
  state: Extract<ItemAnalysisState, { status: "analyzing" }>;
}) {
  const progress = Math.max(0.02, Math.min(1, state.progress ?? 0.1));
  const activeStep = state.steps?.find((step) => step.status === "active");
  const completedCount = state.steps?.filter((step) => step.status === "complete").length ?? 0;
  const totalSteps = state.steps?.length ?? 5;

  return (
    <Animated.View
      entering={FadeInUp.duration(240)}
      style={[styles.footer, { paddingBottom: bottomInset + 16 }]}
    >
      <View style={styles.footerHeader}>
        <View style={styles.liveSignal} />
        <Text numberOfLines={1} style={styles.stageLabel}>
          {state.stage ?? "VALUATION ENGINE ACTIVE"}
        </Text>
        <Text style={styles.stepCount}>
          {String(Math.min(totalSteps, completedCount + 1)).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
        </Text>
      </View>

      <Text numberOfLines={2} style={styles.detail}>
        {state.detail ?? "Calibrating the strongest resale value supported by this evidence."}
      </Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.activeStepRow}>
        <Text style={styles.activeStepLabel}>ACTIVE DIRECTIVE</Text>
        <Text numberOfLines={1} style={styles.activeStepValue}>
          {activeStep?.label ?? "Lock the median valuation"}
        </Text>
      </View>
    </Animated.View>
  );
}

function StatePanel({
  bottomInset,
  doneLabel,
  onDone,
  onRetry,
  retryLabel,
  state,
}: Omit<AnalysisStatusHudProps, "doneLabel" | "state" | "topInset"> & {
  doneLabel: string;
  state: IncompleteAnalysisState;
}) {
  const isSetup = state.status === "setup";
  const isEvidence = state.status === "insufficient-evidence";
  const title =
    state.title ??
    (isSetup
      ? "Valuation engine needs setup"
      : isEvidence
        ? "More evidence will improve the price"
        : "Valuation interrupted");
  const message =
    state.message ??
    (isEvidence
      ? "Add the requested photos before KeepFlip commits to a resale range."
      : "KeepFlip could not complete this valuation.");
  const suggestions =
    state.status === "setup"
      ? state.requirements ?? []
      : state.status === "insufficient-evidence"
        ? state.suggestedPhotos.map((photo) => photo.label)
        : [];

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={[styles.stateHost, { paddingBottom: bottomInset + 22 }]}
    >
      <View style={styles.statePanel}>
        <Text style={styles.stateEyebrow}>
          {isEvidence ? "VALUATION QUALITY HOLD" : "VALUATION SYSTEM"}
        </Text>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateMessage}>{message}</Text>

        {suggestions.slice(0, 3).map((suggestion, index) => (
          <View key={`${suggestion}-${index}`} style={styles.suggestionRow}>
            <Text style={styles.suggestionIndex}>{String(index + 1).padStart(2, "0")}</Text>
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </View>
        ))}

        <View style={styles.actions}>
          <HudButton label={retryLabel ?? (isEvidence ? "Add photos" : "Retry valuation")} onPress={onRetry} primary />
          <HudButton label={doneLabel} onPress={onDone} />
        </View>
      </View>
    </Animated.View>
  );
}

export function AnalysisStatusHud({
  bottomInset,
  doneLabel = "Back",
  onDone,
  onRetry,
  retryLabel,
  state,
  topInset,
}: AnalysisStatusHudProps) {
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        entering={FadeInDown.duration(220)}
        style={[styles.header, { paddingTop: topInset + 10 }]}
      >
        <View style={styles.brandSignal} />
        <Text style={styles.brand}>KEEPFLIP / VALUATION ENGINE</Text>
        <View style={styles.headerRule} />
        <Text style={styles.headerState}>
          {state.status === "analyzing" ? "LIVE" : "HOLD"}
        </Text>
      </Animated.View>

      {state.status === "analyzing" ? (
        <AnalysisFooter bottomInset={bottomInset} state={state} />
      ) : state.status === "result" ? null : (
        <StatePanel
          bottomInset={bottomInset}
          doneLabel={doneLabel}
          onDone={onDone}
          onRetry={onRetry}
          retryLabel={retryLabel}
          state={state}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  header: {
    position: "absolute",
    top: 0,
    right: 16,
    left: 16,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandSignal: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 10px rgba(0, 255, 255, 0.92)",
  },
  brand: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  headerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 255, 255, 0.26)",
  },
  headerState: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  footer: {
    position: "absolute",
    right: 12,
    bottom: 0,
    left: 12,
    gap: 8,
    paddingHorizontal: 15,
    paddingTop: 13,
    borderTopLeftRadius: theme.radii.medium,
    borderTopRightRadius: theme.radii.medium,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(0, 255, 255, 0.24)",
    backgroundColor: "rgba(3, 9, 20, 0.94)",
    boxShadow: "0 -16px 40px rgba(0, 0, 0, 0.52), 0 0 24px rgba(0, 255, 255, 0.06)",
  },
  footerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveSignal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.goldBright,
  },
  stageLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  stepCount: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  detail: {
    color: "rgba(255, 255, 255, 0.68)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 15,
  },
  progressTrack: {
    height: 4,
    overflow: "hidden",
    backgroundColor: "rgba(0, 255, 255, 0.10)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 10px rgba(242, 211, 138, 0.72)",
  },
  activeStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeStepLabel: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  activeStepValue: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.84)",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "800",
  },
  stateHost: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  statePanel: {
    width: "100%",
    maxWidth: 420,
    gap: 12,
    padding: 20,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.28)",
    backgroundColor: "rgba(3, 9, 20, 0.96)",
  },
  stateEyebrow: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.radar,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  stateMessage: {
    color: "rgba(255, 255, 255, 0.68)",
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 18,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  suggestionIndex: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
  },
  suggestionText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    lineHeight: 15,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
    paddingTop: 5,
  },
  button: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.34)",
    borderRadius: 5,
  },
  buttonPrimary: {
    borderColor: theme.colors.goldBright,
    backgroundColor: theme.colors.goldBright,
  },
  buttonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  buttonTextPrimary: {
    color: theme.colors.backgroundDeep,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
});
