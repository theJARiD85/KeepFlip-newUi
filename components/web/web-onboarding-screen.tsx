import { FlipCompanion } from '@/components/flip';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import {
  SemanticHeading,
  WebActionLink,
  WebContentSection,
  WebCopy,
  WebPageHead,
} from '@/components/web/web-public-page';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import {
  KEEPFLIP_EBAY_CONNECTION_COPY,
  KEEPFLIP_FREE_LISTING_GENERATIONS_PER_MONTH,
  KEEPFLIP_FREE_SCANS_PER_MONTH,
  KEEPFLIP_HOME_DESCRIPTION,
  KEEPFLIP_HOME_FAQS,
  KEEPFLIP_HOME_TITLE,
  KEEPFLIP_PUBLIC_COLORS,
} from '@/constants/keepflip-public-site';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';
type IconName = ComponentProps<typeof Ionicons>['name'];
type FlowVisualKind = 'source' | 'decide' | 'run';

const FLOW_SCANNER_IMAGE = require('@/assets/google-play/keepflip-play-scanner.png');
const FLOW_ITEM_IMAGE = require('@/assets/images/walkthrough-coach-bag.jpeg');

export function WebOnboardingScreen() {
  const responsiveLayout = useResponsiveLayout();
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const {
    webContentMaxWidth,
    webContentWidth,
    webPageGutter,
    contentMaxWidth,
    contentWidth,
    pageGutter
  } = useResponsiveLayout();

  const colors = KEEPFLIP_PUBLIC_COLORS;
  const { width } = useWindowDimensions();
  const isWide = width >= 1040;
  const isTablet = width >= 720 && !isWide;
  const isPhone = width < 480;
  const webContentSizing =
    Platform.OS === 'web'
      ? {
        width: webContentWidth,
        maxWidth: webContentMaxWidth,
        alignSelf: 'center' as const,
        paddingHorizontal: webPageGutter,
      }
      : undefined;

  return (
    <>
      <WebPageHead
        canonicalPath="/"
        description={KEEPFLIP_HOME_DESCRIPTION}
        title={KEEPFLIP_HOME_TITLE}
      />
      <KeepFlipBackground colorScheme="dark">
        <LinearGradient
          colors={['#1e161298', '#34200534', '#1e161271', '#3420052e']}
          style={responsiveStyles.background}
        >
          <View style={responsiveStyles.root}>
            <ScrollView
              contentContainerStyle={[responsiveStyles.scrollContent, webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
              showsVerticalScrollIndicator={false}
            >
              <WebSiteHeader colorScheme="dark" showMarketingLinks />
              <View style={[responsiveStyles.page, isPhone && responsiveStyles.pagePhone, webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>


                <View style={[responsiveStyles.hero, isWide && responsiveStyles.heroWide]}>
                  <View style={responsiveStyles.heroCopy}>
                    <View style={responsiveStyles.eyebrowRow}>
                      <Text style={[responsiveStyles.eyebrow, { color: colors.goldBright }]}>
                        KEEPFLIP / RESELLER OPERATIONS
                      </Text>
                      <View style={[responsiveStyles.livePill, { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder }]}>
                        <View style={[responsiveStyles.liveDot, { backgroundColor: colors.scannerCyan }]} />
                        <Text style={[responsiveStyles.livePillText, { color: colors.scannerCyan }]}>BUILT FOR FLIPPERS</Text>
                      </View>
                    </View>
                    <SemanticHeading
                      level={1}
                      style={[responsiveStyles.heroTitle, isPhone && responsiveStyles.heroTitlePhone, { color: colors.text }]}
                    >
                      KeepFlip is your go-to reseller assistant that shows you exactly how much every flip costs.
                    </SemanticHeading>
                    <Text style={[responsiveStyles.heroBody, { color: colors.textMuted }]}>
                      KeepFlip tracks every item from the shelf to the sale. Scan a find, see your estimated net after fees before you spend, then follow it through inventory and into the books. No spreadsheet. No tab chaos.
                    </Text>
                    <Text style={[responsiveStyles.freeEntryNote, { color: colors.textMuted }]}>
                      Free includes every KeepFlip feature except Flip Assistant on Android and web, with up to 10 saved inventory items, {KEEPFLIP_FREE_SCANS_PER_MONTH} AI scans, and {KEEPFLIP_FREE_LISTING_GENERATIONS_PER_MONTH} listing generations each month. Books and insights are included. Serious adds unlimited saved inventory, 200 scans per month, unlimited listing generations, and Flip for $13/month or $130/year. No card or timed trial is required.
                    </Text>
                    <View style={responsiveStyles.heroProof}>
                      <ProofItem colors={colors} label="SOURCE" detail="Scan with the Android app" />
                      <ProofItem colors={colors} label="DECIDE" detail="Know the numbers before you buy" />
                      <ProofItem colors={colors} label="TRACK" detail="See what you kept after the sale" />
                    </View>
                  </View>
                  <View style={[responsiveStyles.flipStrip, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
                    <FlipCompanion cropToSquare={false} size={isWide ? 78 : 64} />
                    <View style={responsiveStyles.flipStripCopy}>
                      <Text style={[responsiveStyles.flipStripEyebrow, { color: colors.scannerViolet }]}>FLIP KEEPS THE NEXT MOVE CLEAR</Text>
                      <Text style={[responsiveStyles.flipStripText, { color: colors.textMuted }]}>Less guesswork. Less cash stuck in the wrong inventory.</Text>
                    </View>
                  </View>

                  <View style={[responsiveStyles.heroVisual, !isWide && responsiveStyles.heroVisualStacked, isPhone && responsiveStyles.heroVisualPhone, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                    <View style={[responsiveStyles.heroVisualHeader, isPhone && responsiveStyles.heroVisualHeaderPhone]}>
                      <View>
                        <Text style={[responsiveStyles.visualEyebrow, { color: colors.goldBright }]}>A FLIP, WITHOUT THE TAB CHAOS</Text>
                        <Text style={[responsiveStyles.visualTitle, { color: colors.text }]}>From find to finished.</Text>
                      </View>
                      <View style={[responsiveStyles.visualStatus, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
                        <View style={[responsiveStyles.liveDot, { backgroundColor: colors.success }]} />
                        <Text style={[responsiveStyles.visualStatusText, { color: colors.success }]}>ANDROID CAPTURE</Text>
                      </View>
                    </View>
                    <View style={[responsiveStyles.heroScreenshotFrame, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
                      <Image
                        accessibilityLabel="Android screenshot of KeepFlip identifying a refrigerator and showing scan confidence"
                        alt="KeepFlip Android scan screen identifying a refrigerator and showing its confidence level."
                        contentFit="cover"
                        source={FLOW_SCANNER_IMAGE}
                        style={responsiveStyles.heroScreenshot}
                      />
                      <View style={[responsiveStyles.screenshotOverlay, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentCyanBorder }]}>
                        <Text style={[responsiveStyles.overlayEyebrow, { color: colors.scannerCyan }]}>KEEPFLIP SIGNAL</Text>
                        <Text style={[responsiveStyles.overlayTitle, { color: colors.text }]}>Research this find</Text>
                        <Text style={[responsiveStyles.overlayBody, { color: colors.textMuted }]}>Evidence, value, costs, and next move in one place.</Text>
                      </View>
                    </View>
                    <View style={responsiveStyles.heroMetricRow}>
                      <MiniMetric colors={colors} label="EST. RESALE" value="$128" />
                      <MiniMetric colors={colors} label="NET AFTER COSTS" value="$74" accent={colors.scannerCyan} />
                      <MiniMetric colors={colors} label="BUY SIGNAL" value="STRONG" accent={colors.success} />
                    </View>
                    <Text style={[responsiveStyles.exampleNote, { color: colors.textMuted }]}>
                      Illustrative example. Actual estimates depend on the item, condition, market evidence, and your costs.
                    </Text>
                  </View>
                </View>

                <View style={[responsiveStyles.promiseBand, isPhone && responsiveStyles.promiseBandPhone, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
                  <View style={responsiveStyles.promiseCopy}>
                    <Text style={[responsiveStyles.promiseEyebrow, { color: colors.goldBright }]}>THE WHOLE FLIP STORY</Text>
                    <SemanticHeading level={2} style={[responsiveStyles.promiseTitle, { color: colors.text }]}>One place to make better seller decisions.</SemanticHeading>
                  </View>
                  <View style={[responsiveStyles.promiseStats, isPhone && responsiveStyles.promiseStatsPhone]}>
                    <PromiseStat colors={colors} value="01" label="SOURCE" />
                    <PromiseStat colors={colors} value="02" label="DECIDE" />
                    <PromiseStat colors={colors} value="03" label="TRACK" />
                    <PromiseStat colors={colors} value="04" label="LEARN" />
                  </View>
                </View>

                <View style={responsiveStyles.sectionHeader}>
                  <Text style={[responsiveStyles.sectionEyebrow, { color: colors.goldBright }]}>HOW KEEPFLIP WORKS FOR RESELLERS</Text>
                  <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, isPhone && responsiveStyles.sectionTitlePhone, { color: colors.text }]}>A clearer path through every flip.</SemanticHeading>
                  <Text style={[responsiveStyles.sectionBody, { color: colors.textMuted }]}>
                    Search the find on Android. Count the costs before you buy. Track the item until it sells and see what was left after fees.
                  </Text>
                </View>

                <View style={[responsiveStyles.flowGrid, isTablet && responsiveStyles.flowGridTablet, isWide && responsiveStyles.flowGridWide]}>
                  <FlowStep
                    accent={colors.scannerCyan}
                    body="Use the Android app to scan or photograph a possible buy and get item identity, condition signals, valuation context, and market research without opening five different tools."
                    compact={isPhone}
                    colors={colors}
                    label="SOURCE WITH SIGNAL"
                    number="01"
                    tablet={isTablet}
                    title="Find something worth investigating."
                    visual="source"
                  />
                  <FlowStep
                    accent={colors.goldBright}
                    body="Count what you pay, fees, shipping, discounts, and your target return before cash is tied up. Keep the market evidence with the find so you can explain why it made sense to buy."
                    compact={isPhone}
                    colors={colors}
                    label="DECIDE WITH CONTEXT"
                    number="02"
                    tablet={isTablet}
                    title="Know whether the deal makes sense."
                    visual="decide"
                  />
                  <FlowStep
                    accent={colors.scannerViolet}
                    body="Save the item, track its location and listing status, connect the sale, and see what you actually kept after the flip was complete."
                    compact={isPhone}
                    colors={colors}
                    label="TRACK THE ITEM"
                    number="03"
                    tablet={isTablet}
                    title="Keep the item moving until it is done."
                    visual="run"
                  />
                </View>

                <View style={responsiveStyles.sectionHeader}>
                  <Text style={[responsiveStyles.sectionEyebrow, { color: colors.goldBright }]}>THE KEEPFLIP TOOLKIT</Text>
                  <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, isPhone && responsiveStyles.sectionTitlePhone, { color: colors.text }]}>The parts of reselling that usually get scattered.</SemanticHeading>
                  <Text style={[responsiveStyles.sectionBody, { color: colors.textMuted }]}>
                    KeepFlip connects the decisions that determine whether a flip is actually worth your time and cash.
                  </Text>
                </View>

                <View style={[responsiveStyles.featureGrid, isWide && responsiveStyles.featureGridColumns]}>
                  <FeatureCard
                    accent={colors.scannerCyan}
                    colors={colors}
                    icon="barcode-outline"
                    title="Scan a find and check its resale range"
                    body="Use the Android app to identify an item, review the market evidence, and see an estimated resale range with confidence signals. It is a starting point for your research, not a guaranteed sale price."
                  />
                  <FeatureCard
                    accent={colors.goldBright}
                    colors={colors}
                    icon="checkmark-circle"
                    title="Buy rules that fit how you sell"
                    body="Set your own categories, target return, and buying rules. Flip uses them as context while you decide whether a find is worth your cash."
                  />
                  <FeatureCard
                    accent={colors.scannerViolet}
                    colors={colors}
                    icon="cash-outline"
                    title="Know what you may keep after fees"
                    body="Count what you paid, marketplace fees, shipping, discounts, and other costs so the listing price is not mistaken for your profit."
                  />
                  <FeatureCard
                    accent={colors.scannerCyan}
                    colors={colors}
                    icon="cube-outline"
                    title="Know what is where and what it cost"
                    body="Keep an item’s cost, storage location, quantity, eBay listing, and status together so you can find it and see what is still tied up in stock."
                  />
                  <FeatureCard
                    accent={colors.goldBright}
                    colors={colors}
                    icon="checkmark-circle"
                    title="Get an eBay listing ready"
                    body="See what still needs work before you list: item details, photos, measurements, price, shipping, and return settings."
                  />
                  <FeatureCard
                    accent={colors.scannerViolet}
                    colors={colors}
                    icon="stats-chart"
                    title="Keep up with sales, costs, and tax records"
                    body="Bring sales, expenses, fees, and inventory costs together. Export Schedule C information from Books and separate earnings from cash still tied up in stock."
                  />
                  <FeatureCard
                    accent={colors.scannerCyan}
                    colors={colors}
                    icon="card-outline"
                    title="Connect your eBay account"
                    body={KEEPFLIP_EBAY_CONNECTION_COPY}
                  />
                  <FeatureCard
                    accent={colors.goldBright}
                    colors={colors}
                    icon="chatbubbles-outline"
                    title="Ask Flip what to check next"
                    body="Use Flip to think through a find, review market evidence, and apply your own buying rules before you spend."
                  />
                </View>

                <WebContentSection
                  eyebrow="SOUND FAMILIAR?"
                  id="reseller-stories"
                  title="What resellers say about tracking the old way."
                >
                  <View style={[responsiveStyles.storyPlaceholder, { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(20) : 20 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 }}>
                      <Text style={{ color: colors.text, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>&quot;I used spreadsheets for a decade... <Text style={{ color: colors.text, fontFamily: theme.fonts.medium }}>so much less stress.&quot;</Text></Text>
                      <Text style={{ color: colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>— Full-time reseller, r/Flipping</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 }}>
                      <Text style={{ color: colors.text, fontFamily: theme.fonts.body, fontSize: responsiveFont(18) }}>&quot;My time is more valuable than $20 a month having to create a spreadsheet and update it constantly. It also helps at the end of the year for tax purposes.&quot;</Text>
                      <Text style={{ color: colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: responsiveFont(18) }}>— Flipwise user, Reddit</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 }}>
                      <Text style={{ color: colors.text, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>&quot;I started using a spreadsheet but as I grew, it became too time consuming to track items on an individual basis.&quot;</Text>
                      <Text style={{ color: colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>— r/Flipping</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 }}>
                      <Text style={{ color: colors.text, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>&quot;I was selling sewing patterns thinking I was making about $1.40 but I didn&apos;t realize about the flat fee and the fact eBay&apos;s fees include shipping. My actual net profit was actually .15.&quot;</Text>
                      <Text style={{ color: colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: responsiveFont(16) }}>— Full-time reseller, r/Flipping</Text>
                    </View>



                    <Text></Text>
                    <Text>— r/Flipping</Text>


                  </View>
                </WebContentSection>

                <View style={[responsiveStyles.compareSection, isWide && responsiveStyles.compareSectionWide]}>
                  <View style={responsiveStyles.compareCopy}>
                    <Text style={[responsiveStyles.sectionEyebrow, { color: colors.scannerCyan }]}>LESS FRICTION, MORE CONTROL</Text>
                    <SemanticHeading level={2} style={[responsiveStyles.sectionTitle, isPhone && responsiveStyles.sectionTitlePhone, { color: colors.text }]}>Keep the work of a flip in the right order.</SemanticHeading>
                    <Text style={[responsiveStyles.sectionBody, { color: colors.textMuted }]}>
                      Use one place to research a find, count the costs before you buy, and keep track of the item through the sale.
                    </Text>
                  </View>
                  <View style={[responsiveStyles.compareGrid, isWide && responsiveStyles.compareGridWide]}>
                    <CompareCard
                      colors={colors}
                      items={['Search across separate apps', 'Guess at fees and real margin', 'Lose track of where items live', 'Find out what worked too late']}
                      label="WHEN DETAILS ARE SCATTERED"
                    />
                    <CompareCard
                      colors={colors}
                      highlighted
                      items={['Research the find', 'Count costs before buying', 'Know what is where and what it cost', 'See what you kept after the sale']}
                      label="WITH KEEPFLIP"
                    />
                  </View>
                </View>

                <WebContentSection eyebrow="STRAIGHT ANSWERS" id="questions" title="Questions resellers ask before they try it.">
                  <View style={responsiveStyles.faqGrid}>
                    {KEEPFLIP_HOME_FAQS.map((faq) => (
                      <View key={faq.question} style={[responsiveStyles.faqCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                        <SemanticHeading level={3} style={[responsiveStyles.faqQuestion, { color: colors.text }]}>{faq.question}</SemanticHeading>
                        <WebCopy>{faq.answer}</WebCopy>
                      </View>
                    ))}
                  </View>
                </WebContentSection>

                <View style={[responsiveStyles.cta, isPhone && responsiveStyles.ctaPhone, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
                  <View style={responsiveStyles.ctaCopy}>
                    <Text style={[responsiveStyles.sectionEyebrow, { color: colors.goldBright }]}>BUILT FOR THE NEXT RESELLER DECISION</Text>
                    <SemanticHeading level={2} style={[responsiveStyles.ctaTitle, isPhone && responsiveStyles.ctaTitlePhone, { color: colors.text }]}>Check the numbers before your next buy.</SemanticHeading>
                    <Text style={[responsiveStyles.ctaBody, { color: colors.textMuted }]}>
                      See the current plan price, then choose whether KeepFlip fits the way you source and sell.
                    </Text>
                  </View>
                  <WebActionLink href="/pricing" label="See plan prices" />
                </View>
              </View>
              <WebSiteFooter colorScheme="dark" inFlow showMarketingLinks />
            </ScrollView>
          </View>
        </LinearGradient>
      </KeepFlipBackground>
    </>
  );
}

function ProofItem({
  colors,
  detail,
  label,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  detail: string;
  label: string;
}) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles2.proofItem}>
      <View style={[responsiveStyles2.proofDot, { backgroundColor: colors.goldBright }]} />
      <View style={responsiveStyles2.proofCopy}>
        <Text style={[responsiveStyles2.proofLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[responsiveStyles2.proofDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

function PromiseStat({
  colors,
  label,
  value,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  value: string;
}) {
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles3.promiseStat}>
      <Text style={[responsiveStyles3.promiseValue, { color: colors.goldBright }]}>{value}</Text>
      <Text style={[responsiveStyles3.promiseLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function FlowStep({
  accent,
  body,
  compact = false,
  colors,
  label,
  number,
  tablet = false,
  title,
  visual,
}: {
  accent: string;
  body: string;
  compact?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  number: string;
  tablet?: boolean;
  title: string;
  visual: FlowVisualKind;
}) {
  const responsiveStyles4 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={[responsiveStyles4.flowCard, tablet && responsiveStyles4.flowGridTabletCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <FlowVisual colors={colors} compact={compact} kind={visual} />
      <View style={responsiveStyles4.flowCopy}>
        <View style={responsiveStyles4.flowLabelRow}>
          <Text style={[responsiveStyles4.flowNumber, { color: accent }]}>{number}</Text>
          <Text style={[responsiveStyles4.flowLabel, { color: accent }]}>{label}</Text>
        </View>
        <SemanticHeading level={3} style={[responsiveStyles4.flowTitle, { color: colors.text }]}>{title}</SemanticHeading>
        <Text style={[responsiveStyles4.flowBody, { color: colors.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

function FlowVisual({
  compact = false,
  colors,
  kind,
}: {
  compact?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  kind: FlowVisualKind;
}) {
  const responsiveStyles5 = useResponsiveStyles(createStylesWebResponsive);
  if (kind === 'source') {
    return (
      <View style={[responsiveStyles5.flowVisual, compact && responsiveStyles5.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <Image
          accessibilityLabel="KeepFlip Android scan screen for researching an item"
          alt="KeepFlip Android scan screen used to research an item before buying."
          contentFit="cover"
          source={FLOW_SCANNER_IMAGE}
          style={responsiveStyles5.flowImage}
        />
        <View style={[responsiveStyles5.flowOverlay, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentCyanBorder }]}>
          <Text style={[responsiveStyles5.overlayEyebrow, { color: colors.scannerCyan }]}>ANDROID SCAN <Ionicons color={colors.scannerCyan} name="arrow-forward" size={11} /> IDENTIFY</Text>
          <Text style={[responsiveStyles5.overlayTitle, { color: colors.text }]}>Evidence attached</Text>
        </View>
      </View>
    );
  }

  if (kind === 'decide') {
    return (
      <View style={[responsiveStyles5.flowVisual, compact && responsiveStyles5.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <Image
          accessibilityLabel="Secondhand coach bag used as an item research example"
          alt="Secondhand coach bag photographed as an example item for resale research."
          contentFit="cover"
          source={FLOW_ITEM_IMAGE}
          style={responsiveStyles5.flowImage}
        />
        <View style={[responsiveStyles5.decisionPanel, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentGoldBorder }]}>
          <Text style={[responsiveStyles5.overlayEyebrow, { color: colors.goldBright }]}>EXAMPLE BUY DECISION</Text>
          <Text style={[responsiveStyles5.overlayTitle, { color: colors.text }]}>Example net $74</Text>
          <Text style={[responsiveStyles5.overlayBody, { color: colors.textMuted }]}>ROI 58% · target ask $128</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[responsiveStyles5.flowVisual, compact && responsiveStyles5.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
      <View style={responsiveStyles5.businessVisual}>
        <View style={responsiveStyles5.businessVisualTop}>
          <Text style={[responsiveStyles5.overlayEyebrow, { color: colors.scannerViolet }]}>KEEPFLIP BOOKS</Text>
          <Text style={[responsiveStyles5.overlayBody, { color: colors.textMuted }]}>EXAMPLE</Text>
        </View>
        <Text style={[responsiveStyles5.businessTotal, { color: colors.text }]}>$1,284</Text>
        <Text style={[responsiveStyles5.overlayBody, { color: colors.textMuted }]}>left after recorded costs</Text>
        <View style={responsiveStyles5.businessBars}>
          <View style={[responsiveStyles5.businessBar, { backgroundColor: colors.scannerCyan, height: '78%' }]} />
          <View style={[responsiveStyles5.businessBar, { backgroundColor: colors.goldBright, height: '53%' }]} />
          <View style={[responsiveStyles5.businessBar, { backgroundColor: colors.scannerViolet, height: '66%' }]} />
          <View style={[responsiveStyles5.businessBar, { backgroundColor: colors.success, height: '42%' }]} />
          <View style={[responsiveStyles5.businessBar, { backgroundColor: colors.textMuted, height: '58%' }]} />
        </View>
        <View style={[responsiveStyles5.inventoryStatus, { borderColor: colors.divider }]}>
          <View style={[responsiveStyles5.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[responsiveStyles5.overlayBody, { color: colors.textMuted }]}>12 example items · 4 listed</Text>
        </View>
      </View>
    </View>
  );
}

function FeatureCard({
  accent,
  body,
  columns = false,
  colors,
  icon,
  title,
}: {
  accent: string;
  body: string;
  columns?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  icon: IconName;
  title: string;
}) {
  const responsiveStyles6 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={[responsiveStyles6.featureCard, columns && responsiveStyles6.featureCardColumns, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
      <View style={[responsiveStyles6.featureIcon, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <Ionicons color={accent} name={icon} size={18} />
      </View>
      <SemanticHeading level={3} style={[responsiveStyles6.featureTitle, { color: colors.text }]}>{title}</SemanticHeading>
      <Text style={[responsiveStyles6.featureBody, { color: colors.textMuted }]}>{body}</Text>
    </View>
  );
}

function CompareCard({
  colors,
  highlighted = false,
  items,
  label,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  highlighted?: boolean;
  items: string[];
  label: string;
}) {
  const responsiveStyles7 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={[responsiveStyles7.compareCard, { backgroundColor: highlighted ? colors.iconSurfaceGold : colors.card, borderColor: highlighted ? colors.accentGoldBorder : colors.divider }]}>
      <SemanticHeading level={3} style={[responsiveStyles7.compareLabel, { color: highlighted ? colors.goldBright : colors.textMuted }]}>{label}</SemanticHeading>
      <View style={responsiveStyles7.compareList}>
        {items.map((item) => (
          <View key={item} style={responsiveStyles7.compareItem}>
            <Ionicons color={highlighted ? colors.success : colors.danger} name={highlighted ? 'checkmark-circle' : 'close'} size={16} />
            <Text style={[responsiveStyles7.compareItemText, { color: colors.textMuted }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MiniMetric({
  accent,
  colors,
  label,
  value,
}: {
  accent?: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  value: string;
}) {
  const responsiveStyles8 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles8.miniMetric}>
      <Text style={[responsiveStyles8.miniMetricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[responsiveStyles8.miniMetricValue, { color: accent ?? colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  root: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingTop: 24,
    paddingBottom: 24,
  },
  page: {
    paddingTop: 35,
    paddingBottom: 170,
    alignSelf: 'center',
    gap: 50,
    width: '100%',
  },
  pagePhone: {
    gap: 42,
  },
  hero: { gap: 32 },
  heroWide: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCopy: { flex: 1, gap: 15, minWidth: 0 },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  eyebrow: { fontFamily: theme.fonts.display, fontSize: 8, letterSpacing: 2 },
  livePill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  liveDot: { borderRadius: 4, height: 7, width: 7 },
  livePillText: { fontFamily: theme.fonts.semibold, fontSize: 8, letterSpacing: 0.9 },
  heroTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 35,
    maxWidth: 730,
    letterSpacing: -1.1,
    lineHeight: 40,
  },
  heroTitlePhone: { fontSize: 31, lineHeight: 39, letterSpacing: -0.7 },
  heroBody: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 25, maxWidth: 650 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  freeEntryNote: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 600 },
  scopeCopy: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 600 },
  downloadProof: { alignSelf: 'flex-start' },
  exampleNote: { fontFamily: theme.fonts.body, fontSize: 9, lineHeight: 14 },
  heroProof: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  proofItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, maxWidth: 180 },
  proofDot: { borderRadius: 3, height: 6, marginTop: 5, width: 6 },
  proofCopy: { gap: 3 },
  proofLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.1 },
  proofDetail: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  heroVisual: {
    borderRadius: 24,
    borderWidth: 1,
    flex: 0.8,
    gap: 14,
    maxWidth: 500,
    minWidth: 0,
    padding: 15,
  },
  heroVisualStacked: { maxWidth: 680, minWidth: 0, width: '100%' },
  heroVisualPhone: { padding: 12 },
  heroVisualHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  heroVisualHeaderPhone: { gap: 8 },
  visualEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  visualTitle: { fontFamily: theme.fonts.semibold, fontSize: 18, marginTop: 4 },
  visualStatus: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  visualStatusText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.8 },
  heroScreenshotFrame: { borderRadius: 17, borderWidth: 1, height: 260, minWidth: 0, overflow: 'hidden', position: 'relative' },
  heroScreenshot: { height: '100%', opacity: 0.86, width: '100%' },
  screenshotOverlay: { borderRadius: 13, borderWidth: 1, bottom: 10, left: 10, padding: 11, position: 'absolute', right: 10 },
  overlayEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1 },
  overlayTitle: { fontFamily: theme.fonts.semibold, fontSize: 15, marginTop: 4 },
  overlayBody: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniMetric: { backgroundColor: 'rgba(0, 0, 0, 0.16)', borderRadius: 11, flex: 1, gap: 5, minHeight: 53, minWidth: 0, padding: 9 },
  miniMetricLabel: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.6 },
  miniMetricValue: { fontFamily: theme.fonts.bold, fontSize: 14 },
  flipStrip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 72, overflow: 'hidden', paddingHorizontal: 10 },
  flipStripCopy: { flex: 1, gap: 4, minWidth: 0 },
  flipStripEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 0.8 },
  flipStripText: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  promiseBand: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', paddingHorizontal: 19, paddingVertical: 17 },
  promiseBandPhone: { alignItems: 'flex-start', gap: 14, paddingHorizontal: 14 },
  promiseCopy: { flex: 1, gap: 5, minWidth: 0 },
  promiseEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  promiseTitle: { fontFamily: theme.fonts.semibold, fontSize: 18 },
  promiseStats: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  promiseStatsPhone: { justifyContent: 'space-between', width: '100%' },
  promiseStat: { alignItems: 'center', gap: 3 },
  promiseValue: { fontFamily: theme.fonts.bold, fontSize: 20 },
  promiseLabel: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  sectionHeader: { alignSelf: 'center', gap: 8, maxWidth: 740, width: '100%' },
  sectionEyebrow: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.5 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 31, letterSpacing: -0.6, lineHeight: 37 },
  sectionTitlePhone: { fontSize: 26, letterSpacing: -0.4, lineHeight: 32 },
  sectionBody: { fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 22, maxWidth: 680 },
  flowGrid: { gap: 14 },
  flowGridTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  flowGridWide: { flexDirection: 'row' },
  flowCard: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 15, minWidth: 0, overflow: 'hidden', paddingBottom: 17 },
  flowGridTabletCard: { minWidth: 280 },
  flowVisual: { borderBottomWidth: 1, height: 220, overflow: 'hidden', position: 'relative', width: '100%' },
  flowVisualPhone: { height: 190 },
  flowImage: { height: '100%', opacity: 0.78, width: '100%' },
  flowOverlay: { borderRadius: 12, borderWidth: 1, bottom: 10, left: 10, padding: 10, position: 'absolute', right: 10 },
  decisionPanel: { borderRadius: 12, borderWidth: 1, bottom: 10, left: 10, padding: 10, position: 'absolute', right: 10 },
  businessVisual: { flex: 1, gap: 7, justifyContent: 'center', padding: 18 },
  businessVisualTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  businessTotal: { fontFamily: theme.fonts.bold, fontSize: 34, marginTop: 3 },
  businessBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 9, height: 72, marginTop: 12 },
  businessBar: { borderRadius: 5, flex: 1, minHeight: 12 },
  inventoryStatus: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 10, paddingHorizontal: 9, paddingVertical: 7 },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  flowCopy: { gap: 9, paddingHorizontal: 17 },
  flowLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  flowNumber: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1 },
  flowLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.1 },
  flowTitle: { fontFamily: theme.fonts.semibold, fontSize: 19, lineHeight: 24 },
  flowBody: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18 },
  featureGrid: { gap: 12 },
  featureGridColumns: { flexDirection: 'row', flexWrap: 'wrap' },
  featureCard: { borderRadius: 17, borderWidth: 1, flex: 1, gap: 9, minHeight: 175, minWidth: 0, padding: 16 },
  featureCardColumns: { minWidth: 270 },
  featureIcon: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  featureTitle: { fontFamily: theme.fonts.semibold, fontSize: 14, lineHeight: 19 },
  featureBody: { fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 17 },
  storyPlaceholder: { borderRadius: 16, borderWidth: 1, padding: 16 },
  faqGrid: { gap: 12 },
  faqCard: { borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
  faqQuestion: { fontFamily: theme.fonts.semibold, fontSize: 16, lineHeight: 22 },
  compareSection: { gap: 22 },
  compareSectionWide: { alignItems: 'center', flexDirection: 'row' },
  compareCopy: { flex: 0.85, gap: 8, minWidth: 0 },
  compareGrid: { gap: 12 },
  compareGridWide: { flex: 1.15, flexDirection: 'row' },
  compareCard: { borderRadius: 18, borderWidth: 1, flex: 1, gap: 14, minWidth: 0, padding: 17 },
  compareLabel: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 0.2 },
  compareList: { gap: 11 },
  compareItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  compareItemText: { flex: 1, fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16 },
  cta: { alignItems: 'center', borderRadius: 21, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', padding: 23 },
  ctaPhone: { alignItems: 'stretch', flexDirection: 'column', gap: 14, padding: 16 },
  ctaCopy: { flex: 1, gap: 8, minWidth: 0 },
  ctaTitle: { fontFamily: theme.fonts.bold, fontSize: 29, lineHeight: 35 },
  ctaTitlePhone: { fontSize: 25, lineHeight: 31 },
  ctaBody: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 20, maxWidth: 650 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scrollContent: {
      ...styles["scrollContent"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
    },
    page: {
      ...styles["page"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(35) : 35,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(170) : 170,
      gap: layout.isWeb ? layout.webResponsiveWidth(50) : 50,
    },
    pagePhone: {
      ...styles["pagePhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(42) : 42,
    },
    hero: {
      ...styles["hero"],
      gap: layout.isWeb ? layout.webResponsiveWidth(32) : 32,
    },
    heroCopy: {
      ...styles["heroCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    eyebrowRow: {
      ...styles["eyebrowRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    livePill: {
      ...styles["livePill"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    liveDot: {
      ...styles["liveDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    livePillText: {
      ...styles["livePillText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    heroTitle: {
      ...styles["heroTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(35) : 35,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(730) : 730,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(40) : 40,
    },
    heroTitlePhone: {
      ...styles["heroTitlePhone"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(31) : 31,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(39) : 39,
    },
    heroBody: {
      ...styles["heroBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(25) : 25,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(650) : 650,
    },
    heroActions: {
      ...styles["heroActions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
    },
    freeEntryNote: {
      ...styles["freeEntryNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(600) : 600,
    },
    scopeCopy: {
      ...styles["scopeCopy"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(600) : 600,
    },
    exampleNote: {
      ...styles["exampleNote"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    heroProof: {
      ...styles["heroProof"],
      gap: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    proofItem: {
      ...styles["proofItem"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(180) : 180,
    },
    proofDot: {
      ...styles["proofDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
      height: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
      width: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    proofCopy: {
      ...styles["proofCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    proofLabel: {
      ...styles["proofLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    proofDetail: {
      ...styles["proofDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    heroVisual: {
      ...styles["heroVisual"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(500) : 500,
    },
    heroVisualStacked: {
      ...styles["heroVisualStacked"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(680) : 680,
    },
    heroVisualHeader: {
      ...styles["heroVisualHeader"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    heroVisualHeaderPhone: {
      ...styles["heroVisualHeaderPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    visualEyebrow: {
      ...styles["visualEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    visualTitle: {
      ...styles["visualTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    visualStatus: {
      ...styles["visualStatus"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
    },
    visualStatusText: {
      ...styles["visualStatusText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    heroScreenshotFrame: {
      ...styles["heroScreenshotFrame"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
      height: layout.isWeb ? layout.webResponsiveHeight(260) : 260,
    },
    screenshotOverlay: {
      ...styles["screenshotOverlay"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    overlayEyebrow: {
      ...styles["overlayEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    overlayTitle: {
      ...styles["overlayTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    overlayBody: {
      ...styles["overlayBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    heroMetricRow: {
      ...styles["heroMetricRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    miniMetric: {
      ...styles["miniMetric"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(53) : 53,
    },
    miniMetricLabel: {
      ...styles["miniMetricLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    miniMetricValue: {
      ...styles["miniMetricValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    flipStrip: {
      ...styles["flipStrip"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(72) : 72,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    flipStripCopy: {
      ...styles["flipStripCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    flipStripEyebrow: {
      ...styles["flipStripEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    flipStripText: {
      ...styles["flipStripText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    promiseBand: {
      ...styles["promiseBand"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(19) : 19,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(17) : 17,
    },
    promiseBandPhone: {
      ...styles["promiseBandPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    promiseCopy: {
      ...styles["promiseCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    promiseEyebrow: {
      ...styles["promiseEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    promiseTitle: {
      ...styles["promiseTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    promiseStats: {
      ...styles["promiseStats"],
      gap: layout.isWeb ? layout.webResponsiveWidth(22) : 22,
    },
    promiseStat: {
      ...styles["promiseStat"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    promiseValue: {
      ...styles["promiseValue"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(20) : 20,
    },
    promiseLabel: {
      ...styles["promiseLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    sectionHeader: {
      ...styles["sectionHeader"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(740) : 740,
    },
    sectionEyebrow: {
      ...styles["sectionEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(31) : 31,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(37) : 37,
    },
    sectionTitlePhone: {
      ...styles["sectionTitlePhone"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(26) : 26,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(32) : 32,
    },
    sectionBody: {
      ...styles["sectionBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(680) : 680,
    },
    flowGrid: {
      ...styles["flowGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    flowCard: {
      ...styles["flowCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      gap: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(17) : 17,
    },
    flowGridTabletCard: {
      ...styles["flowGridTabletCard"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(280) : 280,
    },
    flowVisual: {
      ...styles["flowVisual"],
      height: layout.isWeb ? layout.webResponsiveHeight(220) : 220,
    },
    flowVisualPhone: {
      ...styles["flowVisualPhone"],
      height: layout.isWeb ? layout.webResponsiveHeight(190) : 190,
    },
    flowOverlay: {
      ...styles["flowOverlay"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    decisionPanel: {
      ...styles["decisionPanel"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    businessVisual: {
      ...styles["businessVisual"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    businessTotal: {
      ...styles["businessTotal"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(34) : 34,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(3) : 3,
    },
    businessBars: {
      ...styles["businessBars"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      height: layout.isWeb ? layout.webResponsiveHeight(72) : 72,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    businessBar: {
      ...styles["businessBar"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    inventoryStatus: {
      ...styles["inventoryStatus"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    statusDot: {
      ...styles["statusDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    flowCopy: {
      ...styles["flowCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
    },
    flowLabelRow: {
      ...styles["flowLabelRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    flowNumber: {
      ...styles["flowNumber"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    flowLabel: {
      ...styles["flowLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    flowTitle: {
      ...styles["flowTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(24) : 24,
    },
    flowBody: {
      ...styles["flowBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    featureGrid: {
      ...styles["featureGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    featureCard: {
      ...styles["featureCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(175) : 175,
    },
    featureCardColumns: {
      ...styles["featureCardColumns"],
      minWidth: layout.isWeb ? layout.webResponsiveWidth(270) : 270,
    },
    featureIcon: {
      ...styles["featureIcon"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      height: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      width: layout.isWeb ? layout.webResponsiveWidth(34) : 34,
    },
    featureTitle: {
      ...styles["featureTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    featureBody: {
      ...styles["featureBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    storyPlaceholder: {
      ...styles["storyPlaceholder"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    faqGrid: {
      ...styles["faqGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    faqCard: {
      ...styles["faqCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    faqQuestion: {
      ...styles["faqQuestion"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : 16,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
    },
    compareSection: {
      ...styles["compareSection"],
      gap: layout.isWeb ? layout.webResponsiveWidth(22) : 22,
    },
    compareCopy: {
      ...styles["compareCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    compareGrid: {
      ...styles["compareGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    compareCard: {
      ...styles["compareCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    compareLabel: {
      ...styles["compareLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    compareList: {
      ...styles["compareList"],
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
    },
    compareItem: {
      ...styles["compareItem"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    compareItemText: {
      ...styles["compareItemText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    cta: {
      ...styles["cta"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(21) : 21,
      gap: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
    },
    ctaPhone: {
      ...styles["ctaPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    ctaCopy: {
      ...styles["ctaCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    ctaTitle: {
      ...styles["ctaTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(29) : 29,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(35) : 35,
    },
    ctaTitlePhone: {
      ...styles["ctaTitlePhone"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(25) : 25,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(31) : 31,
    },
    ctaBody: {
      ...styles["ctaBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(20) : 20,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(650) : 650,
    },
  });
}
