import { APPWRITE, tablesDB } from '@/lib/appwrite';
import { CROSSLISTING_DESTINATIONS, type CrosslistingMarketplace } from '@/services/crosslisting-service';
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
      !isRecord(listing.priceRange) || typeof listing.priceRange.targetPrice !== 'number' ||
      !Number.isFinite(listing.priceRange.targetPrice) || !isRecord(listing.marketplaceListings) ||
      !isRecord(listing.platformCopy) || !Array.isArray(listing.warnings)) return null;
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
  const item = await getInventoryItem(ownerId, itemId);
  const serialized = JSON.stringify({ ...draft, savedAt: new Date().toISOString() });
  if (serialized.length > 500_000) throw new Error('This listing draft is too large to save.');
  const targetPrice = draft.listing.priceRange.targetPrice;
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new Error('Enter a valid target price before saving this listing.');
  const savedTargetPrice = Number(item.itemSpecifics.target_listing_price?.replace(/[$,]/g, ''));
  const data: Record<string, string> = {
    listingJson: serialized,
    updatedAt: new Date().toISOString(),
  };
  if (savedTargetPrice !== targetPrice) {
    data.itemSpecificsJson = JSON.stringify({
      ...item.itemSpecifics,
      target_listing_price: String(targetPrice),
    });
  }
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data,
  });
}

function confirmedListingUrl(marketplace: CrosslistingMarketplace, value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = new URL(value);
    const allowedHost = new URL(CROSSLISTING_DESTINATIONS[marketplace].origin).hostname.replace(/^www\./, '');
    if (candidate.protocol !== 'https:' || candidate.hostname !== allowedHost &&
      !candidate.hostname.endsWith(`.${allowedHost}`)) return undefined;
    if (candidate.pathname === '/' || /\/(login|signin|sign-in|sell|create)(\/|$)/i.test(candidate.pathname)) return undefined;
    candidate.search = '';
    candidate.hash = '';
    return candidate.toString();
  } catch { return undefined; }
}

export async function confirmMarketplaceListing(ownerId: string, itemId: string, marketplace: CrosslistingMarketplace, externalUrl?: string): Promise<void> {
  const item = await getInventoryItem(ownerId, itemId);
  const draft = parseSavedListingDraft(item.listingJson);
  if (!draft) throw new Error('Save a generated listing before marking a marketplace as listed.');
  const now = new Date().toISOString();
  const updated: SavedListingDraft = {
    ...draft,
    confirmedMarketplaces: {
      ...draft.confirmedMarketplaces,
      [marketplace]: { confirmedAt: now, externalUrl: confirmedListingUrl(marketplace, externalUrl) },
    },
  };
  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: { listingJson: JSON.stringify({ ...updated, savedAt: now }), isListed: true, listedAt: item.listedAt ?? now, resaleStatus: 'listed', updatedAt: now },
  });
}
