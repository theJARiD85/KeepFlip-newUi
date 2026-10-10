import { FlipCompanion } from '@/components/flip';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, contentWidth, pageGutter, responsiveFont, responsiveHeight, responsiveWidth } = useResponsiveLayout();
  const [step, setStep] = useState(0);
  const current = INTRO[step];
  const isLast = step === INTRO.length - 1;

  // Web: Hide the brand bar and progress indicator
  const isWeb = Platform.OS === 'web';

  return (
    <KeepFlipBackground>
      <ScrollView contentContainerStyle={[responsiveStyles.scroll, { paddingTop: insets.top + 15, paddingBottom: insets.bottom + 30 }]} style={{ marginTop: insets.top, marginBottom: insets.bottom }}>

        <View style={[responsiveStyles.page, { maxWidth: contentMaxWidth, paddingHorizontal: pageGutter, width: contentWidth }]}>
          <View style={responsiveStyles.topBar}>
            <Text style={[responsiveStyles.brand, { fontSize: responsiveFont(10) }]}>KEEPFLIP / MEET FLIP</Text>
            <Pressable accessibilityLabel={step === 0 ? 'Back to welcome' : 'Previous introduction step'} accessibilityRole="button" onPress={() => step === 0 ? onBack() : setStep(step - 1)} style={responsiveStyles.backButton}>
              <Ionicons color={theme.colors.cream} name="close" size={isWeb ? 30 : 16} />
            </Pressable>
          </View>

          <View accessibilityLabel={`Introduction step ${step + 1} of ${INTRO.length}`} style={responsiveStyles.progress}>
            {INTRO.map((item, index) => <View key={item.eyebrow} style={[responsiveStyles.progressSegment, index <= step && responsiveStyles.progressActive]} />)}
          </View>
          <Animated.View key={`flip-${step}`} entering={FadeInDown.duration(300)} style={responsiveStyles.flipStage}>
            <View style={[responsiveStyles.flipHalo, { borderRadius: isWeb ? 190 : 85, height: isWeb ? 250 : 112, width: isWeb ? 250 : 112 }]}><FlipCompanion size={isWeb ? 250 : 112} /></View>
            <View style={responsiveStyles.onlineRow}><View style={responsiveStyles.onlineDot} /><Text style={responsiveStyles.onlineText}>FLIP IS HERE</Text></View>
          </Animated.View>

          <Animated.View key={current.eyebrow} entering={FadeInDown.duration(360).delay(70)} style={responsiveStyles.messageCard}>
            <Text style={[responsiveStyles.eyebrow, { fontSize: responsiveFont(10) }]}>{current.eyebrow}</Text>
            <Text style={[responsiveStyles.title, { fontSize: responsiveFont(29), lineHeight: responsiveFont(35) }]}>{current.title}</Text>
            <Text style={[responsiveStyles.message, { fontSize: responsiveFont(15), lineHeight: responsiveFont(23) }]}>{current.message}</Text>
            <View style={responsiveStyles.highlights}>
              {current.highlights.map((label) => (
                <View key={label} style={responsiveStyles.highlight}>
                  <Ionicons color={theme.colors.scannerCyan} name="checkmark.circle.fill" size={15} />
                  <Text style={[responsiveStyles.highlightText, { fontSize: responsiveFont(11) }]}>{label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Pressable accessibilityLabel={isLast ? 'Continue to free account details' : 'Continue introduction'} accessibilityRole="button" onPress={isLast ? onContinue : () => setStep(step + 1)} style={({ pressed }) => [responsiveStyles.continueButton, pressed && responsiveStyles.pressed]} testID="keepflip-meet-flip-continue">
            <Text style={[responsiveStyles.continueText, { fontSize: responsiveFont(14) }]}>{isLast ? 'CREATE MY FREE ACCOUNT' : 'CONTINUE'}</Text>
            <Ionicons color={theme.colors.textOnAccent} name="arrow.right" size={18} />
          </Pressable>
          <Text style={responsiveStyles.footerNote}>{isLast ? 'Next: your name, email, and password.' : 'A quick introduction, then your account.'}</Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', justifyContent: 'space-between', flexGrow: 1 },
  page: { alignSelf: 'center', flexGrow: 1, gap: 20, justifyContent: 'space-between' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, letterSpacing: 1.2 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 42, paddingHorizontal: 5 },
  backText: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 12 },
  progress: { flexDirection: 'row', gap: 7 },
  progressSegment: { backgroundColor: theme.colors.divider, borderRadius: 4, flex: 1, height: 4 },
  progressActive: { backgroundColor: theme.colors.scannerCyan },
  flipStage: { height: '25%', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flipHalo: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderWidth: 5, justifyContent: 'center' },
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    page: {
      ...styles["page"],
      gap: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
    },
    backButton: {
      ...styles["backButton"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(42) : 42,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    backText: {
      ...styles["backText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    progress: {
      ...styles["progress"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    progressSegment: {
      ...styles["progressSegment"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    flipStage: {
      ...styles["flipStage"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    onlineRow: {
      ...styles["onlineRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    onlineDot: {
      ...styles["onlineDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    onlineText: {
      ...styles["onlineText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    messageCard: {
      ...styles["messageCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
      gap: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    highlights: {
      ...styles["highlights"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    highlight: {
      ...styles["highlight"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    continueButton: {
      ...styles["continueButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(56) : 56,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    footerNote: {
      ...styles["footerNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
  });
}
