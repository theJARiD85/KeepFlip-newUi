import { File } from 'expo-file-system';

import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  storage,
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
  photoCount?: number | null;
  createdAt?: string | null;
};

export type SaveAnalyzedItemInput = {
  analysis: ItemAnalysisSuccess;
  ownerId: string;
  photoUris: readonly string[];
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

function titleFromAnalysis(result: ItemAnalysisSuccess) {
  const identity = result.analysis.identification;
  const structured = [
    identity.brand,
    identity.model,
    identity.variant,
    identity.itemType,
  ]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) =>
      all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) ===
      index,
    )
    .join(' ')
    .trim();

  if (identity.model && structured) return structured.slice(0, 220);

  const summaryTitle = result.analysis.summary
    .split(/\r?\n/)[0]
    .split(/[.!?](?:\s|$)/)[0]
    .replace(
      /^(?:(?:this|the)\s+item|it)\s+(?:appears|looks|seems)\s+to\s+be\s+(?:an?\s+)?/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  return (
    summaryTitle ||
    structured ||
    cleanText(identity.category) ||
    cleanText(identity.itemType) ||
    'Scanned item'
  ).slice(0, 220);
}

function normalizedCondition(value: string | null | undefined) {
  const normalized = String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return [
    'new',
    'like_new',
    'excellent',
    'good',
    'fair',
    'poor',
    'unknown',
  ].includes(normalized)
    ? normalized
    : 'unknown';
}

function displayCondition(value: string | null | undefined) {
  return normalizedCondition(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedStatus(value: string | null | undefined): InventoryItemStatus {
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
    photoCount: Math.max(0, Number(row.photoCount) || 0),
    createdAt: row.createdAt || row.$createdAt || new Date().toISOString(),
  };
}

function assertInventoryConfigured() {
  const missing = [
    !APPWRITE.databaseId ? 'EXPO_PUBLIC_APPWRITE_DATABASE_ID' : null,
    !APPWRITE.itemsTableId ? 'EXPO_PUBLIC_APPWRITE_ITEMS_COLLECTION_ID' : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length) {
    throw new Error(`KeepFlip inventory needs Appwrite configuration: ${missing.join(', ')}`);
  }
}

function normalizePhotoUri(uri: string) {
  const trimmed = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function inventoryUploadFile(uri: string, index: number) {
  const file = new File(normalizePhotoUri(uri));
  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error(`Photo ${index + 1} is no longer available.`);
  }

  const extension = file.extension || '.jpg';
  const declaredType = file.type?.toLowerCase();
  const type =
    declaredType === 'image/png' ||
    declaredType === 'image/webp' ||
    declaredType === 'image/jpeg'
      ? declaredType
      : extension.toLowerCase() === '.png'
        ? 'image/png'
        : extension.toLowerCase() === '.webp'
          ? 'image/webp'
          : 'image/jpeg';

  return {
    name: `keepflip-inventory-${Date.now()}-${index + 1}${extension}`,
    type,
    size: file.size,
    uri: file.uri,
  };
}

async function attachInventoryPhotos({
  itemId,
  ownerId,
  photoUris,
}: {
  itemId: string;
  ownerId: string;
  photoUris: readonly string[];
}) {
  if (!APPWRITE.itemImagesBucketId || !APPWRITE.itemPhotosTableId) {
    return {
      fileIds: [] as string[],
      warning:
        photoUris.length > 0
          ? 'The item was saved, but persistent inventory photo storage is not configured.'
          : null,
    };
  }

  const fileIds: string[] = [];
  const failures: string[] = [];

  for (const [index, photoUri] of photoUris.slice(0, 4).entries()) {
    try {
      const uploaded = await storage.createFile({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId: ID.unique(),
        file: inventoryUploadFile(photoUri, index),
        permissions: ownerPermissions(ownerId),
      });

      await tablesDB.createRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.itemPhotosTableId,
        rowId: ID.unique(),
        data: {
          ownerId,
          itemId,
          fileId: uploaded.$id,
          sortOrder: fileIds.length,
          isPrimary: fileIds.length === 0,
          createdAt: new Date().toISOString(),
        },
        permissions: ownerPermissions(ownerId),
      });

      fileIds.push(uploaded.$id);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `Photo ${index + 1} failed to save.`);
    }
  }

  if (fileIds.length > 0) {
    await tablesDB.updateRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.itemsTableId,
      rowId: itemId,
      data: {
        coverPhotoId: fileIds[0],
        photoCount: fileIds.length,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return {
    fileIds,
    warning:
      failures.length > 0
        ? `The item was saved, but ${failures.length} photo${failures.length === 1 ? '' : 's'} could not be attached.`
        : null,
  };
}

export async function saveAnalyzedItemToInventory({
  analysis,
  ownerId,
  photoUris,
}: SaveAnalyzedItemInput): Promise<SaveAnalyzedItemResult> {
  assertInventoryConfigured();
  if (!ownerId.trim()) throw new Error('Sign in before saving an item.');
  if (analysis.status !== 'identified') {
    throw new Error('Only successfully identified items can be saved to inventory.');
  }

  const identity = analysis.analysis.identification;
  const valuation = analysis.valuation;
  const median = valuation.median;
  const confidence = confidencePercent(analysis.analysis.confidence.overall);
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
      ownerId,
      title: titleFromAnalysis(analysis),
      category: cleanText(identity.category) || cleanText(identity.itemType) || 'Other',
      brand: cleanText(identity.brand),
      model: cleanText(identity.model),
      serialNumber: cleanText(identity.serialNumber),
      condition: normalizedCondition(analysis.analysis.condition.grade),
      status: 'undecided',
      description: conditionNotes || null,
      estimatedValueCents:
        median != null && Number.isFinite(median) && median > 0
          ? Math.round(median * 100)
          : null,
      originalRetailCents: null,
      coverPhotoId: null,
      photoCount: 0,
      aiConfidence: confidence,
      isListed: false,
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    },
    permissions: ownerPermissions(ownerId),
  })) as unknown as InventoryRow;

  const attached = await attachInventoryPhotos({
    itemId: created.$id,
    ownerId,
    photoUris,
  });

  return {
    item: rowToInventoryItem({
      ...created,
      coverPhotoId: attached.fileIds[0] || null,
      photoCount: attached.fileIds.length,
    }),
    photoWarning: attached.warning,
  };
}

export async function listInventoryItems(ownerId: string): Promise<InventoryItem[]> {
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
