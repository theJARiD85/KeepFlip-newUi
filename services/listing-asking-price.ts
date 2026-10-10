import type { ListingGeneratorResult } from '@/services/listingService';

type Listing = ListingGeneratorResult['listing'];

const ASKING_PRICE_PREFIX = String.raw`(?:priced\s+at|listed\s+(?:at|for)|listing\s+price(?:\s+is)?|asking(?:\s+price)?(?:\s+(?:is|of|at|for))?|price(?:\s+is)?|selling\s+for|offered\s+(?:at|for)|available\s+for|buy\s+it\s+now(?:\s+for)?)\s*[:\-]?\s*`;
const MONEY_AMOUNT = String.raw`(?:(?:US|CA|AU)?\$\s*|USD\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:USD|dollars))?`;
const ASKING_PRICE_CLAIM = new RegExp(String.raw`\b(${ASKING_PRICE_PREFIX})(${MONEY_AMOUNT})(?![\w%])`, 'gi');
const HISTORICAL_PRICE_PREFIX = /\b(?:original|originally|retail|msrp|previous|previously|former|formerly|purchase|paid|was)\s+$/i;

function formattedAskingPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
}

function alignAskingPriceText(value: string, price: number, currency: string): string {
  const formattedPrice = formattedAskingPrice(price, currency);
  return value.replace(ASKING_PRICE_CLAIM, (match, prefix: string, _amount: string, offset: number, text: string) => {
    const precedingText = text.slice(Math.max(0, offset - 40), offset);
    return HISTORICAL_PRICE_PREFIX.test(precedingText)
      ? match
      : prefix + formattedPrice;
  });
}

export function listingWithTargetPrice(listing: Listing, amount: number, currency = 'USD'): Listing {
  const align = (value: string) => alignAskingPriceText(value, amount, currency);
  const updatePlatform = <T extends { title: string; description: string; price: number }>(
    draft: T,
    description: string,
  ): T => ({
    ...draft,
    title: align(draft.title),
    description: align(description),
    price: amount,
  });
  const marketplaceListings = {
    facebookMarketplace: updatePlatform(listing.marketplaceListings.facebookMarketplace, listing.platformCopy.facebookMarketplace),
    ebay: {
      ...updatePlatform(listing.marketplaceListings.ebay, listing.platformCopy.ebay),
      subtitle: align(listing.marketplaceListings.ebay.subtitle),
    },
    offerUp: updatePlatform(listing.marketplaceListings.offerUp, listing.platformCopy.offerUp),
    depop: updatePlatform(listing.marketplaceListings.depop, listing.platformCopy.depop),
    poshmark: updatePlatform(listing.marketplaceListings.poshmark, listing.platformCopy.poshmark),
    mercari: updatePlatform(listing.marketplaceListings.mercari, listing.platformCopy.mercari),
  };
  return {
    ...listing,
    title: align(listing.title),
    subtitle: align(listing.subtitle),
    description: align(listing.description),
    shortDescription: align(listing.shortDescription),
    conditionDisclosure: align(listing.conditionDisclosure),
    keySellingPoints: listing.keySellingPoints.map(align),
    photoChecklist: listing.photoChecklist.map(align),
    suggestedTags: listing.suggestedTags.map(align),
    warnings: listing.warnings.map(align),
    priceRange: { quickSale: amount, targetPrice: amount, highAsk: amount },
    marketplaceListings,
    platformCopy: {
      facebookMarketplace: marketplaceListings.facebookMarketplace.description,
      ebay: marketplaceListings.ebay.description,
      offerUp: marketplaceListings.offerUp.description,
      depop: marketplaceListings.depop.description,
      poshmark: marketplaceListings.poshmark.description,
      mercari: marketplaceListings.mercari.description,
    },
  };
}
