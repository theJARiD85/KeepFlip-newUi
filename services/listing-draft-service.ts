import { APPWRITE, tablesDB } from '@/lib/appwrite';
import { getInventoryItem } from '@/services/inventory-service';
import type { ListingGeneratorResult, ListingPlatform, ListingReadiness } from '@/services/listingService';

export type SavedListingDraft = {
  schemaVersion: 1;
  generatedAt: string;
  savedAt: string;
  confidence: number | null;
  readiness: ListingReadiness | null;
  listing: ListingGeneratorResult['listing'];
  confirmedMarketplaces: Partial<Record<ListingPlatform, { confirmedAt: string; externalUrl?: string }>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseSavedListingDraft(value: unknown): SavedListingDraft | null {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.listing)) return null;
    const listing = parsed.listing;
    if (typeof listing.title !== 'string' || typeof listing.description !== 'string' ||
      !isRecord(listing.priceRange) || !isRecord(listing.marketplaceListings) || !isRecord(listing.platformCopy)) return null;
    return {
      schemaVersion: 1,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      readiness: isRecord(parsed.readiness) ? parsed.readiness as ListingReadiness : null,
      listing: listing as SavedListingDraft['listing'],
      confirmedMarketplaces: isRecord(parsed.confirmedMarketplaces)
        ? parsed.confirmedMarketplaces as SavedListingDraft['confirmedMarketplaces'] : {},
    };
  } catch {
    return null;
  }
}

export async function saveListingDraft(ownerId: string, itemId: string, draft: SavedListingDraft): Promise<void> {
  await getInventoryItem(ownerId, itemId);
  const serialized = JSON.stringify({ ...draft, savedAt: new Date().toISOString() });
  if (serialized.length > 500_000) throw new Error('This listing draft is too large to save.');
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: { listingJson: serialized, updatedAt: new Date().toISOString() },
  });
}

export async function confirmMarketplaceListing(ownerId: string, itemId: string, marketplace: ListingPlatform): Promise<void> {
  const item = await getInventoryItem(ownerId, itemId);
  const draft = parseSavedListingDraft(item.listingJson);
  if (!draft) throw new Error('Save a generated listing before marking a marketplace as listed.');
  const now = new Date().toISOString();
  const updated: SavedListingDraft = {
    ...draft,
    confirmedMarketplaces: {
      ...draft.confirmedMarketplaces,
      [marketplace]: { confirmedAt: now },
    },
  };
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: { listingJson: JSON.stringify({ ...updated, savedAt: now }), isListed: true, listedAt: item.listedAt ?? now, resaleStatus: 'listed', updatedAt: now },
  });
}
