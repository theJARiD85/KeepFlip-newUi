import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { FlipCompanion } from '@/components/flip';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import {
  SemanticHeading,
  WebActionLink,
  WebContentSection,
  WebCopy,
  WebPageHead,
  WebTextLink,
} from '@/components/web/web-public-page';
import {
  KEEPFLIP_EBAY_CONNECTION_COPY,
  KEEPFLIP_FREE_LISTING_GENERATIONS_PER_MONTH,
  KEEPFLIP_FREE_SCANS_PER_MONTH,
  KEEPFLIP_GOOGLE_PLAY_URL,
  KEEPFLIP_HOME_FAQS,
  KEEPFLIP_HOME_DESCRIPTION,
  KEEPFLIP_HOME_TITLE,
} from '@/constants/keepflip-public-site';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
type IconName = ComponentProps<typeof IconSymbol>['name'];
type FlowVisualKind = 'source' | 'decide' | 'run';

const FLOW_SCANNER_IMAGE = require('@/assets/google-play/keepflip-play-scanner.png');
const FLOW_ITEM_IMAGE = require('@/assets/images/walkthrough-coach-bag.jpeg');

export function WebOnboardingScreen() {
  const {
    webContentMaxWidth,
    webContentWidth,
    webPageGutter,
    contentMaxWidth,
    contentWidth,
    pageGutter
  } = useResponsiveLayout();

  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
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
      <KeepFlipBackground>
      <LinearGradient
        colors={['#1e161298', '#34200534', '#1e161271', '#3420052e']}
        style={styles.background}
      >
      <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        showsVerticalScrollIndicator={false}
      >
      <WebSiteHeader showMarketingLinks />
        <View style={[styles.page, isPhone && styles.pagePhone, webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>


          <View style={[styles.hero, isWide && styles.heroWide]}>
            <View style={styles.heroCopy}>
              <View style={styles.eyebrowRow}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>
                  KEEPFLIP / RESELLER OPERATIONS
                </Text>
                <View style={[styles.livePill, { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.scannerCyan }]} />
                  <Text style={[styles.livePillText, { color: colors.scannerCyan }]}>BUILT FOR FLIPPERS</Text>
                </View>
              </View>
              <SemanticHeading
                level={1}
                style={[styles.heroTitle, isPhone && styles.heroTitlePhone, { color: colors.text }]}
              >
                KeepFlip is your go-to reseller assistant that shows you exactly how much every flip costs.
              </SemanticHeading>
              <Text style={[styles.heroBody, { color: colors.textMuted }]}>
              KeepFlip tracks every item from the shelf to the sale. Scan a find, see your estimated net after fees before you spend, then follow it through inventory and into the books. No spreadsheet. No tab chaos.
              </Text>
              <Text style={[styles.freeEntryNote, { color: colors.textMuted }]}>
                Free includes every KeepFlip feature except Flip Assistant on Android and web, with up to 10 saved inventory items, {KEEPFLIP_FREE_SCANS_PER_MONTH} AI scans, and {KEEPFLIP_FREE_LISTING_GENERATIONS_PER_MONTH} listing generations each month. Books and insights are included. Serious adds unlimited saved inventory, 200 scans per month, unlimited listing generations, and Flip for $13/month or $130/year. No card or timed trial is required.
              </Text>
              <View style={styles.heroProof}>
                <ProofItem colors={colors} label="SOURCE" detail="Scan with the Android app" />
                <ProofItem colors={colors} label="DECIDE" detail="Know the numbers before you buy" />
                <ProofItem colors={colors} label="TRACK" detail="See what you kept after the sale" />
              </View>
            </View>
            <View style={[styles.flipStrip, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
                <FlipCompanion cropToSquare={false} size={isWide ? 78 : 64} />
                <View style={styles.flipStripCopy}>
                  <Text style={[styles.flipStripEyebrow, { color: colors.scannerViolet }]}>FLIP KEEPS THE NEXT MOVE CLEAR</Text>
                  <Text style={[styles.flipStripText, { color: colors.textMuted }]}>Less guesswork. Less cash stuck in the wrong inventory.</Text>
                </View>
              </View>

            <View style={[styles.heroVisual, !isWide && styles.heroVisualStacked, isPhone && styles.heroVisualPhone, { backgroundColor: colors.card, borderColor: colors.divider }]}>
              <View style={[styles.heroVisualHeader, isPhone && styles.heroVisualHeaderPhone]}>
                <View>
                  <Text style={[styles.visualEyebrow, { color: colors.goldBright }]}>A FLIP, WITHOUT THE TAB CHAOS</Text>
                  <Text style={[styles.visualTitle, { color: colors.text }]}>From find to finished.</Text>
                </View>
                <View style={[styles.visualStatus, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.visualStatusText, { color: colors.success }]}>ANDROID CAPTURE</Text>
                </View>
              </View>
              <View style={[styles.heroScreenshotFrame, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
                <Image
                  accessibilityLabel="Android screenshot of KeepFlip identifying a refrigerator and showing scan confidence"
                  alt="KeepFlip Android scan screen identifying a refrigerator and showing its confidence level."
                  contentFit="cover"
                  source={FLOW_SCANNER_IMAGE}
                  style={styles.heroScreenshot}
                />
                <View style={[styles.screenshotOverlay, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentCyanBorder }]}>
                  <Text style={[styles.overlayEyebrow, { color: colors.scannerCyan }]}>KEEPFLIP SIGNAL</Text>
                  <Text style={[styles.overlayTitle, { color: colors.text }]}>Research this find</Text>
                  <Text style={[styles.overlayBody, { color: colors.textMuted }]}>Evidence, value, costs, and next move in one place.</Text>
                </View>
              </View>
              <View style={styles.heroMetricRow}>
                <MiniMetric colors={colors} label="EST. RESALE" value="$128" />
                <MiniMetric colors={colors} label="NET AFTER COSTS" value="$74" accent={colors.scannerCyan} />
                <MiniMetric colors={colors} label="BUY SIGNAL" value="STRONG" accent={colors.success} />
              </View>
              <Text style={[styles.exampleNote, { color: colors.textMuted }]}>
                Illustrative example. Actual estimates depend on the item, condition, market evidence, and your costs.
              </Text>
            </View>
          </View>

          <View style={[styles.promiseBand, isPhone && styles.promiseBandPhone, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
            <View style={styles.promiseCopy}>
              <Text style={[styles.promiseEyebrow, { color: colors.goldBright }]}>THE WHOLE FLIP STORY</Text>
              <SemanticHeading level={2} style={[styles.promiseTitle, { color: colors.text }]}>One place to make better seller decisions.</SemanticHeading>
            </View>
            <View style={[styles.promiseStats, isPhone && styles.promiseStatsPhone]}>
              <PromiseStat colors={colors} value="01" label="SOURCE" />
              <PromiseStat colors={colors} value="02" label="DECIDE" />
              <PromiseStat colors={colors} value="03" label="TRACK" />
              <PromiseStat colors={colors} value="04" label="LEARN" />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>HOW KEEPFLIP WORKS FOR RESELLERS</Text>
            <SemanticHeading level={2} style={[styles.sectionTitle, isPhone && styles.sectionTitlePhone, { color: colors.text }]}>A clearer path through every flip.</SemanticHeading>
            <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
              Search the find on Android. Count the costs before you buy. Track the item until it sells and see what was left after fees.
            </Text>
          </View>

          <View style={[styles.flowGrid, isTablet && styles.flowGridTablet, isWide && styles.flowGridWide]}>
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

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>THE KEEPFLIP TOOLKIT</Text>
            <SemanticHeading level={2} style={[styles.sectionTitle, isPhone && styles.sectionTitlePhone, { color: colors.text }]}>The parts of reselling that usually get scattered.</SemanticHeading>
            <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
              KeepFlip connects the decisions that determine whether a flip is actually worth your time and cash.
            </Text>
          </View>

          <View style={[styles.featureGrid, isWide && styles.featureGridColumns]}>
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="barcode.viewfinder"
              title="Scan a find and check its resale range"
              body="Use the Android app to identify an item, review the market evidence, and see an estimated resale range with confidence signals. It is a starting point for your research, not a guaranteed sale price."
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="checkmark.circle.fill"
              title="Buy rules that fit how you sell"
              body="Set your own categories, target return, and buying rules. Flip uses them as context while you decide whether a find is worth your cash."
            />
            <FeatureCard
              accent={colors.scannerViolet}
              colors={colors}
              icon="dollarsign.circle.fill"
              title="Know what you may keep after fees"
              body="Count what you paid, marketplace fees, shipping, discounts, and other costs so the listing price is not mistaken for your profit."
            />
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="shippingbox.fill"
              title="Know what is where and what it cost"
              body="Keep an item’s cost, storage location, quantity, eBay listing, and status together so you can find it and see what is still tied up in stock."
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="checkmark.shield.fill"
              title="Get an eBay listing ready"
              body="See what still needs work before you list: item details, photos, measurements, price, shipping, and return settings."
            />
            <FeatureCard
              accent={colors.scannerViolet}
              colors={colors}
              icon="chart.bar.fill"
              title="Keep up with sales, costs, and tax records"
              body="Bring sales, expenses, fees, and inventory costs together. Export Schedule C information from Books and separate earnings from cash still tied up in stock."
            />
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="creditcard.fill"
              title="Connect your eBay account"
              body={KEEPFLIP_EBAY_CONNECTION_COPY}
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="bubble.left.and.bubble.right.fill"
              title="Ask Flip what to check next"
              body="Use Flip to think through a find, review market evidence, and apply your own buying rules before you spend."
            />
          </View>

          <WebContentSection
            eyebrow="SOUND FAMILIAR?"
            id="reseller-stories"
            title="What resellers say about tracking the old way."
          >
            <View style={[styles.storyPlaceholder, { gap: 20 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 10 }}>
                <Text style={{color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 16}}>"I used spreadsheets for a decade...</Text> <Text style={{color: theme.colors.text, fontFamily: theme.fonts.medium}}>so much less stress."</Text>
                <Text style={{color: theme.colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: 16}}>— Full-time reseller, r/Flipping</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Text style={{color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 18}}>"My time is more valuable than $20 a month having to create a spreadsheet and update it constantly. It also helps at the end of the year for tax purposes."</Text>
                <Text style={{color: theme.colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: 18}}>— Flipwise user, Reddit</Text>
              </View>              
              <View style={{ flexDirection: 'row', justifyContent: 'flex-center', gap: 10 }}>
                <Text style={{color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 16}}>"I started using a spreadsheet but as I grew, it became too time consuming to track items on an individual basis."</Text>
                <Text style={{color: theme.colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: 16}}>— r/Flipping</Text>
              </View>             
               <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 10 }}>
                <Text style={{color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: 16}}>"I was selling sewing patterns thinking I was making about $1.40 but I didn't realize about the flat fee and the fact eBay's fees include shipping. My actual net profit was actually .15."</Text>
                <Text style={{color: theme.colors.scannerCyan, fontFamily: theme.fonts.body, fontSize: 16}}>— Full-time reseller, r/Flipping</Text>
              </View>



<Text></Text>
<Text>— r/Flipping</Text>


            </View>
          </WebContentSection>

            <View style={[styles.compareSection, isWide && styles.compareSectionWide]}>
              <View style={styles.compareCopy}>
                <Text style={[styles.sectionEyebrow, { color: colors.scannerCyan }]}>LESS FRICTION, MORE CONTROL</Text>
                <SemanticHeading level={2} style={[styles.sectionTitle, isPhone && styles.sectionTitlePhone, { color: colors.text }]}>Keep the work of a flip in the right order.</SemanticHeading>
                <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
                  Use one place to research a find, count the costs before you buy, and keep track of the item through the sale.
                </Text>
              </View>
              <View style={[styles.compareGrid, isWide && styles.compareGridWide]}>
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
            <View style={styles.faqGrid}>
              {KEEPFLIP_HOME_FAQS.map((faq) => (
                <View key={faq.question} style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                  <SemanticHeading level={3} style={[styles.faqQuestion, { color: colors.text }]}>{faq.question}</SemanticHeading>
                  <WebCopy>{faq.answer}</WebCopy>
                </View>
              ))}
            </View>
          </WebContentSection>

          <View style={[styles.cta, isPhone && styles.ctaPhone, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
            <View style={styles.ctaCopy}>
              <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>BUILT FOR THE NEXT RESELLER DECISION</Text>
              <SemanticHeading level={2} style={[styles.ctaTitle, isPhone && styles.ctaTitlePhone, { color: colors.text }]}>Check the numbers before your next buy.</SemanticHeading>
              <Text style={[styles.ctaBody, { color: colors.textMuted }]}>
                See the current plan price, then choose whether KeepFlip fits the way you source and sell.
              </Text>
            </View>
            <WebActionLink href="/pricing" label="See plan prices" />
          </View>
          </View>
          <WebSiteFooter showMarketingLinks />
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
  return (
    <View style={styles.proofItem}>
      <View style={[styles.proofDot, { backgroundColor: colors.goldBright }]} />
      <View style={styles.proofCopy}>
        <Text style={[styles.proofLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.proofDetail, { color: colors.textMuted }]}>{detail}</Text>
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
  return (
    <View style={styles.promiseStat}>
      <Text style={[styles.promiseValue, { color: colors.goldBright }]}>{value}</Text>
      <Text style={[styles.promiseLabel, { color: colors.textMuted }]}>{label}</Text>
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
  return (
    <View style={[styles.flowCard, tablet && styles.flowGridTabletCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <FlowVisual colors={colors} compact={compact} kind={visual} />
      <View style={styles.flowCopy}>
        <View style={styles.flowLabelRow}>
          <Text style={[styles.flowNumber, { color: accent }]}>{number}</Text>
          <Text style={[styles.flowLabel, { color: accent }]}>{label}</Text>
        </View>
        <SemanticHeading level={3} style={[styles.flowTitle, { color: colors.text }]}>{title}</SemanticHeading>
        <Text style={[styles.flowBody, { color: colors.textMuted }]}>{body}</Text>
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
  if (kind === 'source') {
    return (
      <View style={[styles.flowVisual, compact && styles.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
              <Image
          accessibilityLabel="KeepFlip Android scan screen for researching an item"
          alt="KeepFlip Android scan screen used to research an item before buying."
          contentFit="cover"
          source={FLOW_SCANNER_IMAGE}
          style={styles.flowImage}
        />
        <View style={[styles.flowOverlay, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentCyanBorder }]}>
          <Text style={[styles.overlayEyebrow, { color: colors.scannerCyan }]}>ANDROID SCAN → IDENTIFY</Text>
          <Text style={[styles.overlayTitle, { color: colors.text }]}>Evidence attached</Text>
        </View>
      </View>
    );
  }

  if (kind === 'decide') {
    return (
      <View style={[styles.flowVisual, compact && styles.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
          <Image
          accessibilityLabel="Secondhand coach bag used as an item research example"
          alt="Secondhand coach bag photographed as an example item for resale research."
          contentFit="cover"
          source={FLOW_ITEM_IMAGE}
          style={styles.flowImage}
        />
        <View style={[styles.decisionPanel, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentGoldBorder }]}>
          <Text style={[styles.overlayEyebrow, { color: colors.goldBright }]}>EXAMPLE BUY DECISION</Text>
          <Text style={[styles.overlayTitle, { color: colors.text }]}>Example net $74</Text>
          <Text style={[styles.overlayBody, { color: colors.textMuted }]}>ROI 58% · target ask $128</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flowVisual, compact && styles.flowVisualPhone, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
      <View style={styles.businessVisual}>
        <View style={styles.businessVisualTop}>
          <Text style={[styles.overlayEyebrow, { color: colors.scannerViolet }]}>KEEPFLIP BOOKS</Text>
          <Text style={[styles.overlayBody, { color: colors.textMuted }]}>EXAMPLE</Text>
        </View>
        <Text style={[styles.businessTotal, { color: colors.text }]}>$1,284</Text>
        <Text style={[styles.overlayBody, { color: colors.textMuted }]}>left after recorded costs</Text>
        <View style={styles.businessBars}>
          <View style={[styles.businessBar, { backgroundColor: colors.scannerCyan, height: '78%' }]} />
          <View style={[styles.businessBar, { backgroundColor: colors.goldBright, height: '53%' }]} />
          <View style={[styles.businessBar, { backgroundColor: colors.scannerViolet, height: '66%' }]} />
          <View style={[styles.businessBar, { backgroundColor: colors.success, height: '42%' }]} />
          <View style={[styles.businessBar, { backgroundColor: colors.textMuted, height: '58%' }]} />
        </View>
        <View style={[styles.inventoryStatus, { borderColor: colors.divider }]}>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
        <Text style={[styles.overlayBody, { color: colors.textMuted }]}>12 example items · 4 listed</Text>
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
  return (
    <View style={[styles.featureCard, columns && styles.featureCardColumns, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
      <View style={[styles.featureIcon, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <IconSymbol color={accent} name={icon} size={18} />
      </View>
      <SemanticHeading level={3} style={[styles.featureTitle, { color: colors.text }]}>{title}</SemanticHeading>
      <Text style={[styles.featureBody, { color: colors.textMuted }]}>{body}</Text>
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
  return (
    <View style={[styles.compareCard, { backgroundColor: highlighted ? colors.iconSurfaceGold : colors.card, borderColor: highlighted ? colors.accentGoldBorder : colors.divider }]}>
      <SemanticHeading level={3} style={[styles.compareLabel, { color: highlighted ? colors.goldBright : colors.textMuted }]}>{label}</SemanticHeading>
      <View style={styles.compareList}>
        {items.map((item) => (
          <View key={item} style={styles.compareItem}>
            <IconSymbol color={highlighted ? colors.success : colors.danger} name={highlighted ? 'checkmark.circle.fill' : 'xmark'} size={16} />
            <Text style={[styles.compareItemText, { color: colors.textMuted }]}>{item}</Text>
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
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.miniMetricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniMetricValue, { color: accent ?? colors.text }]}>{value}</Text>
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
    paddingBottom: 6,
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
