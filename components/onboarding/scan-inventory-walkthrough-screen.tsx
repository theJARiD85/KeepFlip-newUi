import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { type Href, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  buyRuleDayLimit,
  DEFAULT_RESELLER_BUY_RULES,
  type ResellerBuyRules,
} from "@/services/reseller-buy-rules-service";
import { completeScanInventoryWalkthrough } from "@/services/user-profile-onboarding-service";
import {
  areKeepFlipSubscriptionsConfigured,
  areKeepFlipSubscriptionsEnforced,
} from "@/services/keepflip-subscription-service";

type FlipIcon =
  | "barcode.viewfinder"
  | "bolt.fill"
  | "chart.bar.fill"
  | "dollarsign.circle.fill"
  | "gauge.with.dots.needle.67percent"
  | "shippingbox.fill"
  | "square.grid.2x2.fill"
  | "star.fill"
  | "tag.fill"
  | "wrench.and.screwdriver.fill";

type FlipChoice = {
  detail: string;
  icon: FlipIcon;
  id: string;
  isSelected: (rules: ResellerBuyRules) => boolean;
  label: string;
  update: (rules: ResellerBuyRules) => ResellerBuyRules;
};

type FlipQuestion = {
  eyebrow: string;
  id: string;
  message: string;
  prompt: string;
  choices: FlipChoice[];
};

const FLIP_MASCOT_IMAGE = require("@/assets/images/flip-mascot.png");

const FLIP_QUESTIONS: FlipQuestion[] = [
  {
    eyebrow: "FIRST, YOUR LANE",
    id: "lane",
    message: "I do my best work when I know what feels natural to you.",
    prompt: "What kind of flips sound most like you?",
    choices: [
      {
        detail: "Games, media, and easy wins",
        icon: "barcode.viewfinder",
        id: "quick",
        isSelected: (rules) =>
          rules.inventoryFocus === "media_games" &&
          rules.laborTolerance === "quick_listing",
        label: "Quick & simple",
        update: (rules) => ({
          ...rules,
          inventoryFocus: "media_games",
          laborTolerance: "quick_listing",
        }),
      },
      {
        detail: "Clothes, shoes, and style finds",
        icon: "tag.fill",
        id: "fashion",
        isSelected: (rules) => rules.inventoryFocus === "fashion",
        label: "Fashion finder",
        update: (rules) => ({
          ...rules,
          inventoryFocus: "fashion",
          laborTolerance: "standard_prep",
        }),
      },
      {
        detail: "I can clean, test, or repair",
        icon: "wrench.and.screwdriver.fill",
        id: "hands-on",
        isSelected: (rules) => rules.laborTolerance === "hands_on",
        label: "Worth the work",
        update: (rules) => ({
          ...rules,
          inventoryFocus: "electronics",
          laborTolerance: "hands_on",
        }),
      },
      {
        detail: "The hunt is half the fun",
        icon: "square.grid.2x2.fill",
        id: "general",
        isSelected: (rules) =>
          rules.inventoryFocus === "general" &&
          rules.laborTolerance === "standard_prep",
        label: "A little of everything",
        update: (rules) => ({
          ...rules,
          inventoryFocus: "general",
          laborTolerance: "standard_prep",
        }),
      },
    ],
  },
  {
    eyebrow: "YOUR FLIP STYLE",
    id: "pace",
    message: "Perfect. Now tell me how you like a good deal to feel.",
    prompt: "What are we optimizing for?",
    choices: [
      {
        detail: "Move it quickly and keep cash moving",
        icon: "bolt.fill",
        id: "fast",
        isSelected: (rules) => rules.saleSpeed === "quick",
        label: "Fast cash",
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit("quick"),
          minimumRoiPercent: 30,
          saleSpeed: "quick",
        }),
      },
      {
        detail: "A healthy mix of speed and margin",
        icon: "gauge.with.dots.needle.67percent",
        id: "balanced",
        isSelected: (rules) => rules.saleSpeed === "steady",
        label: "Good balance",
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit("steady"),
          minimumRoiPercent: 50,
          saleSpeed: "steady",
        }),
      },
      {
        detail: "I can wait for the better payday",
        icon: "star.fill",
        id: "profit",
        isSelected: (rules) => rules.saleSpeed === "patient",
        label: "Bigger payday",
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit("patient"),
          minimumRoiPercent: 100,
          saleSpeed: "patient",
        }),
      },
    ],
  },
  {
    eyebrow: "MAKE IT WORTH IT",
    id: "profit",
    message: "I will factor in the messy little costs. You tell me the win.",
    prompt: "What is the smallest take-home profit worth your time?",
    choices: [
      {
        detail: "Easy wins still count",
        icon: "dollarsign.circle.fill",
        id: "ten",
        isSelected: (rules) => rules.minimumNetProfitCents === 1_000,
        label: "$10",
        update: (rules) => ({ ...rules, minimumNetProfitCents: 1_000 }),
      },
      {
        detail: "A solid flip",
        icon: "dollarsign.circle.fill",
        id: "twenty",
        isSelected: (rules) => rules.minimumNetProfitCents === 2_000,
        label: "$20",
        update: (rules) => ({ ...rules, minimumNetProfitCents: 2_000 }),
      },
      {
        detail: "I want meaningful margin",
        icon: "dollarsign.circle.fill",
        id: "forty",
        isSelected: (rules) => rules.minimumNetProfitCents === 4_000,
        label: "$40",
        update: (rules) => ({ ...rules, minimumNetProfitCents: 4_000 }),
      },
    ],
  },
  {
    eyebrow: "PROTECT YOUR CASH",
    id: "cash",
    message: "Last thing I want is to recommend a deal that pins your bankroll.",
    prompt: "What feels comfortable to put into one find?",
    choices: [
      {
        detail: "Keep every buy light",
        icon: "dollarsign.circle.fill",
        id: "twenty-five",
        isSelected: (rules) => rules.maximumItemCostCents === 2_500,
        label: "Up to $25",
        update: (rules) => ({ ...rules, maximumItemCostCents: 2_500 }),
      },
      {
        detail: "My normal sourcing range",
        icon: "dollarsign.circle.fill",
        id: "seventy-five",
        isSelected: (rules) => rules.maximumItemCostCents === 7_500,
        label: "Up to $75",
        update: (rules) => ({ ...rules, maximumItemCostCents: 7_500 }),
      },
      {
        detail: "I can take on stronger finds",
        icon: "dollarsign.circle.fill",
        id: "one-fifty",
        isSelected: (rules) => rules.maximumItemCostCents === 15_000,
        label: "Up to $150",
        update: (rules) => ({ ...rules, maximumItemCostCents: 15_000 }),
      },
      {
        detail: "Show me higher-ticket opportunities",
        icon: "dollarsign.circle.fill",
        id: "three-hundred",
        isSelected: (rules) => rules.maximumItemCostCents === 30_000,
        label: "$300+",
        update: (rules) => ({ ...rules, maximumItemCostCents: 30_000 }),
      },
    ],
  },
  {
    eyebrow: "HOME BASE",
    id: "storage",
    message: "Then I can flag finds that may take up more room than they deserve.",
    prompt: "Where do your future flips live before they sell?",
    choices: [
      {
        detail: "Every inch matters",
        icon: "shippingbox.fill",
        id: "closet",
        isSelected: (rules) => rules.storageCapacity === "closet_or_bin",
        label: "Closet or bin",
        update: (rules) => ({ ...rules, storageCapacity: "closet_or_bin" }),
      },
      {
        detail: "I have some breathing room",
        icon: "shippingbox.fill",
        id: "room",
        isSelected: (rules) => rules.storageCapacity === "dedicated_room",
        label: "Dedicated room",
        update: (rules) => ({ ...rules, storageCapacity: "dedicated_room" }),
      },
      {
        detail: "Bring on the big finds",
        icon: "shippingbox.fill",
        id: "garage",
        isSelected: (rules) =>
          rules.storageCapacity === "garage_or_warehouse",
        label: "Garage or warehouse",
        update: (rules) => ({
          ...rules,
          storageCapacity: "garage_or_warehouse",
        }),
      },
    ],
  },
];

function selectionHaptic() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.selectionAsync();
  }
}

function completionHaptic() {
  if (process.env.EXPO_OS === "ios") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

function firstName(name?: string | null) {
  const cleaned = name?.trim().split(/\s+/)[0];
  return cleaned || "there";
}

function moneyFromCents(cents: number) {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function FlipCoin({ step }: { step: number }) {
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      key={`flip-coin-${step}`}
      style={styles.coinShell}
    >
      <View style={styles.coinOrbit}>
        <View style={styles.coinFace}>
          <Image
            accessibilityLabel="Flip, KeepFlip's friendly gold coin resale sidekick"
            contentFit="cover"
            source={FLIP_MASCOT_IMAGE}
            style={styles.coinImage}
            transition={180}
          />
        </View>
      </View>
      <View style={styles.coinSignal}>
        <View style={styles.coinSignalDot} />
        <Text style={styles.coinSignalText}>FLIP IS ONLINE</Text>
      </View>
    </Animated.View>
  );
}

function ChoiceCard({
  choice,
  onPress,
  selected,
}: {
  choice: FlipChoice;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityHint={choice.detail}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        selected && styles.choiceCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
        <IconSymbol
          color={selected ? theme.colors.scannerCyan : theme.colors.goldBright}
          name={choice.icon}
          size={22}
        />
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>
          {choice.label}
        </Text>
        <Text style={styles.choiceDetail}>{choice.detail}</Text>
      </View>
      <View style={[styles.choiceRadio, selected && styles.choiceRadioSelected]}>
        {selected ? <View style={styles.choiceRadioCore} /> : null}
      </View>
    </Pressable>
  );
}

export function ScanInventoryWalkthroughScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useKeepFlipAuth();
  const [screen, setScreen] = useState(0);
  const [rules, setRules] = useState<ResellerBuyRules>(() => ({
    ...DEFAULT_RESELLER_BUY_RULES,
    includedCostTypes: [...DEFAULT_RESELLER_BUY_RULES.includedCostTypes],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question =
    screen > 0 && screen <= FLIP_QUESTIONS.length
      ? FLIP_QUESTIONS[screen - 1]
      : null;
  const summary = useMemo(() => {
    const pace =
      rules.saleSpeed === "quick"
        ? "fast flips"
        : rules.saleSpeed === "patient"
          ? "bigger-payday holds"
          : "balanced flips";
    const storage =
      rules.storageCapacity === "closet_or_bin"
        ? "compact storage"
        : rules.storageCapacity === "garage_or_warehouse"
          ? "room for bigger finds"
          : "room to breathe";
    return {
      line: `${moneyFromCents(rules.minimumNetProfitCents)}+ take-home · ${rules.minimumRoiPercent}%+ ROI`,
      details: `${pace} · up to ${moneyFromCents(rules.maximumItemCostCents)} in one item · ${storage}`,
    };
  }, [rules]);

  const goBack = useCallback(() => {
    if (saving || screen === 0) return;
    selectionHaptic();
    setError(null);
    setScreen((current) => Math.max(0, current - 1));
  }, [saving, screen]);

  const choose = useCallback((choice: FlipChoice) => {
    selectionHaptic();
    setError(null);
    setRules((current) => choice.update(current));
    setScreen((current) => Math.min(FLIP_QUESTIONS.length + 1, current + 1));
  }, []);

  const finish = useCallback(async () => {
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      if (!user) throw new Error("Sign in before finishing your Flip profile.");
      await completeScanInventoryWalkthrough(user.$id, user.name, rules);
      completionHaptic();

      const subscriptionOnboardingEnabled =
        areKeepFlipSubscriptionsConfigured() ||
        areKeepFlipSubscriptionsEnforced();

      router.replace(
        (subscriptionOnboardingEnabled
          ? "/subscription?source=onboarding"
          : "/") as Href,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Flip could not save your preferences. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [router, rules, saving, user]);

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { minHeight: height,  paddingTop: insets.top, paddingBottom: insets.bottom + 20  }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(260)} style={styles.topBar}>
          <View>
            <Text style={styles.brandEyebrow}>KEEPFLIP PERSONALIZATION</Text>
            <Text style={styles.brandTitle}>Meet Flip</Text>
          </View>
          {screen > 0 ? (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              disabled={saving}
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        <View accessibilityLabel="Onboarding progress" style={styles.progressRail}>
          {FLIP_QUESTIONS.map((item, index) => (
            <View
              key={item.id}
              style={[styles.progressSegment, index < screen && styles.progressSegmentActive]}
            />
          ))}
        </View>

        <View style={styles.main}>
          <FlipCoin step={screen} />

          {screen === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.panel}>
              <Text style={styles.hello}>Hey {firstName(user?.name)}.</Text>
              <Text style={styles.headline}>I’m Flip, your resale sidekick.</Text>
              <Text style={styles.body}>
                Give me five quick answers and I’ll make every Buy or Pass call feel built around your business—not somebody else’s.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  selectionHaptic();
                  setScreen(1);
                }}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Let’s build my flip style</Text>
                <IconSymbol color={theme.colors.backgroundDeep} name="arrow.right" size={21} />
              </Pressable>
            </Animated.View>
          ) : question ? (
            <Animated.View entering={FadeInDown.duration(260)} key={question.id} style={styles.panel}>
              <View style={styles.messageBubble}>
                <Text style={styles.messageLabel}>FLIP</Text>
                <Text style={styles.messageText}>{question.message}</Text>
              </View>
              <Text style={styles.questionEyebrow}>{question.eyebrow}</Text>
              <Text style={styles.questionTitle}>{question.prompt}</Text>
              <View style={styles.choiceList}>
                {question.choices.map((choice) => (
                  <ChoiceCard
                    choice={choice}
                    key={choice.id}
                    onPress={() => choose(choice)}
                    selected={choice.isSelected(rules)}
                  />
                ))}
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.panel}>
              <Text style={styles.hello}>Locked in.</Text>
              <Text style={styles.headline}>Now I know what a good flip looks like to you.</Text>
              <View style={styles.summaryCard}>
                <Text selectable style={styles.summaryPrimary}>{summary.line}</Text>
                <Text selectable style={styles.summarySecondary}>{summary.details}</Text>
              </View>
              <Text style={styles.body}>
                I’ll use this to make market-backed recommendations stricter when a find does not match your cash, pace, prep, or storage rules. The sold-market evidence stays separate and visible.
              </Text>
              {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void finish()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  saving && styles.buttonDisabled,
                  pressed && !saving && styles.pressed,
                ]}
              >
                {saving ? <ActivityIndicator color={theme.colors.backgroundDeep} /> : <>
                  <Text style={styles.primaryButtonText}>Let’s find some flips</Text>
                  <IconSymbol color={theme.colors.backgroundDeep} name="viewfinder" size={21} />
                </>}
              </Pressable>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    borderColor: "rgba(242, 237, 228, 0.18)",
    borderCurve: "continuous",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 14,
  },
  backButtonText: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 12 },
  body: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 },
  brandEyebrow: { color: theme.colors.gold, fontFamily: theme.fonts.display, fontSize: 9, letterSpacing: 1.2 },
  brandTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 20, marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  choiceCard: {
    alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(242, 237, 228, 0.13)", borderCurve: "continuous", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 13, minHeight: 76, padding: 13,
  },
  choiceCardSelected: { backgroundColor: "rgba(0, 255, 255, 0.09)", borderColor: "rgba(0, 255, 255, 0.72)", boxShadow: "0 0 20px rgba(0, 255, 255, 0.12)" },
  choiceCopy: { flex: 1, gap: 3 },
  choiceDetail: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 16 },
  choiceIcon: { alignItems: "center", backgroundColor: "rgba(215, 168, 74, 0.10)", borderRadius: 14, height: 43, justifyContent: "center", width: 43 },
  choiceIconSelected: { backgroundColor: "rgba(0, 255, 255, 0.12)" },
  choiceList: { gap: 10 },
  choiceRadio: { alignItems: "center", borderColor: "rgba(242, 237, 228, 0.28)", borderRadius: theme.radii.pill, borderWidth: 1, height: 19, justifyContent: "center", width: 19 },
  choiceRadioCore: { backgroundColor: theme.colors.scannerCyan, borderRadius: theme.radii.pill, height: 9, width: 9 },
  choiceRadioSelected: { borderColor: theme.colors.scannerCyan },
  choiceTitle: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 15 },
  choiceTitleSelected: { color: theme.colors.scannerCyan },
  coinFace: { backgroundColor: "rgba(8, 8, 12, 0.98)", borderColor: "rgba(242, 211, 138, 0.85)", borderRadius: theme.radii.pill, borderWidth: 2, height: 124, overflow: "hidden", width: 124 },
  coinImage: { height: "100%", width: "100%" },
  coinOrbit: { alignItems: "center", backgroundColor: "rgba(0, 255, 255, 0.08)", borderColor: "rgba(0, 255, 255, 0.4)", borderRadius: theme.radii.pill, boxShadow: "0 0 36px rgba(0, 255, 255, 0.22)", height: 146, justifyContent: "center", width: 146 },
  coinShell: { alignItems: "center", gap: 10 },
  coinSignal: { alignItems: "center", flexDirection: "row", gap: 6 },
  coinSignalDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: theme.radii.pill, boxShadow: "0 0 10px rgba(0, 255, 255, 0.9)", height: 7, width: 7 },
  coinSignalText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.2 },
  content: { gap: 18, paddingBottom: 36, paddingHorizontal: 22, paddingTop: 28 },
  errorText: { color: theme.colors.danger, fontSize: 13, lineHeight: 19 },
  headline: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 28, letterSpacing: -0.55, lineHeight: 34 },
  hello: { color: theme.colors.goldBright, fontFamily: theme.fonts.medium, fontSize: 17 },
  main: { flex: 1, gap: 22, justifyContent: "center", marginHorizontal: "auto", maxWidth: 530, width: "100%" },
  messageBubble: { backgroundColor: "rgba(141, 114, 255, 0.13)", borderColor: "rgba(141, 114, 255, 0.36)", borderCurve: "continuous", borderRadius: 18, borderTopLeftRadius: 5, borderWidth: 1, gap: 5, padding: 14 },
  messageLabel: { color: theme.colors.scannerViolet, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.15 },
  messageText: { color: theme.colors.cream, fontSize: 14, lineHeight: 20 },
  panel: { backgroundColor: "rgba(8, 8, 12, 0.78)", borderColor: "rgba(242, 237, 228, 0.13)", borderCurve: "continuous", borderRadius: 26, borderWidth: 1, boxShadow: "0 16px 42px rgba(0, 0, 0, 0.34)", gap: 17, padding: 19 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  primaryButton: { alignItems: "center", backgroundColor: theme.colors.goldBright, borderCurve: "continuous", borderRadius: 17, flexDirection: "row", gap: 10, justifyContent: "center", minHeight: 56, paddingHorizontal: 18 },
  primaryButtonText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.bold, fontSize: 15 },
  progressRail: { flexDirection: "row", gap: 7, marginHorizontal: "auto", maxWidth: 530, width: "100%" },
  progressSegment: { backgroundColor: "rgba(242, 237, 228, 0.14)", borderRadius: theme.radii.pill, flex: 1, height: 3 },
  progressSegmentActive: { backgroundColor: theme.colors.scannerCyan, boxShadow: "0 0 9px rgba(0, 255, 255, 0.75)" },
  questionEyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 1.1, marginTop: 4 },
  questionTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 24, letterSpacing: -0.4, lineHeight: 30 },
  summaryCard: { backgroundColor: "rgba(0, 255, 255, 0.075)", borderColor: "rgba(0, 255, 255, 0.28)", borderCurve: "continuous", borderRadius: 18, borderWidth: 1, gap: 6, padding: 15 },
  summaryPrimary: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 16, lineHeight: 22 },
  summarySecondary: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 13, lineHeight: 19 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginHorizontal: "auto", maxWidth: 530, width: "100%"},
});
