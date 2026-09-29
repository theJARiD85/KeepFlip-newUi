import { StyleSheet, View } from 'react-native';

import {
  WebActionLink,
  WebContentSection,
  WebCopy,
  WebInfoCard,
  WebMarketingPage,
  WebTextLink,
} from '@/components/web/web-public-page';
import { KEEPFLIP_GOOGLE_PLAY_URL, KEEPFLIP_SITE_URL } from '@/constants/keepflip-public-site';

const metadata = {
  canonicalPath: '/changelog',
  description:
    'Read the dated KeepFlip release record. The latest public Google Play listing is version 2.1.7, updated September 26, 2026.',
  title: 'KeepFlip changelog | Product updates',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'KeepFlip changelog',
    url: `${KEEPFLIP_SITE_URL}/changelog`,
  },
} as const;

export default function ChangelogPage() {
  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="DATED PRODUCT UPDATES"
      title="KeepFlip changelog."
      intro="A public update log for resellers who want to know when KeepFlip changes."
    >
      <WebContentSection title="Latest public app update.">
        <View style={styles.card}>
          <WebInfoCard title="Version 2.1.7 · September 26, 2026">
            <WebCopy>
              Google Play lists version 2.1.7 as the current release and shows September 26, 2026 as its last update date.
            </WebCopy>
            <WebTextLink href={KEEPFLIP_GOOGLE_PLAY_URL} label="Check the live Google Play listing" />
          </WebInfoCard>
        </View>
      </WebContentSection>

      <WebContentSection eyebrow="RELEASE NOTES" title="Detailed notes are not published yet.">
        <WebCopy>
          The public store listing confirms the version and date, but does not provide enough verified detail for a change-by-change note here. Detailed release notes will be added after they are confirmed.
        </WebCopy>
      </WebContentSection>

      <WebActionLink href="/pricing" label="See plan prices" />
    </WebMarketingPage>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', maxWidth: 570, width: '100%' },
});
