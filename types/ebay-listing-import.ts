export type EbayListingImportCandidate = {
  sourceRecordKey: string;
  listingId: string | null;
  offerId: string;
  sku: string;
  title: string;
  status: string;
  listingUrl: string | null;
  currentPriceCents: number | null;
  currency: string | null;
  quantityAvailable: number;
  marketplaceId: string;
  categoryId: string | null;
  condition: string | null;
  imageUrls: string[];
  lastSyncedAt: string;
};

export type EbayListingImportResult = {
  ok: true;
  schemaVersion: 1;
  environment: 'sandbox' | 'production';
  marketplaceId: string;
  candidates: EbayListingImportCandidate[];
  total: number;
  offset: number;
  nextOffset: number | null;
  truncated: boolean;
  coverage: 'ebay_inventory_api';
  legacyListingsMayRequireMigration: boolean;
  warnings: { sku: string; message: string; code: string }[];
  syncedAt: string;
};
