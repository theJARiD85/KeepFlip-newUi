import { ExecutionMethod, functions, APPWRITE } from '@/lib/appwrite';
import type {
  EbayListingImportCandidate,
  EbayListingImportResult,
} from '@/types/ebay-listing-import';
import type { EbayOAuthEnvironment } from '@/services/ebayConnectionService';

function parsePayload(body: string | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function errorFromExecution(execution: { responseBody?: string; responseStatusCode?: number }, fallback: string) {
  const payload = parsePayload(execution.responseBody);
  return new Error(
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : fallback,
  );
}

function parseCandidate(value: unknown): EbayListingImportCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sourceRecordKey !== 'string' ||
    typeof candidate.offerId !== 'string' ||
    typeof candidate.sku !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.status !== 'string' ||
    typeof candidate.marketplaceId !== 'string' ||
    typeof candidate.lastSyncedAt !== 'string'
  ) {
    return null;
  }
  return {
    sourceRecordKey: candidate.sourceRecordKey,
    listingId: typeof candidate.listingId === 'string' ? candidate.listingId : null,
    offerId: candidate.offerId,
    sku: candidate.sku,
    title: candidate.title,
    status: candidate.status,
    listingUrl: typeof candidate.listingUrl === 'string' ? candidate.listingUrl : null,
    currentPriceCents:
      Number.isSafeInteger(candidate.currentPriceCents) && Number(candidate.currentPriceCents) >= 0
        ? Number(candidate.currentPriceCents)
        : null,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
    quantityAvailable:
      Number.isSafeInteger(candidate.quantityAvailable) && Number(candidate.quantityAvailable) >= 0
        ? Number(candidate.quantityAvailable)
        : 0,
    marketplaceId: candidate.marketplaceId,
    categoryId: typeof candidate.categoryId === 'string' ? candidate.categoryId : null,
    condition: typeof candidate.condition === 'string' ? candidate.condition : null,
    imageUrls: Array.isArray(candidate.imageUrls)
      ? candidate.imageUrls.filter((entry): entry is string => typeof entry === 'string')
      : [],
    lastSyncedAt: candidate.lastSyncedAt,
  };
}

export async function fetchEbayListingImportCandidates(
  environment: EbayOAuthEnvironment,
  options: { marketplaceId?: string; offset?: number; limit?: number } = {},
): Promise<EbayListingImportResult> {
  if (!APPWRITE.ebayOauthFunctionId) {
    throw new Error('Connect the eBay seller backend before importing listings.');
  }

  const execution = await functions.createExecution({
    functionId: APPWRITE.ebayOauthFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    xpath: '/listing/import',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      environment,
      marketplaceId: options.marketplaceId || 'EBAY_US',
      offset: options.offset || 0,
      limit: options.limit || 25,
    }),
  });
  const payload = parsePayload(execution.responseBody);
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || payload.ok !== true) {
    throw errorFromExecution(execution, 'KeepFlip could not import eBay listings.');
  }

  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.map(parseCandidate).filter((value): value is EbayListingImportCandidate => Boolean(value))
    : [];
  if (
    (payload.schemaVersion !== 1 && payload.schemaVersion !== undefined) ||
    typeof payload.environment !== 'string' ||
    typeof payload.marketplaceId !== 'string'
  ) {
    throw new Error('KeepFlip received an invalid eBay listing import response.');
  }

  return {
    ok: true,
    schemaVersion: 1,
    environment: payload.environment === 'sandbox' ? 'sandbox' : 'production',
    marketplaceId: payload.marketplaceId,
    candidates,
    total: Number.isSafeInteger(payload.total) ? Number(payload.total) : candidates.length,
    offset: Number.isSafeInteger(payload.offset) ? Number(payload.offset) : 0,
    nextOffset: Number.isSafeInteger(payload.nextOffset) ? Number(payload.nextOffset) : null,
    truncated: payload.truncated === true,
    coverage: 'ebay_inventory_api',
    legacyListingsMayRequireMigration: payload.legacyListingsMayRequireMigration !== false,
    warnings: Array.isArray(payload.warnings)
      ? payload.warnings.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
          const warning = entry as Record<string, unknown>;
          return typeof warning.sku === 'string' && typeof warning.message === 'string' && typeof warning.code === 'string'
            ? [{ sku: warning.sku, message: warning.message, code: warning.code }]
            : [];
        })
      : [],
    syncedAt: typeof payload.syncedAt === 'string' ? payload.syncedAt : new Date().toISOString(),
  };
}

export async function linkImportedEbayListing({
  environment,
  itemId,
  candidate,
}: {
  environment: EbayOAuthEnvironment;
  itemId: string;
  candidate: EbayListingImportCandidate;
}) {
  if (!APPWRITE.ebayOauthFunctionId) {
    throw new Error('Connect the eBay seller backend before linking listings.');
  }

  const execution = await functions.createExecution({
    functionId: APPWRITE.ebayOauthFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    xpath: '/listing/import/link',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      environment,
      itemId,
      listingId: candidate.listingId,
      offerId: candidate.offerId,
      sku: candidate.sku,
    }),
  });
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    throw errorFromExecution(execution, 'KeepFlip could not link the imported eBay listing.');
  }
}
