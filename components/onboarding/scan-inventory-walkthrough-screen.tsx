import * as Haptics from "expo-haptics";
import { Asset } from "expo-asset";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { InventoryCard } from "@/components/inventory/inventory-card";
import type { ItemAnalysisState } from "@/components/scanner/analysis-visual-types";
import { CerebroAnalysisField } from "@/components/scanner/cerebro-analysis-field.native";
import {
  ScannerToolCarousel,
  type ScannerToolId,
} from "@/components/scanner/scanner-tool-carousel";
import { ValuationResultStage } from "@/components/scanner/valuation-result-stage";
import {
  ValueRadarOverlay,
  type ValueRadarMarker,
} from "@/components/scanner/value-radar.native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import type { InventoryItem } from "@/services/inventory-service";
import { completeScanInventoryWalkthrough } from "@/services/user-profile-onboarding-service";

type WalkthroughStep = {
  accent: string;
  body: string;
  eyebrow: string;
  title: string;
};

const WALKTHROUGH_ITEM_IMAGE = require("@/assets/images/walkthrough-coach-bag.jpeg");
const WALKTHROUGH_ITEM_URI =
  Asset.fromModule(WALKTHROUGH_ITEM_IMAGE).uri;

const WALKTHROUGH_RADAR_MARKER: ValueRadarMarker = {
  classId: 30,
  height: 0.52,
  label: "Handbag",
  score: 0.93,
  sourceHeight: 884,
  sourceWidth: 884,
  width: 0.76,
  x: 0.12,
  y: 0.25,
};

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    accent: theme.colors.scannerCyan,
    eyebrow: "01 / CAPTURE EVIDENCE",
    title: "Center it. Lock it. Scan it.",
    body: "When Value Radar locks, tap the target or Potential Find card to capture. The illuminated Single Scan control works too.",
  },
  {
    accent: theme.colors.scannerViolet,
    eyebrow: "02 / LOCK THE VALUE",
    title: "Read the resale range.",
    body: "Watch Cerebro lock the market range, inspect Value and Max Profit, then swipe up in the live result for the complete intelligence report.",
  },
  {
    accent: theme.colors.goldBright,
    eyebrow: "03 / INVENTORY CONFIRMED",
    title: "Save the intelligence.",
    body: "Choose Save to inventory. KeepFlip stores the item and makes this analysis available from Inventory.",
  },
];

const SAMPLE_ANALYSIS_STATE: Extract<
  ItemAnalysisState,
  { status: "result" }
> = {
  status: "result",
  data: {
    condition: {
      details: [
        "Light handling wear at the corners",
        "Hardware and stitching appear intact",
      ],
      label: "Very Good",
      score: 0.88,
    },
    confidence: {
      condition: 0.88,
      identity: 0.96,
      overall: 0.93,
      valuation: 0.9,
    },
    evidence: [
      {
        id: "walkthrough-evidence-1",
        label: "Maker mark",
        source: "Photo text",
        value: "COACH wordmark and signature C hardware resolved",
      },
      {
        id: "walkthrough-evidence-2",
        label: "Construction",
        source: "Visual",
        value: "Tabby silhouette, structured flap, and chain strap match",
      },
    ],
    identity: {
      brand: "Coach",
      category: "Designer handbag",
      confidence: 0.96,
      model: "Tabby 26",
      title: "Coach Tabby Shoulder Bag 26",
      variant: "Black pebble leather",
    },
    profitPlan: {
      actions: [
        {
          detail: "Open near $315 and use $265 as the evidence-backed offer target.",
          id: "walkthrough-profit-price",
          label: "Leave room for offers",
        },
        {
          detail: "Lead with Coach Tabby 26 and black pebble leather in the listing title.",
          id: "walkthrough-profit-title",
          label: "Use the strongest search terms",
        },
        {
          detail: "Photograph the corners, hardware, and stitching in sharp natural light.",
          id: "walkthrough-profit-condition",
          label: "Turn condition into trust",
        },
      ],
      currency: "USD",
      expectedSale: 265,
      listTarget: 315,
      quickSale: 215,
    },
    suggestedPhotos: [],
    summary:
      "Visual construction, logo placement, and hardware support a Coach Tabby 26 identification.",
    valuation: {
      basis: "Recent matching sold-market evidence",
      comparableCount: 14,
      currency: "USD",
      high: 315,
      low: 215,
      median: 265,
      query: "Coach Tabby 26 black sold",
      source: "multi_market",
    },
    valuationReadiness: {
      label: "Sold-market range ready",
      reason: "Fourteen matching sold comparables survived KeepFlip filtering.",
      score: 0.91,
      status: "ready",
    },
  },
};

const SAMPLE_INVENTORY_ITEM: InventoryItem = {
  aiConfidence: 93,
  brand: "Coach",
  category: "Designer handbag",
  condition: "Very Good",
  conditionNotes: "Light handling wear; hardware and stitching appear intact.",
  coverPhotoId: null,
  createdAt: new Date().toISOString(),
  currency: "USD",
  estimatedValue: 265,
  id: "walkthrough-sample",
  model: "Tabby 26",
  modelFile: null,
  photoCount: 1,
  status: "undecided",
  title: "Coach Tabby Shoulder Bag 26",
};

function selectionHaptic() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.selectionAsync();
  }
}

function SampleEvidenceTarget({
  captured,
  onLock,
  previewWidth,
}: {
  captured: boolean;
  onLock: () => void;
  previewWidth: number;
}) {
  const radarWidth = Math.max(260, previewWidth - 28);
  const radarHeight = 260;

  return (
    <View style={[styles.evidenceViewport, { height: radarHeight }]}>
      <Image
        accessibilityLabel="Coach bag used as the walkthrough scan target"
        contentFit="cover"
        source={WALKTHROUGH_ITEM_IMAGE}
        style={styles.evidenceImage}
        transition={180}
      />
      <View pointerEvents="none" style={styles.evidenceImageShade} />
      <ValueRadarOverlay
        disabled={captured}
        focusBounds={{
          height: 96,
          previewHeight: radarHeight,
          previewWidth: radarWidth,
          width: radarWidth - 28,
          x: 14,
          y: 10,
        }}
        height={radarHeight}
        marker={captured ? null : WALKTHROUGH_RADAR_MARKER}
        onMarkerPress={onLock}
        status="ready"
        width={radarWidth}
      />
    </View>
  );
}

function ScannerStagePreview({
  onAnalysisReady,
  previewWidth,
}: {
  onAnalysisReady: () => void;
  previewWidth: number;
}) {
  const [selectedTool, setSelectedTool] =
    useState<ScannerToolId>("single");
  const [captured, setCaptured] = useState(false);

  const handleActivate = useCallback((tool: ScannerToolId) => {
    setSelectedTool(tool);
    setCaptured(true);
    selectionHaptic();
  }, []);

  return (
    <View style={styles.scannerStage}>
      <SampleEvidenceTarget
        captured={captured}
        onLock={() => handleActivate("single")}
        previewWidth={previewWidth}
      />

      {captured ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.analysisActionShell}>
          <Pressable
            accessibilityLabel="Analyze sample item"
            accessibilityRole="button"
            onPress={onAnalysisReady}
            style={({ pressed }) => [
              styles.analysisAction,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.analysisReticle}>
              <View style={styles.analysisReticleDot} />
            </View>
            <View style={styles.analysisActionCopy}>
              <Text style={styles.analysisEyebrow}>KEEPFLIP INTELLIGENCE</Text>
              <Text style={styles.analysisTitle}>Analyze item</Text>
            </View>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="chevron.right"
              size={23}
            />
          </Pressable>
        </Animated.View>
      ) : (
        <Text style={styles.scannerHint}>
          TAP THE LOCKED TARGET OR CENTER CONTROL
        </Text>
      )}

      <View
        style={[
          styles.carouselHost,
          { marginLeft: -(Math.max(previewWidth, 320) - previewWidth) / 2 },
        ]}
      >
        <ScannerToolCarousel
          badges={{ single: captured ? 1 : 0 }}
          onActivate={handleActivate}
          onSelect={setSelectedTool}
          selectedTool={selectedTool}
        />
      </View>
    </View>
  );
}

function AnalysisStagePreview({
  onSave,
  previewWidth,
}: {
  onSave: () => void;
  previewWidth: number;
}) {
  return (
    <View style={styles.analysisStage}>
      <CerebroAnalysisField
        active
        activityProgress={1}
        isValuating={false}
        lockConfidence={
          SAMPLE_ANALYSIS_STATE.data.confidence?.valuation ??
          SAMPLE_ANALYSIS_STATE.data.valuationReadiness.score
        }
        photoUri={WALKTHROUGH_ITEM_URI}
        style={styles.analysisCerebro}
      />

      <ValuationResultStage
        bottomInset={0}
        embedded
        onSave={onSave}
        projectionLabel="KEEPFLIP CEREBRO / MARKET LOCK"
        saveLabel="Save to inventory"
        state={SAMPLE_ANALYSIS_STATE}
        topInset={0}
        viewportWidth={previewWidth}
      />
    </View>
  );
}

function InventoryStagePreview() {
  return (
    <View style={styles.inventoryStage}>
      <View style={styles.savedSignal}>
        <View style={styles.savedSignalIcon}>
          <IconSymbol
            color={theme.colors.scannerCyan}
            name="checkmark.shield.fill"
            size={22}
          />
        </View>
        <View style={styles.savedSignalCopy}>
          <Text style={styles.savedSignalEyebrow}>DATABASE WRITE COMPLETE</Text>
          <Text style={styles.savedSignalTitle}>Item secured in Inventory</Text>
        </View>
      </View>

      <InventoryCard
        coverImageSource={WALKTHROUGH_ITEM_IMAGE}
        item={SAMPLE_INVENTORY_ITEM}
        onPress={() => undefined}
      />

      <Text style={styles.inventoryHint}>
        Tap any saved inventory card later to reopen its complete analysis.
      </Text>
    </View>
  );
}

export function ScanInventoryWalkthroughScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { user } = useKeepFlipAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const step = WALKTHROUGH_STEPS[activeStep];
  const previewWidth = Math.min(Math.max(width - 32, 288), 520);
  const previewHeight =
    activeStep === 0
      ? 440
      : Math.min(
        activeStep === 1 ? 472 : 430,
        Math.max(356, height * 0.53),
      );

  const goToStep = useCallback((nextStep: number) => {
    selectionHaptic();
    setActiveStep(
      Math.max(0, Math.min(WALKTHROUGH_STEPS.length - 1, nextStep)),
    );
  }, []);

  const finish = useCallback(
    async () => {
      if (savingPreference) return;

      setSavingPreference(true);
      setPreferenceError(null);
      try {
        if (!user) {
          throw new Error("Sign in before completing the walkthrough.");
        }
        await completeScanInventoryWalkthrough(user.$id, user.name);
        router.replace("/" as Href);
      } catch (error) {
        setPreferenceError(
          error instanceof Error
            ? error.message
            : "KeepFlip could not save your walkthrough preference.",
        );
      } finally {
        setSavingPreference(false);
      }
    },
    [router, savingPreference, user],
  );

  const stage = useMemo(() => {
    if (activeStep === 0) {
      return (
        <ScannerStagePreview
          onAnalysisReady={() => goToStep(1)}
          previewWidth={previewWidth}
        />
      );
    }

    if (activeStep === 1) {
      return (
        <AnalysisStagePreview
          onSave={() => goToStep(2)}
          previewWidth={previewWidth}
        />
      );
    }

    return <InventoryStagePreview />;
  }, [activeStep, goToStep, previewWidth]);

  return (
    <KeepFlipBackground>
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            minHeight: height,
            paddingBottom: insets.bottom + 18,
            paddingTop: insets.top + 12,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(240)} style={styles.topBar}>
          <View style={styles.brandCopy}>
            <Text style={styles.brandEyebrow}>KEEPFLIP FIELD GUIDE</Text>
            <Text style={styles.brandTitle}>First item protocol</Text>
          </View>
        </Animated.View>

        <View style={styles.progressRail}>
          {WALKTHROUGH_STEPS.map((candidate, index) => (
            <Pressable
              accessibilityLabel={`Open walkthrough step ${index + 1}: ${candidate.title}`}
              accessibilityRole="button"
              key={candidate.eyebrow}
              onPress={() => goToStep(index)}
              style={styles.progressTarget}
            >
              <View
                style={[
                  styles.progressSegment,
                  index <= activeStep && {
                    backgroundColor: candidate.accent,
                    boxShadow: `0 0 9px ${candidate.accent}`,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>

        <Animated.View
          entering={FadeIn.duration(180)}
          key={`copy-${activeStep}`}
          style={styles.stepCopy}
        >
          <Text style={[styles.stepEyebrow, { color: step.accent }]}>
            {step.eyebrow}
          </Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepBody}>{step.body}</Text>
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(180)}
          key={`stage-${activeStep}`}
          style={[
            styles.previewFrame,
            {
              borderColor: `${step.accent}66`,
              height: previewHeight,
              width: previewWidth,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[styles.previewSignal, { backgroundColor: step.accent }]}
          />
          {stage}
        </Animated.View>

        {preferenceError ? (
          <Text accessibilityLiveRegion="polite" selectable style={styles.errorText}>
            {preferenceError}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            accessibilityLabel="Previous walkthrough step"
            accessibilityRole="button"
            disabled={activeStep === 0 || savingPreference}
            onPress={() => goToStep(activeStep - 1)}
            style={({ pressed }) => [
              styles.secondaryButton,
              activeStep === 0 && styles.buttonDisabled,
              pressed && activeStep > 0 && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>BACK</Text>
          </Pressable>

          {activeStep === WALKTHROUGH_STEPS.length - 1 ? (
            <Pressable
              accessibilityLabel="Finish walkthrough and start scanning"
              accessibilityRole="button"
              disabled={savingPreference}
              onPress={() => void finish()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                savingPreference && styles.buttonDisabled,
              ]}
            >
              {savingPreference ? (
                <ActivityIndicator
                  color={theme.colors.backgroundDeep}
                  size="small"
                />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>START SCANNING</Text>
                  <IconSymbol
                    color={theme.colors.backgroundDeep}
                    name="viewfinder"
                    size={19}
                  />
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="Next walkthrough step"
              accessibilityRole="button"
              onPress={() => goToStep(activeStep + 1)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>NEXT STEP</Text>
              <IconSymbol
                color={theme.colors.backgroundDeep}
                name="arrow.right"
                size={19}
              />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
  },
  topBar: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandCopy: {
    gap: 3,
  },
  brandEyebrow: {
    color: theme.colors.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  brandTitle: {
    color: theme.colors.cream,
    fontSize: 20,
    fontWeight: "900",
  },
  progressRail: {
    width: "100%",
    maxWidth: 520,
    height: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  progressTarget: {
    flex: 1,
    height: 14,
    justifyContent: "center",
  },
  progressSegment: {
    height: 3,
    borderRadius: theme.radii.pill,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  stepCopy: {
    width: "100%",
    maxWidth: 520,
    gap: 5,
  },
  stepEyebrow: {
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.45,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "900",
  },
  stepBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  previewFrame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "rgba(2, 4, 8, 0.92)",
    boxShadow: "0 20px 46px rgba(0, 0, 0, 0.48)",
  },
  previewSignal: {
    position: "absolute",
    top: 0,
    right: 28,
    left: 28,
    zIndex: 90,
    height: 2,
    boxShadow: "0 0 12px rgba(88, 223, 232, 0.7)",
  },
  scannerStage: {
    flex: 1,
    alignItems: "center",
  },
  evidenceViewport: {
    position: "absolute",
    top: 14,
    right: 14,
    left: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.18)",
    backgroundColor: "rgba(3, 9, 13, 0.88)",
  },
  evidenceImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  evidenceImageShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 9, 13, 0.20)",
  },
  scannerHint: {
    position: "absolute",
    top: 278,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  carouselHost: {
    position: "absolute",
    bottom: 25,
  },
  analysisActionShell: {
    position: "absolute",
    top: 276,
    right: 15,
    left: 15,
    zIndex: 20,
  },
  analysisAction: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(2, 9, 13, 0.94)",
    boxShadow: "0 0 20px rgba(88, 223, 232, 0.12)",
  },
  analysisReticle: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
  },
  analysisReticleDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 9px rgba(88, 223, 232, 0.9)",
  },
  analysisActionCopy: {
    flex: 1,
    gap: 2,
  },
  analysisEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  analysisTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  analysisStage: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#030308",
  },
  analysisCerebro: {
    ...StyleSheet.absoluteFillObject,
  },
  inventoryStage: {
    flex: 1,
    justifyContent: "center",
    gap: 17,
    paddingHorizontal: 14,
  },
  savedSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  savedSignalIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.32)",
    backgroundColor: "rgba(88, 223, 232, 0.08)",
  },
  savedSignalCopy: {
    flex: 1,
    gap: 2,
  },
  savedSignalEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  savedSignalTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  inventoryHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  errorText: {
    width: "100%",
    maxWidth: 520,
    color: "#FFB8B1",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  footer: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    minWidth: 90,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  secondaryButtonText: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  primaryButton: {
    minHeight: 50,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 20px rgba(242, 211, 138, 0.17)",
  },
  primaryButtonText: {
    color: theme.colors.backgroundDeep,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.35,
  },
});
