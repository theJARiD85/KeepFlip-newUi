import { File, Paths } from "expo-file-system";

import { APPWRITE, storage } from "@/lib/appwrite";

const CACHE_FILE_PREFIX = "keepflip-inventory-cover-";
const CACHED_EXTENSIONS = ["jpg", "png", "webp"] as const;

function cleanFileId(value: string | null | undefined) {
  const fileId = value?.trim();
  return fileId || null;
}

function safeCacheName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

function imageExtension(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return "jpg";
}

/**
 * Makes a private Appwrite image readable by expo-image without putting a
 * short-lived authenticated URL into a long-lived inventory card.
 */
export async function resolveInventoryCoverImageUri(
  coverPhotoId: string | null | undefined,
): Promise<string | null> {
  const fileId = cleanFileId(coverPhotoId);
  const bucketId = APPWRITE.itemImagesBucketId;

  if (!fileId || !bucketId) {
    return null;
  }

  const safeId = safeCacheName(fileId);

  for (const extension of CACHED_EXTENSIONS) {
    const cachedFile = new File(
      Paths.cache,
      `${CACHE_FILE_PREFIX}${safeId}.${extension}`,
    );

    if (cachedFile.exists) {
      return cachedFile.uri;
    }
  }

  const response = await storage.getFileView({
    bucketId,
    fileId,
  });
  const bytes =
    response instanceof Uint8Array
      ? response
      : new Uint8Array(response);

  if (bytes.byteLength === 0) {
    return null;
  }

  const cacheFile = new File(
    Paths.cache,
    `${CACHE_FILE_PREFIX}${safeId}.${imageExtension(bytes)}`,
  );

  cacheFile.create({
    intermediates: true,
    overwrite: true,
  });
  cacheFile.write(bytes);

  return cacheFile.uri;
}
