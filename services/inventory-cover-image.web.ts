import { APPWRITE, storage } from '@/lib/appwrite';

function cleanFileId(value: string | null | undefined) {
  const fileId = value?.trim();
  return fileId || null;
}

function imageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
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
    return 'image/webp';
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  return 'image/jpeg';
}

/**
 * Download private Appwrite images through the authenticated SDK request,
 * then expose the bytes to expo-image through a browser-local object URL.
 * A plain view URL does not reliably carry the signed-in SDK session in web
 * browsers where Appwrite's cross-site cookies are blocked.
 */
export async function resolveInventoryCoverImageUri(
  coverPhotoId: string | null | undefined,
): Promise<string | null> {
  const fileId = cleanFileId(coverPhotoId);
  const bucketId = APPWRITE.itemImagesBucketId;

  if (!fileId || !bucketId) {
    return null;
  }

  const response = await storage.getFileView({ bucketId, fileId });
  const bytes =
    response instanceof Uint8Array ? response : new Uint8Array(response);

  if (!bytes.byteLength) return null;

  const imageBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const image = new Blob([imageBuffer], { type: imageMimeType(bytes) });

  return URL.createObjectURL(image);
}

export function releaseInventoryCoverImageUri(uri: string) {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
