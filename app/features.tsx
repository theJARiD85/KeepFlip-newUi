import { StyleSheet, View } from 'react-native';

import {
  WebActionLink,
  WebBulletList,
  WebContentSection,
  WebCopy,
  WebInfoCard,
  WebMarketingPage,
  WebTextLink,
} from '@/components/web/web-public-page';
import { KEEPFLIP_EBAY_CONNECTION_COPY, KEEPFLIP_GOOGLE_PLAY_URL, KEEPFLIP_SITE_URL, KEEPFLIP_SIGNUP_URL } from '@/constants/keepflip-public-site';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const metadata = {
  canonicalPath: '/features',
  description:
    'See how KeepFlip helps solo resellers research a find, count costs before buying, track inventory, and review profit after a sale.',
  title: 'How KeepFlip works | Reseller tools from find to sale',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'KeepFlip',
    url: `${KEEPFLIP_SITE_URL}/features`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Android, Web',
  },
} as const;

export default function FeaturesPage() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="HOW IT WORKS"
      title="Take a flip from find to sale."
      intro="KeepFlip puts the buy decision, item details, and money left after the sale in one place, so you can check the numbers before cash is tied up."
    >
      <WebContentSection title="Start with the item in front of you.">
        <View style={responsiveStyles.cardGrid}>
          <WebInfoCard title="1. Research the find">
            <WebCopy>
              Scan or photograph a possible buy in the Android app. Review item identity, confidence signals, and market evidence where available.
            </WebCopy>
          </WebInfoCard>
          <WebInfoCard title="2. Count the costs">
            <WebCopy>
              Add what you will pay and account for fees, shipping, discounts, and other costs. Use the estimate to decide whether the deal fits your own buying rules.
            </WebCopy>
          </WebInfoCard>
          <WebInfoCard title="3. Keep track of the item">
            <WebCopy>
              Save inventory details, what it cost, where it is stored, and its eBay listing status. Find the item again when it is time to pack and ship.
            </WebCopy>
          </WebInfoCard>
          <WebInfoCard title="4. See what you kept">
            <WebCopy>
              Bring sales, expenses, fees, and inventory costs into Books. Export Schedule C information and see the difference between money earned and money still tied up in stock.
            </WebCopy>
          </WebInfoCard>
        </View>
      </WebContentSection>

      <WebContentSection eyebrow="CONNECTED SELLER DETAILS" title="eBay connects through eBay sign-in.">
        <WebCopy>{KEEPFLIP_EBAY_CONNECTION_COPY}</WebCopy>
        <WebBulletList
          items={[
            'Use seller and listing details for the KeepFlip features you choose.',
            'Keep the item, cost, storage location, and eBay listing status together.',
            'KeepFlip is built around solo resellers who source in person and sell on eBay.',
          ]}
        />
      </WebContentSection>

      <WebContentSection eyebrow="CURRENT SCOPE" title="Built for solo flippers, not five-marketplace crosslisting.">
        <WebCopy>
          KeepFlip focuses on researching a buy and following inventory and profit through an eBay sale. If you crosslist to five marketplaces, this is not that tool yet.
        </WebCopy>
      </WebContentSection>

      <View style={responsiveStyles.actions}>
        <WebActionLink href="/meet-flip" label="SIGN UP FOR FREE" />
        <WebActionLink href="/pricing" label="See plan prices" secondary />
        <WebTextLink href="/about" label="Who KeepFlip is for" />
      </View>
    </WebMarketingPage>
  );
}

const styles = StyleSheet.create({
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    cardGrid: {
      ...styles["cardGrid"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    actions: {
      ...styles["actions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
  });
}
