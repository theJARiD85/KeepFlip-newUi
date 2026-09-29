import Head from 'expo-router/head';

import {
  KEEPFLIP_HOME_DESCRIPTION,
  KEEPFLIP_HOME_FAQS,
  KEEPFLIP_HOME_TITLE,
  KEEPFLIP_SITE_URL,
} from '@/constants/keepflip-public-site';

const KEEPFLIP_ORGANIZATION_ID = `${KEEPFLIP_SITE_URL}/#organization`;

const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': KEEPFLIP_ORGANIZATION_ID,
      name: 'KeepFlip',
      url: KEEPFLIP_SITE_URL,
      description: KEEPFLIP_HOME_DESCRIPTION,
      sameAs: [
        'https://www.facebook.com/KeepFlip.Reseller.Assistant',
        'https://www.facebook.com/theJARiD',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${KEEPFLIP_SITE_URL}/#website`,
      name: 'KeepFlip',
      url: KEEPFLIP_SITE_URL,
      publisher: { '@id': KEEPFLIP_ORGANIZATION_ID },
    },
    {
      '@type': 'WebPage',
      '@id': `${KEEPFLIP_SITE_URL}/#webpage`,
      name: KEEPFLIP_HOME_TITLE,
      description: KEEPFLIP_HOME_DESCRIPTION,
      url: KEEPFLIP_SITE_URL,
      mainEntityOfPage: KEEPFLIP_SITE_URL,
      isPartOf: { '@id': `${KEEPFLIP_SITE_URL}/#website` },
      about: { '@id': KEEPFLIP_ORGANIZATION_ID },
    },
    {
      '@type': 'FAQPage',
      '@id': `${KEEPFLIP_SITE_URL}/#questions`,
      mainEntity: KEEPFLIP_HOME_FAQS.map(({ answer, question }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
});

export function KeepFlipHomeStructuredData() {
  return (
    <Head>
      <script type="application/ld+json">{structuredData}</script>
    </Head>
  );
}
