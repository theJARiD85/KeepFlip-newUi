/**
 * The lab is an opt-in build feature. The production, preview, and development
 * profiles leave it disabled; only the dedicated EAS profile enables it.
 */
export const CROSSLISTING_LAB_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_CROSSLISTING_LAB === 'true';
