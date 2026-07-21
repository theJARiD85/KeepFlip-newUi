import { APPWRITE, account, storage } from "@/lib/appwrite";

const MODEL_POLL_INTERVAL_MS = 2_500;
const MODEL_TIMEOUT_MS = 14 * 60 * 1_000;

type AppwriteFile = {
  $id: string;
  name?: string;
  mimeType?: string;
  sizeOriginal?: number;
};

export type Tripo3dModelResult = {
  sourceFileId: string;
  modelBucketId: string;
  modelFileId: string;
  modelFileName: string;
  modelMimeType: string;
  modelSizeBytes: number;
  modelUrl: string;
  modelProjectId: string;
  modelJwt: string;
};

export type WaitForTripo3dModelInput = {
  sourceFileId: string;
};

function requiredModelBucketId() {
  const value = process.env.EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID?.trim();

  if (!value) {
    throw new Error(
      "Missing EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID in .env.local.",
    );
  }

  return value;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const value = Number((error as { code?: unknown }).code);
  return Number.isFinite(value) ? value : null;
}

function isNotFound(error: unknown) {
  return errorCode(error) === 404;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createModelViewUrl(bucketId: string, fileId: string) {
  const value = storage.getFileView({ bucketId, fileId });
  const url = String(value);

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      "The generated model was saved, but KeepFlip could not create its Appwrite view URL.",
    );
  }

  return url;
}

async function waitForModelFile(
  modelBucketId: string,
  sourceFileId: string,
): Promise<AppwriteFile> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MODEL_TIMEOUT_MS) {
    try {
      return (await storage.getFile({
        bucketId: modelBucketId,
        fileId: sourceFileId,
      })) as AppwriteFile;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    await sleep(MODEL_POLL_INTERVAL_MS);
  }

  throw new Error(
    "Tripo3D is still processing after 14 minutes. Check the image-to-model Function execution log.",
  );
}

/**
 * The scanner has already saved the source image to the item-images bucket.
 * That Storage upload triggers the Appwrite image-to-model Function. This
 * client only waits for the GLB whose file ID matches the source image ID.
 */
export async function waitForTripo3dModel({
  sourceFileId,
}: WaitForTripo3dModelInput): Promise<Tripo3dModelResult> {
  const cleanedSourceFileId = sourceFileId.trim();
  if (!cleanedSourceFileId) {
    throw new Error("A saved scan file ID is required to load its 3D model.");
  }

  const modelBucketId = requiredModelBucketId();
  const modelFile = await waitForModelFile(
    modelBucketId,
    cleanedSourceFileId,
  );
  const modelUrl = createModelViewUrl(modelBucketId, cleanedSourceFileId);

  const jwtResult = await account.createJWT({ duration: 900 });
  const modelJwt = jwtResult.jwt?.trim();
  if (!modelJwt) {
    throw new Error(
      "The generated model was saved, but KeepFlip could not authorize the 3D viewer.",
    );
  }

  return {
    sourceFileId: cleanedSourceFileId,
    modelBucketId,
    modelFileId: modelFile.$id,
    modelFileName: modelFile.name || `${cleanedSourceFileId}.glb`,
    modelMimeType: modelFile.mimeType || "model/gltf-binary",
    modelSizeBytes: modelFile.sizeOriginal || 0,
    modelUrl,
    modelProjectId: APPWRITE.projectId,
    modelJwt,
  };
}
