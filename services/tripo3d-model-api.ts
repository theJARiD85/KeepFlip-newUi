import {
  APPWRITE,
  ExecutionMethod,
  functions,
  getAppwriteCoreServices,
  storage,
  tablesDB,
} from "@/lib/appwrite";

const MODEL_POLL_INTERVAL_MS = 2_500;
const MODEL_TIMEOUT_MS = 14 * 60 * 1_000;

type ModelFileRow = {
  $id: string;
  sourceFileId?: string;
  fileId?: string | null;
  status?: string;
  errorMessage?: string | null;
};

type AppwriteFile = {
  $id: string;
  name?: string;
  mimeType?: string;
  sizeOriginal?: number;
};

export type Tripo3dModelResult = {
  itemPhotoId: string;
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
  itemPhotoId: string;
};

function requiredConfiguration() {
  const missing = [
    !APPWRITE.databaseId ? "EXPO_PUBLIC_APPWRITE_DATABASE_ID" : null,
    !APPWRITE.modelFilesTableId
      ? "EXPO_PUBLIC_APPWRITE_MODEL_FILES_COLLECTION_ID"
      : null,
    !APPWRITE.modelFilesBucketId
      ? "EXPO_PUBLIC_APPWRITE_MODEL_BUCKET_ID"
      : null,
    !APPWRITE.imageToModelFunctionId
      ? "EXPO_PUBLIC_APPWRITE_IMAGE_TO_MODEL_FUNCTION_ID"
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `KeepFlip 3D model loading needs Appwrite configuration: ${missing.join(", ")}`,
    );
  }

  return {
    databaseId: APPWRITE.databaseId,
    modelFilesTableId: APPWRITE.modelFilesTableId,
    modelBucketId: APPWRITE.modelFilesBucketId,
    functionId: APPWRITE.imageToModelFunctionId,
  };
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

async function executeImageToModelFunction(
  functionId: string,
  itemPhotoId: string,
) {
  await functions.createExecution({
    functionId,
    body: JSON.stringify({ itemPhotoId }),
    async: true,
    path: "/",
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function waitForReadyModelRow(
  databaseId: string,
  modelFilesTableId: string,
  itemPhotoId: string,
): Promise<ModelFileRow> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MODEL_TIMEOUT_MS) {
    try {
      const row = (await tablesDB.getRow({
        databaseId,
        tableId: modelFilesTableId,
        rowId: itemPhotoId,
      })) as unknown as ModelFileRow;
      const status = row.status?.trim().toLowerCase();

      if (status === "ready" && row.fileId?.trim()) return row;

      if (status === "failed") {
        throw new Error(
          row.errorMessage?.trim() ||
            "The image-to-model Function could not generate this 3D model.",
        );
      }
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
 * scanner-screen.native.tsx has already uploaded the source image and created
 * the item_photos row. The app now explicitly invokes the Function with that
 * row ID, then waits for the matching model_files row to become ready.
 */
export async function waitForTripo3dModel({
  itemPhotoId,
}: WaitForTripo3dModelInput): Promise<Tripo3dModelResult> {
  const cleanedItemPhotoId = itemPhotoId.trim();
  if (!cleanedItemPhotoId) {
    throw new Error("An item photo row ID is required to generate its 3D model.");
  }

  const configuration = requiredConfiguration();

  await executeImageToModelFunction(
    configuration.functionId,
    cleanedItemPhotoId,
  );

  const modelRow = await waitForReadyModelRow(
    configuration.databaseId,
    configuration.modelFilesTableId,
    cleanedItemPhotoId,
  );
  const modelFileId = modelRow.fileId?.trim();

  if (!modelFileId) {
    throw new Error(
      "The model record is ready, but it does not contain a GLB file ID.",
    );
  }

  const modelFile = (await storage.getFile({
    bucketId: configuration.modelBucketId,
    fileId: modelFileId,
  })) as AppwriteFile;
  const modelUrl = createModelViewUrl(
    configuration.modelBucketId,
    modelFileId,
  );

  const { account } = getAppwriteCoreServices();
  const jwtResult = await account.createJWT({ duration: 900 });
  const modelJwt = jwtResult.jwt?.trim();
  if (!modelJwt) {
    throw new Error(
      "The generated model was saved, but KeepFlip could not authorize the 3D viewer.",
    );
  }

  return {
    itemPhotoId: cleanedItemPhotoId,
    sourceFileId: modelRow.sourceFileId?.trim() || cleanedItemPhotoId,
    modelBucketId: configuration.modelBucketId,
    modelFileId,
    modelFileName: modelFile.name || `${modelFileId}.glb`,
    modelMimeType: modelFile.mimeType || "model/gltf-binary",
    modelSizeBytes: modelFile.sizeOriginal || 0,
    modelUrl,
    modelProjectId: APPWRITE.projectId,
    modelJwt,
  };
}
