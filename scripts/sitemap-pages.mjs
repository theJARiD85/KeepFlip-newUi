export const SITE_ORIGIN = 'https://keepflip-bea17.web.app';

// These are the public, non-authenticated pages with maintained editorial
// content. App routes and onboarding flows are intentionally not indexable.
export const SITEMAP_PAGES = [
  {
    path: '/',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/(onboarding)/welcome.web.tsx',
      'components/web/web-onboarding-screen.tsx',
    ],
  },
  {
    path: '/privacy',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/privacy.tsx',
      'components/legal/legal-document-screen.tsx',
    ],
  },
  {
    path: '/terms',
    sourceFiles: [
      'app/_layout.web.tsx',
      'app/terms.tsx',
      'components/legal/legal-document-screen.tsx',
    ],
  },
];
