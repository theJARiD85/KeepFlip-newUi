import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  buyRuleDayLimit,
  DEFAULT_RESELLER_BUY_RULES,
  type ResellerBuyRules,
} from '@/services/reseller-buy-rules-service';

type IconName = ComponentProps<typeof IconSymbol>['name'];

type PreAuthChoice = {
  detail: string;
  icon: IconName;
  id: string;
  isSelected: (rules: ResellerBuyRules) => boolean;
  label: string;
  update: (rules: ResellerBuyRules) => ResellerBuyRules;
};

type PreAuthQuestion = {
  eyebrow: string;
  id: string;
  message: string;
  prompt: string;
  choices: PreAuthChoice[];
};

type KeepFlipPreAuthScreenProps = {
  onBack?: () => void;
  onComplete: (name: string, rules: ResellerBuyRules) => void;
};

const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');

const NAME_STEP = 0;
const TOUR_STEP = 1;
const FIRST_QUESTION_STEP = 2;

const FEATURE_TOUR: Array<{ detail: string; icon: IconName; label: string }> = [
  {
    detail: 'Use photos to identify a find and surface visible evidence.',
    icon: 'barcode.viewfinder',
    label: 'SCAN & IDENTIFY',
  },
  {
    detail: 'Compare market signals before you spend your cash.',
    icon: 'chart.bar.fill',
    label: 'PRICE WITH CONTEXT',
  },
  {
    detail: 'Build listing copy, offers, and sale-ready next steps.',
    icon: 'tag.fill',
    label: 'LIST & SELL',
  },
  {
    detail: 'Track inventory, money sync, books, and business pulse.',
    icon: 'dollarsign.circle.fill',
    label: 'RUN THE BUSINESS',
  },
];

const QUESTIONS: PreAuthQuestion[] = [
  {
    eyebrow: 'FIRST, YOUR LANE',
    id: 'lane',
    message: 'I do my best work when I know what feels natural to you.',
    prompt: 'What kind of flips sound most like you?',
    choices: [
      {
        detail: 'Games, media, and easy wins',
        icon: 'barcode.viewfinder',
        id: 'quick',
        isSelected: (rules) => rules.inventoryFocus === 'media_games' && rules.laborTolerance === 'quick_listing',
        label: 'Quick & simple',
        update: (rules) => ({ ...rules, inventoryFocus: 'media_games', laborTolerance: 'quick_listing' }),
      },
      {
        detail: 'Clothes, shoes, and style finds',
        icon: 'tag.fill',
        id: 'fashion',
        isSelected: (rules) => rules.inventoryFocus === 'fashion',
        label: 'Fashion finder',
        update: (rules) => ({ ...rules, inventoryFocus: 'fashion', laborTolerance: 'standard_prep' }),
      },
      {
        detail: 'I can clean, test, or repair',
        icon: 'wrench.and.screwdriver.fill',
        id: 'hands-on',
        isSelected: (rules) => rules.laborTolerance === 'hands_on',
        label: 'Worth the work',
        update: (rules) => ({ ...rules, inventoryFocus: 'electronics', laborTolerance: 'hands_on' }),
      },
      {
        detail: 'The hunt is half the fun',
        icon: 'square.grid.2x2.fill',
        id: 'general',
        isSelected: (rules) => rules.inventoryFocus === 'general' && rules.laborTolerance === 'standard_prep',
        label: 'A little of everything',
        update: (rules) => ({ ...rules, inventoryFocus: 'general', laborTolerance: 'standard_prep' }),
      },
    ],
  },
  {
    eyebrow: 'YOUR FLIP STYLE',
    id: 'pace',
    message: 'Perfect. Now tell me how you like a good deal to feel.',
    prompt: 'What are we optimizing for?',
    choices: [
      {
        detail: 'Move it quickly and keep cash moving',
        icon: 'bolt.fill',
        id: 'fast',
        isSelected: (rules) => rules.saleSpeed === 'quick',
        label: 'Fast cash',
        update: (rules) => ({ ...rules, maximumTypicalDays: buyRuleDayLimit('quick'), minimumRoiPercent: 30, saleSpeed: 'quick' }),
      },
      {
        detail: 'A healthy mix of speed and margin',
        icon: 'gauge.with.dots.needle.67percent',
        id: 'balanced',
        isSelected: (rules) => rules.saleSpeed === 'steady',
        label: 'Good balance',
        update: (rules) => ({ ...rules, maximumTypicalDays: buyRuleDayLimit('steady'), minimumRoiPercent: 50, saleSpeed: 'steady' }),
      },
      {
        detail: 'I can wait for the better payday',
        icon: 'star.fill',
        id: 'profit',
        isSelected: (rules) => rules.saleSpeed === 'patient',
        label: 'Bigger payday',
        update: (rules) => ({ ...rules, maximumTypicalDays: buyRuleDayLimit('patient'), minimumRoiPercent: 100, saleSpeed: 'patient' }),
      },
    ],
  },
  {
    eyebrow: 'MAKE IT WORTH IT',
    id: 'profit',
    message: 'I will factor in the messy little costs. You tell me the win.',
    prompt: 'What is the smallest take-home profit worth your time?',
    choices: [
      { detail: 'Easy wins still count', icon: 'dollarsign.circle.fill', id: 'ten', isSelected: (rules) => rules.minimumNetProfitCents === 1_000, label: '$10', update: (rules) => ({ ...rules, minimumNetProfitCents: 1_000 }) },
      { detail: 'A solid flip', icon: 'dollarsign.circle.fill', id: 'twenty', isSelected: (rules) => rules.minimumNetProfitCents === 2_000, label: '$20', update: (rules) => ({ ...rules, minimumNetProfitCents: 2_000 }) },
      { detail: 'I want meaningful margin', icon: 'dollarsign.circle.fill', id: 'forty', isSelected: (rules) => rules.minimumNetProfitCents === 4_000, label: '$40', update: (rules) => ({ ...rules, minimumNetProfitCents: 4_000 }) },
    ],
  },
  {
    eyebrow: 'PROTECT YOUR CASH',
    id: 'cash',
    message: 'Last thing I want is to recommend a deal that pins your bankroll.',
    prompt: 'What feels comfortable to put into one find?',
    choices: [
      { detail: 'Keep every buy light', icon: 'dollarsign.circle.fill', id: 'twenty-five', isSelected: (rules) => rules.maximumItemCostCents === 2_500, label: 'Up to $25', update: (rules) => ({ ...rules, maximumItemCostCents: 2_500 }) },
      { detail: 'My normal sourcing range', icon: 'dollarsign.circle.fill', id: 'seventy-five', isSelected: (rules) => rules.maximumItemCostCents === 7_500, label: 'Up to $75', update: (rules) => ({ ...rules, maximumItemCostCents: 7_500 }) },
      { detail: 'I can take on stronger finds', icon: 'dollarsign.circle.fill', id: 'one-fifty', isSelected: (rules) => rules.maximumItemCostCents === 15_000, label: 'Up to $150', update: (rules) => ({ ...rules, maximumItemCostCents: 15_000 }) },
      { detail: 'Show me higher-ticket opportunities', icon: 'dollarsign.circle.fill', id: 'three-hundred', isSelected: (rules) => rules.maximumItemCostCents === 30_000, label: '$300+', update: (rules) => ({ ...rules, maximumItemCostCents: 30_000 }) },
    ],
  },
  {
    eyebrow: 'HOME BASE',
    id: 'storage',
    message: 'Then I can flag finds that may take up more room than they deserve.',
    prompt: 'Where do your future flips live before they sell?',
    choices: [
      { detail: 'Every inch matters', icon: 'shippingbox.fill', id: 'closet', isSelected: (rules) => rules.storageCapacity === 'closet_or_bin', label: 'Closet or bin', update: (rules) => ({ ...rules, storageCapacity: 'closet_or_bin' }) },
      { detail: 'I have some breathing room', icon: 'shippingbox.fill', id: 'room', isSelected: (rules) => rules.storageCapacity === 'dedicated_room', label: 'Dedicated room', update: (rules) => ({ ...rules, storageCapacity: 'dedicated_room' }) },
      { detail: 'Bring on the big finds', icon: 'shippingbox.fill', id: 'garage', isSelected: (rules) => rules.storageCapacity === 'garage_or_warehouse', label: 'Garage or warehouse', update: (rules) => ({ ...rules, storageCapacity: 'garage_or_warehouse' }) },
    ],
  },
];

function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function moneyFromCents(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function FeatureTile({ detail, icon, label }: { detail: string; icon: IconName; label: string }) {
  return (
    <View style={styles.featureTile}>
      <View style={styles.featureIcon}><IconSymbol color={theme.colors.scannerCyan} name={icon} size={16} /></View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function ChoiceCard({ choice, onPress, selected }: { choice: PreAuthChoice; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityHint={choice.detail}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choiceCard, selected && styles.choiceCardSelected, pressed && styles.pressed]}>
      <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><IconSymbol color={selected ? theme.colors.scannerCyan : theme.colors.goldBright} name={choice.icon} size={21} /></View>
      <View style={styles.choiceCopy}><Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{choice.label}</Text><Text style={styles.choiceDetail}>{choice.detail}</Text></View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioCore} /> : null}</View>
    </Pressable>
  );
}

export function KeepFlipPreAuthScreen({ onBack, onComplete }: KeepFlipPreAuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();
  const { height } = useWindowDimensions();
  const [screen, setScreen] = useState(NAME_STEP);
  const [name, setName] = useState('');
  const [rules, setRules] = useState<ResellerBuyRules>(() => ({ ...DEFAULT_RESELLER_BUY_RULES, includedCostTypes: [...DEFAULT_RESELLER_BUY_RULES.includedCostTypes] }));
  const [error, setError] = useState<string | null>(null);
  const summaryStep = QUESTIONS.length + FIRST_QUESTION_STEP;
  const question =
    screen >= FIRST_QUESTION_STEP && screen < summaryStep
      ? QUESTIONS[screen - FIRST_QUESTION_STEP]
      : null;
  const summary = useMemo(() => ({ line: `${moneyFromCents(rules.minimumNetProfitCents)}+ take-home · ${rules.minimumRoiPercent}%+ ROI`, details: `${rules.saleSpeed} pace · up to ${moneyFromCents(rules.maximumItemCostCents)} in one item` }), [rules]);

  const goBack = useCallback(() => {
    selectionHaptic();
    setError(null);
    if (screen === 0) { onBack?.(); return; }
    setScreen((current) => Math.max(0, current - 1));
  }, [onBack, screen]);

  const choose = useCallback((choice: PreAuthChoice) => {
    selectionHaptic();
    setError(null);
    setRules((current) => choice.update(current));
    setScreen((current) => Math.min(summaryStep, current + 1));
  }, [summaryStep]);

  const finish = useCallback(() => {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (cleanName.length < 2) { setError('Tell Flip what to call you before we continue.'); setScreen(NAME_STEP); return; }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onComplete(cleanName, rules);
  }, [name, onComplete, rules]);

  return (
    <KeepFlipBackground>
      <ScrollView contentContainerStyle={[styles.content, {paddingTop: insets.top / 4, height: 'auto', paddingBottom: insets.bottom }]} style={{height: height, marginTop: insets.top, marginBottom: insets.bottom}} showsVerticalScrollIndicator={false}>
        <View pointerEvents="none" style={styles.authGlow} />
        <View style={styles.topBar}>
          <View><Text style={[styles.brandEyebrow, {fontSize: responsiveFont(10)}]}>MEET FLIP</Text><Text style={[styles.brandTitle, { fontSize: responsiveFont(26)}]}>Your resale sidekick.</Text></View>
        </View>


        <View style={[styles.main]}>
          <Animated.View entering={FadeIn.duration(260)} style={styles.coinShell}>
            <View style={styles.coinFace}><Image accessibilityLabel="Flip" contentFit="cover" source={FLIP_MASCOT_IMAGE} style={styles.coinImage} /></View>
            <View style={styles.onlineLine}><View style={styles.onlineDot} /><Text style={styles.onlineText}>FLIP IS ONLINE</Text></View>
          </Animated.View>

          {screen === NAME_STEP ? (
            <Animated.View entering={FadeInDown.duration(280)} style={styles.panel}>
              <Text style={[styles.hello, { fontSize: responsiveFont(20)}]}>Hi, I'm Flip.</Text>
              <Text style={styles.headline}>What should I call you?</Text>
              <Text style={styles.body}>A quick intro lets me tailor your seller setup to the way you actually flip.</Text>
              <View style={styles.nameBlock}><Text style={styles.nameLabel}>YOUR NAME</Text><TextInput autoCapitalize="words" autoComplete="name" onChangeText={(value) => { setName(value); setError(null); }} style={styles.nameInput} value={name} /></View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => { if (name.trim().length < 2) { setError('Tell Flip what to call you before we continue.'); return; } selectionHaptic(); setScreen(TOUR_STEP); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>CONTINUE</Text></Pressable>
            </Animated.View>
          ) : screen === TOUR_STEP ? (
            <Animated.View entering={FadeInDown.duration(280)} style={styles.panel}>
              <Text style={styles.hello}>Nice to meet you, {name.trim()}.</Text>
              <Text style={styles.headline}>Here's how KeepFlip helps.</Text>
              <Text style={styles.body}>From the first scan through the sale, Flip keeps your decisions and your money connected.</Text>
              <View style={styles.featureList}>{FEATURE_TOUR.map((feature) => <FeatureTile {...feature} key={feature.label} />)}</View>
              <Pressable accessibilityRole="button" onPress={() => { selectionHaptic(); setScreen(FIRST_QUESTION_STEP); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>BUILD MY SELLER SETUP</Text><IconSymbol color={theme.colors.backgroundDeep} name="arrow.right" size={20} /></Pressable>
            </Animated.View>
          ) : question ? (
            <Animated.View entering={FadeInDown.duration(260)} key={question.id} style={styles.panel}>
              <View style={styles.messageBubble}><Text style={styles.messageLabel}>FLIP</Text><Text style={styles.messageText}>{question.message}</Text></View>
              <Text style={styles.questionEyebrow}>{question.eyebrow}</Text><Text style={styles.questionTitle}>{question.prompt}</Text>
              <View style={styles.choiceList}>{question.choices.map((choice) => <ChoiceCard choice={choice} key={choice.id} onPress={() => choose(choice)} selected={choice.isSelected(rules)} />)}</View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(280)} style={styles.panel}>
              <Text style={styles.hello}>Locked in.</Text><Text style={styles.headline}>Flip knows what a good buy looks like to you.</Text>
              <View style={styles.summaryCard}><Text style={styles.summaryPrimary}>{summary.line}</Text><Text style={styles.summarySecondary}>{summary.details}</Text></View>
              <Text style={styles.body}>Next, choose a plan and create the account that will keep your seller setup connected.</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable accessibilityRole="button" onPress={finish} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>CONTINUE TO PLAN & ACCOUNT SETUP</Text></Pressable>
            </Animated.View>
          )}
        </View>
        <View style={styles.progressRail}>{QUESTIONS.map((item, index) => <View key={item.id} style={[styles.progressSegment, index < Math.max(0, screen - TOUR_STEP) && styles.progressSegmentActive]} />)}</View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  authGlow: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
    radial-gradient(circle at 82% 12%, rgba(88, 223, 232, 0.055) 0%, transparent 32%),
    radial-gradient(circle at 70r% 94%, rgba(141, 114, 255, 0.07) 0%, transparent 34%), 
      radial-gradient(circle at 25% 86%, rgba(224, 172, 75, 0.13) 0%, transparent 31%)
      
    `,
  },
  backButton: { alignItems: 'center', borderColor: 'rgba(242, 237, 228, 0.18)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 3, minHeight: 34, paddingHorizontal: 11 },
  backButtonText: { color: theme.colors.cream, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 0.85 },
  body: { color: theme.colors.textMuted, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 21 },
  brandEyebrow: { color: theme.colors.gold, fontFamily: theme.fonts.display, letterSpacing: 2.4 },
  brandTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 20, marginTop: 4 },
  choiceCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.035)', borderColor: 'rgba(242,237,228,0.13)', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 50, padding: 11 },
  choiceCardSelected: { backgroundColor: 'rgba(0,255,255,0.09)', borderColor: 'rgba(0,255,255,0.72)' },
  choiceCopy: { flex: 1, gap: 2 },
  choiceDetail: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
  choiceIcon: { alignItems: 'center', backgroundColor: 'rgba(215,168,74,0.10)', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  choiceIconSelected: { backgroundColor: 'rgba(0,255,255,0.12)' },
  choiceList: { gap: 9 },
  choiceTitle: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 14 },
  choiceTitleSelected: { color: theme.colors.scannerCyan },
  coinFace: { backgroundColor: 'rgba(8,8,12,0.98)', borderColor: 'rgba(242,211,138,0.85)', borderRadius: 999, borderWidth: 2, height: 112, overflow: 'hidden', width: 112 },
  coinImage: { height: '100%', width: '100%' },
  coinShell: { alignItems: 'center', gap: 8 },
  content: { gap: 10, paddingHorizontal: 12 },
  errorText: { color: theme.colors.danger, fontSize: 12, lineHeight: 18 },
  featureCopy: { flex: 1, gap: 2 },
  featureDetail: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
  featureIcon: { alignItems: 'center', backgroundColor: 'rgba(0,255,255,0.08)', borderRadius: 10, height: 33, justifyContent: 'center', width: 33 },
  featureLabel: { color: theme.colors.cream, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 0.85 },
  featureList: { gap: 8 },
  featureTile: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  hello: { color: theme.colors.goldBright, fontFamily: theme.fonts.display, fontSize: 16 },
  headline: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 26, lineHeight: 32 },
  main: { gap: 20,  maxWidth: 560, width: '100%', justifyContent: 'space-evenly' },
  messageBubble: { backgroundColor: 'rgba(141,114,255,0.13)', borderColor: 'rgba(141,114,255,0.36)', borderRadius: 16, borderTopLeftRadius: 5, borderWidth: 1, gap: 4, padding: 13 },
  messageLabel: { color: theme.colors.scannerViolet, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.1 },
  messageText: { color: theme.colors.cream, fontSize: 13, lineHeight: 19 },
  nameBlock: { gap: 6 },
  nameInput: { backgroundColor: 'rgba(2,2,4,0.82)', borderColor: 'rgba(242,211,138,0.2)', borderRadius: 12, borderWidth: 1, color: theme.colors.cream, fontSize: 15, minHeight: 52, paddingHorizontal: 14 },
  nameLabel: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 11, letterSpacing: 1 },
  onlineDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: 999, height: 6, width: 6 },
  onlineLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  onlineText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 10, letterSpacing: 1.1 },
  panel: { backgroundColor: 'rgba(8,8,12,0.80)', borderColor: 'rgba(242,237,228,0.13)', justifyContent: 'space-evenly', borderRadius: 12, borderWidth: 1, gap: 15, padding: 12, height: '75%' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  primaryButton: { alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 16, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 54, paddingHorizontal: 14 },
  primaryButtonText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.65 },
  progressRail: { top: 10, flexDirection: 'row', gap: 6, marginHorizontal: 'auto', maxWidth: 560, width: '100%' },
  progressSegment: { backgroundColor: 'rgba(242,237,228,0.14)', borderRadius: 999, flex: 1, height: 3 },
  progressSegmentActive: { backgroundColor: theme.colors.scannerCyan, boxShadow: '0 0 9px rgba(0,255,255,0.75)' },
  questionEyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.1 },
  questionTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 23, lineHeight: 22 },
  radio: { alignItems: 'center', borderColor: 'rgba(242,237,228,0.28)', borderRadius: 999, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 },
  radioCore: { backgroundColor: theme.colors.scannerCyan, borderRadius: 999, height: 8, width: 8 },
  radioSelected: { borderColor: theme.colors.scannerCyan },
  summaryCard: { backgroundColor: 'rgba(0,255,255,0.075)', borderColor: 'rgba(0,255,255,0.28)', borderRadius: 16, borderWidth: 1, gap: 5, padding: 14 },
  summaryPrimary: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 15 },
  summarySecondary: { color: theme.colors.cream, fontSize: 12, lineHeight: 18 },
  topBar: { alignItems: 'center', flexDirection: 'row', maxWidth: 560, width: '100%' },
});
