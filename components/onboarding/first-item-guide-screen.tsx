import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from "@/services/keepflip-analytics";

type GuideStep = {
  body: string;
  eyebrow: string;
  id: "capture" | "review" | "calculate";
  title: string;
};

const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "capture",
    eyebrow: "01  /  CAPTURE",
    title: "Start with the item in front of you.",
    body: "Take a clear photo of the whole item. Add labels, model details, and flaws so the match reflects what you found.",
  },
  {
    id: "review",
    eyebrow: "02  /  REVIEW",
    title: "Read the evidence behind the value.",
    body: "Check the item match, condition, and market range. Add missing details or photos before relying on a narrower value. Prices are references, not promises.",
  },
  {
    id: "calculate",
    eyebrow: "03  /  CALCULATE",
    title: "See what the flip could leave you.",
    body: "In MAX PROFIT, enter your actual item cost, shipping, and prep. KeepFlip estimates fees, take-home profit, and ROI.",
  },
];

const CAPTURE_DETAILS = [
  { icon: "viewfinder", label: "Whole item" },
  { icon: "tag.fill", label: "Label or model" },
  { icon: "exclamationmark.triangle.fill", label: "Wear or flaws" },
] as const;

function VisualHeader({ label, note }: { label: string; note: string }) {
  return (
    <View style={styles.visualHeader}>
      <Text style={styles.visualLabel}>{label}</Text>
      <Text style={styles.visualNote}>{note}</Text>
    </View>
  );
}

function CaptureVisual() {
  return (
    <View style={styles.visualCard}>
      <VisualHeader label="ITEM SCAN" note="CLEAR PHOTOS HELP" />
      <View style={styles.captureHero}>
        <View style={styles.captureIcon}>
          <IconSymbol color={theme.colors.goldBright} name="viewfinder" size={30} />
        </View>
        <View style={styles.captureCopy}>
          <Text style={styles.captureTitle}>Build a useful item record</Text>
          <Text style={styles.captureSubtitle}>Whole item first, details next</Text>
        </View>
      </View>
      <View style={styles.captureDetails}>
        {CAPTURE_DETAILS.map((detail) => (
          <View key={detail.label} style={styles.captureDetail}>
            <IconSymbol color={theme.colors.scannerCyan} name={detail.icon} size={15} />
            <Text numberOfLines={1} style={styles.captureDetailText}>{detail.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ValuationVisual() {
  return (
    <View style={styles.visualCard}>
      <VisualHeader label="EXAMPLE RESULT" note="ILLUSTRATION" />
      <View style={styles.resultCard}>
        <View style={styles.resultTitleRow}>
          <View style={styles.resultIcon}>
            <IconSymbol color={theme.colors.goldBright} name="tag.fill" size={16} />
          </View>
          <View style={styles.resultCopy}>
            <Text style={styles.resultItem}>Vintage denim jacket</Text>
            <Text style={styles.resultSub}>Review identity and condition</Text>
          </View>
          <IconSymbol color={theme.colors.scannerCyan} name="checkmark.circle.fill" size={18} />
        </View>
        <View style={styles.rangeBlock}>
          <Text style={styles.rangeCaption}>EXAMPLE MARKET RANGE</Text>
          <Text style={styles.rangeAmount}>$42 — $74</Text>
          <View style={styles.rangeTrack}><View style={styles.rangeMarker} /></View>
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeEdge}>LOW  $42</Text>
            <Text style={styles.rangeMiddle}>EXPECTED  $60</Text>
            <Text style={styles.rangeEdge}>HIGH  $74</Text>
          </View>
        </View>
      </View>
      <View style={styles.caution}>
        <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={15} />
        <Text style={styles.cautionText}>Confirm the match and condition before using the range.</Text>
      </View>
    </View>
  );
}

function ProfitVisual() {
  return (
    <View style={styles.visualCard}>
      <VisualHeader label="MAX PROFIT" note="EXAMPLE ESTIMATE" />
      <View style={styles.profitCard}>
        <View style={styles.saleRow}>
          <View>
            <Text style={styles.rowCaption}>SALE PRICE</Text>
            <Text style={styles.salePrice}>$60.00</Text>
          </View>
          <View style={styles.channelPill}>
            <IconSymbol color={theme.colors.scannerCyan} name="shippingbox.fill" size={13} />
            <Text style={styles.channelText}>eBay estimate</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.costRow}><Text style={styles.costLabel}>Item cost</Text><Text style={styles.costValue}>−$20.00</Text></View>
        <View style={styles.costRow}><Text style={styles.costLabel}>Outbound shipping</Text><Text style={styles.costValue}>−$8.00</Text></View>
        <View style={styles.costRow}><Text style={styles.costLabel}>Estimated platform fee</Text><Text style={styles.costValue}>−$8.56</Text></View>
        <View style={styles.netRow}>
          <View>
            <Text style={styles.netLabel}>PROJECTED NET PROFIT</Text>
            <Text style={styles.netHint}>Sale − costs − estimated fee</Text>
          </View>
          <Text style={styles.netAmount}>$23.44</Text>
        </View>
      </View>
      <Text style={styles.exampleNote}>Example only · eBay fee uses a $60 sale and no buyer-paid shipping.</Text>
    </View>
  );
}

function StepVisual({ step }: { step: GuideStep["id"] }) {
  if (step === "capture") return <CaptureVisual />;
  if (step === "review") return <ValuationVisual />;
  return <ProfitVisual />;
}

export function FirstItemGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, contentWidth, pageGutter, responsiveFont, verticalScale } =
    useResponsiveLayout();
  const [stepIndex, setStepIndex] = useState(0);
  const step = GUIDE_STEPS[stepIndex]!;
  const isLastStep = stepIndex === GUIDE_STEPS.length - 1;
  const scannerLabel = Platform.OS === "web" ? "View mobile scanner" : "Start my first analysis";

  useEffect(() => {
    trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.firstItemGuideOpened);
  }, []);

  const openScanner = (completed: boolean) => {
    trackKeepFlipEvent(
      completed
        ? KEEPFLIP_ANALYTICS_EVENTS.firstItemGuideCompleted
        : KEEPFLIP_ANALYTICS_EVENTS.firstItemGuideSkipped,
    );
    router.replace("/scanner" as Href);
  };

  const advance = () => {
    if (isLastStep) {
      openScanner(true);
      return;
    }
    setStepIndex((current) => Math.min(current + 1, GUIDE_STEPS.length - 1));
  };

  return (
    <KeepFlipBackground>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[
          styles.page,
          {
            width: contentWidth,
            maxWidth: contentMaxWidth,
            paddingHorizontal: pageGutter,
            paddingTop: verticalScale(22),
            paddingBottom: Math.max(insets.bottom, verticalScale(18)) + 24,
          },
        ]}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <IconSymbol color={theme.colors.backgroundDeep} name="bolt.fill" size={13} />
              </View>
              <Text style={[styles.brand, { fontSize: responsiveFont(9) }]}>KEEPFLIP / FIRST ITEM GUIDE</Text>
            </View>
            <Pressable
              accessibilityLabel={Platform.OS === "web" ? "Skip guide and view the mobile scanner" : "Skip guide and open scanner"}
              accessibilityRole="button"
              onPress={() => openScanner(false)}
              style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
              testID="keepflip-first-item-guide-skip"
            >
              <Text style={[styles.skipText, { fontSize: responsiveFont(12) }]}>Skip</Text>
            </Pressable>
          </View>

          <View style={styles.progressHeader}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>{step.eyebrow}</Text>
            <Text style={[styles.stepCount, { fontSize: responsiveFont(9) }]}>
              {String(stepIndex + 1).padStart(2, "0")} / 03
            </Text>
          </View>
          <View style={styles.progressBar}>
            {GUIDE_STEPS.map((item, index) => (
              <View key={item.id} style={[styles.progressSegment, index <= stepIndex && styles.progressActive]} />
            ))}
          </View>

          <Animated.View key={step.id} entering={FadeInDown.duration(250)} style={styles.stepCopy}>
            <Text style={[styles.title, { fontSize: responsiveFont(27), lineHeight: responsiveFont(33) }]}>
              {step.title}
            </Text>
            <Text style={[styles.body, { fontSize: responsiveFont(14), lineHeight: responsiveFont(21) }]}>
              {step.body}
            </Text>
          </Animated.View>

          <Animated.View key={"visual-" + step.id} entering={FadeInDown.duration(280).delay(40)}>
            <StepVisual step={step.id} />
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.buttonRow}>
              {stepIndex > 0 ? (
                <Pressable
                  accessibilityLabel="Previous guide step"
                  accessibilityRole="button"
                  onPress={() => setStepIndex((current) => Math.max(current - 1, 0))}
                  style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
                  testID="keepflip-first-item-guide-back"
                >
                  <IconSymbol color={theme.colors.cream} name="chevron.left" size={17} />
                  <Text style={[styles.backText, { fontSize: responsiveFont(13) }]}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={isLastStep ? scannerLabel : "Continue guide"}
                accessibilityRole="button"
                onPress={advance}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                testID="keepflip-first-item-guide-next"
              >
                <Text style={[styles.primaryText, { fontSize: responsiveFont(14) }]}>
                  {isLastStep ? scannerLabel : "Continue"}
                </Text>
                <IconSymbol color={theme.colors.textOnAccent} name={isLastStep ? "viewfinder" : "arrow.right"} size={18} />
              </Pressable>
            </View>
            <Text style={[styles.footerNote, { fontSize: responsiveFont(10) }]}>
              {isLastStep
                ? Platform.OS === "web"
                  ? "Camera analysis is available in the KeepFlip mobile app."
                  : "Your scan starts now. Use your actual costs to judge the deal."
                : "Three quick steps · about one minute"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: "center" },
  page: { flexGrow: 1, gap: 16, width: "100%", alignSelf: "center" },
  topBar: { minHeight: 38, alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  brandMark: { width: 25, height: 25, borderRadius: 9, backgroundColor: theme.colors.goldBright, alignItems: "center", justifyContent: "center" },
  brand: { color: theme.colors.gold, fontFamily: theme.fonts.radar, letterSpacing: 1 },
  skipButton: { minHeight: 38, minWidth: 48, alignItems: "center", justifyContent: "center" },
  skipText: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium },
  progressHeader: { marginTop: 2, alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, letterSpacing: 1.4 },
  stepCount: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, letterSpacing: 1 },
  progressBar: { flexDirection: "row", gap: 6 },
  progressSegment: { height: 4, flex: 1, borderRadius: theme.radii.pill, backgroundColor: theme.colors.divider },
  progressActive: { backgroundColor: theme.colors.scannerCyan },
  stepCopy: { gap: 8, paddingTop: 2 },
  title: { color: theme.colors.cream, fontFamily: theme.fonts.bold, letterSpacing: -0.45 },
  body: { color: theme.colors.textMuted },
  visualCard: { gap: 14, padding: 15, borderWidth: 1, borderColor: theme.colors.divider, borderRadius: 22, backgroundColor: theme.colors.surfaceOverlay },
  visualHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  visualLabel: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.1 },
  visualNote: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 0.8 },
  captureHero: { minHeight: 111, gap: 13, padding: 14, alignItems: "center", flexDirection: "row", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceInset },
  captureIcon: { width: 57, height: 57, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: theme.colors.iconSurfaceGold },
  captureCopy: { flex: 1, gap: 5 },
  captureTitle: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 13 },
  captureSubtitle: { color: theme.colors.textMuted, fontSize: 10 },
  captureDetails: { flexDirection: "row", gap: 7 },
  captureDetail: { flex: 1, minHeight: 47, gap: 5, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.cardSoft },
  captureDetailText: { color: theme.colors.textMuted, fontSize: 8, textAlign: "center" },
  resultCard: { gap: 13, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceInset },
  resultTitleRow: { alignItems: "center", flexDirection: "row", gap: 9 },
  resultIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: theme.colors.iconSurfaceGold },
  resultCopy: { flex: 1, gap: 3 },
  resultItem: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 12 },
  resultSub: { color: theme.colors.textMuted, fontSize: 9 },
  rangeBlock: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: theme.colors.cardSoft },
  rangeCaption: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 0.9 },
  rangeAmount: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 22 },
  rangeTrack: { height: 5, marginTop: 2, borderRadius: 3, backgroundColor: "rgba(242, 211, 138, 0.35)", position: "relative" },
  rangeMarker: { position: "absolute", left: "56%", top: -4, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: theme.colors.surfaceInset, backgroundColor: theme.colors.scannerCyan },
  rangeLabels: { flexDirection: "row", justifyContent: "space-between" },
  rangeEdge: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 7 },
  rangeMiddle: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 7 },
  caution: { gap: 7, paddingHorizontal: 2, alignItems: "center", flexDirection: "row" },
  cautionText: { flex: 1, color: theme.colors.textMuted, fontSize: 9, lineHeight: 14 },
  profitCard: { gap: 10, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceInset },
  saleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  rowCaption: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 1 },
  salePrice: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 23 },
  channelPill: { gap: 5, paddingHorizontal: 9, paddingVertical: 6, alignItems: "center", flexDirection: "row", borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.accentCyanBorder, backgroundColor: theme.colors.iconSurfaceCyan },
  channelText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.medium, fontSize: 8 },
  divider: { height: 1, backgroundColor: theme.colors.divider },
  costRow: { flexDirection: "row", justifyContent: "space-between" },
  costLabel: { color: theme.colors.textMuted, fontSize: 10 },
  costValue: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 10 },
  netRow: { marginTop: 2, padding: 10, alignItems: "center", flexDirection: "row", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: "rgba(70, 245, 162, 0.25)", backgroundColor: "rgba(70, 245, 162, 0.08)" },
  netLabel: { color: "#46F5A2", fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 0.8 },
  netHint: { marginTop: 4, color: theme.colors.textMuted, fontSize: 7 },
  netAmount: { color: "#46F5A2", fontFamily: theme.fonts.bold, fontSize: 21 },
  exampleNote: { color: theme.colors.textMuted, fontSize: 8, lineHeight: 12, paddingHorizontal: 2 },
  footer: { gap: 8, marginTop: "auto", paddingTop: 2 },
  buttonRow: { flexDirection: "row", gap: 9 },
  backButton: { minHeight: 54, gap: 6, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.cardSoft },
  backText: { color: theme.colors.cream, fontFamily: theme.fonts.medium },
  primaryButton: { minHeight: 54, flex: 1, gap: 9, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", borderRadius: 15, backgroundColor: theme.colors.goldBright },
  primaryText: { color: theme.colors.textOnAccent, fontFamily: theme.fonts.bold },
  footerNote: { color: theme.colors.textMuted, lineHeight: 15, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
