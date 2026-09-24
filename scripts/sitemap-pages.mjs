export const SITE_ORIGIN = 'https://keepflip-bea17.web.app';

// These are the public, non-authenticated pages with maintained editorial
// content. App routes and onboarding flows are intentionally not indexable.
export const SITEMAP_PAGES = [
  {
    path: '/',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/index.web.tsx',
      'components/web/web-onboarding-screen.tsx',
      'components/web/site-metadata.tsx',
      'components/web/public-site-footer.tsx',
      'public/og/keepflip-share.png',
    ],
  },
  {
    path: '/about',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/about.tsx',
      'app/about.web.tsx',
      'components/web/about-page-content.tsx',
      'components/web/public-info-page.tsx',
      'components/web/site-metadata.tsx',
      'components/web/public-site-footer.tsx',
      'public/og/keepflip-share.png',
    ],
  },
  {
    path: '/contact',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/contact.tsx',
      'app/contact.web.tsx',
      'components/web/contact-page-content.tsx',
      'components/web/public-info-page.tsx',
      'components/web/site-metadata.tsx',
      'components/web/public-site-footer.tsx',
      'public/og/keepflip-share.png',
    ],
  },
  {
    path: '/privacy',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/privacy.tsx',
      'app/privacy.web.tsx',
      'components/legal/privacy-policy-page.tsx',
      'components/legal/legal-document-screen.tsx',
      'components/web/site-metadata.tsx',
      'components/web/public-site-footer.tsx',
      'public/og/keepflip-share.png',
    ],
  },
  {
    path: '/terms',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/terms.tsx',
      'app/terms.web.tsx',
      'components/legal/terms-of-service-page.tsx',
      'components/legal/legal-document-screen.tsx',
      'components/web/site-metadata.tsx',
      'components/web/public-site-footer.tsx',
      'public/og/keepflip-share.png',
    ],
  },
];
