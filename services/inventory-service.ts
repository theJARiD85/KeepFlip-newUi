import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  storage,
  tablesDB,
} from '@/lib/appwrite';
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  type ItemAnalysisSuccess,
  type ItemMarketFlipComplexity,
  type ItemMarketFlipDecision,
  type ItemMarketResaleVelocity,
} from '@/types/item-analysis';
import type { EbayListingImportCandidate } from '@/types/ebay-listing-import';
import { trackTenjinEvent } from '@/services/tenjin-attribution-service';

const ANALYSIS_SNAPSHOT_COLUMN = 'analysisSnapshotJson';
const INVENTORY_RESELLER_COLUMNS = [
  'acquisitionCostCents',
  'flipDecision',
  'flipVerdict',
  'resaleVelocity',
  'resaleTypicalDays',
  'flipComplexity',
  'flipDecisionConfidence',
] as const;
const INVENTORY_ITEM_DETAILS_COLUMNS = [
  'quantityPurchased',
  'quantityOnHand',
  'inventoryCostCentsOnHand',
  'purchaseSource',
  'sku',
  'storageLocation',
  'receiptFileId',
  'purchaseNotes',
  'variant',
  'color',
  'era',
  'itemSpecificsJson',
] as const;
const ANALYSIS_SNAPSHOT_SCHEMA_VERSION = 1 as const;
const MAX_ANALYSIS_SNAPSHOT_CHARACTERS = 500_000;
const MAX_ITEM_QUANTITY = 100_000;
const MAX_INVENTORY_NUMBER_CENTS = 2_147_483_647;

const INVENTORY_LIST_COLUMNS = [
  'title',
  'brand',
  'model',
  'category',
  'condition',
  'description',
  'status',
  'estimatedValueCents',
  'aiConfidence',
  'acquisitionCostCents',
  'quantityPurchased',
  'quantityOnHand',
  'inventoryCostCentsOnHand',
  'flipDecision',
  'flipVerdict',
  'resaleVelocity',
  'resaleTypicalDays',
  'flipComplexity',
  'flipDecisionConfidence',
  'coverPhotoId',
  'modelFile',
  'photoCount',
  'itemPhotos',
  'sku',
  'storageLocation',
  'isListed',
  'resaleStatus',
  'ebaySku',
  'ebayOfferId',
  'ebayListingId',
  'listedAt',
  'acquiredAt',
  'createdAt',
] as const;

type PersistedAnalysisSnapshot = {
  schemaVersion: typeof ANALYSIS_SNAPSHOT_SCHEMA_VERSION;
  savedAt: string;
  result: ItemAnalysisSuccess;
};

export type InventoryItemStatus = 'keep' | 'flip' | 'undecided';
export type InventoryFlipDecision = ItemMarketFlipDecision['verdict'];
export type InventoryFlipVerdict = ItemMarketFlipDecision['verdict'];
export type InventoryResaleVelocity = ItemMarketResaleVelocity['demand'];
export type InventoryFlipComplexity = ItemMarketFlipComplexity['level'];
export type InventoryListSort =
  | 'newest'
  | 'resale_speed'
  | 'decision_confidence';

export const INVENTORY_NUMBER_FIELDS = [
  'acquisition_cost_cents',
  'inventory_cost_cents_on_hand',
  'estimated_value_cents',
  'quantity_purchased',
  'quantity_on_hand',
  'resale_typical_days',
] as const;

export type InventoryNumberField = (typeof INVENTORY_NUMBER_FIELDS)[number];

export type InventoryListOptions = {
  flipDecision?: InventoryFlipDecision;
  /** @deprecated Use flipDecision for new inventory filters. */
  flipVerdict?: InventoryFlipVerdict;
  resaleVelocity?: InventoryResaleVelocity;
  sort?: InventoryListSort;
};

export type InventoryItem = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  condition: string;
  conditionNotes: string;
  status: InventoryItemStatus;
  estimatedValue: number | null;
  acquisitionCost: number | null;
  /** Total original cost for the saved lot, rather than a per-unit estimate. */
  inventoryCostOnHand: number | null;
  quantityPurchased: number;
  quantityOnHand: number;
  currency: string;
  aiConfidence: number | null;
  flipDecision: InventoryFlipDecision | null;
  flipVerdict: InventoryFlipVerdict | null;
  resaleVelocity: InventoryResaleVelocity | null;
  resaleTypicalDays: number | null;
  flipComplexity: InventoryFlipComplexity | null;
  flipDecisionConfidence: number | null;
  coverPhotoId: string | null;
  modelFile: string | null;
  photoCount: number;
  itemPhotos: string[];
  variant: string | null;
  color: string | null;
  era: string | null;
  serialNumber: string | null;
  itemSpecifics: Record<string, string>;
  purchaseSource: string | null;
  sku: string | null;
  storageLocation: string | null;
  isListed: boolean;
  resaleStatus: string | null;
  listingChannel: string | null;
  externalListingId: string | null;
  externalOfferId: string | null;
  listingCurrentPrice: number | null;
  listingQuantity: number | null;
  listingLastSyncedAt: string | null;
  listingSyncStatus: string | null;
  ebaySku: string | null;
  ebayOfferId: string | null;
  ebayListingId: string | null;
  listedAt: string | null;
  receiptFileId: string | null;
  purchaseNotes: string | null;
  acquiredAt?: string | null;
  createdAt: string;
  analysisSnapshot?: ItemAnalysisSuccess | null;
};

type InventoryRow = {
  $id: string;
  $createdAt?: string;
  ownerId: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  condition?: string | null;
  description?: string | null;
  status?: string | null;
  estimatedValueCents?: number | null;
  acquisitionCostCents?: number | null;
  inventoryCostCentsOnHand?: number | null;
  quantityPurchased?: number | null;
  quantityOnHand?: number | null;
  aiConfidence?: number | null;
  flipDecision?: string | null;
  flipVerdict?: string | null;
  resaleVelocity?: string | null;
  resaleTypicalDays?: number | null;
  flipComplexity?: string | null;
  flipDecisionConfidence?: number | null;
  coverPhotoId?: string | null;
  modelFile?: string | null;
  variant?: string | null;
  color?: string | null;
  era?: string | null;
  serialNumber?: string | null;
  itemSpecificsJson?: string | null;
  purchaseSource?: string | null;
  sku?: string | null;
  storageLocation?: string | null;
  isListed?: boolean | null;
  resaleStatus?: string | null;
  ebaySku?: string | null;
  ebayOfferId?: string | null;
  ebayListingId?: string | null;
  listedAt?: string | null;
  receiptFileId?: string | null;
  purchaseNotes?: string | null;
  photoCount?: number | null;
  itemPhotos?: unknown;
  acquiredAt?: string | null;
  createdAt?: string | null;
  analysisSnapshotJson?: string | null;
};

type ItemPhotoRow = {
  $id: string;
  ownerId: string;
  scanId: string;
  itemId?: string | null;
  fileId: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type SaveAnalyzedItemInput = {
  analysis: ItemAnalysisSuccess;
  acquisitionCost?: number | null;
  acquiredAt?: string | null;
  itemSpecifics?: Record<string, string> | string | null;
  modelFile?: string | null;
  ownerId: string;
  purchaseNotes?: string | null;
  purchaseSource?: string | null;
  quantity?: number | null;
  receiptFileId?: string | null;
  scanId: string;
  sku?: string | null;
  storageLocation?: string | null;
};

export type SaveAnalyzedItemResult = {
  item: InventoryItem;
  photoWarning: string | null;
};

export type DeleteInventoryItemResult = {
  itemId: string;
  deletedPhotoCount: number;
  photoFileDeleteFailures: number;
};

export type UpdateInventoryAnalysisSnapshotInput = {
  analysis: ItemAnalysisSuccess;
  itemId: string;
  ownerId: string;
};

export type UpdateInventoryItemNumberInput = {
  field: InventoryNumberField;
  itemId: string;
  ownerId: string;
  value: number;
};

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function boundedText(
  value: string | null | undefined,
  maximumLength: number,
) {
  return cleanText(value)?.slice(0, maximumLength) || null;
}

function normalizedItemPhotos(value: unknown): string[] {
  let candidates: unknown = value;

  if (typeof value === 'string') {
    try {
      candidates = JSON.parse(value);
    } catch {
      candidates = value.split(',');
    }
  }

  if (!Array.isArray(candidates)) return [];

  return [
    ...new Set(
      candidates
        .filter((candidate): candidate is string => typeof candidate === 'string')
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizedModelFile(value: string | null | undefined) {
  const cleaned = boundedText(value, 50_000);
  if (!cleaned) return null;

  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? cleaned
      : null;
  } catch {
    return null;
  }
}

function titleFromAnalysis(result: ItemAnalysisSuccess) {
  const identity = result.analysis.identification;
  const brand = boundedText(identity.brand, 100);
  const model = boundedText(identity.model, 150);
  const itemType = boundedText(identity.itemType, 80);
  const category = boundedText(identity.category, 60);
  const identityTitleParts =
    brand && model
      ? [brand, model]
      : brand && itemType
        ? [brand, itemType]
        : model
          ? [model]
          : itemType
            ? [itemType]
            : category
              ? [category]
              : ['Scanned item'];

  return identityTitleParts
    .filter((value): value is string => Boolean(value))
    .filter(
      (value, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLowerCase() === value.toLowerCase(),
        ) === index,
    )
    .join(' ')
    .slice(0, 180);
}

function normalizedCondition(value: string | null | undefined) {
  const normalized = String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'excellent') return 'like_new';

  return ['new', 'like_new', 'good', 'fair', 'poor', 'unknown'].includes(
    normalized,
  )
    ? normalized
    : 'unknown';
}

function displayCondition(value: string | null | undefined) {
  return normalizedCondition(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedStatus(
  value: string | null | undefined,
): InventoryItemStatus {
  return value === 'keep' || value === 'flip' || value === 'undecided'
    ? value
    : 'undecided';
}

function confidencePercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

function amountFromCents(value: number | null | undefined) {
  const cents = Number(value);
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) / 100 : null;
}

function centsFromAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return cents <= 2_147_483_647 ? cents : null;
}

function savedQuantity(value: number | null | undefined, fallback = 1) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) &&
    quantity >= 0 &&
    quantity <= MAX_ITEM_QUANTITY
    ? quantity
    : fallback;
}

function purchaseQuantity(value: number | null | undefined) {
  if (value == null) return 1;
  const quantity = Number(value);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    throw new Error(
      `Quantity must be a whole number from 1 through ${MAX_ITEM_QUANTITY.toLocaleString()}.`,
    );
  }
  return quantity;
}

function itemSpecifics(value: unknown): Record<string, string> {
  let source: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      source = JSON.parse(trimmed);
    } catch {
      source = Object.fromEntries(
        trimmed
          .split(/\r?\n/)
          .map((line, index) => {
            const separator = line.indexOf(':');
            const key =
              separator > 0 ? line.slice(0, separator) : `Detail ${index + 1}`;
            const detail = separator > 0 ? line.slice(separator + 1) : line;
            return [key, detail];
          }),
      );
    }
  }
  if (!isRecord(source)) return {};

  return Object.fromEntries(
    Object.entries(source)
      .map(([key, detail]) => [
        boundedText(key, 60),
        boundedText(typeof detail === 'string' ? detail : String(detail), 240),
      ])
      .filter(
        (entry): entry is [string, string] => Boolean(entry[0] && entry[1]),
      )
      .slice(0, 24),
  );
}

function serializedItemSpecifics(value: unknown) {
  const details = itemSpecifics(value);
  return Object.keys(details).length > 0 ? JSON.stringify(details) : null;
}

function normalizedFlipVerdict(
  value: string | null | undefined,
): InventoryFlipVerdict | null {
  return value === 'flip' ||
    value === 'conditional_flip' ||
    value === 'sell_as_is' ||
    value === 'part_out' ||
    value === 'skip' ||
    value === 'unknown'
    ? value
    : null;
}

function normalizedResaleVelocity(
  value: string | null | undefined,
): InventoryResaleVelocity | null {
  return value === 'fast' ||
    value === 'moderate' ||
    value === 'slow' ||
    value === 'unknown'
    ? value
    : null;
}

function normalizedFlipComplexity(
  value: string | null | undefined,
): InventoryFlipComplexity | null {
  return value === 'easy' ||
    value === 'moderate' ||
    value === 'complex' ||
    value === 'unknown'
    ? value
    : null;
}

function normalizedResaleDays(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const days = Math.round(value);
  return days >= 0 && days <= 3_650 ? days : null;
}

function inventoryResellerSignals(analysis: ItemAnalysisSuccess) {
  const market = analysis.marketResearch;
  const flipDecision = normalizedFlipVerdict(market?.flipDecision?.verdict);
  return {
    // Keep the legacy display field and the enum field aligned. The enum is
    // the preferred filter key; flipVerdict preserves readable compatibility.
    flipDecision,
    flipVerdict: flipDecision,
    resaleVelocity: normalizedResaleVelocity(market?.marketVelocity?.demand),
    resaleTypicalDays: normalizedResaleDays(
      market?.marketVelocity?.typicalDays,
    ),
    flipComplexity: normalizedFlipComplexity(market?.flipComplexity?.level),
    flipDecisionConfidence: confidencePercent(
      market?.flipDecision?.confidencePercent,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isItemAnalysisSuccess(value: unknown): value is ItemAnalysisSuccess {
  if (!isRecord(value)) return false;
  if (
    value.ok !== true ||
    value.contractVersion !== ITEM_ANALYSIS_CONTRACT_VERSION ||
    typeof value.version !== 'string' ||
    (value.status !== 'identified' && value.status !== 'insufficient_evidence') ||
    !isRecord(value.input) ||
    !isRecord(value.analysis) ||
    !isRecord(value.vision) ||
    !isRecord(value.valuation)
  ) {
    return false;
  }

  const analysis = value.analysis;
  const condition = analysis.condition;
  const marketResearch = value.marketResearch;

  return (
    typeof analysis.summary === 'string' &&
    isRecord(analysis.identification) &&
    isRecord(condition) &&
    Array.isArray(condition.notes) &&
    isRecord(analysis.confidence) &&
    Array.isArray(analysis.evidence) &&
    Array.isArray(analysis.ambiguities) &&
    Array.isArray(analysis.suggestedPhotos) &&
    isRecord(analysis.valuationSignals) &&
    Array.isArray(value.vision.images) &&
    (marketResearch == null || isRecord(marketResearch))
  );
}

function serializeAnalysisSnapshot(
  analysis: ItemAnalysisSuccess,
  savedAt: string,
) {
  const snapshot: PersistedAnalysisSnapshot = {
    schemaVersion: ANALYSIS_SNAPSHOT_SCHEMA_VERSION,
    savedAt,
    result: analysis,
  };
  const serialized = JSON.stringify(snapshot);

  if (serialized.length > MAX_ANALYSIS_SNAPSHOT_CHARACTERS) {
    throw new Error(
      `KeepFlip's normalized analysis snapshot is too large to save (${serialized.length.toLocaleString()} characters).`,
    );
  }

  return serialized;
}

function parseAnalysisSnapshot(value: string | null | undefined) {
  const serialized = value?.trim();
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== ANALYSIS_SNAPSHOT_SCHEMA_VERSION) return null;
    return isItemAnalysisSuccess(parsed.result) ? parsed.result : null;
  } catch {
    return null;
  }
}

function isInventorySchemaError(error: unknown) {
  const source = isRecord(error) ? error : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof source?.message === 'string'
        ? source.message
        : '';
  const type = typeof source?.type === 'string' ? source.type : '';

  return (
    [
      ANALYSIS_SNAPSHOT_COLUMN,
      ...INVENTORY_RESELLER_COLUMNS,
      ...INVENTORY_ITEM_DETAILS_COLUMNS,
    ].some((column) =>
      message.toLowerCase().includes(column.toLowerCase()),
    ) ||
    /(?:row|document)_invalid_structure|unknown_(?:attribute|column)/i.test(type)
  );
}

function inventorySchemaMigrationError(cause: unknown) {
  const error = new Error(
    `KeepFlip's Appwrite items table needs ${ANALYSIS_SNAPSHOT_COLUMN}, these reseller-intelligence columns: ${INVENTORY_RESELLER_COLUMNS.join(', ')}, and these item-detail columns: ${INVENTORY_ITEM_DETAILS_COLUMNS.join(', ')}. Set flipDecisionConfidence to an integer range of 0 through 100, then wait until the columns are available and retry.`,
  );
  error.name = 'InventorySchemaMigrationError';
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function isMissingInventoryIndexError(cause: unknown) {
  const source = cause as { message?: unknown; type?: unknown } | null;
  const detail = [
    cause instanceof Error ? cause.message : null,
    typeof source?.message === 'string' ? source.message : null,
    typeof source?.type === 'string' ? source.type : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(?:index|indexed|query_invalid)/.test(detail);
}

function applyInventoryListOptions(
  items: InventoryItem[],
  options: InventoryListOptions,
) {
  const flipDecision = options.flipDecision ?? options.flipVerdict;
  const filtered = items.filter((item) => {
    if (
      flipDecision &&
      item.flipDecision !== flipDecision &&
      item.flipVerdict !== flipDecision
    ) {
      return false;
    }
    return !options.resaleVelocity || item.resaleVelocity === options.resaleVelocity;
  });

  if (options.sort === 'resale_speed') {
    return filtered.sort((left, right) => {
      const leftDays = left.resaleTypicalDays ?? Number.MAX_SAFE_INTEGER;
      const rightDays = right.resaleTypicalDays ?? Number.MAX_SAFE_INTEGER;
      return leftDays - rightDays;
    });
  }

  if (options.sort === 'decision_confidence') {
    return filtered.sort(
      (left, right) =>
        (right.flipDecisionConfidence ?? -1) -
        (left.flipDecisionConfidence ?? -1),
    );
  }

  return filtered;
}

function rowToInventoryItem(row: InventoryRow): InventoryItem {
  const cents = Number(row.estimatedValueCents);
  const flipDecision =
    normalizedFlipVerdict(row.flipDecision) ??
    normalizedFlipVerdict(row.flipVerdict);
  return {
    id: row.$id,
    title: row.title,
    brand: cleanText(row.brand),
    model: cleanText(row.model),
    category: cleanText(row.category) || 'Other',
    condition: displayCondition(row.condition),
    conditionNotes: cleanText(row.description) || '',
    status: normalizedStatus(row.status),
    estimatedValue:
      Number.isFinite(cents) && cents > 0 ? Math.round(cents) / 100 : null,
    acquisitionCost: amountFromCents(row.acquisitionCostCents),
    inventoryCostOnHand: amountFromCents(
      row.inventoryCostCentsOnHand ?? row.acquisitionCostCents,
    ),
    quantityPurchased: savedQuantity(row.quantityPurchased),
    quantityOnHand: savedQuantity(
      row.quantityOnHand,
      savedQuantity(row.quantityPurchased),
    ),
    currency: 'USD',
    aiConfidence: confidencePercent(row.aiConfidence),
    flipDecision,
    flipVerdict: normalizedFlipVerdict(row.flipVerdict) ?? flipDecision,
    resaleVelocity: normalizedResaleVelocity(row.resaleVelocity),
    resaleTypicalDays: normalizedResaleDays(row.resaleTypicalDays),
    flipComplexity: normalizedFlipComplexity(row.flipComplexity),
    flipDecisionConfidence: confidencePercent(row.flipDecisionConfidence),
    coverPhotoId: cleanText(row.coverPhotoId),
    modelFile: normalizedModelFile(row.modelFile),
    photoCount: Math.max(0, Number(row.photoCount) || 0),
    itemPhotos: normalizedItemPhotos(row.itemPhotos),
    variant: cleanText(row.variant),
    color: cleanText(row.color),
    era: cleanText(row.era),
    serialNumber: cleanText(row.serialNumber),
    itemSpecifics: itemSpecifics(row.itemSpecificsJson),
    purchaseSource: cleanText(row.purchaseSource),
    sku: cleanText(row.sku),
    storageLocation: cleanText(row.storageLocation),
    isListed: row.isListed === true,
    resaleStatus: cleanText(row.resaleStatus),
    listingChannel:
      row.isListed === true || row.ebayListingId || row.ebayOfferId || row.ebaySku
        ? 'ebay'
        : null,
    externalListingId: cleanText(row.ebayListingId),
    externalOfferId: cleanText(row.ebayOfferId),
    listingCurrentPrice: null,
    listingQuantity: null,
    listingLastSyncedAt: null,
    listingSyncStatus: row.isListed === true ? 'linked' : null,
    ebaySku: cleanText(row.ebaySku) || cleanText(row.sku),
    ebayOfferId: cleanText(row.ebayOfferId),
    ebayListingId: cleanText(row.ebayListingId),
    listedAt: row.listedAt || null,
    receiptFileId: cleanText(row.receiptFileId),
    purchaseNotes: cleanText(row.purchaseNotes),
    acquiredAt: row.acquiredAt || null,
    createdAt: row.createdAt || row.$createdAt || new Date().toISOString(),
    analysisSnapshot: parseAnalysisSnapshot(row.analysisSnapshotJson),
  };
}

function assertInventoryTableConfigured() {
  const missing = [
    !APPWRITE.databaseId ? 'EXPO_PUBLIC_APPWRITE_DATABASE_ID' : null,
    !APPWRITE.itemsTableId
      ? 'EXPO_PUBLIC_APPWRITE_ITEMS_COLLECTION_ID'
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    throw new Error(
      `KeepFlip inventory needs Appwrite configuration: ${missing.join(', ')}`,
    );
  }
}

function assertInventoryConfigured() {
  assertInventoryTableConfigured();
  if (!APPWRITE.itemPhotosTableId) {
    throw new Error(
      'KeepFlip inventory needs Appwrite configuration: EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID',
    );
  }
}

async function attachExistingScan({
  itemId,
  ownerId,
  scanId,
}: {
  itemId: string;
  ownerId: string;
  scanId: string;
}) {
  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    queries: [
      Query.equal('ownerId', [ownerId]),
      Query.equal('scanId', [scanId]),
      Query.orderAsc('sortOrder'),
      Query.limit(21),
    ],
  });

  const photos = response.rows as unknown as ItemPhotoRow[];
  const photoLinkFailures: string[] = [];

  for (const photo of photos) {
    try {
      await tablesDB.updateRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: photo.$id,
        data: { itemId },
      });
    } catch (error) {
      photoLinkFailures.push(
        error instanceof Error
          ? error.message
          : `Photo row ${photo.$id} could not be linked.`,
      );
    }
  }

  const primaryPhoto =
    photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null;

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: itemId,
    data: {
      coverPhotoId: primaryPhoto?.fileId || null,
      photoCount: photos.length,
      itemPhotos: normalizedItemPhotos(photos.map((photo) => photo.fileId)),
      updatedAt: new Date().toISOString(),
    },
  });

  return {
    coverPhotoId: primaryPhoto?.fileId || null,
    photoCount: photos.length,
    itemPhotos: normalizedItemPhotos(photos.map((photo) => photo.fileId)),
    warning:
      photos.length === 0
        ? 'The item was saved, but no saved scanner photos matched this scan.'
        : photoLinkFailures.length > 0
          ? `The item was saved, but ${photoLinkFailures.length} scanner photo${
              photoLinkFailures.length === 1 ? '' : 's'
            } could not be linked.`
          : null,
  };
}

export async function saveAnalyzedItemToInventory({
  analysis,
  acquisitionCost,
  acquiredAt,
  itemSpecifics: suppliedItemSpecifics,
  modelFile,
  ownerId,
  purchaseNotes,
  purchaseSource,
  quantity,
  receiptFileId,
  scanId,
  sku,
  storageLocation,
}: SaveAnalyzedItemInput): Promise<SaveAnalyzedItemResult> {
  assertInventoryConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanScanId = scanId.trim();
  if (!cleanOwnerId) throw new Error('Sign in before saving an item.');
  if (!cleanScanId) throw new Error('The completed scan ID is missing.');
  if (analysis.status !== 'identified') {
    throw new Error('Only successfully identified items can be saved to inventory.');
  }

  const identity = analysis.analysis.identification;
  const valuation = analysis.valuation;
  const median = valuation.median;
  const confidence = confidencePercent(analysis.analysis.confidence.overall);
  const storedModelFile = normalizedModelFile(modelFile);
  const now = new Date().toISOString();
  const analysisSnapshotJson = serializeAnalysisSnapshot(analysis, now);
  const acquisitionCostCents = centsFromAmount(acquisitionCost);
  const normalizedAcquiredAt = acquiredAt?.trim() || null;
  const normalizedQuantity = purchaseQuantity(quantity);
  const inventoryCostCentsOnHand = acquisitionCostCents;
  const itemDetailData = {
    color: boundedText(identity.color, 80),
    era: boundedText(identity.era, 80),
    itemSpecificsJson: serializedItemSpecifics(suppliedItemSpecifics),
    purchaseNotes: boundedText(purchaseNotes, 2_000),
    purchaseSource: boundedText(purchaseSource, 120),
    receiptFileId: boundedText(receiptFileId, 64),
    serialNumber: boundedText(identity.serialNumber, 150) || null,
    sku: boundedText(sku, 120),
    storageLocation: boundedText(storageLocation, 180),
    variant: boundedText(identity.variant, 120),
  };
  const resellerSignals = inventoryResellerSignals(analysis);
  const conditionNotes = [
    ...analysis.analysis.condition.notes,
    analysis.analysis.summary,
  ]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' ')
    .slice(0, 4000);

  let created: InventoryRow;
  try {
    created = (await tablesDB.createRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: ID.unique(),
      data: {
        ownerId: cleanOwnerId,
        title: titleFromAnalysis(analysis),
        category:
          boundedText(identity.category, 60) ||
          boundedText(identity.itemType, 60) ||
          'Other',
        brand: boundedText(identity.brand, 100),
        model: boundedText(identity.model, 150),
        condition: normalizedCondition(analysis.analysis.condition.grade),
        status: 'undecided',
        description: conditionNotes || null,
        estimatedValueCents:
          median != null && Number.isFinite(median) && median > 0
            ? Math.round(median * 100)
            : null,
        acquisitionCostCents,
        inventoryCostCentsOnHand,
        quantityPurchased: normalizedQuantity,
        quantityOnHand: normalizedQuantity,
        ...itemDetailData,
        ...resellerSignals,
        originalRetailCents: null,
        coverPhotoId: null,
        modelFile: storedModelFile,
        photoCount: 0,
        itemPhotos: [],
        aiConfidence: confidence,
        analysisSnapshotJson,
        isListed: false,
        acquiredAt: normalizedAcquiredAt,
        createdAt: now,
        updatedAt: now,
      },
      permissions: ownerPermissions(cleanOwnerId),
    })) as unknown as InventoryRow;
  } catch (error) {
    if (isInventorySchemaError(error)) {
      throw inventorySchemaMigrationError(error);
    }
    throw error;
  }

  trackTenjinEvent('inventory_item_saved');

  let attached;
  try {
    attached = await attachExistingScan({
      itemId: created.$id,
      ownerId: cleanOwnerId,
      scanId: cleanScanId,
    });
  } catch (error) {
    attached = {
      coverPhotoId: null,
      photoCount: 0,
      itemPhotos: [],
      warning:
        error instanceof Error
          ? `The item was saved, but its scanner photos could not be linked: ${error.message}`
          : 'The item was saved, but its scanner photos could not be linked.',
    };
  }

  return {
    item: rowToInventoryItem({
      ...created,
      acquisitionCostCents,
      inventoryCostCentsOnHand,
      quantityPurchased: normalizedQuantity,
      quantityOnHand: normalizedQuantity,
      ...itemDetailData,
      ...resellerSignals,
      coverPhotoId: attached.coverPhotoId,
      modelFile: storedModelFile,
      photoCount: attached.photoCount,
      itemPhotos: attached.itemPhotos,
    }),
    photoWarning: attached.warning,
  };
}

export async function listInventoryItems(
  ownerId: string,
  options: InventoryListOptions = {},
): Promise<InventoryItem[]> {
  assertInventoryConfigured();
  if (!ownerId.trim()) return [];

  const queries = [Query.equal('ownerId', [ownerId])];
  const flipDecision = options.flipDecision ?? options.flipVerdict;
  if (flipDecision) {
    queries.push(Query.equal('flipDecision', [flipDecision]));
  }
  if (options.resaleVelocity) {
    queries.push(Query.equal('resaleVelocity', [options.resaleVelocity]));
  }

  switch (options.sort) {
    case 'resale_speed':
      queries.push(Query.orderAsc('resaleTypicalDays'));
      break;
    case 'decision_confidence':
      queries.push(Query.orderDesc('flipDecisionConfidence'));
      break;
    default:
      queries.push(Query.orderDesc('createdAt'));
      break;
  }
  queries.push(Query.limit(100), Query.select([...INVENTORY_LIST_COLUMNS]));

  try {
    const response = await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      queries,
    });
    return applyInventoryListOptions(
      (response.rows as unknown as InventoryRow[]).map(rowToInventoryItem),
      options,
    );
  } catch (cause) {
    const requestedFilterOrSort =
      Boolean(flipDecision || options.resaleVelocity) ||
      options.sort === 'resale_speed' ||
      options.sort === 'decision_confidence';

    if (!requestedFilterOrSort || !isMissingInventoryIndexError(cause)) {
      throw cause;
    }

    // A new column is readable before its Appwrite composite index is ready.
    // Preserve usable controls for the first 100 items, while normal indexed
    // queries take over automatically once the index exists.
    const fallback = await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      queries: [
        Query.equal('ownerId', [ownerId]),
        Query.orderDesc('createdAt'),
        Query.limit(100),
        Query.select([...INVENTORY_LIST_COLUMNS]),
      ],
    });
    return applyInventoryListOptions(
      (fallback.rows as unknown as InventoryRow[]).map(rowToInventoryItem),
      options,
    );
  }
}

const INVENTORY_ANALYTICS_PAGE_SIZE = 100;
const INVENTORY_ANALYTICS_MAX_ITEMS = 1_000;
const INVENTORY_ASSISTANT_MAX_ITEMS = 300;

/**
 * Loads the bounded item directory that lets Flip resolve an explicit item
 * update to an owner-owned record. This path only needs the items table, so an
 * imported or incomplete record remains addressable even when photo storage
 * has not been configured yet.
 */
export async function listInventoryItemsForAssistant(ownerId: string): Promise<{
  items: InventoryItem[];
  total: number;
  truncated: boolean;
}> {
  assertInventoryTableConfigured();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return { items: [], total: 0, truncated: false };

  const items: InventoryItem[] = [];
  let total: number | null = null;
  while (items.length < INVENTORY_ASSISTANT_MAX_ITEMS) {
    const pageSize = Math.min(
      INVENTORY_ANALYTICS_PAGE_SIZE,
      INVENTORY_ASSISTANT_MAX_ITEMS - items.length,
    );
    const response = await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      queries: [
        Query.equal('ownerId', [cleanOwnerId]),
        Query.orderDesc('createdAt'),
        Query.limit(pageSize),
        Query.offset(items.length),
        Query.select([...INVENTORY_LIST_COLUMNS]),
      ],
    });
    const page = (response.rows as unknown as InventoryRow[]).map(rowToInventoryItem);
    const reportedTotal = Number(response.total);
    if (Number.isSafeInteger(reportedTotal) && reportedTotal >= 0) {
      total = Math.max(total ?? 0, reportedTotal);
    }
    items.push(...page);
    if (page.length < pageSize || (total != null && items.length >= total)) break;
  }

  return {
    items,
    total: Math.max(total ?? 0, items.length),
    truncated: (total ?? items.length) > items.length,
  };
}

/**
 * Loads a bounded, newest-first inventory snapshot for analytics. The normal
 * inventory screen remains on its existing first-page query; analytics can
 * page beyond that 100-row list without accidentally charting only the newest
 * items. The result reports truncation instead of implying it is complete.
 */
export async function listInventoryItemsForAnalytics(ownerId: string): Promise<{
  items: InventoryItem[];
  total: number;
  truncated: boolean;
}> {
  assertInventoryConfigured();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return { items: [], total: 0, truncated: false };

  const items: InventoryItem[] = [];
  let total = 0;
  while (items.length < INVENTORY_ANALYTICS_MAX_ITEMS) {
    const pageSize = Math.min(
      INVENTORY_ANALYTICS_PAGE_SIZE,
      INVENTORY_ANALYTICS_MAX_ITEMS - items.length,
    );
    const response = await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      queries: [
        Query.equal('ownerId', [cleanOwnerId]),
        Query.orderDesc('createdAt'),
        Query.limit(pageSize),
        Query.offset(items.length),
        Query.select([...INVENTORY_LIST_COLUMNS]),
      ],
    });
    const page = (response.rows as unknown as InventoryRow[]).map(rowToInventoryItem);
    total = Math.max(total, response.total);
    items.push(...page);
    if (page.length < pageSize || items.length >= total) break;
  }

  return {
    items,
    total: Math.max(total, items.length),
    truncated: total > items.length,
  };
}

export async function updateInventoryAnalysisSnapshot({
  analysis,
  itemId,
  ownerId,
}: UpdateInventoryAnalysisSnapshotInput): Promise<void> {
  assertInventoryConfigured();
  const cleanItemId = itemId.trim();
  const cleanOwnerId = ownerId.trim();

  if (!cleanItemId || !cleanOwnerId) {
    throw new Error(
      'KeepFlip needs the signed-in owner and inventory item before saving guidance.',
    );
  }

  const savedAt = new Date().toISOString();
  const resellerSignals = inventoryResellerSignals(analysis);

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: cleanItemId,
    data: {
      analysisSnapshotJson: serializeAnalysisSnapshot(analysis, savedAt),
      ...resellerSignals,
      updatedAt: savedAt,
    },
  });
}

export async function updateInventoryMarketplaceLink({
  ownerId,
  itemId,
  ebaySku,
  ebayOfferId,
  ebayListingId,
  listedAt,
}: {
  ownerId: string;
  itemId: string;
  ebaySku: string;
  ebayOfferId?: string | null;
  ebayListingId?: string | null;
  listedAt?: string | null;
}): Promise<void> {
  assertInventoryConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanItemId = itemId.trim();
  const cleanSku = ebaySku.trim();
  if (!cleanOwnerId || !cleanItemId || !cleanSku) {
    throw new Error(
      'KeepFlip needs the signed-in owner, item, and eBay SKU before linking a listing.',
    );
  }

  // Confirm ownership before adding marketplace identifiers to an item. The
  // financial sync uses these identifiers later to locate the exact inventory
  // cost when the listing sells.
  await getInventoryItem(cleanOwnerId, cleanItemId);
  const now = new Date().toISOString();

  try {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: cleanItemId,
      data: {
        ebayListingId: ebayListingId?.trim() || null,
        ebayOfferId: ebayOfferId?.trim() || null,
        ebaySku: cleanSku,
        isListed: true,
        listedAt: listedAt?.trim() || now,
        resaleStatus: 'listed',
        updatedAt: now,
      },
    });
  } catch (cause) {
    if (isInventorySchemaError(cause)) {
      throw new Error(
        'Add the eBay tracking columns (resaleStatus, ebaySku, ebayOfferId, ebayListingId, and listedAt) to the items table before linking a listing.',
      );
    }
    throw cause;
  }
}

export async function createImportedEbayInventoryItem({
  ownerId,
  candidate,
}: {
  ownerId: string;
  candidate: EbayListingImportCandidate;
}): Promise<InventoryItem> {
  assertInventoryConfigured();
  const cleanOwnerId = ownerId.trim();
  const title = boundedText(candidate.title, 300) || 'Imported eBay listing';
  const sku = boundedText(candidate.sku, 120);
  const quantityOnHand = savedQuantity(candidate.quantityAvailable, 0);
  const now = new Date().toISOString();

  if (!cleanOwnerId || !sku || !candidate.offerId) {
    throw new Error('KeepFlip needs the signed-in owner and eBay listing identifiers before importing.');
  }

  const importedNotes = [
    'Imported from an existing eBay listing.',
    'Acquisition cost, receipt, storage location, and KeepFlip analysis were not inferred.',
    candidate.categoryId ? `eBay category: ${candidate.categoryId}.` : null,
    candidate.listingUrl ? `eBay listing: ${candidate.listingUrl}` : null,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2_000);

  let created: InventoryRow;
  try {
    created = (await tablesDB.createRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: ID.unique(),
      data: {
        ownerId: cleanOwnerId,
        title,
        category: 'Other',
        brand: null,
        model: null,
        condition: boundedText(candidate.condition, 100) || 'UNKNOWN',
        status: 'undecided',
        description: importedNotes,
        estimatedValueCents: null,
        acquisitionCostCents: null,
        inventoryCostCentsOnHand: null,
        quantityPurchased: 1,
        quantityOnHand,
        purchaseSource: 'eBay import',
        purchaseNotes: importedNotes,
        sku,
        storageLocation: null,
        variant: null,
        color: null,
        era: null,
        serialNumber: null,
        itemSpecificsJson: JSON.stringify({
          source: 'inventory_api',
          marketplaceId: candidate.marketplaceId,
          eBayCategoryId: candidate.categoryId,
          eBayCondition: candidate.condition,
        }),
        coverPhotoId: null,
        modelFile: null,
        photoCount: 0,
        itemPhotos: [],
        isListed: true,
        resaleStatus: 'listed',
        ebaySku: sku,
        ebayOfferId: candidate.offerId,
        ebayListingId: candidate.listingId,
        listedAt: now,
        acquiredAt: null,
        createdAt: now,
        updatedAt: now,
      },
      permissions: ownerPermissions(cleanOwnerId),
    })) as unknown as InventoryRow;
  } catch (error) {
    if (isInventorySchemaError(error)) {
      throw inventorySchemaMigrationError(error);
    }
    throw error;
  }

  return rowToInventoryItem({
    ...created,
    quantityPurchased: 1,
    quantityOnHand,
    purchaseSource: 'eBay import',
    purchaseNotes: importedNotes,
    sku,
    isListed: true,
    resaleStatus: 'listed',
    ebaySku: sku,
    ebayOfferId: candidate.offerId,
    ebayListingId: candidate.listingId,
    listedAt: now,
    itemPhotos: [],
    photoCount: 0,
  });
}

function normalizeInventoryNumberValue(
  field: InventoryNumberField,
  value: number,
) {
  if (!INVENTORY_NUMBER_FIELDS.includes(field)) {
    throw new Error('Flip requested an unsupported inventory number.');
  }

  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized)) {
    throw new Error('Inventory updates must use whole numbers.');
  }

  if (
    (field === 'acquisition_cost_cents' ||
      field === 'inventory_cost_cents_on_hand' ||
      field === 'estimated_value_cents') &&
    (normalized < 0 || normalized > MAX_INVENTORY_NUMBER_CENTS)
  ) {
    throw new Error('Inventory money values must be between $0.00 and $21,474,836.47.');
  }

  if (
    (field === 'quantity_purchased' || field === 'quantity_on_hand') &&
    (normalized < 0 || normalized > MAX_ITEM_QUANTITY)
  ) {
    throw new Error(
      `Inventory quantities must be whole numbers from 0 through ${MAX_ITEM_QUANTITY.toLocaleString()}.`,
    );
  }

  if (field === 'quantity_purchased' && normalized < 1) {
    throw new Error('Quantity purchased must be at least 1.');
  }

  if (field === 'resale_typical_days' && (normalized < 0 || normalized > 3_650)) {
    throw new Error('Typical resale days must be between 0 and 3,650.');
  }

  return normalized;
}

function inventoryNumberData(
  field: InventoryNumberField,
  value: number,
): Record<string, number | string> {
  switch (field) {
    case 'acquisition_cost_cents':
      return { acquisitionCostCents: value };
    case 'inventory_cost_cents_on_hand':
      return { inventoryCostCentsOnHand: value };
    case 'estimated_value_cents':
      return { estimatedValueCents: value };
    case 'quantity_purchased':
      return { quantityPurchased: value };
    case 'quantity_on_hand':
      return { quantityOnHand: value };
    case 'resale_typical_days':
      return { resaleTypicalDays: value };
  }
}

/**
 * Updates one seller-entered numeric inventory value after confirming the
 * record belongs to the signed-in owner. It deliberately has no analysis or
 * status precondition, so imported and incomplete records can be corrected.
 * Money fields are integer cents; quantity and resale-day fields are integers.
 */
export async function updateInventoryItemNumber({
  field,
  itemId,
  ownerId,
  value,
}: UpdateInventoryItemNumberInput): Promise<InventoryItem> {
  assertInventoryTableConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanItemId = itemId.trim();
  if (!cleanOwnerId) throw new Error('Sign in before updating an inventory item.');
  if (!cleanItemId) throw new Error('The inventory item ID is missing.');

  const current = await getInventoryItem(cleanOwnerId, cleanItemId);
  const normalizedValue = normalizeInventoryNumberValue(field, value);

  if (
    field === 'quantity_purchased' &&
    normalizedValue < current.quantityOnHand
  ) {
    throw new Error(
      `Quantity purchased cannot be lower than the ${current.quantityOnHand.toLocaleString()} units currently on hand.`,
    );
  }
  if (
    field === 'quantity_on_hand' &&
    normalizedValue > current.quantityPurchased
  ) {
    throw new Error(
      `Quantity on hand cannot exceed the ${current.quantityPurchased.toLocaleString()} units purchased. Update quantity purchased first if the record is incomplete.`,
    );
  }

  await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: cleanItemId,
    data: {
      ...inventoryNumberData(field, normalizedValue),
      updatedAt: new Date().toISOString(),
    },
  });

  return getInventoryItem(cleanOwnerId, cleanItemId);
}

export async function getInventoryItem(
  ownerId: string,
  itemId: string,
): Promise<InventoryItem> {
  assertInventoryTableConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanItemId = itemId.trim();
  if (!cleanOwnerId) throw new Error('Sign in before opening an inventory item.');
  if (!cleanItemId) throw new Error('The inventory item ID is missing.');

  const row = (await tablesDB.getRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: cleanItemId,
  })) as unknown as InventoryRow;

  if (row.ownerId !== cleanOwnerId) {
    throw new Error('This inventory item is not available to the signed-in account.');
  }

  return rowToInventoryItem(row);
}

/**
 * Removes an owner-owned inventory record and its linked item-photo rows.
 *
 * The item-photo files are cleaned up after their rows so a failed file delete
 * cannot leave a row pointing at a file that was already removed. Financial
 * history and external marketplace records intentionally remain untouched;
 * deleting a local inventory record must not erase the books or an eBay sale.
 */
export async function deleteInventoryItem(
  ownerId: string,
  itemId: string,
): Promise<DeleteInventoryItemResult> {
  assertInventoryConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanItemId = itemId.trim();

  if (!cleanOwnerId) throw new Error('Sign in before deleting an item.');
  if (!cleanItemId) throw new Error('The inventory item ID is missing.');

  const row = (await tablesDB.getRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: cleanItemId,
  })) as unknown as InventoryRow;

  if (row.ownerId !== cleanOwnerId) {
    throw new Error('This inventory item is not available to the signed-in account.');
  }

  const photoResponse = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemPhotosTableId,
    queries: [
      Query.equal('ownerId', [cleanOwnerId]),
      Query.equal('itemId', [cleanItemId]),
      Query.limit(100),
      Query.select(['$id', 'ownerId', 'fileId']),
    ],
  });
  const photoRows = photoResponse.rows as unknown as ItemPhotoRow[];

  if (photoRows.length > 0 && !APPWRITE.itemImagesBucketId) {
    throw new Error(
      'KeepFlip inventory photo storage is not configured, so this item was not deleted.',
    );
  }

  const rowDeleteResults = await Promise.allSettled(
    photoRows.map((photo) =>
      tablesDB.deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: photo.$id,
      }),
    ),
  );
  const failedPhotoRows = rowDeleteResults.filter(
    (result) => result.status === 'rejected',
  );

  if (failedPhotoRows.length > 0) {
    throw new Error(
      `KeepFlip could not remove ${failedPhotoRows.length} linked photo record${
        failedPhotoRows.length === 1 ? '' : 's'
      }. The inventory item was kept.`,
    );
  }

  await tablesDB.deleteRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    rowId: cleanItemId,
  });

  const fileDeleteResults = await Promise.allSettled(
    photoRows
      .map((photo) => photo.fileId?.trim())
      .filter((fileId): fileId is string => Boolean(fileId))
      .map((fileId) =>
        storage.deleteFile({
          bucketId: APPWRITE.itemImagesBucketId,
          fileId,
        }),
      ),
  );

  return {
    itemId: cleanItemId,
    deletedPhotoCount: photoRows.length,
    photoFileDeleteFailures: fileDeleteResults.filter(
      (result) => result.status === 'rejected',
    ).length,
  };
}
