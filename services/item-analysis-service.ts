import { File } from 'expo-file-system';
import {
  AppwriteException,
  ExecutionMethod,
  ID,
  Permission,
  Role,
  type Account,
  type Functions,
  type Storage,
} from 'react-native-appwrite';

import {
  AppwriteSetupError,
  getAppwriteServices,
} from '@/lib/appwrite';
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  type AnalyzeItemPhotosInput,
  type AnalyzeItemPhotosOptions,
  type ItemAnalysisEvidenceSource,
  type ItemAnalysisEvidenceStrength,
  type ItemAnalysisFailure,
  type ItemAnalysisFunctionRequest,
  type ItemMarketResearch,
  type ItemAnalysisStage,
  type ItemAnalysisSuccess,
  type ItemAnalysisResponse,
  type ItemSoldComparable,
  type ItemValuation,
} from '@/types/item-analysis';

export { AppwriteSetupError } from '@/lib/appwrite';
export type {
  AnalyzeItemPhotosInput,
  AnalyzeItemPhotosOptions,
  ItemAnalysisResult,
  ItemAnalysisStage,
  ItemAnalysisSuccess,
} from '@/types/item-analysis';

const MAX_ANALYSIS_PHOTOS = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PHOTO_BYTES = 24 * 1024 * 1024;
const MAX_USER_NOTES_CHARACTERS = 4_000;
const MAX_OCR_CHARACTERS = 12_000;
const MAX_COMPARABLES = 100;
const MAX_COMPARABLE_PRICE = 10_000_000;
const MAX_FUNCTION_ERROR_CHARACTERS = 16_384;
const MAX_FUNCTION_RESPONSE_CHARACTERS = 1_000_000;
const EBAY_COMPS_LIMIT = 12;
const EBAY_POLL_INTERVAL_MS = 1_500;
const EBAY_RESEARCH_TIMEOUT_MS = 90_000;

export class ItemAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ItemAnalysisError';
  }
}

function createAbortError() {
  const error = new Error('Item analysis was canceled.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function reportStage(
  onStage: AnalyzeItemPhotosOptions['onStage'],
  stage: ItemAnalysisStage,
) {
  // Progress reporting is observational and must never interrupt paid work or
  // prevent private temporary uploads from being removed.
  try {
    onStage?.(stage);
  } catch {
    // Ignore errors raised by presentation callbacks.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return typeof value === 'number' || value === null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIdentification(value: unknown) {
  if (!isRecord(value)) return false;
  return [
    value.itemType,
    value.category,
    value.brand,
    value.model,
    value.variant,
    value.color,
    value.era,
    value.serialNumber,
  ].every(isStringOrNull);
}

function isCondition(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    [
      'new',
      'like_new',
      'excellent',
      'good',
      'fair',
      'poor',
      'unknown',
    ].includes(String(value.grade)) &&
    isFiniteNumber(value.confidence) &&
    isStringArray(value.notes)
  );
}

function isConfidence(value: unknown) {
  if (!isRecord(value)) return false;
  return [
    value.overall,
    value.itemType,
    value.brand,
    value.model,
    value.condition,
  ].every(isFiniteNumber);
}

function isEvidence(value: unknown) {
  if (!isRecord(value)) return false;
  const sources: ItemAnalysisEvidenceSource[] = [
    'photo_visual',
    'photo_text',
    'user_notes',
    'google_vision',
  ];
  const strengths: ItemAnalysisEvidenceStrength[] = ['high', 'medium', 'low'];

  return (
    typeof value.claim === 'string' &&
    typeof value.value === 'string' &&
    sources.includes(value.source as ItemAnalysisEvidenceSource) &&
    (value.imageIndex === null || Number.isInteger(value.imageIndex)) &&
    strengths.includes(value.strength as ItemAnalysisEvidenceStrength) &&
    typeof value.rationale === 'string'
  );
}

function isValuationSignals(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.searchTerms) &&
    isStringOrNull(value.category) &&
    typeof value.conditionAdjustment === 'string' &&
    isStringArray(value.positiveFactors) &&
    isStringArray(value.negativeFactors)
  );
}

function isAnalysis(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.summary === 'string' &&
    isIdentification(value.identification) &&
    isCondition(value.condition) &&
    isConfidence(value.confidence) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidence) &&
    isStringArray(value.ambiguities) &&
    isStringArray(value.suggestedPhotos) &&
    isValuationSignals(value.valuationSignals)
  );
}

function isVision(value: unknown) {
  if (!isRecord(value)) return false;
  if (
    typeof value.enabled !== 'boolean' ||
    typeof value.succeeded !== 'boolean' ||
    !isStringArray(value.warnings) ||
    !Array.isArray(value.images)
  ) {
    return false;
  }

  return value.images.every((image) => {
    if (!isRecord(image)) return false;
    return (
      Number.isInteger(image.imageIndex) &&
      isStringOrNull(image.text) &&
      Array.isArray(image.labels) &&
      image.labels.every(
        (label) =>
          isRecord(label) &&
          typeof label.description === 'string' &&
          isFiniteNumber(label.score),
      ) &&
      Array.isArray(image.objects) &&
      image.objects.every(
        (object) =>
          isRecord(object) &&
          typeof object.name === 'string' &&
          isFiniteNumber(object.score),
      )
    );
  });
}

function isValuation(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    ['ready', 'limited_comps', 'needs_comps'].includes(String(value.status)) &&
    isStringOrNull(value.currency) &&
    isFiniteNumber(value.suppliedCount) &&
    isFiniteNumber(value.usedCount) &&
    isFiniteNumber(value.rejectedCount) &&
    isNumberOrNull(value.median) &&
    isNumberOrNull(value.p20) &&
    isNumberOrNull(value.p80) &&
    ['median_linear_p20_p80_mad_outlier_filter_v1', 'none'].includes(
      String(value.methodology),
    ) &&
    (value.source === undefined ||
      ['caller_supplied', 'ebay_sold', 'none'].includes(String(value.source)))
  );
}

function isItemAnalysisSuccess(value: unknown): value is ItemAnalysisSuccess {
  if (!isRecord(value) || value.ok !== true) return false;
  if (!isRecord(value.input)) return false;

  return (
    value.contractVersion === ITEM_ANALYSIS_CONTRACT_VERSION &&
    typeof value.version === 'string' &&
    value.version.trim().length > 0 &&
    ['identified', 'insufficient_evidence'].includes(String(value.status)) &&
    isFiniteNumber(value.input.imageCount) &&
    ['appwrite_storage', 'direct', 'mixed'].includes(String(value.input.source)) &&
    isAnalysis(value.analysis) &&
    isVision(value.vision) &&
    isValuation(value.valuation)
  );
}

function isItemAnalysisFailure(value: unknown): value is ItemAnalysisFailure {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.code === 'string' &&
    value.error.code.length > 0 &&
    value.error.code.length <= 80 &&
    typeof value.error.message === 'string' &&
    value.error.message.length > 0 &&
    value.error.message.length <= 500
  );
}

function parseFunctionResponse(responseBody: string): ItemAnalysisResponse {
  if (
    !responseBody ||
    responseBody.length > MAX_FUNCTION_RESPONSE_CHARACTERS
  ) {
    throw new ItemAnalysisError(
      'The analysis service returned an unexpected response.',
      'INVALID_FUNCTION_RESPONSE',
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(responseBody);
  } catch (error) {
    throw new ItemAnalysisError(
      'The analysis service returned unreadable data.',
      'INVALID_FUNCTION_RESPONSE',
      undefined,
      { cause: error },
    );
  }

  if (isItemAnalysisSuccess(parsed) || isItemAnalysisFailure(parsed)) {
    return parsed;
  }

  throw new ItemAnalysisError(
    'The analysis service returned an unexpected response.',
    'INVALID_FUNCTION_RESPONSE',
  );
}

function parseBoundedFunctionFailure(
  responseBody: string,
): ItemAnalysisFailure | null {
  if (
    !responseBody ||
    responseBody.length > MAX_FUNCTION_ERROR_CHARACTERS
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(responseBody);
    return isItemAnalysisFailure(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type EbayStartedResponse = {
  ok: true;
  phase: 'started';
  runId: string;
  query: string;
};

type EbayRunningResponse = {
  ok: true;
  phase: 'running';
  runId: string;
  query: string;
};

type EbayCompletedResponse = {
  ok: true;
  phase: 'completed';
  runId: string;
  query: string;
  comps: ItemSoldComparable[];
  valuation: ItemValuation;
  searchedAt: string;
};

type EbayFunctionResponse =
  | EbayStartedResponse
  | EbayRunningResponse
  | EbayCompletedResponse;

function isSoldComparable(value: unknown): value is ItemSoldComparable {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === 'string' &&
    isFiniteNumber(value.soldPrice) &&
    isFiniteNumber(value.shipping) &&
    isFiniteNumber(value.totalPrice) &&
    typeof value.currency === 'string' &&
    isStringOrNull(value.condition) &&
    isStringOrNull(value.soldDate) &&
    isStringOrNull(value.imageUrl) &&
    isStringOrNull(value.listingUrl)
  );
}

function parseEbayFunctionResponse(responseBody: string): EbayFunctionResponse {
  if (!responseBody || responseBody.length > MAX_FUNCTION_RESPONSE_CHARACTERS) {
    throw new ItemAnalysisError(
      'The eBay sold-comps service returned an unexpected response.',
      'INVALID_EBAY_COMPS_RESPONSE',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch (error) {
    throw new ItemAnalysisError(
      'The eBay sold-comps service returned unreadable data.',
      'INVALID_EBAY_COMPS_RESPONSE',
      undefined,
      { cause: error },
    );
  }

  if (isRecord(parsed) && parsed.ok === false) {
    throw new ItemAnalysisError(
      typeof parsed.error === 'string'
        ? parsed.error
        : 'KeepFlip could not research eBay sold comps.',
      'EBAY_COMPS_REQUEST_FAILED',
    );
  }

  if (!isRecord(parsed) || parsed.ok !== true || typeof parsed.phase !== 'string') {
    throw new ItemAnalysisError(
      'The eBay sold-comps service returned an unexpected response.',
      'INVALID_EBAY_COMPS_RESPONSE',
    );
  }

  if (
    (parsed.phase === 'started' || parsed.phase === 'running') &&
    typeof parsed.runId === 'string' &&
    typeof parsed.query === 'string'
  ) {
    return parsed as EbayStartedResponse | EbayRunningResponse;
  }

  if (
    parsed.phase === 'completed' &&
    typeof parsed.runId === 'string' &&
    typeof parsed.query === 'string' &&
    typeof parsed.searchedAt === 'string' &&
    Array.isArray(parsed.comps) &&
    parsed.comps.every(isSoldComparable) &&
    isValuation(parsed.valuation)
  ) {
    return parsed as EbayCompletedResponse;
  }

  throw new ItemAnalysisError(
    'The eBay sold-comps service returned an unexpected response.',
    'INVALID_EBAY_COMPS_RESPONSE',
  );
}

function waitForDelay(milliseconds: number, signal?: AbortSignal) {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function executeEbayFunction(
  functions: Functions,
  functionId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
    headers: { 'content-type': 'application/json' },
  });
  throwIfAborted(signal);

  if (
    execution.status !== 'completed' ||
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300
  ) {
    let providerMessage: string | undefined;
    try {
      const parsed: unknown = JSON.parse(execution.responseBody);
      if (isRecord(parsed) && typeof parsed.error === 'string') {
        providerMessage = parsed.error;
      }
    } catch {
      // Fall through to a bounded generic failure.
    }

    throw new ItemAnalysisError(
      providerMessage || 'The eBay sold-comps function did not complete successfully.',
      'EBAY_COMPS_EXECUTION_FAILED',
      {
        executionId: execution.$id,
        executionStatus: execution.status,
        responseStatusCode: execution.responseStatusCode,
      },
    );
  }

  return parseEbayFunctionResponse(execution.responseBody);
}

function appendUniqueQueryPart(parts: string[], value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  if (!cleaned) return;
  const normalized = cleaned.toLocaleLowerCase();
  if (parts.some((part) => part.toLocaleLowerCase() === normalized)) return;
  parts.push(cleaned);
}

function buildEbaySoldCompsQuery(result: ItemAnalysisSuccess) {
  const identity = result.analysis.identification;
  const parts: string[] = [];
  appendUniqueQueryPart(parts, identity.brand);
  appendUniqueQueryPart(parts, identity.model);
  appendUniqueQueryPart(parts, identity.variant);
  appendUniqueQueryPart(parts, identity.itemType);

  if (parts.length === 0) {
    appendUniqueQueryPart(parts, result.analysis.valuationSignals.searchTerms[0]);
    appendUniqueQueryPart(parts, identity.category);
  }

  return parts.join(' ').slice(0, 180).trim();
}

function marketResearchFailure(
  status: ItemMarketResearch['status'],
  code: string,
  message: string,
  query: string | null,
): ItemMarketResearch {
  return {
    provider: 'ebay',
    status,
    query,
    searchedAt: null,
    comparableCount: 0,
    comps: [],
    error: { code, message },
  };
}

async function researchEbaySoldComps(
  result: ItemAnalysisSuccess,
  functions: Functions,
  functionId: string,
  signal?: AbortSignal,
): Promise<ItemAnalysisSuccess> {
  const query = buildEbaySoldCompsQuery(result);
  if (result.status !== 'identified' || query.length < 3) {
    return {
      ...result,
      marketResearch: marketResearchFailure(
        'unavailable',
        'IDENTIFICATION_NOT_READY_FOR_COMPS',
        'More identifying evidence is needed before searching sold comps.',
        query || null,
      ),
    };
  }

  const startedAt = Date.now();
  const started = await executeEbayFunction(
    functions,
    functionId,
    { action: 'start', query, limit: EBAY_COMPS_LIMIT },
    signal,
  );
  if (started.phase !== 'started') {
    throw new ItemAnalysisError(
      'The eBay sold-comps service did not start a research run.',
      'EBAY_COMPS_START_FAILED',
    );
  }

  while (Date.now() - startedAt < EBAY_RESEARCH_TIMEOUT_MS) {
    await waitForDelay(EBAY_POLL_INTERVAL_MS, signal);
    const status = await executeEbayFunction(
      functions,
      functionId,
      {
        action: 'status',
        runId: started.runId,
        query: started.query,
        limit: EBAY_COMPS_LIMIT,
      },
      signal,
    );

    if (status.phase !== 'completed') continue;
    return {
      ...result,
      valuation: { ...status.valuation, source: 'ebay_sold' },
      marketResearch: {
        provider: 'ebay',
        status: 'completed',
        query: status.query,
        searchedAt: status.searchedAt,
        comparableCount: status.valuation.usedCount,
        comps: status.comps,
      },
    };
  }

  throw new ItemAnalysisError(
    'eBay sold-comps research took too long. The item identification is still available.',
    'EBAY_COMPS_TIMEOUT',
  );
}

function normalizePhotoUri(uri: string) {
  const trimmed = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function mimeTypeForFile(file: File) {
  const declaredType = file.type?.toLowerCase();
  if (declaredType === 'image/jpeg' || declaredType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (declaredType === 'image/png' || declaredType === 'image/webp') {
    return declaredType;
  }

  switch (file.extension.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.jfif':
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg';
    default:
      throw new ItemAnalysisError(
        'Use a JPEG, PNG, or WebP photo for item analysis.',
        'UNSUPPORTED_PHOTO_TYPE',
        { fileName: file.name, declaredType: file.type || null },
      );
  }
}

function localUploadFile(uri: string, index: number) {
  let file: File;

  try {
    file = new File(normalizePhotoUri(uri));
  } catch (error) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} could not be opened.`,
      'PHOTO_UNREADABLE',
      { index, uri },
      { cause: error },
    );
  }

  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} is missing or empty.`,
      'PHOTO_NOT_FOUND',
      { index, uri: file.uri },
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} is larger than 8 MB. Choose a smaller image.`,
      'PHOTO_TOO_LARGE',
      { index, maximumBytes: MAX_PHOTO_BYTES, receivedBytes: file.size },
    );
  }

  const extension = file.extension || '.jpg';
  return {
    name: `keepflip-scan-${Date.now()}-${index + 1}${extension}`,
    type: mimeTypeForFile(file),
    size: file.size,
    uri: file.uri,
  };
}

function isUnauthenticated(error: unknown) {
  return error instanceof AppwriteException && error.code === 401;
}

async function ensureAuthenticatedUserId(
  account: Account,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);

  try {
    const user = await account.get();
    throwIfAborted(signal);
    const session = await account.getSession({ sessionId: 'current' });
    throwIfAborted(signal);

    if (session.provider.trim().toLowerCase() === 'anonymous') {
      throw new ItemAnalysisError(
        'Sign in to KeepFlip before analyzing an item.',
        'AUTHENTICATION_REQUIRED',
      );
    }

    return user.$id;
  } catch (error) {
    if (error instanceof ItemAnalysisError) throw error;
    if (isUnauthenticated(error)) {
      throw new ItemAnalysisError(
        'Sign in to KeepFlip before analyzing an item.',
        'AUTHENTICATION_REQUIRED',
      );
    }
    throw error;
  }
}

async function deleteUploadedFiles(
  storage: Storage,
  bucketId: string,
  fileIds: string[],
) {
  for (const fileId of fileIds) {
    try {
      await storage.deleteFile({ bucketId, fileId });
    } catch (error) {
      // A 404 means the temporary upload is already gone. Other cleanup
      // failures are deliberately best-effort: a successful paid analysis
      // must remain usable and must not encourage the user to pay for a retry.
      if (error instanceof AppwriteException && error.code === 404) continue;
    }
  }
}

function validateInput(input: AnalyzeItemPhotosInput) {
  if (!isRecord(input)) {
    throw new ItemAnalysisError(
      'The item analysis request is invalid.',
      'INVALID_ANALYSIS_INPUT',
    );
  }

  if (!Array.isArray(input.photoUris) || input.photoUris.length === 0) {
    throw new ItemAnalysisError(
      'Add at least one photo before starting analysis.',
      'PHOTO_REQUIRED',
    );
  }

  if (input.photoUris.length > MAX_ANALYSIS_PHOTOS) {
    throw new ItemAnalysisError(
      `KeepFlip analyzes up to ${MAX_ANALYSIS_PHOTOS} photos of one item at a time.`,
      'TOO_MANY_PHOTOS',
      { maximum: MAX_ANALYSIS_PHOTOS, received: input.photoUris.length },
    );
  }

  if (input.photoUris.some((uri) => typeof uri !== 'string' || !uri.trim())) {
    throw new ItemAnalysisError(
      'Every analysis photo needs a valid local URI.',
      'INVALID_PHOTO_URI',
    );
  }

  if (
    input.userNotes !== undefined &&
    (typeof input.userNotes !== 'string' ||
      input.userNotes.length > MAX_USER_NOTES_CHARACTERS)
  ) {
    throw new ItemAnalysisError(
      `Item notes must be text no longer than ${MAX_USER_NOTES_CHARACTERS} characters.`,
      'INVALID_USER_NOTES',
    );
  }

  if (input.ocr !== undefined) {
    const entries = Array.isArray(input.ocr) ? input.ocr : [input.ocr];
    if (
      entries.length > MAX_ANALYSIS_PHOTOS ||
      entries.some((entry) => typeof entry !== 'string') ||
      entries.reduce((total, entry) => total + entry.length, 0) >
        MAX_OCR_CHARACTERS
    ) {
      throw new ItemAnalysisError(
        `OCR must contain at most ${MAX_ANALYSIS_PHOTOS} text entries and ${MAX_OCR_CHARACTERS} characters.`,
        'INVALID_OCR',
      );
    }
  }

  if (input.comps !== undefined) {
    if (!Array.isArray(input.comps) || input.comps.length > MAX_COMPARABLES) {
      throw new ItemAnalysisError(
        `Supply no more than ${MAX_COMPARABLES} sold comparables.`,
        'INVALID_COMPARABLES',
      );
    }

    for (const [index, comparable] of input.comps.entries()) {
      if (
        !isRecord(comparable) ||
        !isFiniteNumber(comparable.price) ||
        comparable.price <= 0 ||
        comparable.price > MAX_COMPARABLE_PRICE ||
        (comparable.currency !== undefined &&
          (typeof comparable.currency !== 'string' ||
            !/^[A-Za-z]{3}$/.test(comparable.currency)))
      ) {
        throw new ItemAnalysisError(
          `Comparable ${index + 1} needs a valid positive price and optional three-letter currency.`,
          'INVALID_COMPARABLE',
          { index },
        );
      }
    }
  }
}

export async function analyzeItemPhotos(
  input: AnalyzeItemPhotosInput,
  options: AnalyzeItemPhotosOptions = {},
): Promise<ItemAnalysisSuccess> {
  validateInput(input);
  throwIfAborted(options.signal);

  const { account, configuration, functions, storage } = getAppwriteServices();
  const uploadFiles = input.photoUris.map(localUploadFile);
  const totalPhotoBytes = uploadFiles.reduce(
    (total, file) => total + file.size,
    0,
  );
  if (totalPhotoBytes > MAX_TOTAL_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      'The selected photos total more than 24 MB. Use smaller images.',
      'PHOTOS_TOO_LARGE',
      {
        maximumBytes: MAX_TOTAL_PHOTO_BYTES,
        receivedBytes: totalPhotoBytes,
      },
    );
  }

  const uploadedFileIds: string[] = [];
  let result: ItemAnalysisSuccess | undefined;
  let primaryError: unknown;

  try {
    reportStage(options.onStage, 'authenticating');
    const userId = await ensureAuthenticatedUserId(account, options.signal);
    throwIfAborted(options.signal);

    reportStage(options.onStage, 'uploading');
    for (const [photoIndex, file] of uploadFiles.entries()) {
      throwIfAborted(options.signal);
      const uploaded = await storage.createFile({
        bucketId: configuration.scanBucketId,
        fileId: ID.unique(),
        file,
        permissions: [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ],
      });
      uploadedFileIds.push(uploaded.$id);

      try {
        const verified = await storage.getFile({
          bucketId: configuration.scanBucketId,
          fileId: uploaded.$id,
        });
        if (verified.$id !== uploaded.$id) {
          throw new Error('Appwrite returned mismatched file metadata.');
        }
      } catch (error) {
        throw new ItemAnalysisError(
          'KeepFlip uploaded a photo but could not read it back. Enable File Security on the item_images bucket and preserve the user file permissions.',
          'PHOTO_UPLOAD_NOT_READABLE',
          {
            photoIndex,
            bucketId: configuration.scanBucketId,
            statusCode:
              error instanceof AppwriteException ? error.code : undefined,
          },
          { cause: error },
        );
      }
      throwIfAborted(options.signal);
    }

    const request: ItemAnalysisFunctionRequest = {
      bucketId: configuration.scanBucketId,
      fileIds: uploadedFileIds,
      ...(input.ocr === undefined ? {} : { ocr: input.ocr }),
      ...(input.userNotes === undefined
        ? {}
        : { userNotes: input.userNotes }),
      ...(input.comps === undefined
        ? {}
        : {
            // Valuation consumes only numeric sold prices and currency. Do not
            // send unused listing metadata or URLs to the analysis Function.
            comps: input.comps.map(({ price, currency }) => ({
              price,
              ...(currency === undefined ? {} : { currency }),
            })),
          }),
    };

    reportStage(options.onStage, 'analyzing');
    throwIfAborted(options.signal);
    const execution = await functions.createExecution({
      functionId: configuration.analyzeFunctionId,
      body: JSON.stringify(request),
      async: false,
      method: ExecutionMethod.POST,
      headers: { 'content-type': 'application/json' },
    });
    throwIfAborted(options.signal);

    if (
      execution.status !== 'completed' ||
      execution.responseStatusCode < 200 ||
      execution.responseStatusCode >= 300
    ) {
      const functionFailure = parseBoundedFunctionFailure(
        execution.responseBody,
      );
      if (functionFailure) {
        throw new ItemAnalysisError(
          functionFailure.error.message,
          functionFailure.error.code,
          functionFailure.error.details,
        );
      }

      throw new ItemAnalysisError(
        'The analysis function did not complete successfully.',
        'FUNCTION_EXECUTION_FAILED',
        {
          executionId: execution.$id,
          executionStatus: execution.status,
          responseStatusCode: execution.responseStatusCode,
        },
      );
    }

    const response = parseFunctionResponse(execution.responseBody);
    if (!response.ok) {
      throw new ItemAnalysisError(
        response.error.message,
        response.error.code,
        response.error.details,
      );
    }

    result = response;
  } catch (error) {
    primaryError = error;
  } finally {
    if (uploadedFileIds.length > 0) {
      reportStage(options.onStage, 'cleaning');
      await deleteUploadedFiles(
        storage,
        configuration.scanBucketId,
        uploadedFileIds,
      );
    }
  }

  if (primaryError) {
    if (
      primaryError instanceof AppwriteSetupError ||
      primaryError instanceof ItemAnalysisError ||
      (primaryError instanceof Error && primaryError.name === 'AbortError')
    ) {
      throw primaryError;
    }

    throw new ItemAnalysisError(
      'KeepFlip could not reach the analysis service. Check your connection and try again.',
      'ANALYSIS_REQUEST_FAILED',
      undefined,
      { cause: primaryError },
    );
  }

  if (result) {
    const identifiedResult: ItemAnalysisSuccess = {
      ...result,
      valuation: {
        ...result.valuation,
        source: result.valuation.usedCount > 0 ? 'caller_supplied' : 'none',
      },
    };
    const ebayFunctionId = configuration.ebaySoldCompsFunctionId;
    if (!ebayFunctionId) {
      return {
        ...identifiedResult,
        marketResearch: marketResearchFailure(
          'unavailable',
          'EBAY_COMPS_NOT_CONFIGURED',
          'Add EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID to enable sold-comp valuation.',
          buildEbaySoldCompsQuery(identifiedResult) || null,
        ),
      };
    }

    reportStage(options.onStage, 'researching_comps');
    try {
      return await researchEbaySoldComps(
        identifiedResult,
        functions,
        ebayFunctionId,
        options.signal,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      const query = buildEbaySoldCompsQuery(identifiedResult) || null;
      return {
        ...identifiedResult,
        marketResearch: marketResearchFailure(
          'failed',
          error instanceof ItemAnalysisError
            ? error.code
            : 'EBAY_COMPS_REQUEST_FAILED',
          error instanceof Error
            ? error.message
            : 'KeepFlip could not research eBay sold comps.',
          query,
        ),
      };
    }
  }

  throw new ItemAnalysisError(
    'The analysis service completed without a result.',
    'EMPTY_ANALYSIS_RESULT',
  );
}
