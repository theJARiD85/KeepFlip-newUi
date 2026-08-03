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

export async function getPrimaryScannerPhotoFileId(
  ownerId: string,
  scanId: string,
): Promise<string> {
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
  const rows = response.rows as unknown as {
    fileId?: unknown;
    isPrimary?: unknown;
  }[];
  const primary = rows.find((row) => row.isPrimary === true) ?? rows[0];
  const fileId =
    typeof primary?.fileId === "string" ? primary.fileId.trim() : "";

  if (!fileId) {
    throw new Error(
      "Save the scan photo before answering valuation questions.",
    );
  }

  return fileId;
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
