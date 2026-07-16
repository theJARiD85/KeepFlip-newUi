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
  APPWRITE,
  AppwriteSetupError,
  getAppwriteServices,
} from '@/lib/appwrite';
import {
  buildStrictEbaySearchQuery,
  selectStrictEbaySoldComps,
  type StrictMarketValueProfile,
} from '@/services/ebaySoldCompsService';
import {
  getItemIdentificationGuidance,
  identifyItemWithAI,
  type ItemIdentificationGuidance,
  type KeepFlipIdentification,
} from '@/services/itemAiService';
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  ITEM_ANALYSIS_VERSION,
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

export const MAX_ANALYSIS_PHOTOS = 4;
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

function isValuation(value: unknown): value is ItemValuation {
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
  valuation?: ItemValuation;
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

  if (!isRecord(parsed) || parsed.ok !== true) {
    throw new ItemAnalysisError(
      'The eBay sold-comps service returned an unexpected response.',
      'INVALID_EBAY_COMPS_RESPONSE',
    );
  }

  if (
    Array.isArray(parsed.comps) &&
    parsed.comps.every(isSoldComparable) &&
    (parsed.valuation === undefined || isValuation(parsed.valuation))
  ) {
    const completed: EbayCompletedResponse = {
      ok: true,
      phase: 'completed',
      runId:
        typeof parsed.runId === 'string'
          ? parsed.runId
          : typeof parsed.id === 'string'
            ? parsed.id
            : 'completed',
      query: typeof parsed.query === 'string' ? parsed.query : '',
      comps: parsed.comps,
      searchedAt:
        typeof parsed.searchedAt === 'string'
          ? parsed.searchedAt
          : new Date().toISOString(),
    };
    if (isValuation(parsed.valuation)) {
      completed.valuation = parsed.valuation;
    }
    return completed;
  }

  if (
    (parsed.phase === 'started' || parsed.phase === 'running') &&
    typeof parsed.runId === 'string' &&
    typeof parsed.query === 'string'
  ) {
    return parsed as EbayStartedResponse | EbayRunningResponse;
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

function confidencePercent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function buildStrictMarketProfile(
  result: ItemAnalysisSuccess,
): StrictMarketValueProfile {
  const identity = result.analysis.identification;
  const signals = result.analysis.valuationSignals;
  const title = [
    identity.brand,
    identity.model,
    identity.variant,
    identity.itemType,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const visibleMarks = result.analysis.evidence
    .filter((entry) =>
      ['photo_text', 'google_vision'].includes(entry.source),
    )
    .map((entry) => entry.value);

  return {
    title: title || identity.category || 'Unclear item',
    brand: identity.brand,
    model: identity.model,
    condition: result.analysis.condition.grade,
    conditionNotes: result.analysis.condition.notes.join(' '),
    photoCount: result.input.imageCount,
    valuationSignals: {
      objectType: identity.itemType,
      subcategory: signals.category ?? identity.category,
      style: identity.variant ? [identity.variant] : [],
      materials: [],
      colors: identity.color ? [identity.color] : [],
      era: identity.era ? [identity.era] : [],
      motifs: [],
      shape: null,
      construction: [],
      conditionSignals: [
        ...result.analysis.condition.notes,
        ...signals.positiveFactors,
        ...signals.negativeFactors,
      ],
      visibleMarks: [
        ...visibleMarks,
        ...(identity.serialNumber ? [identity.serialNumber] : []),
      ],
      descriptorSummary: result.analysis.summary,
      searchQueries: signals.searchTerms,
      negativeKeywords: [],
      uncertainty: result.analysis.ambiguities,
      suggestedPhotoAngles: result.analysis.suggestedPhotos,
      confidence: confidencePercent(result.analysis.confidence.overall),
    },
  };
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = position - lowerIndex;
  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function valuationFromSelectedComps(
  selected: ItemSoldComparable[],
  suppliedCount: number,
): ItemValuation {
  const currencyCounts = new Map<string, number>();
  for (const comp of selected) {
    const currency = comp.currency.toUpperCase();
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
  }
  const currency = [...currencyCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const prices = selected
    .filter((comp) => comp.currency.toUpperCase() === currency)
    .map((comp) => comp.totalPrice)
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right);

  if (!currency || prices.length === 0) {
    return {
      status: 'needs_comps',
      currency: null,
      suppliedCount,
      usedCount: 0,
      rejectedCount: suppliedCount,
      median: null,
      p20: null,
      p80: null,
      methodology: 'none',
      source: 'ebay_sold',
    };
  }

  return {
    status: prices.length >= 3 ? 'ready' : 'limited_comps',
    currency,
    suppliedCount,
    usedCount: prices.length,
    rejectedCount: Math.max(0, suppliedCount - prices.length),
    median: roundMoney(percentile(prices, 0.5)),
    p20: roundMoney(percentile(prices, 0.2)),
    p80: roundMoney(percentile(prices, 0.8)),
    methodology: 'median_linear_p20_p80_mad_outlier_filter_v1',
    source: 'ebay_sold',
  };
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
  const profile = buildStrictMarketProfile(result);
  const query = buildStrictEbaySearchQuery(profile).slice(0, 180).trim();
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
    {
      action: 'start',
      purpose: 'sold_comps',
      query,
      limit: EBAY_COMPS_LIMIT,
    },
    signal,
  );

  const applyCompletedResult = (
    completed: EbayCompletedResponse,
  ): ItemAnalysisSuccess => {
    const selected = selectStrictEbaySoldComps(profile, completed.comps);
    const valuation = valuationFromSelectedComps(
      selected.comps,
      completed.comps.length,
    );
    return {
      ...result,
      valuation,
      marketResearch: {
        provider: 'ebay',
        status: 'completed',
        query: selected.query || completed.query,
        searchedAt: completed.searchedAt,
        comparableCount: valuation.usedCount,
        comps: selected.comps,
        quality: selected.quality,
      },
    };
  };

  if (started.phase === 'completed') {
    return applyCompletedResult(started);
  }

  if (started.phase !== 'started' && started.phase !== 'running') {
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
        purpose: 'sold_comps',
        runId: started.runId,
        query: started.query,
        limit: EBAY_COMPS_LIMIT,
      },
      signal,
    );

    if (status.phase !== 'completed') continue;
    return applyCompletedResult(status);
  }

  throw new ItemAnalysisError(
    'eBay sold-comps research took too long. The item identification is still available.',
    'EBAY_COMPS_TIMEOUT',
  );
}

function normalizedLegacyScore(value: number) {
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function emptyMarketValuation(): ItemValuation {
  return {
    status: 'needs_comps',
    currency: null,
    suppliedCount: 0,
    usedCount: 0,
    rejectedCount: 0,
    median: null,
    p20: null,
    p80: null,
    methodology: 'none',
    source: 'none',
  };
}

function emptyVisionResult() {
  return {
    enabled: false,
    succeeded: false,
    images: [],
    warnings: [],
  };
}

function legacyIdentificationResult(
  identification: KeepFlipIdentification,
  imageCount: number,
): ItemAnalysisSuccess {
  const sourceMap: Record<
    KeepFlipIdentification['identityEvidence'][number]['source'],
    ItemAnalysisEvidenceSource
  > = {
    photo_text: 'photo_text',
    visual_design: 'photo_visual',
    user_notes: 'user_notes',
    external_evidence: 'user_notes',
  };
  const signals = identification.valuationSignals;
  const itemType =
    signals.objectType ||
    (identification.title.toLowerCase() === 'unclear item'
      ? null
      : identification.title);
  const status =
    identification.identificationBasis === 'insufficient_evidence'
      ? 'insufficient_evidence'
      : 'identified';

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-keepflip-item-ai-fallback`,
    status,
    input: {
      imageCount,
      source: 'appwrite_storage',
    },
    analysis: {
      summary:
        identification.conditionNotes ||
        `${identification.title} identified from the uploaded photo evidence.`,
      identification: {
        itemType,
        category: identification.category,
        brand: identification.brand,
        model: identification.model,
        variant: null,
        color: signals.colors[0] ?? null,
        era: signals.era[0] ?? null,
        serialNumber: null,
      },
      condition: {
        grade: identification.condition,
        confidence: normalizedLegacyScore(
          identification.confidenceBreakdown.condition,
        ),
        notes: identification.conditionNotes
          ? [identification.conditionNotes]
          : signals.conditionSignals,
      },
      confidence: {
        overall: normalizedLegacyScore(identification.confidence),
        itemType: normalizedLegacyScore(
          identification.confidenceBreakdown.itemType,
        ),
        brand: normalizedLegacyScore(
          identification.confidenceBreakdown.brand,
        ),
        model: normalizedLegacyScore(
          identification.confidenceBreakdown.model,
        ),
        condition: normalizedLegacyScore(
          identification.confidenceBreakdown.condition,
        ),
      },
      evidence: identification.identityEvidence.map((entry) => ({
        claim: entry.field,
        value: entry.value,
        source: sourceMap[entry.source],
        imageIndex: null,
        strength:
          entry.confidence >= 75
            ? 'high'
            : entry.confidence >= 45
              ? 'medium'
              : 'low',
        rationale: entry.explanation,
      })),
      ambiguities: identification.ambiguityNotes,
      suggestedPhotos: identification.suggestedPhotos,
      valuationSignals: {
        searchTerms: signals.searchQueries.length
          ? signals.searchQueries
          : [identification.productSearchQuery].filter(Boolean),
        category: signals.subcategory ?? identification.category,
        conditionAdjustment:
          identification.conditionNotes ||
          'No supported condition adjustment is available.',
        positiveFactors: signals.conditionSignals,
        negativeFactors: signals.uncertainty,
      },
    },
    vision: emptyVisionResult(),
    valuation: emptyMarketValuation(),
  };
}

function legacyGuidanceResult(
  guidance: ItemIdentificationGuidance,
  imageCount: number,
): ItemAnalysisSuccess {
  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-keepflip-item-ai-guidance`,
    status: 'insufficient_evidence',
    input: { imageCount, source: 'appwrite_storage' },
    analysis: {
      summary: guidance.message,
      identification: {
        itemType: null,
        category: null,
        brand: null,
        model: null,
        variant: null,
        color: null,
        era: null,
        serialNumber: null,
      },
      condition: {
        grade: 'unknown',
        confidence: 0,
        notes: [],
      },
      confidence: {
        overall: 0,
        itemType: 0,
        brand: 0,
        model: 0,
        condition: 0,
      },
      evidence: [],
      ambiguities: [guidance.message],
      suggestedPhotos: guidance.tips,
      valuationSignals: {
        searchTerms: [],
        category: null,
        conditionAdjustment: 'Condition cannot be assessed from the current evidence.',
        positiveFactors: [],
        negativeFactors: [],
      },
    },
    vision: emptyVisionResult(),
    valuation: emptyMarketValuation(),
  };
}

function shouldTryLegacyItemAi(error: unknown) {
  if (!APPWRITE.itemAiFunctionId) return false;
  if (!(error instanceof ItemAnalysisError)) return false;
  return /provider|openai|vision|timeout|function_execution|analysis_request|invalid_function_response/i.test(
    error.code,
  );
}

async function executePrimaryAnalysis(
  functions: Functions,
  functionId: string,
  request: ItemAnalysisFunctionRequest,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify(request),
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
  return response;
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
    try {
      result = await executePrimaryAnalysis(
        functions,
        configuration.analyzeFunctionId,
        request,
        options.signal,
      );
    } catch (primaryAnalysisError) {
      if (!shouldTryLegacyItemAi(primaryAnalysisError)) {
        throw primaryAnalysisError;
      }

      try {
        const legacyIdentification = await identifyItemWithAI(
          uploadedFileIds,
          input.userNotes,
        );
        throwIfAborted(options.signal);
        result = legacyIdentificationResult(
          legacyIdentification,
          uploadedFileIds.length,
        );
      } catch (legacyError) {
        throwIfAborted(options.signal);
        const guidance = getItemIdentificationGuidance(legacyError);
        if (guidance) {
          result = legacyGuidanceResult(
            guidance,
            uploadedFileIds.length,
          );
        } else {
          throw primaryAnalysisError;
        }
      }
    }
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
          buildStrictEbaySearchQuery(
            buildStrictMarketProfile(identifiedResult),
          ) || null,
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
      const query =
        buildStrictEbaySearchQuery(
          buildStrictMarketProfile(identifiedResult),
        ) || null;
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
