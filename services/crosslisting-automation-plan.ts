import type { InventoryItem } from '@/services/inventory-service';
import type { ListingGeneratorResult } from '@/services/listingService';
import {
  createGeneratedCrosslistingPayload,
  type CrosslistingMarketplace,
  type CrosslistingPayload,
} from '@/services/crosslisting-service';

export const CROSSLISTING_RUN_MARKETPLACES: readonly CrosslistingMarketplace[] = [
  'depop', 'poshmark', 'mercari', 'facebookMarketplace', 'offerUp',
];

export type CrosslistingAutomationPlan = {
  jobs: { marketplace: CrosslistingMarketplace; payload: CrosslistingPayload }[];
  photoFileIds: string[];
};

export type CrosslistingAutomationInput = {
  item: InventoryItem;
  listing: ListingGeneratorResult['listing'];
  marketplaces: readonly CrosslistingMarketplace[];
  sellerPaysShipping?: boolean;
  facebookMinimumOfferPrice?: number | null;
};

/** Freeze one generated draft per selected marketplace before either execution host starts. */
export function createCrosslistingAutomationPlan({ item, listing, marketplaces, sellerPaysShipping, facebookMinimumOfferPrice }: CrosslistingAutomationInput): CrosslistingAutomationPlan {
  const selected = new Set(marketplaces);
  const facebookPrice = listing.marketplaceListings.facebookMarketplace.price;
  if (selected.has('facebookMarketplace') && facebookMinimumOfferPrice != null &&
    (!Number.isFinite(facebookPrice) || facebookPrice <= 0 || !Number.isFinite(facebookMinimumOfferPrice) ||
      facebookMinimumOfferPrice < facebookPrice / 2 ||
      facebookMinimumOfferPrice >= facebookPrice)) {
    throw new Error('The minimum Facebook offer must be at least half the listing price and below the listing price.');
  }
  const jobs = CROSSLISTING_RUN_MARKETPLACES.filter((marketplace) => selected.has(marketplace)).map((marketplace) => {
    const payload = createGeneratedCrosslistingPayload({ marketplace, listing, item });
    if (marketplace === 'facebookMarketplace' && sellerPaysShipping !== undefined) {
      payload.platformFields.sellerPaysShipping = String(sellerPaysShipping);
    }
    if (marketplace === 'facebookMarketplace') {
      payload.platformFields.allowOffers = String(facebookMinimumOfferPrice != null);
      if (facebookMinimumOfferPrice != null) payload.platformFields.minimumOfferPrice = String(facebookMinimumOfferPrice);
    }
    return { marketplace, payload };
  });
  if (!jobs.length) throw new Error('Choose at least one marketplace to list this item.');
  const savedPhotos = item.itemPhotos.length ? item.itemPhotos : item.coverPhotoId ? [item.coverPhotoId] : [];
  return {
    jobs,
    photoFileIds: [...new Set(savedPhotos.map((fileId) => fileId.trim()).filter(Boolean))],
  };
}
