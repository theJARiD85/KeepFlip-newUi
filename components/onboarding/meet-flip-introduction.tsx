import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FlipCompanion } from '@/components/flip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type MeetFlipIntroductionProps = {
  onBack: () => void;
  onContinue: () => void;
};

const INTRO = [
  {
    eyebrow: 'MEET YOUR RESALE SIDEKICK',
    title: "Hi, I'm Flip.",
    message: 'I help you keep a find moving from the first photo to the final sale. Let me show you how KeepFlip works before we make your account.',
    highlights: ['Scan a find', 'Save it to inventory', 'Build a listing', 'Record the sale'],
  },
  {
    eyebrow: 'START FREE',
    title: 'The whole workflow is yours to try.',
    message: 'Scan and research a find, save inventory, prepare a listing, and track your costs and sale records with a free account. No credit card is required, and there is no timed trial. You are welcome to explore the app at your own pace.',
    highlights: ['No credit card', 'No trial clock', 'Books and insights included'],
  },
  {
    eyebrow: 'THE FREE PLAN',
    title: "Here's where the limits are.",
    message: "Free includes up to 10 saved inventory items, 10 AI scans each month, and 10 listing generations each month. You can use the workflow without paying, but my Flip Assistant help is part of Serious. I'll guide this tour so you can see the app; ongoing assistant help requires Serious.",
    highlights: ['10 saved items', '10 AI scans / month', '10 listing generations / month'],
  },
] as const;

export function MeetFlipIntroduction({ onBack, onContinue }: MeetFlipIntroductionProps) {
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, contentWidth, pageGutter, responsiveFont, responsiveHeight, responsiveWidth } = useResponsiveLayout();
  const [step, setStep] = useState(0);
  const current = INTRO[step];
  const isLast = step === INTRO.length - 1;

  return (
    <KeepFlipBackground>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 15, paddingBottom: insets.bottom + 30 }]} style={{marginTop: insets.top, marginBottom: insets.bottom}}>

        <View style={[styles.page, { maxWidth: contentMaxWidth, paddingHorizontal: pageGutter, width: contentWidth }]}>
          <View style={styles.topBar}>
            <Text style={[styles.brand, { fontSize: responsiveFont(10) }]}>KEEPFLIP / MEET FLIP</Text>
            <Pressable accessibilityLabel={step === 0 ? 'Back to welcome' : 'Previous introduction step'} accessibilityRole="button" onPress={() => step === 0 ? onBack() : setStep(step - 1)} style={styles.backButton}>
              <IconSymbol color={theme.colors.cream} name="chevron.left" size={16} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>

          <View accessibilityLabel={`Introduction step ${step + 1} of ${INTRO.length}`} style={styles.progress}>
            {INTRO.map((item, index) => <View key={item.eyebrow} style={[styles.progressSegment, index <= step && styles.progressActive]} />)}
          </View>
          <View style={styles.flipStage}>
            <Image style={{ height: responsiveHeight(85), width: responsiveWidth(85), zIndex: 0, position: 'absolute', borderRadius: 16, overflow: 'hidden' }} source={require('@/assets/flip/background.jpg')} />
            <FlipCompanion size={85} />
          </View>
          <Animated.View key={`flip-${step}`} entering={FadeInDown.duration(300)} style={styles.flipStage}>
            <View style={styles.flipHalo}><FlipCompanion size={112} /></View>
            <View style={styles.onlineRow}><View style={styles.onlineDot} /><Text style={styles.onlineText}>FLIP IS HERE</Text></View>
          </Animated.View>

          <Animated.View key={current.eyebrow} entering={FadeInDown.duration(360).delay(70)} style={styles.messageCard}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>{current.eyebrow}</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(29), lineHeight: responsiveFont(35) }]}>{current.title}</Text>
            <Text style={[styles.message, { fontSize: responsiveFont(15), lineHeight: responsiveFont(23) }]}>{current.message}</Text>
            <View style={styles.highlights}>
              {current.highlights.map((label) => (
                <View key={label} style={styles.highlight}>
                  <IconSymbol color={theme.colors.scannerCyan} name="checkmark.circle.fill" size={15} />
                  <Text style={[styles.highlightText, { fontSize: responsiveFont(11) }]}>{label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Pressable accessibilityLabel={isLast ? 'Continue to free account details' : 'Continue introduction'} accessibilityRole="button" onPress={isLast ? onContinue : () => setStep(step + 1)} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]} testID="keepflip-meet-flip-continue">
            <Text style={[styles.continueText, { fontSize: responsiveFont(14) }]}>{isLast ? 'CREATE MY FREE ACCOUNT' : 'CONTINUE'}</Text>
            <IconSymbol color={theme.colors.textOnAccent} name="arrow.right" size={18} />
          </Pressable>
          <Text style={styles.footerNote}>{isLast ? 'Next: your name, email, and password.' : 'A quick introduction, then your account.'}</Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', flexGrow: 1 },
  page: { alignSelf: 'center', flexGrow: 1, gap: 20, justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, letterSpacing: 1.2 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 42, paddingHorizontal: 5 },
  backText: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 12 },
  progress: { flexDirection: 'row', gap: 7 },
  progressSegment: { backgroundColor: theme.colors.divider, borderRadius: 4, flex: 1, height: 4 },
  progressActive: { backgroundColor: theme.colors.scannerCyan },
  flipStage: { alignItems: 'center', gap: 8, paddingVertical: 5 },
  flipHalo: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: 85, borderWidth: 1, height: 155, justifyContent: 'center', width: 155 },
  onlineRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  onlineDot: { backgroundColor: theme.colors.scannerCyan, borderRadius: 4, height: 7, width: 7 },
  onlineText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 1 },
  messageCard: { backgroundColor: theme.colors.surfaceOverlay, borderColor: theme.colors.divider, borderRadius: 24, borderWidth: 1, gap: 15, padding: 21 },
  eyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, letterSpacing: 1.3 },
  title: { color: theme.colors.cream, fontFamily: theme.fonts.bold, letterSpacing: -0.5 },
  message: { color: theme.colors.textMuted, fontFamily: theme.fonts.body },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  highlight: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  highlightText: { color: theme.colors.cream, fontFamily: theme.fonts.medium },
  continueButton: { alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 17, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 56, paddingHorizontal: 15 },
  continueText: { color: theme.colors.textOnAccent, fontFamily: theme.fonts.bold },
  footerNote: { color: theme.colors.textMuted, fontFamily: theme.fonts.body, fontSize: 11, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
