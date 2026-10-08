import { APPWRITE, ImageFormat, storage } from '@/lib/appwrite';
import type { CrosslistingPhotoAsset } from '@/services/crosslisting-service';

const MAX_PHOTOS = 8;
const MAX_TOTAL_BYTES = 2_000_000;

function toDataUrl(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Photo conversion failed.'));
    reader.onerror = () => reject(new Error('Photo conversion failed.'));
    reader.readAsDataURL(new Blob([buffer], { type: 'image/jpeg' }));
  });
}

/** Fetch only this owner's saved photo previews through the signed-in Appwrite SDK. */
export async function loadCrosslistingExtensionPhotos(fileIds: string[]): Promise<{ photos: CrosslistingPhotoAsset[]; unavailablePhotoCount: number }> {
  const candidates = [...new Set(fileIds.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_PHOTOS);
  const photos: CrosslistingPhotoAsset[] = [];
  let unavailablePhotoCount = Math.max(0, fileIds.length - candidates.length);
  let totalBytes = 0;
  if (!APPWRITE.itemImagesBucketId) return { photos, unavailablePhotoCount: fileIds.length };

  for (const [index, fileId] of candidates.entries()) {
    try {
      const response = await storage.getFilePreview({
        bucketId: APPWRITE.itemImagesBucketId, fileId,
        width: 1200, height: 1200, quality: 70, output: ImageFormat.Jpeg,
      });
      const bytes = response instanceof Uint8Array ? response : new Uint8Array(response);
      if (!bytes.byteLength || totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
        unavailablePhotoCount += candidates.length - index;
        break;
      }
      totalBytes += bytes.byteLength;
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      photos.push({ name: `keepflip-item-photo-${index + 1}.jpg`, dataUrl: await toDataUrl(buffer) });
    } catch {
      unavailablePhotoCount += 1;
    }
  }
  return { photos, unavailablePhotoCount };
}
