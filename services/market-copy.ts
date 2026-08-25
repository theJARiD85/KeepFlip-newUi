const MARKETPLACE_BRAND_PATTERN = /e[\s_-]?bay/gi;
const KEEPFLIP_AI_MODE_PATTERN = /\bkeepflip\s+ai\s+mode\b/gi;
const MARKET_PROVIDER_BRAND_PATTERN =
  /\b(?:serpapi(?:\s+(?:google\s+)?ai(?:\s+mode)?)?|google\s+ai(?:\s+mode)?|ai\s+mode)\b/gi;

/**
 * Keeps third-party marketplace and market-research provider names out of
 * customer-facing market copy while
 * preserving the underlying research data and its source metadata.
 */
export function neutralizeMarketProviderBrand(value: string) {
  return value
    .replace(KEEPFLIP_AI_MODE_PATTERN, "KeepFlip AI")
    .replace(MARKET_PROVIDER_BRAND_PATTERN, "KeepFlip AI");
}

export function neutralizeMarketplaceBrand(value: string) {
  return neutralizeMarketProviderBrand(
    value.replace(MARKETPLACE_BRAND_PATTERN, "marketplace"),
  );
}
