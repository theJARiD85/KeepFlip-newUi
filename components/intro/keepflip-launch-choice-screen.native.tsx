import { LANDING_BENEFITS, LANDING_STEPS } from '@/components/landing/landing-copy';
import { MatchedWidthHeadline } from '@/components/landing/matched-width-headline.native';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type IconName = ComponentProps<typeof Ionicons>['name'];
type KeepFlipLaunchChoiceScreenProps = {
  onExistingLogin: () => void;
  onNewUser: () => void;
};

const LOGO = require('@/assets/images/icon3.png');
const GARAGE_ART_WIDE = require('@/assets/images/landing-garage-wide-flip.png');
const GARAGE_ART_MOBILE = require('@/assets/images/landing-garage-mobile-flip.png');
const SCAN_SCREEN = require('@/assets/google-play/keepflip-play-scanner.png');
const colors = theme.colors;

function selectionHaptic() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

export function KeepFlipLaunchChoiceScreen({
  onExistingLogin,
  onNewUser,
}: KeepFlipLaunchChoiceScreenProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tablet = width >= 700;

  const start = () => {
    selectionHaptic();
    onNewUser();
  };
  const signIn = () => {
    selectionHaptic();
    onExistingLogin();
  };

  return (
    <View style={responsiveStyles.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          responsiveStyles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 35 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[responsiveStyles.content, tablet && responsiveStyles.contentTablet]}>
          <View style={responsiveStyles.header}>
            <View style={responsiveStyles.brand}>
              <Image accessibilityLabel="KeepFlip logo" contentFit="contain" source={LOGO} style={responsiveStyles.logo} />
              <View>
                <Text style={responsiveStyles.brandName}>KEEPFLIP</Text>
                <Text style={responsiveStyles.brandTagline}>RESELLER ASSISTANT</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Log in to KeepFlip"
              accessibilityRole="button"
              hitSlop={10}
              onPress={signIn}
              style={({ pressed }) => [responsiveStyles.loginButton, pressed && responsiveStyles.pressed]}
              testID="keepflip-landing-login"
            >
              <Text style={responsiveStyles.loginText}>LOG IN</Text>
            </Pressable>
          </View>

          <View style={responsiveStyles.hero}>
            <Text style={responsiveStyles.eyebrow}>FREE UP CASH TIED IN INVENTORY.</Text>
            <MatchedWidthHeadline
              bottomStyle={[responsiveStyles.headlineBottom, tablet && responsiveStyles.headlineBottomTablet]}
              bottomText="IN THE BINS."
              topStyle={[responsiveStyles.headlineTop, tablet && responsiveStyles.headlineTopTablet]}
              topText="RANSOM"
            />
            <Text style={responsiveStyles.heroBody}>
              Unsold items tie up cash. KeepFlip helps you see what you have, what it may return,
              and what to work on next.
            </Text>
            <View style={responsiveStyles.checks}>
              <CheckLine label="See what is tied up." />
              <CheckLine label="Know your estimated net." />
              <CheckLine label="Get the next item moving." />
            </View>
            <Pressable
              accessibilityLabel="Get started free with KeepFlip"
              accessibilityRole="button"
              onPress={start}
              style={({ pressed }) => [responsiveStyles.primaryButton, pressed && responsiveStyles.pressed]}
              testID="keepflip-landing-signup"
            >
              <Text style={responsiveStyles.primaryButtonText}>GET STARTED FREE</Text>
              <Ionicons color={colors.campaignInk} name="arrow-forward" size={19} />
            </Pressable>
            <Text style={responsiveStyles.freeNote}>Create a free account. No credit card required.</Text>
          </View>

          <View pointerEvents="none" style={[responsiveStyles.artFrame, tablet && responsiveStyles.artFrameTablet]}>
            <Image
              accessibilityLabel="Gold Flip signals stop as a toy robot holds a bundle of cash and a toy sword"
              contentFit="cover"
              contentPosition={tablet ? 'right center' : 'center'}
              source={tablet ? GARAGE_ART_WIDE : GARAGE_ART_MOBILE}
              style={responsiveStyles.robotArt}
            />
          </View>

          <View style={responsiveStyles.capabilityBand}>
            <Text style={responsiveStyles.capabilityTitle}>FROM FIND TO SALE</Text>
            <Text style={responsiveStyles.capabilityText}>ANDROID SCAN  •  COSTS & NET  •  INVENTORY  •  BOOKS</Text>
          </View>

          <View style={responsiveStyles.section}>
            <Text style={responsiveStyles.sectionEyebrow}>YOUR DAY, BACK IN ORDER.</Text>
            <Text accessibilityRole="header" style={responsiveStyles.sectionTitle}>One clear path through every flip.</Text>
            <View style={[responsiveStyles.steps, tablet && responsiveStyles.stepsTablet]}>
              {LANDING_STEPS.map((step) => (
                <View key={step.number} style={[responsiveStyles.step, tablet && responsiveStyles.stepTablet]}>
                  <View style={responsiveStyles.stepIcon}>
                    <Ionicons color={colors.campaignGold} name={step.icon as IconName} size={25} />
                  </View>
                  <View style={responsiveStyles.stepCopy}>
                    <Text style={responsiveStyles.stepNumber}>{step.number}</Text>
                    <Text style={responsiveStyles.stepTitle}>{step.title}</Text>
                    <Text style={responsiveStyles.stepDetail}>{step.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={responsiveStyles.section}>
            <Text style={responsiveStyles.sectionEyebrow}>STOP ADMIN FROM STEALING YOUR PROFIT.</Text>
            <Text accessibilityRole="header" style={responsiveStyles.sectionTitle}>Keep the numbers with the item.</Text>
            <View style={responsiveStyles.benefits}>
              {LANDING_BENEFITS.map((benefit) => (
                <View key={benefit.title} style={responsiveStyles.benefit}>
                  <View style={responsiveStyles.benefitIcon}>
                    <Ionicons color={colors.campaignGold} name={benefit.icon as IconName} size={22} />
                  </View>
                  <View style={responsiveStyles.benefitCopy}>
                    <Text style={responsiveStyles.benefitTitle}>{benefit.title}</Text>
                    <Text style={responsiveStyles.benefitDetail}>{benefit.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={responsiveStyles.preview}>
              <Text style={responsiveStyles.previewEyebrow}>A FLIP, WITHOUT THE TAB CHAOS</Text>
              <Text style={responsiveStyles.previewTitle}>From find to finished.</Text>
              <View style={responsiveStyles.previewScreen}>
                <Image
                  accessibilityLabel="KeepFlip Android app scan screen"
                  contentFit="cover"
                  source={SCAN_SCREEN}
                  style={responsiveStyles.previewImage}
                />
                <View style={responsiveStyles.previewOverlay}>
                  <Text style={responsiveStyles.previewSignal}>KEEPFLIP SIGNAL</Text>
                  <Text style={responsiveStyles.previewOverlayTitle}>Research this find</Text>
                  <Text style={responsiveStyles.previewOverlayBody}>Evidence, value, costs, and next move together.</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={responsiveStyles.finalCard}>
            <Text style={responsiveStyles.sectionEyebrow}>TAKE YOUR CASH BACK.</Text>
            <Text accessibilityRole="header" style={responsiveStyles.finalTitle}>Know what every flip costs.</Text>
            <Text style={responsiveStyles.finalBody}>Start with the item in front of you. Keep the next move clear.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={start}
              style={({ pressed }) => [responsiveStyles.primaryButton, pressed && responsiveStyles.pressed]}
            >
              <Text style={responsiveStyles.primaryButtonText}>GET STARTED FREE</Text>
              <Ionicons color={colors.campaignInk} name="arrow-forward" size={19} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function CheckLine({ label }: { label: string }) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles2.checkLine}>
      <Ionicons color={colors.campaignGold} name="checkmark-circle-outline" size={19} />
      <Text style={responsiveStyles2.checkText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.campaignInk, flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { alignSelf: 'center', maxWidth: 540, paddingHorizontal: 20, width: '100%' },
  contentTablet: { maxWidth: 740, paddingHorizontal: 30 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 23 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  logo: { height: 50, width: 50 },
  brandName: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 22, letterSpacing: 1.5 },
  brandTagline: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.15 },
  loginButton: { borderColor: colors.campaignGold, borderRadius: 5, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  loginText: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 11 },
  hero: { gap: 13 },
  eyebrow: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.7 },
  headlineTop: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 60, letterSpacing: -4.3, lineHeight: 64 },
  headlineTopTablet: { fontSize: 86, lineHeight: 89 },
  headlineBottom: { color: colors.campaignGold, fontFamily: 'SpaceGroteskBold', fontSize: 40, letterSpacing: -2.9, lineHeight: 44 },
  headlineBottomTablet: { fontSize: 63, lineHeight: 67 },
  heroBody: { color: colors.text, fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 22 },
  checks: { gap: 5, paddingVertical: 3 },
  checkLine: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  checkText: { color: colors.text, fontFamily: theme.fonts.body, fontSize: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.campaignGold, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 18 },
  primaryButtonText: { color: colors.campaignInk, fontFamily: theme.fonts.bold, fontSize: 14, letterSpacing: 0.2 },
  freeNote: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 11 },
  artFrame: { height: 390, marginTop: 13, overflow: 'hidden', width: '100%' },
  artFrameTablet: { height: 440 },
  robotArt: { height: '100%', width: '100%' },
  capabilityBand: { borderBottomColor: '#2C3231', borderBottomWidth: 1, borderTopColor: '#2C3231', borderTopWidth: 1, gap: 7, paddingVertical: 16 },
  capabilityTitle: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.6 },
  capabilityText: { color: colors.campaignMuted, fontFamily: theme.fonts.medium, fontSize: 11, lineHeight: 17 },
  section: { gap: 13, paddingTop: 37 },
  sectionEyebrow: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.6 },
  sectionTitle: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 30, letterSpacing: -0.8, lineHeight: 35 },
  steps: { gap: 9, paddingTop: 5 },
  stepsTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  step: { alignItems: 'flex-start', borderColor: '#303637', borderWidth: 1, flexDirection: 'row', gap: 12, padding: 13 },
  stepTablet: { flexBasis: '48%', flexGrow: 1 },
  stepIcon: { alignItems: 'center', borderColor: '#697171', borderRadius: 40, borderWidth: 1, height: 49, justifyContent: 'center', width: 49 },
  stepCopy: { flex: 1, gap: 3 },
  stepNumber: { color: colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 16 },
  stepTitle: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 15 },
  stepDetail: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 17 },
  benefits: { gap: 17, paddingVertical: 8 },
  benefit: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  benefitIcon: { alignItems: 'center', borderColor: colors.campaignGold, borderRadius: 30, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  benefitCopy: { flex: 1, gap: 4 },
  benefitTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 16 },
  benefitDetail: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: '#0B1114', borderColor: '#5E6665', borderRadius: 30, borderWidth: 2, gap: 8, marginTop: 8, overflow: 'hidden', padding: 14 },
  previewEyebrow: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 0.5 },
  previewTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 19 },
  previewScreen: { borderColor: '#986F28', borderRadius: 15, borderWidth: 1, height: 240, overflow: 'hidden' },
  previewImage: { height: '100%', width: '100%' },
  previewOverlay: { backgroundColor: '#080B0DEB', borderColor: '#38565B', borderRadius: 11, borderWidth: 1, bottom: 7, gap: 2, left: 7, padding: 9, position: 'absolute', right: 7 },
  previewSignal: { color: colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 9 },
  previewOverlayTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 16 },
  previewOverlayBody: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 10 },
  finalCard: { borderColor: colors.campaignGold, borderRadius: 12, borderWidth: 1, gap: 12, marginTop: 39, padding: 20 },
  finalTitle: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 27, lineHeight: 32 },
  finalBody: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.78 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    content: {
      ...styles["content"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(540) : layout.responsiveWidth(540),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
    },
    contentTablet: {
      ...styles["contentTablet"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(740) : layout.responsiveWidth(740),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(30) : layout.responsiveWidth(30),
    },
    header: {
      ...styles["header"],
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(23) : layout.responsiveHeight(23),
    },
    brand: {
      ...styles["brand"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    logo: {
      ...styles["logo"],
      height: layout.isWeb ? layout.webResponsiveHeight(50) : layout.responsiveHeight(50),
      width: layout.isWeb ? layout.webResponsiveWidth(50) : layout.responsiveWidth(50),
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    brandTagline: {
      ...styles["brandTagline"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    loginButton: {
      ...styles["loginButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(9) : layout.responsiveHeight(9),
    },
    loginText: {
      ...styles["loginText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    hero: {
      ...styles["hero"],
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : layout.responsiveWidth(13),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    headlineTop: {
      ...styles["headlineTop"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(60) : layout.responsiveFont(60),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(64) : layout.responsiveFont(64),
    },
    headlineTopTablet: {
      ...styles["headlineTopTablet"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(86) : layout.responsiveFont(86),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(89) : layout.responsiveFont(89),
    },
    headlineBottom: {
      ...styles["headlineBottom"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(40) : layout.responsiveFont(40),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(44) : layout.responsiveFont(44),
    },
    headlineBottomTablet: {
      ...styles["headlineBottomTablet"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(63) : layout.responsiveFont(63),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(67) : layout.responsiveFont(67),
    },
    heroBody: {
      ...styles["heroBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    checks: {
      ...styles["checks"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    checkLine: {
      ...styles["checkLine"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
    },
    checkText: {
      ...styles["checkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    primaryButton: {
      ...styles["primaryButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      minHeight: layout.isWeb ? layout.webResponsiveHeight(52) : layout.responsiveHeight(52),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(18) : layout.responsiveWidth(18),
    },
    primaryButtonText: {
      ...styles["primaryButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    freeNote: {
      ...styles["freeNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    artFrame: {
      ...styles["artFrame"],
      height: layout.isWeb ? layout.webResponsiveHeight(390) : layout.responsiveHeight(390),
      marginTop: layout.isWeb ? layout.webResponsiveHeight(13) : layout.responsiveHeight(13),
    },
    artFrameTablet: {
      ...styles["artFrameTablet"],
      height: layout.isWeb ? layout.webResponsiveHeight(440) : layout.responsiveHeight(440),
    },
    capabilityBand: {
      ...styles["capabilityBand"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(16) : layout.responsiveHeight(16),
    },
    capabilityTitle: {
      ...styles["capabilityTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    capabilityText: {
      ...styles["capabilityText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    section: {
      ...styles["section"],
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : layout.responsiveWidth(13),
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(37) : layout.responsiveHeight(37),
    },
    sectionEyebrow: {
      ...styles["sectionEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(35) : layout.responsiveFont(35),
    },
    steps: {
      ...styles["steps"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(5) : layout.responsiveHeight(5),
    },
    step: {
      ...styles["step"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    stepIcon: {
      ...styles["stepIcon"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(40) : layout.responsiveWidth(40),
      height: layout.isWeb ? layout.webResponsiveHeight(49) : layout.responsiveHeight(49),
      width: layout.isWeb ? layout.webResponsiveWidth(49) : layout.responsiveWidth(49),
    },
    stepCopy: {
      ...styles["stepCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    stepNumber: {
      ...styles["stepNumber"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    stepTitle: {
      ...styles["stepTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
    },
    stepDetail: {
      ...styles["stepDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    benefits: {
      ...styles["benefits"],
      gap: layout.isWeb ? layout.webResponsiveWidth(17) : layout.responsiveWidth(17),
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
    benefit: {
      ...styles["benefit"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    benefitIcon: {
      ...styles["benefitIcon"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(30) : layout.responsiveWidth(30),
      height: layout.isWeb ? layout.webResponsiveHeight(40) : layout.responsiveHeight(40),
      width: layout.isWeb ? layout.webResponsiveWidth(40) : layout.responsiveWidth(40),
    },
    benefitCopy: {
      ...styles["benefitCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    benefitTitle: {
      ...styles["benefitTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    benefitDetail: {
      ...styles["benefitDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    preview: {
      ...styles["preview"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(30) : layout.responsiveWidth(30),
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      marginTop: layout.isWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
    previewEyebrow: {
      ...styles["previewEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    previewTitle: {
      ...styles["previewTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    previewScreen: {
      ...styles["previewScreen"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(15) : layout.responsiveWidth(15),
      height: layout.isWeb ? layout.webResponsiveHeight(240) : layout.responsiveHeight(240),
    },
    previewOverlay: {
      ...styles["previewOverlay"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(11) : layout.responsiveWidth(11),
    },
    previewSignal: {
      ...styles["previewSignal"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    previewOverlayTitle: {
      ...styles["previewOverlayTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    previewOverlayBody: {
      ...styles["previewOverlayBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    finalCard: {
      ...styles["finalCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWeb ? layout.webResponsiveHeight(39) : layout.responsiveHeight(39),
    },
    finalTitle: {
      ...styles["finalTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(27) : layout.responsiveFont(27),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(32) : layout.responsiveFont(32),
    },
    finalBody: {
      ...styles["finalBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
  });
}
