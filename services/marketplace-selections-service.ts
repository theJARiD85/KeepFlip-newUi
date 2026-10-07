import { APPWRITE, tablesDB } from '@/lib/appwrite';
import { normalizeMarketplaceSelections } from '@/lib/listing-marketplaces';
import { ensureUserProfile } from '@/services/user-profile-onboarding-service';
import type { ListingPlatform } from '@/services/listingService';

export async function getMarketplaceSelections(userId: string, displayName?: string | null) {
  const row = await ensureUserProfile({ userId, displayName });
  return normalizeMarketplaceSelections(row.marketplaceSelections);
}

export async function saveMarketplaceSelections(userId: string, selections: readonly ListingPlatform[], displayName?: string | null) {
  const normalized = normalizeMarketplaceSelections(selections);
  const row = await ensureUserProfile({ userId, displayName });
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.userProfilesTableId,
    rowId: row.$id,
    data: { marketplaceSelections: normalized, updatedAt: new Date().toISOString() },
  });
  return normalized;
}
