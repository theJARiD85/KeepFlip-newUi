import Head from 'expo-router/head';

const KEEPFLIP_SITE_URL = 'https://app.keep-flip.com';
const KEEPFLIP_HOME_TITLE = 'KeepFlip';
const KEEPFLIP_ORGANIZATION_ID = `${KEEPFLIP_SITE_URL}/#organization`;

// Keep this list limited to verified company profiles. Add the URLs when they
// are confirmed instead of publishing personal or unrelated accounts.
const KEEPFLIP_ORGANIZATION_SAME_AS: readonly string[] = [];

type StructuredDataNode = Record<string, unknown>;

const organization: StructuredDataNode = {
  '@type': 'Organization',
  '@id': KEEPFLIP_ORGANIZATION_ID,
  name: KEEPFLIP_HOME_TITLE,
  url: KEEPFLIP_SITE_URL,
  description: 'The reseller command center for sourcing, inventory, listings, and real profit.',
};

if (KEEPFLIP_ORGANIZATION_SAME_AS.length > 0) {
  organization.sameAs = [...KEEPFLIP_ORGANIZATION_SAME_AS];
}

const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    {
      '@type': 'WebSite',
      '@id': `${KEEPFLIP_SITE_URL}/#website`,
      name: KEEPFLIP_HOME_TITLE,
      url: KEEPFLIP_SITE_URL,
      publisher: { '@id': KEEPFLIP_ORGANIZATION_ID },
    },
    {
      '@type': 'WebPage',
      '@id': `${KEEPFLIP_SITE_URL}/#webpage`,
      headline: KEEPFLIP_HOME_TITLE,
      name: KEEPFLIP_HOME_TITLE,
      url: KEEPFLIP_SITE_URL,
      mainEntityOfPage: KEEPFLIP_SITE_URL,
      isPartOf: { '@id': `${KEEPFLIP_SITE_URL}/#website` },
      about: { '@id': KEEPFLIP_ORGANIZATION_ID },
    },
  ],
});

export function KeepFlipHomeStructuredData() {
  return (
    <Head>
      <title>{KEEPFLIP_HOME_TITLE}</title>
      <script type="application/ld+json">{structuredData}</script>
    </Head>
  );
}
