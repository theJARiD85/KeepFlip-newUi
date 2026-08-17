import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  type ItemAnalysisSuccess,
  type ItemMarketFlipComplexity,
  type ItemMarketFlipDecision,
  type ItemMarketResaleVelocity,
} from '@/types/item-analysis';

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
const ANALYSIS_SNAPSHOT_SCHEMA_VERSION = 1 as const;
const MAX_ANALYSIS_SNAPSHOT_CHARACTERS = 500_000;

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
  'flipDecision',
  'flipVerdict',
  'resaleVelocity',
  'resaleTypicalDays',
  'flipComplexity',
  'flipDecisionConfidence',
  'coverPhotoId',
  'modelFile',
  'photoCount',
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
  aiConfidence?: number | null;
  flipDecision?: string | null;
  flipVerdict?: string | null;
  resaleVelocity?: string | null;
  resaleTypicalDays?: number | null;
  flipComplexity?: string | null;
  flipDecisionConfidence?: number | null;
  coverPhotoId?: string | null;
  modelFile?: string | null;
  photoCount?: number | null;
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
  modelFile?: string | null;
  ownerId: string;
  scanId: string;
};

export type SaveAnalyzedItemResult = {
  item: InventoryItem;
  photoWarning: string | null;
};

export type UpdateInventoryAnalysisSnapshotInput = {
  analysis: ItemAnalysisSuccess;
  itemId: string;
  ownerId: string;
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
    [ANALYSIS_SNAPSHOT_COLUMN, ...INVENTORY_RESELLER_COLUMNS].some((column) =>
      message.toLowerCase().includes(column.toLowerCase()),
    ) ||
    /(?:row|document)_invalid_structure|unknown_(?:attribute|column)/i.test(type)
  );
}

function inventorySchemaMigrationError(cause: unknown) {
  const error = new Error(
    `KeepFlip's Appwrite items table needs ${ANALYSIS_SNAPSHOT_COLUMN} plus these optional reseller-intelligence columns before analyzed items can be saved: ${INVENTORY_RESELLER_COLUMNS.join(', ')}. Set flipDecisionConfidence to an integer range of 0 through 100, then wait until the columns are available and retry.`,
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
    createdAt: row.createdAt || row.$createdAt || new Date().toISOString(),
    analysisSnapshot: parseAnalysisSnapshot(row.analysisSnapshotJson),
  };
}

function assertInventoryConfigured() {
  const missing = [
    !APPWRITE.databaseId ? 'EXPO_PUBLIC_APPWRITE_DATABASE_ID' : null,
    !APPWRITE.itemsTableId
      ? 'EXPO_PUBLIC_APPWRITE_ITEMS_COLLECTION_ID'
      : null,
    !APPWRITE.itemPhotosTableId
      ? 'EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID'
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    throw new Error(
      `KeepFlip inventory needs Appwrite configuration: ${missing.join(', ')}`,
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
      updatedAt: new Date().toISOString(),
    },
  });

  return {
    coverPhotoId: primaryPhoto?.fileId || null,
    photoCount: photos.length,
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
  modelFile,
  ownerId,
  scanId,
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
        serialNumber: boundedText(identity.serialNumber, 150),
        condition: normalizedCondition(analysis.analysis.condition.grade),
        status: 'undecided',
        description: conditionNotes || null,
        estimatedValueCents:
          median != null && Number.isFinite(median) && median > 0
            ? Math.round(median * 100)
            : null,
        acquisitionCostCents,
        ...resellerSignals,
        originalRetailCents: null,
        coverPhotoId: null,
        modelFile: storedModelFile,
        photoCount: 0,
        aiConfidence: confidence,
        analysisSnapshotJson,
        isListed: false,
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
      ...resellerSignals,
      coverPhotoId: attached.coverPhotoId,
      modelFile: storedModelFile,
      photoCount: attached.photoCount,
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

export async function getInventoryItem(
  ownerId: string,
  itemId: string,
): Promise<InventoryItem> {
  assertInventoryConfigured();
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
