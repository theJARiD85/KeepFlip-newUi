import { File } from 'expo-file-system';
import {
  AppwriteException,
  ExecutionMethod,
  ID,
  Permission,
  Role,
} from 'react-native-appwrite';

import { getAppwriteServices } from '@/lib/appwrite';

export const MIN_PHOTOGRAMMETRY_PHOTOS = 12;
export const MAX_PHOTOGRAMMETRY_PHOTOS = 96;

const PHOTOGRAMMETRY_FUNCTION_ID =
  process.env.EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_FUNCTION_ID?.trim() || '';
const PHOTOGRAMMETRY_INPUT_BUCKET_ID =
  process.env.EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_INPUT_BUCKET_ID?.trim() || '';

type PhotogrammetryJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface PhotogrammetryJob {
  id: string;
  status: PhotogrammetryJobStatus;
  progress: number;
  photoCount: number;
  modelUrl?: string;
  modelFileId?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

type FunctionResponse = {
  success?: boolean;
  message?: string;
  job?: Partial<PhotogrammetryJob> & { id?: string };
  jobId?: string;
  status?: PhotogrammetryJobStatus;
  progress?: number;
  photoCount?: number;
  modelUrl?: string;
  modelFileId?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
};

function assertConfigured() {
  const missing = [
    !PHOTOGRAMMETRY_FUNCTION_ID
      ? 'EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_FUNCTION_ID'
      : null,
    !PHOTOGRAMMETRY_INPUT_BUCKET_ID
      ? 'EXPO_PUBLIC_APPWRITE_PHOTOGRAMMETRY_INPUT_BUCKET_ID'
      : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `KeepFlip 3D scanning needs Appwrite configuration: ${missing.join(', ')}`,
    );
  }
}

function normalizePhotoUri(uri: string) {
  const trimmed = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function createUploadFile(uri: string, index: number) {
  const file = new File(normalizePhotoUri(uri));
  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error(`3D scan photo ${index + 1} is no longer available.`);
  }

  const extension = file.extension || '.jpg';
  const declaredType = file.type?.toLowerCase();
  const type =
    declaredType === 'image/png' ||
    declaredType === 'image/webp' ||
    declaredType === 'image/jpeg'
      ? declaredType
      : extension.toLowerCase() === '.png'
        ? 'image/png'
        : extension.toLowerCase() === '.webp'
          ? 'image/webp'
          : 'image/jpeg';

  return {
    name: `keepflip-3d-${Date.now()}-${String(index + 1).padStart(3, '0')}${extension}`,
    type,
    size: file.size,
    uri: file.uri,
  };
}

function parseFunctionResponse(responseBody: string): FunctionResponse {
  if (!responseBody.trim()) {
    throw new Error('The photogrammetry backend returned an empty response.');
  }

  try {
    return JSON.parse(responseBody) as FunctionResponse;
  } catch {
    throw new Error('The photogrammetry backend returned invalid JSON.');
  }
}

function normalizedJob(response: FunctionResponse): PhotogrammetryJob {
  const source = response.job ?? response;
  const id = source.id ?? response.jobId;
  const status = source.status ?? response.status;

  if (!id || !status) {
    throw new Error(response.message || 'The photogrammetry job response was incomplete.');
  }

  return {
    id,
    status,
    progress: Math.max(0, Math.min(100, Number(source.progress ?? response.progress) || 0)),
    photoCount: Math.max(0, Number(source.photoCount ?? response.photoCount) || 0),
    modelUrl: source.modelUrl ?? response.modelUrl,
    modelFileId: source.modelFileId ?? response.modelFileId,
    error: source.error ?? response.error,
    createdAt: source.createdAt ?? response.createdAt,
    updatedAt: source.updatedAt ?? response.updatedAt,
  };
}

async function deleteUploadedFiles(fileIds: readonly string[]) {
  if (!PHOTOGRAMMETRY_INPUT_BUCKET_ID || fileIds.length === 0) return;
  const { storage } = getAppwriteServices();

  await Promise.allSettled(
    fileIds.map((fileId) =>
      storage.deleteFile({
        bucketId: PHOTOGRAMMETRY_INPUT_BUCKET_ID,
        fileId,
      }),
    ),
  );
}

async function invokeBackend(body: Record<string, unknown>) {
  const { functions } = getAppwriteServices();
  const execution = await functions.createExecution({
    functionId: PHOTOGRAMMETRY_FUNCTION_ID,
    body: JSON.stringify(body),
    async: false,
    xpath: '/',
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });

  const parsed = parseFunctionResponse(execution.responseBody || '');
  if (execution.responseStatusCode >= 400 || parsed.success === false) {
    throw new Error(parsed.message || `Photogrammetry request failed (${execution.responseStatusCode}).`);
  }

  return parsed;
}

export const PhotogrammetryAPI = {
  async uploadImageSequence(imageUris: readonly string[]): Promise<string> {
    const job = await this.createJob(imageUris);
    return job.id;
  },

  async createJob(imageUris: readonly string[]): Promise<PhotogrammetryJob> {
    assertConfigured();

    const uniqueUris = [...new Set(imageUris.map((uri) => uri.trim()).filter(Boolean))];
    if (uniqueUris.length < MIN_PHOTOGRAMMETRY_PHOTOS) {
      throw new Error(
        `Capture at least ${MIN_PHOTOGRAMMETRY_PHOTOS} distinct angles before generating a 3D mesh.`,
      );
    }
    if (uniqueUris.length > MAX_PHOTOGRAMMETRY_PHOTOS) {
      throw new Error(
        `A 3D scan can contain at most ${MAX_PHOTOGRAMMETRY_PHOTOS} photos.`,
      );
    }

    const { account, storage } = getAppwriteServices();
    const user = await account.get();
    const permissions = [
      Permission.read(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ];
    const uploadedFileIds: string[] = [];

    try {
      for (const [index, imageUri] of uniqueUris.entries()) {
        const uploaded = await storage.createFile({
          bucketId: PHOTOGRAMMETRY_INPUT_BUCKET_ID,
          fileId: ID.unique(),
          file: createUploadFile(imageUri, index),
          permissions,
        });
        uploadedFileIds.push(uploaded.$id);
      }

      const response = await invokeBackend({
        action: 'create_job',
        fileIds: uploadedFileIds,
        photoCount: uploadedFileIds.length,
        client: {
          platform: process.env.EXPO_OS || 'unknown',
          contractVersion: 1,
        },
      });

      return normalizedJob(response);
    } catch (error) {
      await deleteUploadedFiles(uploadedFileIds);
      if (error instanceof AppwriteException) {
        throw new Error(`Unable to upload the 3D scan: ${error.message}`);
      }
      throw error;
    }
  },

  async getJobStatus(jobId: string): Promise<PhotogrammetryJob> {
    assertConfigured();
    const cleanedJobId = jobId.trim();
    if (!cleanedJobId) throw new Error('A photogrammetry job ID is required.');

    const response = await invokeBackend({
      action: 'check_status',
      jobId: cleanedJobId,
    });
    return normalizedJob(response);
  },

  async cancelJob(jobId: string): Promise<PhotogrammetryJob> {
    assertConfigured();
    const cleanedJobId = jobId.trim();
    if (!cleanedJobId) throw new Error('A photogrammetry job ID is required.');

    const response = await invokeBackend({
      action: 'cancel_job',
      jobId: cleanedJobId,
    });
    return normalizedJob(response);
  },
};
