import { File as ExpoFile } from "expo-file-system";

import {
  ExecutionMethod,
  ID,
  Permission,
  Role,
  APPWRITE,
  account,
  functions,
  storage,
} from "@/lib/appwrite";

const MODEL_POLL_INTERVAL_MS = 2_500;
const MODEL_TIMEOUT_MS = 14 * 60 * 1_000;
const COMPLETED_MODEL_GRACE_MS = 20_000;

type AppwriteExecution = {
  $id: string;
  status?: string;
  errors?: string;
};

type AppwriteFile = {
  $id: string;
  name?: string;
  mimeType?: string;
  sizeOriginal?: number;
};

export type Tripo3dModelResult = {
  executionId: string;
  sourceBucketId: string;
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

export type CreateTripo3dModelInput = {
  imageUri: string;
  userId: string;
  itemId?: string;
};

function requiredFunctionId() {
  const value =
    process.env.EXPO_PUBLIC_APPWRITE_IMAGE_TO_MODEL_FUNCTION_ID?.trim();

  if (!value) {
    throw new Error(
      "Missing EXPO_PUBLIC_APPWRITE_IMAGE_TO_MODEL_FUNCTION_ID in .env",
    );
  }

  return value;
}

function requiredSourceBucketId() {
  const value = process.env.EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID?.trim();

  if (!value) {
    throw new Error(
      "Missing EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID in .env",
    );
  }

  return value;
}

function requiredModelBucketId() {
  const value = process.env.EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID?.trim();

  if (!value) {
    throw new Error(
      "Missing EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID in .env",
    );
  }

  return value;
}

function normalizeLocalUri(uri: string) {
  const trimmed = uri.trim();

  if (
    trimmed.startsWith("file://") ||
    trimmed.startsWith("content://") ||
    trimmed.startsWith("ph://")
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }

  return trimmed;
}

function createUploadFile(imageUri: string) {
  const file = new ExpoFile(normalizeLocalUri(imageUri));

  if (!file.exists) {
    throw new Error(
      "The selected source image no longer exists on this device.",
    );
  }

  if (file.size <= 0) {
    throw new Error("KeepFlip could not determine the source image file size.");
  }

  return file;
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
  try {
    const value = storage.getFileView({ bucketId, fileId });
    const url = String(value);

    return /^https?:\/\//i.test(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

async function getExecutionIfVisible(
  functionId: string,
  executionId: string,
): Promise<AppwriteExecution | null> {
  try {
    return (await functions.getExecution({
      functionId,
      executionId,
    })) as AppwriteExecution;
  } catch (error) {
    // Async executions can briefly return 404 before the execution record is
    // visible. The generated model file is the authoritative completion signal.
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function waitForGeneratedModel({
  functionId,
  executionId,
  modelBucketId,
  modelFileId,
}: {
  functionId: string;
  executionId: string;
  modelBucketId: string;
  modelFileId: string;
}): Promise<AppwriteFile> {
  const startedAt = Date.now();
  let completedAt: number | null = null;

  while (Date.now() - startedAt < MODEL_TIMEOUT_MS) {
    try {
      return (await storage.getFile({
        bucketId: modelBucketId,
        fileId: modelFileId,
      })) as AppwriteFile;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    const execution = await getExecutionIfVisible(functionId, executionId);
    const status = execution?.status?.toLowerCase();

    if (status === "failed" || status === "canceled") {
      throw new Error(
        execution?.errors?.trim() ||
          `The image-to-model Function ${status}. Check its Appwrite execution log.`,
      );
    }

    if (status === "completed") {
      completedAt ??= Date.now();
      if (Date.now() - completedAt > COMPLETED_MODEL_GRACE_MS) {
        throw new Error(
          "The image-to-model Function completed, but the expected GLB file was not saved to the model bucket.",
        );
      }
    }

    await sleep(MODEL_POLL_INTERVAL_MS);
  }

  throw new Error(
    "Tripo3D is still processing after 14 minutes. Check the Appwrite execution log before trying again.",
  );
}

export async function createTripo3dModelFromImage({
  imageUri,
  userId,
  itemId,
}: CreateTripo3dModelInput): Promise<Tripo3dModelResult> {
  const functionId = requiredFunctionId();
  const sourceBucketId = requiredSourceBucketId();
  const modelBucketId = requiredModelBucketId();
  const uploadFile = createUploadFile(imageUri);

  // This is the permanent scan image. It intentionally remains in the item
  // images bucket instead of being deleted after Tripo3D starts.
  const uploadedSource = await storage.createFile({
    bucketId: sourceBucketId,
    fileId: ID.unique(),
    file: uploadFile as any,
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });

  // The client chooses the final model file ID before starting the async
  // Function. That lets the app poll Storage directly. Appwrite does not retain
  // async Function response bodies, so the GLB file itself is the completion
  // signal.
  const modelFileId = ID.unique();

  const startedExecution = (await functions.createExecution({
    functionId,
    body: JSON.stringify({
      sourceFileId: uploadedSource.$id,
      modelFileId,
      ...(itemId?.trim() ? { itemId: itemId.trim() } : {}),
    }),
    async: true,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  })) as AppwriteExecution;

  const executionId = startedExecution.$id?.trim();
  if (!executionId) {
    throw new Error(
      "Appwrite accepted the model request but did not return an execution ID.",
    );
  }

  const modelFile = await waitForGeneratedModel({
    functionId,
    executionId,
    modelBucketId,
    modelFileId,
  });

  const modelUrl = createModelViewUrl(modelBucketId, modelFileId);
  if (!modelUrl) {
    throw new Error(
      "The generated model was saved, but KeepFlip could not create its Appwrite view URL.",
    );
  }

  const jwtResult = await account.createJWT({ duration: 900 });
  const modelJwt = jwtResult.jwt?.trim();
  if (!modelJwt) {
    throw new Error(
      "The generated model was saved, but KeepFlip could not authorize the 3D viewer.",
    );
  }

  return {
    executionId,
    sourceBucketId,
    sourceFileId: uploadedSource.$id,
    modelBucketId,
    modelFileId,
    modelFileName: modelFile.name || `${modelFileId}.glb`,
    modelMimeType: modelFile.mimeType || "model/gltf-binary",
    modelSizeBytes: modelFile.sizeOriginal || 0,
    modelUrl,
    modelProjectId: APPWRITE.projectId,
    modelJwt,
  };
}
