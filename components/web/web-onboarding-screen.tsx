import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import type { ComponentProps } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { FlipCompanion } from '@/components/flip';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type IconName = ComponentProps<typeof IconSymbol>['name'];
type FlowVisualKind = 'source' | 'decide' | 'run';

const FLOW_SCANNER_IMAGE = require('@/assets/google-play/keepflip-play-scanner.png');
const FLOW_ITEM_IMAGE = require('@/assets/images/walkthrough-coach-bag.jpeg');

export function WebOnboardingScreen({
  onExistingLogin,
  onNewUser,
}: {
  onExistingLogin?: () => void;
  onNewUser?: () => void;
}) {
  const router = useRouter();
  const landingScrollRef = useRef<ScrollView>(null);
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const goToSignIn = onExistingLogin ?? (() => router.push('/sign-in'));
  const getStarted = onNewUser ?? (() => router.push('/meet-flip'));
  const scrollToWorkflow = () =>
    landingScrollRef.current?.scrollTo({ animated: true, y: 760 });

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <ScrollView
        ref={landingScrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <WebSiteHeader
            label="RESELLER COMMAND CENTER"
            onGetStarted={getStarted}
            onHowItWorks={scrollToWorkflow}
            onSignIn={goToSignIn}
          />

          <View style={[styles.hero, isWide && styles.heroWide]}>
            <View style={styles.heroCopy}>
              <View style={styles.eyebrowRow}>
                <Text style={[styles.eyebrow, { color: colors.goldBright }]}>
                  KEEPFLIP / RESELLER OPERATIONS
                </Text>
                <View style={[styles.livePill, { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.scannerCyan }]} />
                  <Text style={[styles.livePillText, { color: colors.scannerCyan }]}>BUILT FOR RESELLERS</Text>
                </View>
              </View>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                KeepFlip is the reseller command center for sourcing smarter, managing inventory, and knowing your real profit.
              </Text>
              <Text style={[styles.heroBody, { color: colors.textMuted }]}>
                Keep every flip moving from the first Android scan to the final sale. KeepFlip brings item research, buying decisions, inventory, listings, expenses, and realized profit into one clear workflow.
              </Text>
              <View style={styles.heroActions}>
                <ActionButton
                  colors={colors}
                  label="Start my reseller workflow"
                  onPress={getStarted}
                  primary
                />
                <ActionButton
                  colors={colors}
                  label="See how the workflow works"
                  onPress={scrollToWorkflow}
                />
              </View>
              <View style={styles.heroProof}>
                <ProofItem colors={colors} label="SOURCE" detail="Scan with the Android app" />
                <ProofItem colors={colors} label="DECIDE" detail="Know the numbers before you buy" />
                <ProofItem colors={colors} label="RUN" detail="Track what you kept after the sale" />
              </View>
            </View>

            <View style={[styles.heroVisual, !isWide && styles.heroVisualStacked, { backgroundColor: colors.card, borderColor: colors.divider }]}>
              <View style={styles.heroVisualHeader}>
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
                  accessibilityLabel="Placeholder KeepFlip Android scanner image"
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
              <View style={[styles.flipStrip, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
                <FlipCompanion cropToSquare={false} size={isWide ? 78 : 64} />
                <View style={styles.flipStripCopy}>
                  <Text style={[styles.flipStripEyebrow, { color: colors.scannerViolet }]}>FLIP KEEPS THE NEXT MOVE CLEAR</Text>
                  <Text style={[styles.flipStripText, { color: colors.textMuted }]}>Less guesswork. Less cash stuck in the wrong inventory.</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.promiseBand, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
            <View style={styles.promiseCopy}>
              <Text style={[styles.promiseEyebrow, { color: colors.goldBright }]}>THE WHOLE FLIP STORY</Text>
              <Text style={[styles.promiseTitle, { color: colors.text }]}>One place to make better seller decisions.</Text>
            </View>
            <View style={styles.promiseStats}>
              <PromiseStat colors={colors} value="01" label="SOURCE" />
              <PromiseStat colors={colors} value="02" label="DECIDE" />
              <PromiseStat colors={colors} value="03" label="RUN" />
              <PromiseStat colors={colors} value="04" label="LEARN" />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>HOW KEEPFLIP WORKS FOR RESELLERS</Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>A clearer path through every flip.</Text>
            <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
              KeepFlip turns a scattered reseller routine into a repeatable workflow: capture the opportunity in the Android app, make the call, then keep the business record honest.
            </Text>
          </View>

          <View style={[styles.flowGrid, isWide && styles.flowGridWide]}>
            <FlowStep
              accent={colors.scannerCyan}
              body="Use the Android app to scan or photograph a possible buy and get item identity, condition signals, valuation context, and market research without opening five different tools."
              colors={colors}
              label="SOURCE WITH SIGNAL"
              number="01"
              title="Find something worth investigating."
              visual="source"
            />
            <FlowStep
              accent={colors.goldBright}
              body="Use acquisition cost, fees, shipping, discounts, and your reseller buying rules to see the likely net profit before your cash is tied up."
              colors={colors}
              label="DECIDE WITH CONTEXT"
              number="02"
              title="Know whether the deal makes sense."
              visual="decide"
            />
            <FlowStep
              accent={colors.scannerViolet}
              body="Save the item, track its location and listing status, connect the sale, and see what you actually kept after the flip was complete."
              colors={colors}
              label="RUN THE BUSINESS"
              number="03"
              title="Keep the item moving until it is done."
              visual="run"
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>THE KEEPFLIP TOOLKIT</Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>The parts of the reseller business that usually get scattered.</Text>
            <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
              KeepFlip connects the decisions that determine whether a flip is actually worth your time and cash.
            </Text>
          </View>

          <View style={[styles.featureGrid, isWide && styles.featureGridWide]}>
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="barcode.viewfinder"
              title="AI item scan and valuation"
              body="Use the Android app's scanner to identify what you are looking at, assess the evidence, and get a realistic resale range with confidence levels instead of a made-up single number."
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="checkmark.circle.fill"
              title="Personalized buy decisions"
              body="KeepFlip considers the reseller rules you gave Flip—your pace, categories, labor tolerance, and risk preference—when it helps you decide."
            />
            <FeatureCard
              accent={colors.scannerViolet}
              colors={colors}
              icon="dollarsign.circle.fill"
              title="True net-profit pricing"
              body="Price around acquisition cost, marketplace fees, shipping, promotions, discounts, refunds, and ROI—not just the listing price."
            />
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="shippingbox.fill"
              title="Inventory and lifecycle control"
              body="Keep SKU, storage location, quantity, channel, external listing ID, price, and last-sync details with the item so nothing gets lost or oversold."
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="checkmark.shield.fill"
              title="Listing readiness"
              body="See exactly what is missing before publishing: identity, title, category, item specifics, disclosures, photos, measurements, price, shipping, and returns."
            />
            <FeatureCard
              accent={colors.scannerViolet}
              colors={colors}
              icon="chart.bar.fill"
              title="Books and realized profit"
              body="Connect sales, expenses, fees, and inventory costs so you can tell money earned from money still tied up in stock."
            />
            <FeatureCard
              accent={colors.scannerCyan}
              colors={colors}
              icon="creditcard.fill"
              title="eBay and seller connections"
              body="Bring marketplace context and seller workflows closer to the rest of the flip instead of making every tool live in its own silo."
            />
            <FeatureCard
              accent={colors.goldBright}
              colors={colors}
              icon="bubble.left.and.bubble.right.fill"
              title="Flip assistant and market research"
              body="Ask Flip what to do next, research a market, plan a buy, or make a seller decision while keeping your own operating rules in view."
            />
          </View>

          <View style={[styles.compareSection, isWide && styles.compareSectionWide]}>
            <View style={styles.compareCopy}>
              <Text style={[styles.sectionEyebrow, { color: colors.scannerCyan }]}>LESS FRICTION, MORE CONTROL</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Run your resale business with the work in the right order.</Text>
              <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
                The goal is not more dashboards. It is fewer decisions made from memory, guesswork, or a pile of open tabs.
              </Text>
            </View>
            <View style={[styles.compareGrid, isWide && styles.compareGridWide]}>
              <CompareCard
                colors={colors}
                items={['Search across separate apps', 'Guess at fees and real margin', 'Lose track of where items live', 'Find out what worked too late']}
                label="WITHOUT A CONNECTED WORKFLOW"
              />
              <CompareCard
                colors={colors}
                highlighted
                items={['Scan and research the find', 'See expected net profit before buying', 'Track the item through its lifecycle', 'Learn from the flips you actually finished']}
                label="WITH KEEPFLIP"
              />
            </View>
          </View>

          <View style={[styles.cta, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
            <View style={styles.ctaCopy}>
              <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>BUILT FOR THE NEXT RESELLER DECISION</Text>
              <Text style={[styles.ctaTitle, { color: colors.text }]}>Make the next flip easier to trust.</Text>
              <Text style={[styles.ctaBody, { color: colors.textMuted }]}>
                Set up your reseller rules, meet Flip, and start building a business record that gets more useful with every item.
              </Text>
            </View>
            <ActionButton
              colors={colors}
              label="Meet Flip and get started"
              onPress={getStarted}
              primary
            />
          </View>

          <WebSiteFooter />
        </View>
      </ScrollView>
    </View>
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
  colors,
  label,
  number,
  title,
  visual,
}: {
  accent: string;
  body: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  number: string;
  title: string;
  visual: FlowVisualKind;
}) {
  return (
    <View style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <FlowVisual colors={colors} kind={visual} />
      <View style={styles.flowCopy}>
        <View style={styles.flowLabelRow}>
          <Text style={[styles.flowNumber, { color: accent }]}>{number}</Text>
          <Text style={[styles.flowLabel, { color: accent }]}>{label}</Text>
        </View>
        <Text style={[styles.flowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.flowBody, { color: colors.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

function FlowVisual({
  colors,
  kind,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  kind: FlowVisualKind;
}) {
  if (kind === 'source') {
    return (
      <View style={[styles.flowVisual, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <Image
          accessibilityLabel="Placeholder Android source scan image"
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
      <View style={[styles.flowVisual, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <Image
          accessibilityLabel="Placeholder item image"
          contentFit="cover"
          source={FLOW_ITEM_IMAGE}
          style={styles.flowImage}
        />
        <View style={[styles.decisionPanel, { backgroundColor: colors.surfaceOverlay, borderColor: colors.accentGoldBorder }]}>
          <Text style={[styles.overlayEyebrow, { color: colors.goldBright }]}>BUY DECISION</Text>
          <Text style={[styles.overlayTitle, { color: colors.text }]}>Net profit $74</Text>
          <Text style={[styles.overlayBody, { color: colors.textMuted }]}>ROI 58% · target ask $128</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flowVisual, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
      <View style={styles.businessVisual}>
        <View style={styles.businessVisualTop}>
          <Text style={[styles.overlayEyebrow, { color: colors.scannerViolet }]}>KEEPFLIP BOOKS</Text>
          <Text style={[styles.overlayBody, { color: colors.textMuted }]}>THIS MONTH</Text>
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
          <Text style={[styles.overlayBody, { color: colors.textMuted }]}>12 items tracked · 4 listed</Text>
        </View>
      </View>
    </View>
  );
}

function FeatureCard({
  accent,
  body,
  colors,
  icon,
  title,
}: {
  accent: string;
  body: string;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  icon: IconName;
  title: string;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
      <View style={[styles.featureIcon, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        <IconSymbol color={accent} name={icon} size={18} />
      </View>
      <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
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
      <Text style={[styles.compareLabel, { color: highlighted ? colors.goldBright : colors.textMuted }]}>{label}</Text>
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

function ActionButton({
  colors,
  label,
  onPress,
  primary = false,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary
          ? { backgroundColor: colors.gold, borderColor: colors.gold }
          : { backgroundColor: colors.backgroundRaised, borderColor: colors.divider },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, { color: primary ? colors.textOnAccent : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  page: {
    alignSelf: 'center',
    gap: 58,
    maxWidth: 1120,
    paddingBottom: 6,
    width: '100%',
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
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.5 },
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
  livePillText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.9 },
  heroTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 45,
    letterSpacing: -1.1,
    lineHeight: 53,
    maxWidth: 720,
  },
  heroBody: { fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 25, maxWidth: 650 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  action: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  actionText: { fontFamily: theme.fonts.semibold, fontSize: 13 },
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
    minWidth: 320,
    padding: 15,
  },
  heroVisualStacked: { maxWidth: 680, width: '100%' },
  heroVisualHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  visualEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  visualTitle: { fontFamily: theme.fonts.semibold, fontSize: 18, marginTop: 4 },
  visualStatus: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  visualStatusText: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.8 },
  heroScreenshotFrame: { borderRadius: 17, borderWidth: 1, height: 260, overflow: 'hidden', position: 'relative' },
  heroScreenshot: { height: '100%', opacity: 0.86, width: '100%' },
  screenshotOverlay: { borderRadius: 13, borderWidth: 1, bottom: 10, left: 10, padding: 11, position: 'absolute', right: 10 },
  overlayEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1 },
  overlayTitle: { fontFamily: theme.fonts.semibold, fontSize: 15, marginTop: 4 },
  overlayBody: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  heroMetricRow: { flexDirection: 'row', gap: 8 },
  miniMetric: { backgroundColor: 'rgba(0, 0, 0, 0.16)', borderRadius: 11, flex: 1, gap: 5, minHeight: 53, padding: 9 },
  miniMetricLabel: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 0.6 },
  miniMetricValue: { fontFamily: theme.fonts.bold, fontSize: 14 },
  flipStrip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 72, overflow: 'hidden', paddingHorizontal: 10 },
  flipStripCopy: { flex: 1, gap: 4, minWidth: 0 },
  flipStripEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 0.8 },
  flipStripText: { fontFamily: theme.fonts.body, fontSize: 10, lineHeight: 14 },
  promiseBand: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', paddingHorizontal: 19, paddingVertical: 17 },
  promiseCopy: { flex: 1, gap: 5, minWidth: 230 },
  promiseEyebrow: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.2 },
  promiseTitle: { fontFamily: theme.fonts.semibold, fontSize: 18 },
  promiseStats: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  promiseStat: { alignItems: 'center', gap: 3 },
  promiseValue: { fontFamily: theme.fonts.bold, fontSize: 20 },
  promiseLabel: { fontFamily: theme.fonts.bold, fontSize: 7, letterSpacing: 1 },
  sectionHeader: { alignSelf: 'center', gap: 8, maxWidth: 740, width: '100%' },
  sectionEyebrow: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.5 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 31, letterSpacing: -0.6, lineHeight: 37 },
  sectionBody: { fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 22, maxWidth: 680 },
  flowGrid: { gap: 14 },
  flowGridWide: { flexDirection: 'row' },
  flowCard: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 15, minWidth: 0, overflow: 'hidden', paddingBottom: 17 },
  flowVisual: { borderBottomWidth: 1, height: 220, overflow: 'hidden', position: 'relative', width: '100%' },
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
  featureGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  featureCard: { borderRadius: 17, borderWidth: 1, flex: 1, gap: 9, minHeight: 175, minWidth: 270, padding: 16 },
  featureIcon: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  featureTitle: { fontFamily: theme.fonts.semibold, fontSize: 14, lineHeight: 19 },
  featureBody: { fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 17 },
  compareSection: { gap: 22 },
  compareSectionWide: { alignItems: 'center', flexDirection: 'row' },
  compareCopy: { flex: 0.85, gap: 8, minWidth: 260 },
  compareGrid: { gap: 12 },
  compareGridWide: { flex: 1.15, flexDirection: 'row' },
  compareCard: { borderRadius: 18, borderWidth: 1, flex: 1, gap: 14, minWidth: 0, padding: 17 },
  compareLabel: { fontFamily: theme.fonts.bold, fontSize: 8, letterSpacing: 1.1 },
  compareList: { gap: 11 },
  compareItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  compareItemText: { flex: 1, fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16 },
  cta: { alignItems: 'center', borderRadius: 21, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', padding: 23 },
  ctaCopy: { flex: 1, gap: 8, minWidth: 260 },
  ctaTitle: { fontFamily: theme.fonts.bold, fontSize: 29, lineHeight: 35 },
  ctaBody: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 20, maxWidth: 650 },
  pressed: { opacity: 0.78 },
});
