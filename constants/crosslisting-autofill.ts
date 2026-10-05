/**
 * Keep the assisted marketplace autofill flow out of regular app builds.
 * Enable it only in a dedicated crosslisting build profile.
 */
export const CROSSLISTING_AUTOFILL_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_CROSSLISTING_AUTOFILL === 'true';
