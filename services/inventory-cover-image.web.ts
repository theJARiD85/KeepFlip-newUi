import { APPWRITE, storage } from '@/lib/appwrite';

function cleanFileId(value: string | null | undefined) {
  const fileId = value?.trim();
  return fileId || null;
}

/**
 * Browsers can render Appwrite's view URL directly. The native implementation
 * intentionally downloads the private bytes into the device cache instead,
 * but expo-file-system has no equivalent browser cache API.
 */
export async function resolveInventoryCoverImageUri(
  coverPhotoId: string | null | undefined,
): Promise<string | null> {
  const fileId = cleanFileId(coverPhotoId);
  const bucketId = APPWRITE.itemImagesBucketId;

  if (!fileId || !bucketId) {
    return null;
  }

  return storage.getFileViewURL(bucketId, fileId).toString();
}
