/**
 * Browser-only Firebase Analytics is resolved from
 * keepflip-firebase-analytics.web.ts. Keep native bundles free of the Firebase
 * JavaScript SDK while allowing the shared root layout to call the same API.
 */
export async function initializeKeepFlipFirebaseAnalytics() {
  return null;
}

export async function trackKeepFlipFirebaseWebScreen(_pathname: string) {
  return undefined;
}
