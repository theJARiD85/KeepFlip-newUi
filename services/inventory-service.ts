import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';
import type { ItemAnalysisSuccess } from '@/types/item-analysis';

export type InventoryItemStatus = 'keep' | 'flip' | 'undecided';

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
  currency: string;
  aiConfidence: number | null;
  coverPhotoId: string | null;
  modelFile: string | null;
  photoCount: number;
  createdAt: string;
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
  aiConfidence?: number | null;
  coverPhotoId?: string | null;
  modelFile?: string | null;
  photoCount?: number | null;
  createdAt?: string | null;
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
  modelFile?: string | null;
  ownerId: string;
  scanId: string;
};

export type SaveAnalyzedItemResult = {
  item: InventoryItem;
  photoWarning: string | null;
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

function rowToInventoryItem(row: InventoryRow): InventoryItem {
  const cents = Number(row.estimatedValueCents);
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
    currency: 'USD',
    aiConfidence: confidencePercent(row.aiConfidence),
    coverPhotoId: cleanText(row.coverPhotoId),
    modelFile: normalizedModelFile(row.modelFile),
    photoCount: Math.max(0, Number(row.photoCount) || 0),
    createdAt: row.createdAt || row.$createdAt || new Date().toISOString(),
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
  const conditionNotes = [
    ...analysis.analysis.condition.notes,
    analysis.analysis.summary,
  ]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' ')
    .slice(0, 4000);

  const created = (await tablesDB.createRow({
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
      originalRetailCents: null,
      coverPhotoId: null,
      modelFile: storedModelFile,
      photoCount: 0,
      aiConfidence: confidence,
      isListed: false,
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as InventoryRow;

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
      coverPhotoId: attached.coverPhotoId,
      photoCount: attached.photoCount,
    }),
    photoWarning: attached.warning,
  };
}

export async function listInventoryItems(
  ownerId: string,
): Promise<InventoryItem[]> {
  assertInventoryConfigured();
  if (!ownerId.trim()) return [];

  const response = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.itemsTableId,
    queries: [
      Query.equal('ownerId', [ownerId]),
      Query.orderDesc('createdAt'),
      Query.limit(100),
    ],
  });

  return (response.rows as unknown as InventoryRow[]).map(rowToInventoryItem);
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
