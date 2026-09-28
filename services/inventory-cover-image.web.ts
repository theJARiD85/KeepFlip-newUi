import { APPWRITE, ImageFormat, storage } from '@/lib/appwrite';

const PREVIEW_MAX_FILE_SIZE = 10 * 1024 * 1024;
const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 720;

function cleanFileId(value: string | null | undefined) {
  const fileId = value?.trim();
  return fileId || null;
}

function imageMimeType(bytes: Uint8Array, declaredMimeType?: string) {
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

  const normalizedMimeType = declaredMimeType
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();

  return normalizedMimeType?.startsWith('image/')
    ? normalizedMimeType
    : 'image/jpeg';
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

  const file = await storage.getFile({ bucketId, fileId });
  let response: ArrayBuffer | Uint8Array;
  let mimeType: string;

  if (
    file.sizeOriginal < PREVIEW_MAX_FILE_SIZE &&
    ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(
      file.mimeType.toLowerCase(),
    )
  ) {
    try {
      response = await storage.getFilePreview({
        bucketId,
        fileId,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        quality: 82,
        background: '06060A',
        output: ImageFormat.Jpeg,
      });
      mimeType = 'image/jpeg';
    } catch {
      // Unsupported or untransformable files can still be displayed from the
      // original bytes when the browser supports their actual image format.
      response = await storage.getFileView({ bucketId, fileId });
      mimeType = '';
    }
  } else {
    response = await storage.getFileView({ bucketId, fileId });
    mimeType = '';
  }

  const bytes = response instanceof Uint8Array ? response : new Uint8Array(response);

  if (!bytes.byteLength) return null;

  if (!mimeType) mimeType = imageMimeType(bytes, file.mimeType);

  const imageBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const image = new Blob([imageBuffer], { type: mimeType });

  return URL.createObjectURL(image);
}

export function releaseInventoryCoverImageUri(uri: string) {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
