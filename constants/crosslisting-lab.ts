/**
 * The Listing workspace uses the existing route group. EAS build profiles
 * enable it; Appwrite Sites needs the same public build flag.
 */
export const CROSSLISTING_LAB_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_CROSSLISTING_LAB === 'true';
