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
};

/** Freeze one generated draft per selected marketplace before either execution host starts. */
export function createCrosslistingAutomationPlan({ item, listing, marketplaces }: CrosslistingAutomationInput): CrosslistingAutomationPlan {
  const selected = new Set(marketplaces);
  const jobs = CROSSLISTING_RUN_MARKETPLACES.filter((marketplace) => selected.has(marketplace)).map((marketplace) => ({
    marketplace,
    payload: createGeneratedCrosslistingPayload({ marketplace, listing, item }),
  }));
  if (!jobs.length) throw new Error('Choose at least one marketplace to list this item.');
  const savedPhotos = item.itemPhotos.length ? item.itemPhotos : item.coverPhotoId ? [item.coverPhotoId] : [];
  return {
    jobs,
    photoFileIds: [...new Set(savedPhotos.map((fileId) => fileId.trim()).filter(Boolean))],
  };
}
