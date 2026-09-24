import Head from 'expo-router/head';

const SITE_ORIGIN = 'https://keepflip-bea17.web.app';
const SOCIAL_IMAGE = `${SITE_ORIGIN}/og/keepflip-share.png`;

type SiteMetadataProps = {
  description: string;
  path: string;
  title: string;
};

const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'KeepFlip',
  url: SITE_ORIGIN,
  logo: SOCIAL_IMAGE,
  email: 'support@keep-flip.com',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@keep-flip.com',
    url: `${SITE_ORIGIN}/contact`,
  },
};

const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KeepFlip',
  url: SITE_ORIGIN,
};

// TODO(same-as): Add only verified, KeepFlip-owned company profile URLs.

export function SiteMetadata({ description, path, title }: SiteMetadataProps) {
  const pageUrl = `${SITE_ORIGIN}${path}`;
  const structuredData = JSON.stringify([ORGANIZATION_SCHEMA, WEBSITE_SCHEMA]);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="KeepFlip" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:image" content={SOCIAL_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="KeepFlip resale research and inventory tools" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE} />
      <script type="application/ld+json">{structuredData}</script>
    </Head>
  );
}
