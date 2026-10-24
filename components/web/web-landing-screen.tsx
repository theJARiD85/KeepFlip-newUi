import { LANDING_BENEFITS, LANDING_STEPS } from '@/components/landing/landing-copy';
import { LandingHostageStory } from '@/components/landing/landing-hostage-story';
import { MatchedWidthHeadline } from '@/components/landing/matched-width-headline.web';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { SemanticHeading, WebActionLink, WebPageHead } from '@/components/web/web-public-page';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import {
  KEEPFLIP_HOME_DESCRIPTION,
  KEEPFLIP_HOME_FAQS,
  KEEPFLIP_HOME_TITLE,
} from '@/constants/keepflip-public-site';
import KeepFlipShader from '@/components/ui/keepflip-shader.web';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type IconName = ComponentProps<typeof Ionicons>['name'];

const GARAGE_ART_WIDE = require('@/assets/images/landing-garage-wide-flip.png');
const GARAGE_ART_MOBILE = require('@/assets/images/landing-garage-mobile-flip.png');
const SCAN_SCREEN = require('@/assets/google-play/keepflip-play-scanner.png');
const colors = theme.colors;

export function WebLandingScreen() {
  const responsiveStyles4 = useResponsiveStyles(createStylesWebResponsive2);
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const phone = width < 540;
  const heroTitleStyle = [responsiveStyles.heroTitle, compact && responsiveStyles.heroTitleCompact, phone && responsiveStyles.heroTitlePhone];
  const heroTitleTypography = StyleSheet.flatten(heroTitleStyle);

  return (
    <>
    <KeepFlipShader />
      <WebPageHead
        canonicalPath="/"
        description={KEEPFLIP_HOME_DESCRIPTION}
        title={KEEPFLIP_HOME_TITLE}
      />
      <View style={responsiveStyles.root}>
        <ScrollView
          contentContainerStyle={responsiveStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[responsiveStyles.shell, phone && responsiveStyles.shellPhone]}>
            <WebSiteHeader colorScheme="dark" landing showMarketingLinks />

            <View style={[responsiveStyles.hero, compact && responsiveStyles.heroCompact]}>
              {!compact && (
                <>
                  <View pointerEvents="none" style={responsiveStyles.heroArt}>
                    <Image
                      accessibilityLabel="Gold Flip signals stop as a toy robot holds a bundle of cash and a toy sword"
                      alt="Flip faces a vintage toy robot holding cash hostage with a toy sword."
                      contentFit="cover"
                      contentPosition="right center"
                      source={GARAGE_ART_WIDE}
                      style={responsiveStyles.heroArtImage}
                    />
                  </View>
                </>
              )}
              <View style={[responsiveStyles.heroCopy, compact && responsiveStyles.heroCopyCompact]}>
                <Text style={[responsiveStyles.eyebrow, phone && responsiveStyles.eyebrowPhone]}>
                  FREE UP CASH TIED IN INVENTORY.
                </Text>
                <MatchedWidthHeadline
                  bottomStyle={{ color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: phone ? 39 : compact ? 65 : 72, letterSpacing: phone ? -1 : 1 }}
                  bottomText="IN THE BINS"
                  headingStyle={heroTitleStyle}
                  topStyle={{ color: colors.text, fontFamily: theme.fonts.bold, fontSize: heroTitleTypography.fontSize, letterSpacing: phone ? responsiveStyles4.heroTitlePhone.letterSpacing : responsiveStyles4.heroTitle.letterSpacing }}
                  topText="RANSOM"
                />
                <Text style={[responsiveStyles.heroBody, phone && responsiveStyles.heroBodyPhone]}>
                  Unsold items tie up cash. KeepFlip helps you see what you have, what it may return,
                  and what to work on next.
                </Text>
                <View style={responsiveStyles.heroChecks}>
                  <CheckLine label="See what is tied up." />
                  <CheckLine label="Know your estimated net." />
                  <CheckLine label="Get the next item moving." />
                </View>
                <View style={[responsiveStyles.heroActions, phone && responsiveStyles.heroActionsPhone]}>
                  <WebActionLink href="/meet-flip" label="Get started free" />
                  <WebActionLink href="/pricing" label="See plan prices" secondary />
                </View>
                <Text style={responsiveStyles.heroNote}>Create a free account. No credit card required.</Text>
              </View>
              {compact && (
                <View pointerEvents="none" style={[responsiveStyles.heroArtCompact, phone && responsiveStyles.heroArtPhone]}>
                  <Image
                    accessibilityLabel="Gold Flip signals stop as a toy robot holds a bundle of cash and a toy sword"
                    alt="Flip faces a vintage toy robot holding cash hostage with a toy sword."
                    contentFit="cover"
                    source={GARAGE_ART_MOBILE}
                    style={responsiveStyles.heroArtImage}
                  />
                </View>
              )}
            </View>

            <View style={[responsiveStyles.capabilityBand, phone && responsiveStyles.capabilityBandPhone]}>
              <Text style={responsiveStyles.bandLead}>FROM FIND TO SALE</Text>
              {['Scan & Valuate', 'Costs & Net', 'Inventory', 'Books'].map((label) => (
                <View key={label} style={responsiveStyles.bandItem}>
                  <View style={responsiveStyles.bandDot} />
                  <Text style={responsiveStyles.bandText}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={responsiveStyles.section}>
              <Text style={responsiveStyles.sectionEyebrow}>YOUR DAY, BACK IN ORDER.</Text>
              <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, phone && responsiveStyles.sectionTitlePhone]}>
                One clear path through every flip.
              </SemanticHeading>
              <View style={[responsiveStyles.steps, compact && responsiveStyles.stepsCompact]}>
                {LANDING_STEPS.map((step) => (
                  <View key={step.number} style={[responsiveStyles.step, compact && responsiveStyles.stepCompact]}>
                    <View style={responsiveStyles.stepIcon}>
                      <Ionicons color={colors.campaignGold} name={step.icon as IconName} size={27} />
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

            <LandingHostageStory />

            <View style={[responsiveStyles.showcase, compact && responsiveStyles.showcaseCompact]}>
              <View style={responsiveStyles.showcaseCopy}>
                <Text style={responsiveStyles.sectionEyebrow}>STOP ADMIN FROM STEALING YOUR PROFIT.</Text>
                <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, phone && responsiveStyles.sectionTitlePhone]}>
                  Spend less time hunting for the numbers.
                </SemanticHeading>
                <Text style={responsiveStyles.showcaseIntro}>
                  A find can sit in a bin, an unlisted pile, or five open tabs. Keep its costs and next
                  steps in one place.
                </Text>
                <View style={responsiveStyles.benefits}>
                  {LANDING_BENEFITS.map((benefit) => (
                    <View key={benefit.title} style={responsiveStyles.benefit}>
                      <View style={responsiveStyles.benefitIcon}>
                        <Ionicons color={colors.campaignGold} name={benefit.icon as IconName} size={24} />
                      </View>
                      <View style={responsiveStyles.benefitCopy}>
                        <Text style={responsiveStyles.benefitTitle}>{benefit.title}</Text>
                        <Text style={responsiveStyles.benefitDetail}>{benefit.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
              <View style={[responsiveStyles.phoneFrame, phone && responsiveStyles.phoneFramePhone]}>
                <View style={responsiveStyles.phoneTop}>
                  <Text style={responsiveStyles.phoneEyebrow}>A FLIP, WITHOUT THE TAB CHAOS</Text>
                  <Text style={responsiveStyles.phoneTitle}>From find to finished.</Text>
                </View>
                <View style={responsiveStyles.phoneScreen}>
                  <Image
                    accessibilityLabel="KeepFlip Android scanner screen"
                    alt="KeepFlip Android app scan screen."
                    contentFit="cover"
                    source={SCAN_SCREEN}
                    style={responsiveStyles.phoneScreenshot}
                  />
                  <View style={responsiveStyles.phoneOverlay}>
                    <Text style={responsiveStyles.phoneSignal}>KEEPFLIP SIGNAL</Text>
                    <Text style={responsiveStyles.phoneOverlayTitle}>Research this find</Text>
                    <Text style={responsiveStyles.phoneOverlayBody}>Evidence, value, costs, and next move together.</Text>
                  </View>
                </View>
                <View style={responsiveStyles.phoneMetrics}>
                  <ExampleMetric label="EST. RESALE" value="$128" />
                  <ExampleMetric label="NET AFTER COSTS" value="$74" accent />
                  <ExampleMetric label="BUY SIGNAL" value="STRONG" accent />
                </View>
                <Text style={responsiveStyles.exampleNote}>Illustrative example. Actual estimates depend on the item, market evidence, and your costs.</Text>
              </View>
            </View>

            <View style={responsiveStyles.faqSection}>
              <Text style={responsiveStyles.sectionEyebrow}>STRAIGHT ANSWERS.</Text>
              <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, phone && responsiveStyles.sectionTitlePhone]}>
                Before your next buy.
              </SemanticHeading>
              <View style={[responsiveStyles.faqGrid, compact && responsiveStyles.faqGridCompact]}>
                {KEEPFLIP_HOME_FAQS.map((faq) => (
                  <View key={faq.question} style={[responsiveStyles.faqCard, compact && responsiveStyles.faqCardCompact]}>
                    <SemanticHeading level={3} style={responsiveStyles.faqQuestion}>{faq.question}</SemanticHeading>
                    <Text style={responsiveStyles.faqAnswer}>{faq.answer}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[responsiveStyles.finalCta, compact && responsiveStyles.finalCtaCompact]}>
              <View style={responsiveStyles.finalCtaCopy}>
                <Text style={responsiveStyles.sectionEyebrow}>TAKE YOUR CASH BACK.</Text>
                <SemanticHeading level={2} style={[responsiveStyles.finalCtaTitle, phone && responsiveStyles.finalCtaTitlePhone]}>
                  Know what every flip costs.
                </SemanticHeading>
                <Text style={responsiveStyles.finalCtaBody}>Start with the item in front of you. Keep the next move clear.</Text>
              </View>
              <WebActionLink href="/meet-flip" label="Get started free" />
            </View>
          </View>
          <WebSiteFooter colorScheme="dark" inFlow showMarketingLinks />
        </ScrollView>
      </View>
    </>
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

function ExampleMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles3.metric}>
      <Text style={responsiveStyles3.metricLabel}>{label}</Text>
      <Text style={[responsiveStyles3.metricValue, accent && responsiveStyles3.metricValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 18 },
  shell: { alignSelf: 'center', maxWidth: 1320, paddingHorizontal: 30, width: '100%' },
  shellPhone: { paddingHorizontal: 16 },
  hero: { borderBottomColor: '#292C2C', borderBottomWidth: 1, minHeight: 600, overflow: 'hidden', position: 'relative' },
  heroCompact: { minHeight: 0 },
  heroCopy: { gap: 15, paddingBottom: 68, paddingLeft: 12, paddingTop: 52, position: 'relative', width: '43%', zIndex: 1 },
  heroCopyCompact: { paddingBottom: 12, paddingLeft: 0, paddingTop: 34, width: '100%' },
  eyebrow: { color: colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 16, letterSpacing: 1.3 },
  eyebrowPhone: { fontSize: 12, letterSpacing: 0.7 },
  heroTitle: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 102, letterSpacing: -6, lineHeight: 100 },
  heroTitleCompact: { fontSize: 85, lineHeight: 85 },
  heroTitlePhone: { fontSize: 57, letterSpacing: -4, lineHeight: 58 },
  heroBody: { color: colors.text, fontFamily: theme.fonts.body, fontSize: 18, lineHeight: 26, maxWidth: 400 },
  heroBodyPhone: { fontSize: 15, lineHeight: 22 },
  heroChecks: { gap: 6, paddingTop: 3 },
  checkLine: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  checkText: { color: colors.text, fontFamily: theme.fonts.body, fontSize: 15 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  heroActionsPhone: { flexDirection: 'column' },
  heroNote: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 12 },
  heroArt: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  heroArtCompact: { alignSelf: 'center', height: 430, width: '100%' },
  heroArtPhone: { height: 355 },
  heroArtImage: { height: '100%', width: '100%' },
  capabilityBand: { alignItems: 'center', borderBottomColor: '#25292A', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 20 },
  capabilityBandPhone: { alignItems: 'flex-start', gap: 12 },
  bandLead: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.8 },
  bandItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  bandDot: { backgroundColor: colors.scannerCyan, borderRadius: 5, height: 8, width: 8 },
  bandText: { color: colors.text, fontFamily: theme.fonts.medium, fontSize: 13 },
  section: { gap: 16, paddingVertical: 42 },
  sectionEyebrow: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 13, letterSpacing: 0.8 },
  sectionTitle: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 38, letterSpacing: -1.1, lineHeight: 44, maxWidth: 670 },
  sectionTitlePhone: { fontSize: 30, lineHeight: 35 },
  steps: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  stepsCompact: { flexWrap: 'wrap' },
  step: { alignItems: 'flex-start', borderColor: '#262B2B', borderWidth: 1, flex: 1, flexDirection: 'row', gap: 12, minWidth: 0, padding: 14 },
  stepCompact: { flexBasis: 280 },
  stepIcon: { alignItems: 'center', borderColor: '#707779', borderRadius: 50, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  stepCopy: { flex: 1, gap: 3 },
  stepNumber: { color: colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 17 },
  stepTitle: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 16 },
  stepDetail: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 17 },
  showcase: { alignItems: 'center', borderBottomColor: '#25292A', borderBottomWidth: 1, borderTopColor: '#25292A', borderTopWidth: 1, flexDirection: 'row', gap: 32, justifyContent: 'space-between', paddingVertical: 45 },
  showcaseCompact: { alignItems: 'stretch', flexDirection: 'column' },
  showcaseCopy: { flex: 1, gap: 14, maxWidth: 620 },
  showcaseIntro: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 23, maxWidth: 570 },
  benefits: { gap: 21, paddingTop: 16 },
  benefit: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 },
  benefitIcon: { alignItems: 'center', borderColor: colors.campaignGold, borderRadius: 28, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  benefitCopy: { flex: 1, gap: 4 },
  benefitTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 17 },
  benefitDetail: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 20 },
  phoneFrame: { alignSelf: 'center', backgroundColor: '#0B1114', borderColor: '#646C6B', borderRadius: 40, borderWidth: 3, flex: 0.8, gap: 12, maxWidth: 440, minWidth: 320, overflow: 'hidden', padding: 18, width: '100%' },
  phoneFramePhone: { minWidth: 0 },
  phoneTop: { gap: 4 },
  phoneEyebrow: { color: colors.campaignGold, fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 0.6 },
  phoneTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 21 },
  phoneScreen: { backgroundColor: '#071113', borderColor: '#A9822C', borderRadius: 20, borderWidth: 1, height: 300, overflow: 'hidden' },
  phoneScreenshot: { height: '100%', width: '100%' },
  phoneOverlay: { backgroundColor: '#080B0DEB', borderColor: '#38565B', borderRadius: 14, borderWidth: 1, bottom: 8, gap: 3, left: 8, padding: 10, position: 'absolute', right: 8 },
  phoneSignal: { color: colors.scannerCyan, fontFamily: theme.fonts.bold, fontSize: 10 },
  phoneOverlayTitle: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 17 },
  phoneOverlayBody: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 11 },
  phoneMetrics: { flexDirection: 'row', gap: 7 },
  metric: { backgroundColor: '#080B0D', borderRadius: 9, flex: 1, gap: 5, minWidth: 0, padding: 9 },
  metricLabel: { color: colors.campaignMuted, fontFamily: theme.fonts.bold, fontSize: 8 },
  metricValue: { color: colors.text, fontFamily: theme.fonts.bold, fontSize: 17 },
  metricValueAccent: { color: colors.scannerViolet },
  exampleNote: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  faqSection: { gap: 14, paddingVertical: 44 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  faqGridCompact: { flexDirection: 'column' },
  faqCard: { backgroundColor: '#101314', borderColor: '#2B3131', borderWidth: 1, flexBasis: '32%', flexGrow: 1, gap: 8, minWidth: 280, padding: 17 },
  faqCardCompact: { minWidth: 0 },
  faqQuestion: { color: colors.text, fontFamily: theme.fonts.semibold, fontSize: 16, lineHeight: 21 },
  faqAnswer: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  finalCta: { alignItems: 'center', borderColor: colors.campaignGold, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 26, justifyContent: 'space-between', marginBottom: 45, padding: 27 },
  finalCtaCompact: { alignItems: 'stretch', flexDirection: 'column' },
  finalCtaCopy: { flex: 1, gap: 7 },
  finalCtaTitle: { color: colors.text, fontFamily: 'SpaceGroteskBold', fontSize: 30, lineHeight: 36 },
  finalCtaTitlePhone: { fontSize: 26, lineHeight: 32 },
  finalCtaBody: { color: colors.campaignMuted, fontFamily: theme.fonts.body, fontSize: 14 },
});

function createStylesWebResponsive2(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scrollContent: {
      ...styles["scrollContent"],
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
    },
    shell: {
      ...styles["shell"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(1320) : layout.responsiveWidth(1320),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(30) : layout.responsiveWidth(30),
    },
    shellPhone: {
      ...styles["shellPhone"],
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
    },
    hero: {
      ...styles["hero"],
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(600) : layout.responsiveHeight(600),
    },
    heroCopy: {
      ...styles["heroCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(15) : layout.responsiveWidth(15),
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(68) : layout.responsiveHeight(68),
      paddingLeft: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(52) : layout.responsiveHeight(52),
    },
    heroCopyCompact: {
      ...styles["heroCopyCompact"],
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(34) : layout.responsiveHeight(34),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    eyebrowPhone: {
      ...styles["eyebrowPhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    heroTitle: {
      ...styles["heroTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(102) : layout.responsiveFont(102),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(100) : layout.responsiveFont(100),
    },
    heroTitleCompact: {
      ...styles["heroTitleCompact"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(85) : layout.responsiveFont(85),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(85) : layout.responsiveFont(85),
    },
    heroTitlePhone: {
      ...styles["heroTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(57) : layout.responsiveFont(57),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(58) : layout.responsiveFont(58),
    },
    heroBody: {
      ...styles["heroBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(26) : layout.responsiveFont(26),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(540) : layout.responsiveWidth(540),
    },
    heroBodyPhone: {
      ...styles["heroBodyPhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    heroChecks: {
      ...styles["heroChecks"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    checkLine: {
      ...styles["checkLine"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    checkText: {
      ...styles["checkText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
    },
    heroActions: {
      ...styles["heroActions"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
    },
    heroNote: {
      ...styles["heroNote"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    heroArtCompact: {
      ...styles["heroArtCompact"],
      height: layout.isWideWeb ? layout.webResponsiveHeight(430) : layout.responsiveHeight(430),
    },
    heroArtPhone: {
      ...styles["heroArtPhone"],
      height: layout.isWideWeb ? layout.webResponsiveHeight(355) : layout.responsiveHeight(355),
    },
    capabilityBand: {
      ...styles["capabilityBand"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(22) : layout.responsiveWidth(22),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(20) : layout.responsiveHeight(20),
    },
    capabilityBandPhone: {
      ...styles["capabilityBandPhone"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    bandLead: {
      ...styles["bandLead"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    bandItem: {
      ...styles["bandItem"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    bandDot: {
      ...styles["bandDot"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
      height: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
      width: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    bandText: {
      ...styles["bandText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    section: {
      ...styles["section"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
    },
    sectionEyebrow: {
      ...styles["sectionEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(38) : layout.responsiveFont(38),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(44) : layout.responsiveFont(44),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(670) : layout.responsiveWidth(670),
    },
    sectionTitlePhone: {
      ...styles["sectionTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(35) : layout.responsiveFont(35),
    },
    steps: {
      ...styles["steps"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
    step: {
      ...styles["step"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    stepIcon: {
      ...styles["stepIcon"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(50) : layout.responsiveWidth(50),
      height: layout.isWideWeb ? layout.webResponsiveHeight(54) : layout.responsiveHeight(54),
      width: layout.isWideWeb ? layout.webResponsiveWidth(54) : layout.responsiveWidth(54),
    },
    stepCopy: {
      ...styles["stepCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    stepNumber: {
      ...styles["stepNumber"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    stepTitle: {
      ...styles["stepTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    stepDetail: {
      ...styles["stepDetail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    showcase: {
      ...styles["showcase"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(32) : layout.responsiveWidth(32),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(45) : layout.responsiveHeight(45),
    },
    showcaseCopy: {
      ...styles["showcaseCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(620) : layout.responsiveWidth(620),
    },
    showcaseIntro: {
      ...styles["showcaseIntro"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(23) : layout.responsiveFont(23),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(570) : layout.responsiveWidth(570),
    },
    benefits: {
      ...styles["benefits"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(21) : layout.responsiveWidth(21),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(16) : layout.responsiveHeight(16),
    },
    benefit: {
      ...styles["benefit"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
    },
    benefitIcon: {
      ...styles["benefitIcon"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(28) : layout.responsiveWidth(28),
      height: layout.isWideWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
      width: layout.isWideWeb ? layout.webResponsiveWidth(42) : layout.responsiveWidth(42),
    },
    benefitCopy: {
      ...styles["benefitCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    benefitTitle: {
      ...styles["benefitTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    benefitDetail: {
      ...styles["benefitDetail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(20) : layout.responsiveFont(20),
    },
    phoneFrame: {
      ...styles["phoneFrame"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(40) : layout.responsiveWidth(40),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(440) : layout.responsiveWidth(440),
      minWidth: layout.isWideWeb ? layout.webResponsiveWidth(320) : layout.responsiveWidth(320),
    },
    phoneTop: {
      ...styles["phoneTop"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    phoneEyebrow: {
      ...styles["phoneEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    phoneTitle: {
      ...styles["phoneTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(21) : layout.responsiveFont(21),
    },
    phoneScreen: {
      ...styles["phoneScreen"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
      height: layout.isWideWeb ? layout.webResponsiveHeight(300) : layout.responsiveHeight(300),
    },
    phoneOverlay: {
      ...styles["phoneOverlay"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    phoneSignal: {
      ...styles["phoneSignal"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    phoneOverlayTitle: {
      ...styles["phoneOverlayTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    phoneOverlayBody: {
      ...styles["phoneOverlayBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    phoneMetrics: {
      ...styles["phoneMetrics"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    metric: {
      ...styles["metric"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
    },
    metricLabel: {
      ...styles["metricLabel"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(8) : layout.responsiveFont(8),
    },
    metricValue: {
      ...styles["metricValue"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    exampleNote: {
      ...styles["exampleNote"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    faqSection: {
      ...styles["faqSection"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(44) : layout.responsiveHeight(44),
    },
    faqGrid: {
      ...styles["faqGrid"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    faqCard: {
      ...styles["faqCard"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      minWidth: layout.isWideWeb ? layout.webResponsiveWidth(280) : layout.responsiveWidth(280),
    },
    faqQuestion: {
      ...styles["faqQuestion"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(21) : layout.responsiveFont(21),
    },
    faqAnswer: {
      ...styles["faqAnswer"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    finalCta: {
      ...styles["finalCta"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(26) : layout.responsiveWidth(26),
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(45) : layout.responsiveHeight(45),
    },
    finalCtaCopy: {
      ...styles["finalCtaCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    finalCtaTitle: {
      ...styles["finalCtaTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(36) : layout.responsiveFont(36),
    },
    finalCtaTitlePhone: {
      ...styles["finalCtaTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(26) : layout.responsiveFont(26),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(32) : layout.responsiveFont(32),
    },
    finalCtaBody: {
      ...styles["finalCtaBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
  });
}

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scrollContent: {
      ...styles["scrollContent"],
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
    },
    shell: {
      ...styles["shell"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(1320) : layout.responsiveWidth(1320),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(30) : layout.responsiveWidth(30),
    },
    shellPhone: {
      ...styles["shellPhone"],
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
    },
    hero: {
      ...styles["hero"],
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(600) : layout.responsiveHeight(600),
    },
    heroCopy: {
      ...styles["heroCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(15) : layout.responsiveWidth(15),
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(68) : layout.responsiveHeight(68),
      paddingLeft: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(52) : layout.responsiveHeight(52),
    },
    heroCopyCompact: {
      ...styles["heroCopyCompact"],
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(34) : layout.responsiveHeight(34),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    eyebrowPhone: {
      ...styles["eyebrowPhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    heroTitle: {
      ...styles["heroTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(102) : layout.responsiveFont(102),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(80) : layout.responsiveFont(60),
    },
    heroTitleCompact: {
      ...styles["heroTitleCompact"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(85) : layout.responsiveFont(85),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(70) : layout.responsiveFont(70),
    },
    heroTitlePhone: {
      ...styles["heroTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(57) : layout.responsiveFont(57),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(58) : layout.responsiveFont(58),
    },
    heroBody: {
      ...styles["heroBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(26) : layout.responsiveFont(20),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(600) : layout.responsiveWidth(650),
    },
    heroBodyPhone: {
      ...styles["heroBodyPhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(19),
    },
    heroChecks: {
      ...styles["heroChecks"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    checkLine: {
      ...styles["checkLine"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    checkText: {
      ...styles["checkText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
    },
    heroActions: {
      ...styles["heroActions"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
    },
    heroNote: {
      ...styles["heroNote"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    heroArtCompact: {
      ...styles["heroArtCompact"],
      height: layout.isWideWeb ? layout.webResponsiveHeight(430) : layout.responsiveHeight(430),
    },
    heroArtPhone: {
      ...styles["heroArtPhone"],
      height: layout.isWideWeb ? layout.webResponsiveHeight(355) : layout.responsiveHeight(355),
    },
    capabilityBand: {
      ...styles["capabilityBand"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(22) : layout.responsiveWidth(22),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(20) : layout.responsiveHeight(20),
    },
    capabilityBandPhone: {
      ...styles["capabilityBandPhone"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    bandLead: {
      ...styles["bandLead"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    bandItem: {
      ...styles["bandItem"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    bandDot: {
      ...styles["bandDot"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
      height: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
      width: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    bandText: {
      ...styles["bandText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    section: {
      ...styles["section"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
    },
    sectionEyebrow: {
      ...styles["sectionEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(38) : layout.responsiveFont(38),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(44) : layout.responsiveFont(44),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(670) : layout.responsiveWidth(670),
    },
    sectionTitlePhone: {
      ...styles["sectionTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(35) : layout.responsiveFont(35),
    },
    steps: {
      ...styles["steps"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
    step: {
      ...styles["step"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    stepIcon: {
      ...styles["stepIcon"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(50) : layout.responsiveWidth(50),
      height: layout.isWideWeb ? layout.webResponsiveHeight(54) : layout.responsiveHeight(54),
      width: layout.isWideWeb ? layout.webResponsiveWidth(54) : layout.responsiveWidth(54),
    },
    stepCopy: {
      ...styles["stepCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    stepNumber: {
      ...styles["stepNumber"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    stepTitle: {
      ...styles["stepTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    stepDetail: {
      ...styles["stepDetail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    showcase: {
      ...styles["showcase"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(32) : layout.responsiveWidth(32),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(45) : layout.responsiveHeight(45),
    },
    showcaseCopy: {
      ...styles["showcaseCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(620) : layout.responsiveWidth(620),
    },
    showcaseIntro: {
      ...styles["showcaseIntro"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(23) : layout.responsiveFont(23),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(570) : layout.responsiveWidth(570),
    },
    benefits: {
      ...styles["benefits"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(21) : layout.responsiveWidth(21),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(16) : layout.responsiveHeight(16),
    },
    benefit: {
      ...styles["benefit"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
    },
    benefitIcon: {
      ...styles["benefitIcon"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(28) : layout.responsiveWidth(28),
      height: layout.isWideWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
      width: layout.isWideWeb ? layout.webResponsiveWidth(42) : layout.responsiveWidth(42),
    },
    benefitCopy: {
      ...styles["benefitCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    benefitTitle: {
      ...styles["benefitTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    benefitDetail: {
      ...styles["benefitDetail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(20) : layout.responsiveFont(20),
    },
    phoneFrame: {
      ...styles["phoneFrame"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(40) : layout.responsiveWidth(40),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(440) : layout.responsiveWidth(440),
      minWidth: layout.isWideWeb ? layout.webResponsiveWidth(320) : layout.responsiveWidth(320),
    },
    phoneTop: {
      ...styles["phoneTop"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
    },
    phoneEyebrow: {
      ...styles["phoneEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    phoneTitle: {
      ...styles["phoneTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(21) : layout.responsiveFont(21),
    },
    phoneScreen: {
      ...styles["phoneScreen"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
      height: layout.isWideWeb ? layout.webResponsiveHeight(300) : layout.responsiveHeight(300),
    },
    phoneOverlay: {
      ...styles["phoneOverlay"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    phoneSignal: {
      ...styles["phoneSignal"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    phoneOverlayTitle: {
      ...styles["phoneOverlayTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    phoneOverlayBody: {
      ...styles["phoneOverlayBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    phoneMetrics: {
      ...styles["phoneMetrics"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    metric: {
      ...styles["metric"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
    },
    metricLabel: {
      ...styles["metricLabel"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(8) : layout.responsiveFont(8),
    },
    metricValue: {
      ...styles["metricValue"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    exampleNote: {
      ...styles["exampleNote"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    faqSection: {
      ...styles["faqSection"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(44) : layout.responsiveHeight(44),
    },
    faqGrid: {
      ...styles["faqGrid"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    faqCard: {
      ...styles["faqCard"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
      minWidth: layout.isWideWeb ? layout.webResponsiveWidth(280) : layout.responsiveWidth(280),
    },
    faqQuestion: {
      ...styles["faqQuestion"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(21) : layout.responsiveFont(21),
    },
    faqAnswer: {
      ...styles["faqAnswer"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    finalCta: {
      ...styles["finalCta"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(26) : layout.responsiveWidth(26),
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(45) : layout.responsiveHeight(45),
    },
    finalCtaCopy: {
      ...styles["finalCtaCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    finalCtaTitle: {
      ...styles["finalCtaTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(30) : layout.responsiveFont(30),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(36) : layout.responsiveFont(36),
    },
    finalCtaTitlePhone: {
      ...styles["finalCtaTitlePhone"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(26) : layout.responsiveFont(26),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(32) : layout.responsiveFont(32),
    },
    finalCtaBody: {
      ...styles["finalCtaBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
  });
}
