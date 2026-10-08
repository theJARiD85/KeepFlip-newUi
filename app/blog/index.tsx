import { StyleSheet, View } from 'react-native';

import { WebActionLink, WebContentSection, WebCopy, WebInfoCard, WebMarketingPage } from '@/components/web/web-public-page';
import { FIRST_BLOG_POST } from '@/constants/keepflip-blog';
import { KEEPFLIP_SITE_URL } from '@/constants/keepflip-public-site';

const metadata = {
  canonicalPath: '/blog',
  description: 'Reseller guides from KeepFlip on researching a buy, counting costs, and learning from each sale.',
  title: 'Reseller blog | KeepFlip',
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'KeepFlip reseller blog',
    url: `${KEEPFLIP_SITE_URL}/blog`,
  },
} as const;

export default function BlogIndexPage() {
  return (
    <WebMarketingPage
      metadata={metadata}
      eyebrow="RESELLER BLOG"
      title="Make the next buy with better numbers."
      intro="Practical guides for researching items, checking costs, and learning what your sales actually earned."
    >
      <WebContentSection title="Latest article">
        <View style={styles.articleCard}>
          <WebInfoCard title={FIRST_BLOG_POST.headline}>
            <WebCopy>By {FIRST_BLOG_POST.author} · Updated {FIRST_BLOG_POST.updated}</WebCopy>
            <WebCopy>{FIRST_BLOG_POST.description}</WebCopy>
            <View style={styles.action}>
              <WebActionLink href={FIRST_BLOG_POST.path} label="Read the article" />
            </View>
          </WebInfoCard>
        </View>
      </WebContentSection>
    </WebMarketingPage>
  );
}

const styles = StyleSheet.create({
  articleCard: { maxWidth: 760, width: '100%' },
  action: { alignItems: 'flex-start', marginTop: 8 },
});
