const MARKETPLACE_BRAND_PATTERN = /e[\s_-]?bay/gi;

/**
 * Keeps third-party provider names out of customer-facing market copy while
 * preserving the underlying research data and its source metadata.
 */
export function neutralizeMarketplaceBrand(value: string) {
  return value.replace(MARKETPLACE_BRAND_PATTERN, "marketplace");
}
