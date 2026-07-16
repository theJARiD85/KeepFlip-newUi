import {
  APPWRITE,
  tablesDB,
} from "../lib/appwrite";
import type { MarketplaceListingStatus } from "./marketplaceService";

export async function updateMarketplaceListingStatus(
  listingId: string,
  status: MarketplaceListingStatus
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.marketplaceListingsTableId,
    rowId: listingId,
    data: {
      status,
      updatedAt: new Date().toISOString(),
    },
  });
}
