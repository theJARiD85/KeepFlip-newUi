import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import type { SmartEvidenceCapturePlan } from "@/services/smart-evidence-capture";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type SmartEvidenceCaptureGuideProps = {
  photoCount: number;
  plan: SmartEvidenceCapturePlan;
};

/**
 * A deliberately quiet, camera-first hint. The detailed plan stays in the
 * analysis/review flow; the live scanner only needs to tell the reseller what
 * the next proof photo should show.
 */
export function SmartEvidenceCaptureGuide({
  photoCount,
  plan,
}: SmartEvidenceCaptureGuideProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const completedPhotoCount = Math.max(0, Math.min(photoCount, plan.steps.length));
  const isComplete = completedPhotoCount >= plan.steps.length;
  const currentStep = isComplete ? null : plan.steps[completedPhotoCount];
  const prompt = isComplete
    ? "Evidence set ready. Tap Analyze when you want KeepFlip to research it."
    : `${currentStep?.prompt ?? "Capture one clear proof photo."}${
        currentStep?.privacyNote ? " Hide personal details." : ""
      }`;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(120)}
      pointerEvents="none"
      style={styles.root}>
      <Animated.View
        entering={FadeIn.duration(150)}
        key={`${plan.category}-${completedPhotoCount}-${isComplete ? "ready" : "next"}`}
        style={styles.copy}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>SMART SCAN</Text>
          <Text style={styles.count}>
            {completedPhotoCount}/{plan.steps.length}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.title, { fontSize: responsiveFont(12) }]}>
          {isComplete
            ? "Evidence set ready"
            : `${plan.categoryLabel} · Next: ${currentStep?.title ?? "proof photo"}`}
        </Text>
        <Text numberOfLines={1} style={[styles.prompt, { fontSize: responsiveFont(9), lineHeight: 12 }]}>
          {prompt}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
    const staticStyles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 10,
    right: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radii.small,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.32)",
    backgroundColor: "rgba(4, 7, 11, 0.76)",
    boxShadow: "0 5px 16px rgba(0, 0, 0, 0.34)",
  },
  copy: { gap: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  count: {
    color: theme.colors.goldBright,
    fontSize: 9,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  title: {
    color: theme.colors.cream,
    fontSize: 12,
    fontWeight: "900",
  },
  prompt: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
});
  return {
    ...staticStyles,
  eyebrow: [
    staticStyles.eyebrow,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  count: [
    staticStyles.count,
    {
        fontSize: responsiveLayout.responsiveFont(9),
    },
  ],
  title: [
    staticStyles.title,
    {
        fontSize: responsiveLayout.responsiveFont(12),
    },
  ],
  prompt: [
    staticStyles.prompt,
    {
        fontSize: responsiveLayout.responsiveFont(9),
    },
  ],
  };
}
