import { File } from "expo-file-system";

import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  storage,
  tablesDB,
} from "@/lib/appwrite";

export type SavedScanPhoto = {
  itemPhotoId: string;
  scanId: string;
  fileId: string;
  sortOrder: number;
  isPrimary: boolean;
  localUri: string;
};

export type SaveScannerPhotoInput = {
  imageUri: string;
  ownerId: string;
  scanId: string;
  sortOrder: number;
  isPrimary: boolean;
};

function requiredConfiguration() {
  const missing = [
    !APPWRITE.databaseId ? "EXPO_PUBLIC_APPWRITE_DATABASE_ID" : null,
    !APPWRITE.itemPhotosTableId
      ? "EXPO_PUBLIC_APPWRITE_ITEM_PHOTOS_COLLECTION_ID"
      : null,
    !APPWRITE.itemImagesBucketId
      ? "EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID"
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `KeepFlip scanner photo storage needs Appwrite configuration: ${missing.join(", ")}`,
    );
  }

  return {
    databaseId: APPWRITE.databaseId,
    itemPhotosTableId: APPWRITE.itemPhotosTableId,
    itemImagesBucketId: APPWRITE.itemImagesBucketId,
  };
}

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function normalizePhotoUri(uri: string) {
  const trimmed = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function openPhoto(imageUri: string) {
  const file = new File(normalizePhotoUri(imageUri));

  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("The captured scanner image is missing or empty.");
  }

  return file;
}

export function createScanId() {
  return ID.unique();
}

type ScannerPhotoRow = {
  fileId?: unknown;
  isPrimary?: unknown;
  sortOrder?: unknown;
};

async function listScannerPhotoRows(
  ownerId: string,
  scanId: string,
): Promise<ScannerPhotoRow[]> {
  const cleanOwnerId = ownerId.trim();
  const cleanScanId = scanId.trim();

  if (!cleanOwnerId) throw new Error("Sign in before refining a valuation.");
  if (!cleanScanId) throw new Error("The scanner session ID is missing.");

  const configuration = requiredConfiguration();
  const response = await tablesDB.listRows({
    databaseId: configuration.databaseId,
    tableId: configuration.itemPhotosTableId,
    queries: [
      Query.equal("ownerId", [cleanOwnerId]),
      Query.equal("scanId", [cleanScanId]),
      Query.orderAsc("sortOrder"),
      Query.limit(21),
      Query.select(["fileId", "isPrimary", "sortOrder"]),
    ],
  });

  return response.rows as unknown as ScannerPhotoRow[];
}

function rowFileId(row: ScannerPhotoRow | undefined) {
  return typeof row?.fileId === "string" ? row.fileId.trim() : "";
}

export async function getScannerPhotoFileId(
  ownerId: string,
  scanId: string,
  requestedFileId?: string | null,
): Promise<string> {
  const rows = await listScannerPhotoRows(ownerId, scanId);
  const requested = requestedFileId?.trim() || "";

  if (requested) {
    const selected = rows.find((row) => rowFileId(row) === requested);
    if (!selected) {
      throw new Error("The selected scanner photo is no longer available.");
    }
    return requested;
  }

  const primary = rows.find((row) => row.isPrimary === true) ?? rows[0];
  const fileId = rowFileId(primary);

  if (!fileId) {
    throw new Error(
      "Save the scan photo before answering valuation questions.",
    );
  }

  return fileId;
}

export async function getPrimaryScannerPhotoFileId(
  ownerId: string,
  scanId: string,
): Promise<string> {
  return getScannerPhotoFileId(ownerId, scanId);
}

export type SavedScannerPhotoSummary = {
  coverPhotoId: string | null;
  photoCount: number;
};

/**
 * Returns the durable photo pointers for a completed scan. Shelf rows store
 * these pointers rather than a device-only `file://` URI so they remain usable
 * after the scanner session closes or the user signs in on another device.
 */
export async function getSavedScannerPhotoSummary(
  ownerId: string,
  scanId: string,
): Promise<SavedScannerPhotoSummary> {
  const rows = await listScannerPhotoRows(ownerId, scanId);
  const primary = rows.find((row) => row.isPrimary === true) ?? rows[0];

  return {
    coverPhotoId: rowFileId(primary) || null,
    photoCount: rows.length,
  };
}

export async function saveScannerPhoto({
  imageUri,
  ownerId,
  scanId,
  sortOrder,
  isPrimary,
}: SaveScannerPhotoInput): Promise<SavedScanPhoto> {
  const cleanOwnerId = ownerId.trim();
  const cleanScanId = scanId.trim();

  if (!cleanOwnerId) throw new Error("Sign in before saving a scanner photo.");
  if (!cleanScanId) throw new Error("The scanner session ID is missing.");
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 20) {
    throw new Error("The scanner photo order is invalid.");
  }

  const configuration = requiredConfiguration();
  const photo = openPhoto(imageUri);
  const itemPhotoId = ID.unique();
  const permissions = ownerPermissions(cleanOwnerId);

  const uploaded = await storage.createFile({
    bucketId: configuration.itemImagesBucketId,
    fileId: itemPhotoId,
    file: photo as any,
    permissions,
  });

  try {
    await tablesDB.createRow({
      databaseId: configuration.databaseId,
      tableId: configuration.itemPhotosTableId,
      rowId: itemPhotoId,
      data: {
        ownerId: cleanOwnerId,
        scanId: cleanScanId,
        fileId: uploaded.$id,
        sortOrder,
        isPrimary,
        createdAt: new Date().toISOString(),
      },
      permissions,
    });
  } catch (error) {
    try {
      await storage.deleteFile({
        bucketId: configuration.itemImagesBucketId,
        fileId: uploaded.$id,
      });
    } catch {
      // Preserve the row-creation failure as the useful error.
    }
    throw error;
  }

  return {
    itemPhotoId,
    scanId: cleanScanId,
    fileId: uploaded.$id,
    sortOrder,
    isPrimary,
    localUri: imageUri,
  };
}

export async function saveScannerRefinementPhoto({
  imageUri,
  ownerId,
  scanId,
}: Pick<SaveScannerPhotoInput, "imageUri" | "ownerId" | "scanId">): Promise<SavedScanPhoto> {
  const rows = await listScannerPhotoRows(ownerId, scanId);
  const highestSortOrder = rows.reduce((highest, row) => {
    const value =
      typeof row.sortOrder === "number" && Number.isInteger(row.sortOrder)
        ? row.sortOrder
        : -1;
    return Math.max(highest, value);
  }, -1);
  const sortOrder = highestSortOrder + 1;

  if (sortOrder > 20) {
    throw new Error("This scan already has the maximum number of saved photos.");
  }

  return saveScannerPhoto({
    imageUri,
    ownerId,
    scanId,
    sortOrder,
    isPrimary: false,
  });
}
