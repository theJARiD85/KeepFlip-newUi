import { Image } from 'expo-image';
import { type ComponentProps, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  buyRuleDayLimit,
  DEFAULT_RESELLER_BUY_RULES,
  type ResellerBuyRules,
} from '@/services/reseller-buy-rules-service';

type IconName = ComponentProps<typeof IconSymbol>['name'];

type QuestionChoice = {
  detail: string;
  icon: IconName;
  id: string;
  isSelected: (rules: ResellerBuyRules) => boolean;
  label: string;
  update: (rules: ResellerBuyRules) => ResellerBuyRules;
};

type OnboardingQuestion = {
  eyebrow: string;
  id: string;
  message: string;
  prompt: string;
  choices?: QuestionChoice[];
};

const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');
const NAME_STEP = 0;
const TOUR_STEP = 1;
const FIRST_QUESTION_STEP = 2;

const FEATURE_TOUR: { detail: string; icon: IconName; label: string }[] = [
  {
    detail: 'Use item evidence to understand what you are looking at.',
    icon: 'barcode.viewfinder',
    label: 'IDENTIFY WITH EVIDENCE',
  },
  {
    detail: 'Compare real market signals before cash leaves your hand.',
    icon: 'chart.bar.fill',
    label: 'PRICE WITH CONTEXT',
  },
  {
    detail: 'Track inventory, realized costs, and your next seller move.',
    icon: 'dollarsign.circle.fill',
    label: 'RUN THE BUSINESS',
  },
];

const QUESTIONS: OnboardingQuestion[] = [
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
        isSelected: (rules) =>
          rules.inventoryFocus === 'media_games' &&
          rules.laborTolerance === 'quick_listing',
        label: 'Quick & simple',
        update: (rules) => ({
          ...rules,
          inventoryFocus: 'media_games',
          laborTolerance: 'quick_listing',
        }),
      },
      {
        detail: 'Clothes, shoes, and style finds',
        icon: 'tag.fill',
        id: 'fashion',
        isSelected: (rules) => rules.inventoryFocus === 'fashion',
        label: 'Fashion finder',
        update: (rules) => ({
          ...rules,
          inventoryFocus: 'fashion',
          laborTolerance: 'standard_prep',
        }),
      },
      {
        detail: 'I can clean, test, or repair',
        icon: 'wrench.and.screwdriver.fill',
        id: 'hands-on',
        isSelected: (rules) => rules.laborTolerance === 'hands_on',
        label: 'Worth the work',
        update: (rules) => ({
          ...rules,
          inventoryFocus: 'electronics',
          laborTolerance: 'hands_on',
        }),
      },
      {
        detail: 'The hunt is half the fun',
        icon: 'square.grid.2x2.fill',
        id: 'general',
        isSelected: (rules) =>
          rules.inventoryFocus === 'general' &&
          rules.laborTolerance === 'standard_prep',
        label: 'A little of everything',
        update: (rules) => ({
          ...rules,
          inventoryFocus: 'general',
          laborTolerance: 'standard_prep',
        }),
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
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit('quick'),
          minimumRoiPercent: 30,
          saleSpeed: 'quick',
        }),
      },
      {
        detail: 'A healthy mix of speed and margin',
        icon: 'gauge.with.dots.needle.67percent',
        id: 'balanced',
        isSelected: (rules) => rules.saleSpeed === 'steady',
        label: 'Good balance',
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit('steady'),
          minimumRoiPercent: 50,
          saleSpeed: 'steady',
        }),
      },
      {
        detail: 'I can wait for the better payday',
        icon: 'star.fill',
        id: 'profit',
        isSelected: (rules) => rules.saleSpeed === 'patient',
        label: 'Bigger payday',
        update: (rules) => ({
          ...rules,
          maximumTypicalDays: buyRuleDayLimit('patient'),
          minimumRoiPercent: 100,
          saleSpeed: 'patient',
        }),
      },
    ],
  },
  {
    eyebrow: 'MAKE IT WORTH IT',
    id: 'profit',
    message: 'I will factor in the messy little costs. You tell me the win.',
    prompt: 'What is the smallest take-home profit worth your time?',
  },
  {
    eyebrow: 'PROTECT YOUR CASH',
    id: 'cash',
    message: 'Last thing I want is to recommend a deal that pins your bankroll.',
    prompt: 'What feels comfortable to put into one find?',
    choices: [
      {
        detail: 'Keep every buy light',
        icon: 'dollarsign.circle.fill',
        id: 'twenty-five',
        isSelected: (rules) => rules.maximumItemCostCents === 2_500,
        label: 'Up to $25',
        update: (rules) => ({ ...rules, maximumItemCostCents: 2_500 }),
      },
      {
        detail: 'My normal sourcing range',
        icon: 'dollarsign.circle.fill',
        id: 'seventy-five',
        isSelected: (rules) => rules.maximumItemCostCents === 7_500,
        label: 'Up to $75',
        update: (rules) => ({ ...rules, maximumItemCostCents: 7_500 }),
      },
      {
        detail: 'I can take on stronger finds',
        icon: 'dollarsign.circle.fill',
        id: 'one-fifty',
        isSelected: (rules) => rules.maximumItemCostCents === 15_000,
        label: 'Up to $150',
        update: (rules) => ({ ...rules, maximumItemCostCents: 15_000 }),
      },
      {
        detail: 'Show me higher-ticket opportunities',
        icon: 'dollarsign.circle.fill',
        id: 'three-hundred',
        isSelected: (rules) => rules.maximumItemCostCents === 30_000,
        label: '$300+',
        update: (rules) => ({ ...rules, maximumItemCostCents: 30_000 }),
      },
    ],
  },
  {
    eyebrow: 'HOME BASE',
    id: 'storage',
    message: 'Then I can flag finds that may take up more room than they deserve.',
    prompt: 'Where do your future flips live before they sell?',
    choices: [
      {
        detail: 'Every inch matters',
        icon: 'shippingbox.fill',
        id: 'closet',
        isSelected: (rules) => rules.storageCapacity === 'closet_or_bin',
        label: 'Closet or bin',
        update: (rules) => ({ ...rules, storageCapacity: 'closet_or_bin' }),
      },
      {
        detail: 'I have some breathing room',
        icon: 'shippingbox.fill',
        id: 'room',
        isSelected: (rules) => rules.storageCapacity === 'dedicated_room',
        label: 'Dedicated room',
        update: (rules) => ({ ...rules, storageCapacity: 'dedicated_room' }),
      },
      {
        detail: 'Bring on the big finds',
        icon: 'shippingbox.fill',
        id: 'garage',
        isSelected: (rules) => rules.storageCapacity === 'garage_or_warehouse',
        label: 'Garage or warehouse',
        update: (rules) => ({ ...rules, storageCapacity: 'garage_or_warehouse' }),
      },
    ],
  },
];

function moneyFromCents(cents: number) {
  const amount = cents / 100;
  return `$${amount.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  })}`;
}

export function WebPreAuthScreen({
  onBack,
  onComplete,
}: {
  onBack?: () => void;
  onComplete: (name: string, rules: ResellerBuyRules) => void;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const [step, setStep] = useState(NAME_STEP);
  const [name, setName] = useState('');
  const [rules, setRules] = useState<ResellerBuyRules>(() => ({
    ...DEFAULT_RESELLER_BUY_RULES,
    includedCostTypes: [...DEFAULT_RESELLER_BUY_RULES.includedCostTypes],
  }));
  const [profitInput, setProfitInput] = useState(() =>
    String(DEFAULT_RESELLER_BUY_RULES.minimumNetProfitCents / 100),
  );
  const [error, setError] = useState<string | null>(null);
  const summaryStep = FIRST_QUESTION_STEP + QUESTIONS.length;
  const question =
    step >= FIRST_QUESTION_STEP && step < summaryStep
      ? QUESTIONS[step - FIRST_QUESTION_STEP]
      : null;
  const progress = Math.min(1, Math.max(0, (step + 1) / (summaryStep + 1)));
  const summary = useMemo(
    () => ({
      detail: `${rules.saleSpeed} pace · up to ${moneyFromCents(rules.maximumItemCostCents)} in one item`,
      line: `${moneyFromCents(rules.minimumNetProfitCents)}+ take-home · ${rules.minimumRoiPercent}%+ ROI`,
    }),
    [rules],
  );

  const goBack = () => {
    setError(null);
    if (step === NAME_STEP) {
      onBack?.();
      return;
    }
    setStep((current) => Math.max(NAME_STEP, current - 1));
  };

  const continueFromName = () => {
    if (!name.trim()) {
      setError('Tell Flip what to call you first.');
      return;
    }
    setError(null);
    setStep(TOUR_STEP);
  };

  const continueFromProfit = () => {
    const normalized = profitInput.replace(/[$,\s]/g, '');
    const amount = Number(normalized);
    const isValid =
      /^\d+(?:\.\d{0,2})?$/.test(normalized) &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= 1_000_000;

    if (!isValid) {
      setError('Enter a take-home profit between $0 and $1,000,000.');
      return;
    }

    setRules((current) => ({
      ...current,
      minimumNetProfitCents: Math.round(amount * 100),
    }));
    setError(null);
    setStep((current) => Math.min(summaryStep, current + 1));
  };

  const choose = (choice: QuestionChoice) => {
    setRules((current) => choice.update(current));
    setError(null);
    setStep((current) => Math.min(summaryStep, current + 1));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={[styles.backText, { color: colors.textMuted }]}>← BACK</Text>
            </Pressable>
            <View style={styles.progressCopy}>
              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>SETUP {Math.min(step + 1, summaryStep + 1)} / {summaryStep + 1}</Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.divider }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.scannerCyan, width: `${progress * 100}%` }]} />
              </View>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
            <View style={styles.flipHeader}>
              <View style={[styles.flipAvatar, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
                <Image contentFit="contain" source={FLIP_MASCOT_IMAGE} style={styles.flipImage} />
              </View>
              <View style={styles.flipHeaderCopy}>
                <Text style={[styles.flipLabel, { color: colors.scannerCyan }]}>FLIP · RESALE SIDEKICK</Text>
                <Text style={[styles.flipStatus, { color: colors.textMuted }]}>READY TO LEARN YOUR BUYING STYLE</Text>
              </View>
            </View>

            {step === NAME_STEP ? (
              <View style={styles.stage}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>LET’S MAKE THIS PERSONAL</Text>
                <Text style={[styles.title, { color: colors.text }]}>What should Flip call you?</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>Your answer stays in your KeepFlip profile and helps make the advice feel like it is built for your business.</Text>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>YOUR NAME</Text>
                <TextInput
                  accessibilityLabel="Your name"
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={setName}
                  onSubmitEditing={continueFromName}
                  placeholder="Jamie Reseller"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text }]}
                  value={name}
                />
                {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
                <PrimaryAction colors={colors} label="CONTINUE" onPress={continueFromName} />
              </View>
            ) : null}

            {step === TOUR_STEP ? (
              <View style={styles.stage}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>WHAT FLIP HELPS WITH</Text>
                <Text style={[styles.title, { color: colors.text }]}>Less guessing. Better next moves.</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>KeepFlip keeps the scanner on Android, but the same evidence, records, buy rules, and advice stay with you on web.</Text>
                <View style={styles.featureList}>
                  {FEATURE_TOUR.map((feature) => (
                    <View key={feature.label} style={[styles.feature, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
                      <View style={[styles.featureIcon, { backgroundColor: colors.iconSurfaceCyan }]}>
                        <IconSymbol color={colors.scannerCyan} name={feature.icon} size={18} />
                      </View>
                      <View style={styles.featureCopy}>
                        <Text style={[styles.featureLabel, { color: colors.text }]}>{feature.label}</Text>
                        <Text style={[styles.featureDetail, { color: colors.textMuted }]}>{feature.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <PrimaryAction colors={colors} label="SET MY BUY RULES" onPress={() => setStep(FIRST_QUESTION_STEP)} />
              </View>
            ) : null}

            {question ? (
              <View style={styles.stage}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>{question.eyebrow}</Text>
                <Text style={[styles.title, { color: colors.text }]}>{question.prompt}</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>{question.message}</Text>
                {question.choices ? (
                  <View style={styles.choiceList}>
                    {question.choices.map((choice) => {
                      const selected = choice.isSelected(rules);
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={choice.id}
                          onPress={() => choose(choice)}
                          style={({ pressed }) => [
                            styles.choice,
                            {
                              backgroundColor: selected ? colors.iconSurfaceCyan : colors.surfaceInset,
                              borderColor: selected ? colors.scannerCyan : colors.divider,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={[styles.choiceIcon, { backgroundColor: selected ? colors.iconSurfaceCyan : colors.iconSurfaceGold }]}>
                            <IconSymbol color={selected ? colors.scannerCyan : colors.goldBright} name={choice.icon} size={20} />
                          </View>
                          <View style={styles.choiceCopy}>
                            <Text style={[styles.choiceTitle, { color: colors.text }]}>{choice.label}</Text>
                            <Text style={[styles.choiceDetail, { color: colors.textMuted }]}>{choice.detail}</Text>
                          </View>
                          <View style={[styles.radio, { borderColor: selected ? colors.scannerCyan : colors.textMuted }]}>
                            {selected ? <View style={[styles.radioCore, { backgroundColor: colors.scannerCyan }]} /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TAKE-HOME PROFIT</Text>
                    <TextInput
                      accessibilityLabel="Minimum take-home profit"
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      onChangeText={setProfitInput}
                      onSubmitEditing={continueFromProfit}
                      placeholder="$15"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text }]}
                      value={profitInput}
                    />
                    {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
                    <PrimaryAction colors={colors} label="SAVE MY PROFIT FLOOR" onPress={continueFromProfit} />
                  </>
                )}
              </View>
            ) : null}

            {step === summaryStep ? (
              <View style={styles.stage}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>FLIP HAS THE SIGNAL</Text>
                <Text style={[styles.title, { color: colors.text }]}>This is your buying baseline.</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>You can change these rules anytime. KeepFlip will use them to make its recommendations more useful from the first item onward.</Text>
                <View style={[styles.summaryCard, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
                  <Text style={[styles.summaryName, { color: colors.text }]}>{`${name.trim()}'s flip rules`}</Text>
                  <Text style={[styles.summaryLine, { color: colors.goldBright }]}>{summary.line}</Text>
                  <Text style={[styles.summaryDetail, { color: colors.textMuted }]}>{summary.detail}</Text>
                </View>
                <PrimaryAction colors={colors} label="CREATE MY KEEPFLIP ACCOUNT" onPress={() => onComplete(name.trim(), rules)} />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PrimaryAction({
  colors,
  label,
  onPress,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.gold }, pressed && styles.pressed]}
    >
      <Text style={[styles.primaryActionText, { color: colors.textOnAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { alignItems: 'center', padding: 24 },
  content: { maxWidth: 680, width: '100%' },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  backButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  backText: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1 },
  progressCopy: { alignItems: 'flex-end', gap: 6, width: 180 },
  progressLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1 },
  progressTrack: { borderRadius: 99, height: 5, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: 99, height: '100%' },
  card: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  flipHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
  flipAvatar: { borderRadius: 18, borderWidth: 1, height: 70, overflow: 'hidden', width: 70 },
  flipImage: { height: '100%', width: '100%' },
  flipHeaderCopy: { flex: 1, gap: 5, minWidth: 0 },
  flipLabel: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.15 },
  flipStatus: { fontFamily: theme.fonts.semibold, fontSize: 10, letterSpacing: 0.35 },
  stage: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider, gap: 14, padding: 24 },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.45 },
  title: { fontFamily: theme.fonts.bold, fontSize: 29, letterSpacing: -0.5, lineHeight: 35 },
  body: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, maxWidth: 590 },
  fieldLabel: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1, marginTop: 4 },
  input: { borderRadius: 14, borderWidth: 1, fontFamily: theme.fonts.body, fontSize: 16, minHeight: 54, paddingHorizontal: 16 },
  error: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  primaryAction: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 14, justifyContent: 'center', marginTop: 6, minHeight: 52, paddingHorizontal: 20 },
  primaryActionText: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 1 },
  featureList: { gap: 9 },
  feature: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 12 },
  featureIcon: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  featureCopy: { flex: 1, gap: 3, minWidth: 0 },
  featureLabel: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 0.65 },
  featureDetail: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 17 },
  choiceList: { gap: 9 },
  choice: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 72, padding: 12 },
  choiceIcon: { alignItems: 'center', borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  choiceCopy: { flex: 1, gap: 3, minWidth: 0 },
  choiceTitle: { fontFamily: theme.fonts.bold, fontSize: 14 },
  choiceDetail: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 17 },
  radio: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  radioCore: { borderRadius: 5, height: 10, width: 10 },
  summaryCard: { borderRadius: 16, borderWidth: 1, gap: 6, padding: 16 },
  summaryName: { fontFamily: theme.fonts.bold, fontSize: 16 },
  summaryLine: { fontFamily: theme.fonts.bold, fontSize: 19 },
  summaryDetail: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.8 },
});
