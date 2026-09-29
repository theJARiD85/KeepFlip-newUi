import { useState } from 'react';
import { createElement, type CSSProperties } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  SemanticHeading,
  WebActionLink,
  WebBulletList,
  WebContentSection,
  WebCopy,
  WebInfoCard,
  WebMarketingPage,
  WebTextLink,
} from '@/components/web/web-public-page';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import {
  KEEPFLIP_FREE_ANDROID_SCANS_PER_MONTH,
  KEEPFLIP_GOOGLE_PLAY_URL,
  KEEPFLIP_PUBLIC_PRICING_USD,
  KEEPFLIP_SITE_URL,
} from '@/constants/keepflip-public-site';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

const pricingMetadata = {
  canonicalPath: '/pricing',
  description:
    'See KeepFlip Serious Reseller pricing: $18 per month or $180 per year at US web checkout, with every feature and up to 250 active listings.',
  title: 'KeepFlip pricing | One plan for resellers',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'KeepFlip',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Android, Web',
    offers: [
      {
        '@type': 'Offer',
        name: 'Serious Reseller monthly, US web checkout',
        price: KEEPFLIP_PUBLIC_PRICING_USD.web.monthly.toFixed(2),
        priceCurrency: 'USD',
        url: `${KEEPFLIP_SITE_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        name: 'Serious Reseller annual, US web checkout',
        price: KEEPFLIP_PUBLIC_PRICING_USD.web.annual.toFixed(2),
        priceCurrency: 'USD',
        url: `${KEEPFLIP_SITE_URL}/pricing`,
      },
    ],
  },
} as const;

export default function PricingPage() {
  const [cadence, setCadence] = useState<'monthly' | 'annual'>('monthly');
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const displayedPrice =
    cadence === 'annual'
      ? KEEPFLIP_PUBLIC_PRICING_USD.web.annual
      : KEEPFLIP_PUBLIC_PRICING_USD.web.monthly;

  return (
      <WebMarketingPage
        metadata={pricingMetadata}
        eyebrow="ONE PAID PLAN"
        title="One plan for the work of a flip."
        intro="Serious Reseller includes every KeepFlip feature. US web checkout is $18 per month or $180 per year."
      >
        <WebContentSection title="Serious Reseller">
          <WebCopy>
            There is one paid plan because the research, buy decision, inventory, and profit tools are meant to work together. You do not have to pick through feature gates.
          </WebCopy>
          <View style={[styles.planCard, { backgroundColor: colors.backgroundRaised, borderColor: colors.accentGoldBorder }]}>
            <View style={styles.planTop}>
              <View style={styles.planTitle}>
                <Text style={[styles.planEyebrow, { color: colors.goldBright }]}>ONLY PAID PLAN</Text>
                <SemanticHeading level={3} style={[styles.planName, { color: colors.text }]}>Serious Reseller</SemanticHeading>
              </View>
              <View style={[styles.billingToggle, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
                {(['monthly', 'annual'] as const).map((option) => {
                  const selected = cadence === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setCadence(option)}
                      style={[
                        styles.billingOption,
                        selected && { backgroundColor: colors.gold },
                      ]}
                    >
                      <Text style={[styles.billingText, { color: selected ? colors.textOnAccent : colors.textMuted }]}>
                        {option === 'monthly' ? 'Monthly' : 'Annual'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: colors.text }]}>${displayedPrice}</Text>
              <Text style={[styles.period, { color: colors.textMuted }]}>{cadence === 'annual' ? 'per year' : 'per month'}</Text>
            </View>
            {cadence === 'annual' ? (
              <WebCopy>
                Pay for 10 months and get 12. Save ${KEEPFLIP_PUBLIC_PRICING_USD.web.annualSavings} compared with paying monthly for a year.
              </WebCopy>
            ) : null}
            <WebBulletList
              items={[
                'Every KeepFlip feature is included.',
                'Up to 250 active listings total.',
                'US web checkout in US dollars.',
              ]}
            />
            <WebActionLink href="/meet-flip" label="Continue to setup and choose your billing period" />
          </View>
          <BillingComparisonTable colors={colors} />
          <WebCopy>
            Your checkout shows the billing period and amount before you confirm. The current web checkout does not include a free trial.
          </WebCopy>
        </WebContentSection>

        <WebContentSection eyebrow="WHAT IS INCLUDED" title="Everything to take a flip from find to sale.">
          <WebBulletList
            items={[
              'Research a find with the Android scan and market evidence.',
              'Count acquisition cost, fees, shipping, and discounts before buying.',
              'Track inventory, storage location, quantity, and eBay listing status.',
              'Review sales, expenses, fees, and inventory costs in Books.',
              'Use every KeepFlip feature, with up to 250 active listings total.',
            ]}
          />
        </WebContentSection>

        <WebContentSection eyebrow="FREE ANDROID ENTRY" title="Try the scanner before you pay.">
          <WebCopy>
            Android has a free scanner path with up to {KEEPFLIP_FREE_ANDROID_SCANS_PER_MONTH} scans per month, no credit card, and no saved inventory. The web checkout is a separate paid plan with no free trial.
          </WebCopy>
          <WebActionLink href={KEEPFLIP_GOOGLE_PLAY_URL} label="Try the free Android scanner" />
        </WebContentSection>

        <WebContentSection eyebrow="GOOGLE PLAY" title="The store shows its own checkout price.">
          <WebCopy>
            Google Play sets the amount shown in its purchase screen. Its public listing currently reports in-app purchases from $18 to $180. Review the exact plan, billing period, and price in Google Play before confirming a purchase.
          </WebCopy>
          <WebTextLink href={KEEPFLIP_GOOGLE_PLAY_URL} label="See KeepFlip on Google Play" />
        </WebContentSection>

        <WebContentSection eyebrow="BEFORE YOU BUY" title="A few direct answers.">
          <View style={styles.answerGrid}>
            <WebInfoCard title="Is there a free trial?">
              <WebCopy>
                The current web checkout does not offer a free trial. We do not advertise one here.
              </WebCopy>
            </WebInfoCard>
            <WebInfoCard title="What happens if a scan is wrong?">
              <WebCopy>
                Scan results are estimates. Check the item details, market evidence, and your own costs before you buy.
              </WebCopy>
            </WebInfoCard>
            <WebInfoCard title="Can I export my data?">
              <WebCopy>
                Books can export Schedule C information. A one-click export of every account record is not available; contact support for eligible access or deletion requests.
              </WebCopy>
            </WebInfoCard>
          </View>
        </WebContentSection>
      </WebMarketingPage>
  );
}

function BillingComparisonTable({
  colors,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
}) {
  const rows = [
    ['Monthly', '$18 each month', '$216 over 12 months'],
    ['Annual', '$180 once per year', '$15/month equivalent · save $36'],
  ] as const;

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.billingRows}>
        {rows.map(([billing, amount, total]) => (
          <View key={billing} style={[styles.billingRow, { borderColor: colors.divider }]}>
            <Text style={[styles.billingHeader, { color: colors.text }]}>{billing}</Text>
            <Text style={[styles.billingCopy, { color: colors.textMuted }]}>{amount}</Text>
            <Text style={[styles.billingCopy, { color: colors.textMuted }]}>{total}</Text>
          </View>
        ))}
      </View>
    );
  }

  const headerStyle: CSSProperties = {
    backgroundColor: colors.backgroundRaised,
    borderBottom: `1px solid ${colors.divider}`,
    color: colors.text,
    fontWeight: 700,
    padding: '12px 14px',
    textAlign: 'left',
  };
  const cellStyle: CSSProperties = {
    borderBottom: `1px solid ${colors.divider}`,
    color: colors.textMuted,
    padding: '12px 14px',
    textAlign: 'left',
  };

  return createElement(
    'div',
    { style: { border: `1px solid ${colors.divider}`, borderRadius: 14, maxWidth: '100%', overflowX: 'auto' } },
    createElement(
      'table',
      { style: { borderCollapse: 'collapse', minWidth: '520px', width: '100%' } },
      createElement('caption', { style: { clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 } }, 'Compare monthly and annual billing for Serious Reseller'),
      createElement(
        'thead',
        null,
        createElement(
          'tr',
          null,
          createElement('th', { scope: 'col', style: headerStyle }, 'Billing'),
          createElement('th', { scope: 'col', style: headerStyle }, 'Price'),
          createElement('th', { scope: 'col', style: headerStyle }, 'Cost over one year'),
        ),
      ),
      createElement(
        'tbody',
        null,
        ...rows.map(([billing, amount, total]) =>
          createElement(
            'tr',
            { key: billing },
            createElement('th', { scope: 'row', style: headerStyle }, billing),
            createElement('td', { style: cellStyle }, amount),
            createElement('td', { style: cellStyle }, total),
          ),
        ),
      ),
    ),
  );
}

const styles = StyleSheet.create({
  planCard: { alignSelf: 'flex-start', borderRadius: 18, borderWidth: 1, gap: 15, maxWidth: 720, padding: 20, width: '100%' },
  planTop: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 13, justifyContent: 'space-between' },
  planTitle: { flex: 1, gap: 5, minWidth: 180 },
  planEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  planName: { fontSize: 22, lineHeight: 29 },
  billingToggle: { borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 3 },
  billingOption: { alignItems: 'center', borderRadius: 11, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 },
  billingText: { fontSize: 13, fontWeight: '600' },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 8 },
  price: { fontSize: 34, fontWeight: '700', lineHeight: 41 },
  period: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  answerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  billingRows: { gap: 9 },
  billingRow: { borderBottomWidth: 1, gap: 5, paddingBottom: 12, paddingTop: 7 },
  billingHeader: { fontSize: 14, fontWeight: '700' },
  billingCopy: { fontSize: 13, lineHeight: 20 },
});
