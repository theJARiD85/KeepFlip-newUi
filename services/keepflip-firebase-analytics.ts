/**
 * Resolution fallback for tools that do not understand Expo's .web/.native
 * platform extensions. Expo selects the platform-specific implementation at
 * runtime; this fallback intentionally collects nothing.
 */
export async function initializeKeepFlipFirebaseAnalytics() {
  return null;
}

export async function trackKeepFlipFirebaseWebScreen(_pathname: string) {
  return undefined;
}
