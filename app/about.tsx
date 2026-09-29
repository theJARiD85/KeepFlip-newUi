import { StyleSheet, View } from 'react-native';

import {
  WebActionLink,
  WebContentSection,
  WebCopy,
  WebInfoCard,
  WebMarketingPage,
  WebTextLink,
} from '@/components/web/web-public-page';
import { KEEPFLIP_SITE_URL } from '@/constants/keepflip-public-site';

const metadata = {
  canonicalPath: '/about',
  description:
    'KeepFlip is for solo resellers who source in person and sell on eBay. Learn what it helps with and who publishes the app.',
  title: 'About KeepFlip | Tools for solo resellers',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About KeepFlip',
    url: `${KEEPFLIP_SITE_URL}/about`,
    mainEntity: { '@id': `${KEEPFLIP_SITE_URL}/#organization` },
  },
} as const;

export default function AboutPage() {
  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="ABOUT KEEPFLIP"
      title="Made for the solo reseller doing the whole flip."
      intro="KeepFlip helps one-person resale businesses research a buy, keep the item and its costs straight, and see what remained after the sale."
    >
      <WebContentSection title="Who KeepFlip is for.">
        <WebCopy>
          KeepFlip is built for solo flippers who source in person and sell on eBay. It brings item research, buy decisions, inventory details, and recorded sale costs closer together.
        </WebCopy>
        <WebCopy>
          If you crosslist to five marketplaces, KeepFlip is not that tool yet. See the current scope on the <WebTextLink href="/features" label="How it works page" />.
        </WebCopy>
      </WebContentSection>

      <WebContentSection eyebrow="PUBLISHER" title="A real name to start with.">
        <View style={styles.cardGrid}>
          <WebInfoCard title="Published by Jarid & Found">
            <WebCopy>
              Google Play lists Jarid &amp; Found as KeepFlip&apos;s app publisher. KeepFlip also maintains a public Facebook page.
            </WebCopy>
            <WebTextLink
              href="https://play.google.com/store/apps/details?id=com.keepflip.app"
              label="See the publisher on Google Play"
            />
            <WebTextLink
              href="https://www.facebook.com/KeepFlip.Reseller.Assistant"
              label="KeepFlip on Facebook"
            />
          </WebInfoCard>
          <WebInfoCard title="Founder details">
            <WebCopy>
              The founder&apos;s full name, photo, and personal story have not been supplied for this page. We will add them after they are confirmed.
            </WebCopy>
            <WebTextLink href="https://www.facebook.com/theJARiD" label="Existing publisher profile" />
          </WebInfoCard>
        </View>
      </WebContentSection>

      <View style={styles.actions}>
        <WebActionLink href="/pricing" label="See plan prices" />
        <WebActionLink href="/features" label="How KeepFlip works" secondary />
      </View>
    </WebMarketingPage>
  );
}

const styles = StyleSheet.create({
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
