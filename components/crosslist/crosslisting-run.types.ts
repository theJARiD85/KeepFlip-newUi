import type { InventoryItem } from '@/services/inventory-service';
import type { ListingGeneratorResult, ListingPlatform } from '@/services/listingService';
import type { CrosslistingMarketplace } from '@/services/crosslisting-service';

export type CrosslistingRunProps = {
  item: InventoryItem;
  listing: ListingGeneratorResult['listing'];
  userId: string;
  onDraftPrepared?: (marketplace: CrosslistingMarketplace) => void;
  onListingConfirmed?: (marketplace: CrosslistingMarketplace) => void;
  onBeforeStart?: () => Promise<boolean>;
  initialSelections?: ListingPlatform[];
};
