import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
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
  type ItemMarketProviderStatus,
  type ItemMarketSignal,
  type ItemAnalysisStage,
  type ItemAnalysisSuccess,
  type ItemAnalysisResponse,
  type ItemSoldComparable,
  type ItemValuation,
  type MarketEvidenceClass,
  type MarketProviderId,
  type MarketProviderRunStatus,
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
const MAX_SOURCE_PHOTO_BYTES = 32 * 1024 * 1024;
const TARGET_PREPARED_PHOTO_BYTES = 1_500_000;
const TARGET_TOTAL_PREPARED_PHOTO_BYTES = 4_000_000;
const MAX_USER_NOTES_CHARACTERS = 4_000;
const MAX_OCR_CHARACTERS = 12_000;
const MAX_COMPARABLES = 100;
const MAX_COMPARABLE_PRICE = 10_000_000;
const MAX_FUNCTION_ERROR_CHARACTERS = 16_384;
const MAX_FUNCTION_RESPONSE_CHARACTERS = 1_000_000;
const EBAY_COMPS_LIMIT = 12;
const EBAY_POLL_INTERVAL_MS = 1_500;
const EBAY_RESEARCH_TIMEOUT_MS = 180_000;
const MAX_VALUATION_COMPS_PER_PROVIDER = 8;

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

type AnalysisDiagnosticValue = boolean | number | string | null | undefined;

function createAnalysisDiagnosticId() {
  return `kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function boundedDiagnosticMessage(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function appwriteErrorDiagnostics(error: unknown) {
  if (!(error instanceof AppwriteException)) {
    return {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage:
        error instanceof Error ? boundedDiagnosticMessage(error.message) : null,
    };
  }

  return {
    appwriteCode: error.code,
    appwriteType: boundedDiagnosticMessage(error.type),
    errorMessage: boundedDiagnosticMessage(error.message),
  };
}

function fileDiagnosticRef(fileId: string) {
  return fileId.length <= 8 ? fileId : fileId.slice(-8);
}

function identifierDiagnosticRef(value: string) {
  return value.length <= 10
    ? value
    : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function endpointDiagnosticHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return boundedDiagnosticMessage(endpoint);
  }
}

function logAnalysisDiagnostic(
  diagnosticId: string,
  event: string,
  startedAt: number,
  details: Record<string, AnalysisDiagnosticValue> = {},
  level: 'error' | 'info' | 'warn' = 'info',
) {
  const payload = Object.fromEntries(
    Object.entries({
      diagnosticId,
      event,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...details,
    }).filter(([, value]) => value !== undefined),
  );
  const message = `[KeepFlip analysis] ${JSON.stringify(payload)}`;

  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.info(message);
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
      ['caller_supplied', 'ebay_sold', 'multi_market_sold', 'none'].includes(
        String(value.source),
      ))
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

type MarketStartedResponse = {
  ok: true;
  phase: 'started' | 'running';
  runId?: string;
  jobId?: string;
  jobToken?: string;
  query: string;
  providers: ItemMarketProviderStatus[];
};

type MarketCompletedResponse = {
  ok: true;
  phase: 'completed';
  runId?: string;
  jobId?: string;
  jobToken?: string;
  query: string;
  comps: ItemSoldComparable[];
  providers: ItemMarketProviderStatus[];
  signals: ItemMarketSignal[];
  partial: boolean;
  valuation?: ItemValuation;
  searchedAt: string;
};

type MarketFunctionResponse = MarketStartedResponse | MarketCompletedResponse;

const MARKET_PROVIDER_ALIASES: Record<string, MarketProviderId> = {
  ebay: 'ebay',
  mercari: 'mercari',
  poshmark: 'poshmark',
  grailed: 'grailed',
  pricecharting: 'pricecharting',
  price_charting: 'pricecharting',
  tcgplayer: 'tcgplayer',
  tcg_player: 'tcgplayer',
  reverb: 'reverb',
  discogs: 'discogs',
  bricklink: 'bricklink',
  brick_link: 'bricklink',
  yahoo: 'yahoo_japan',
  yahoo_japan: 'yahoo_japan',
  yahoo_auctions_japan: 'yahoo_japan',
  'yahoo-auctions-japan': 'yahoo_japan',
};

const MARKET_EVIDENCE_CLASSES: MarketEvidenceClass[] = [
  'confirmed_transaction',
  'platform_last_sale',
  'platform_sold_aggregate',
  'sold_status_last_ask',
  'inferred_sale',
  'active_ask',
];

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  if (isFiniteNumber(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProviderId(
  value: unknown,
  fallback: MarketProviderId = 'unknown',
): MarketProviderId {
  const normalized = optionalString(value)
    ?.toLowerCase()
    .replace(/[\s/]+/g, '_');
  return (normalized && MARKET_PROVIDER_ALIASES[normalized]) || fallback;
}

function normalizeEvidenceClass(value: unknown) {
  const normalized = optionalString(value)?.toLowerCase();
  return MARKET_EVIDENCE_CLASSES.includes(normalized as MarketEvidenceClass)
    ? (normalized as MarketEvidenceClass)
    : null;
}

function normalizeSoldComparable(
  value: unknown,
  allowLegacyEbayEvidence: boolean,
): ItemSoldComparable | null {
  if (!isRecord(value)) return null;

  const explicitProvider = optionalString(
    value.provider ?? value.marketplace ?? value.source,
  );
  const provider = normalizeProviderId(
    explicitProvider,
    allowLegacyEbayEvidence ? 'ebay' : 'unknown',
  );
  const evidenceClass =
    normalizeEvidenceClass(value.evidenceClass ?? value.evidence_class) ??
    (allowLegacyEbayEvidence && provider === 'ebay'
      ? 'confirmed_transaction'
      : 'inferred_sale');
  const soldPrice = optionalNumber(
    value.soldPrice ?? value.price ?? value.finalPrice ?? value.amount,
  );
  const shipping =
    optionalNumber(
      value.shipping ?? value.shippingCost ?? value.shippingPrice ?? value.postage,
    ) ?? 0;
  const totalPrice =
    optionalNumber(value.totalPrice ?? value.total) ??
    (soldPrice === null ? null : soldPrice + shipping);
  const title = optionalString(value.title ?? value.name ?? value.itemTitle);

  if (!title || soldPrice === null || totalPrice === null) return null;

  const soldDateConfidence = optionalString(value.soldDateConfidence);
  const shippingSemantics = optionalString(value.shippingSemantics);

  return {
    provider,
    marketplace:
      optionalString(value.marketplace) ??
      (provider === 'unknown' ? 'unknown' : provider),
    evidenceClass,
    title,
    soldPrice: roundMoney(soldPrice),
    shipping: roundMoney(shipping),
    totalPrice: roundMoney(totalPrice),
    currency: optionalString(value.currency)?.toUpperCase() ?? 'USD',
    condition: optionalString(value.condition ?? value.conditionDisplayName),
    soldDate: optionalString(
      value.soldDate ?? value.soldAt ?? value.dateSold ?? value.completedDate,
    ),
    imageUrl: optionalString(
      value.imageUrl ?? value.image ?? value.thumbnail ?? value.thumbnailUrl,
    ),
    listingUrl: optionalString(
      value.listingUrl ?? value.url ?? value.itemUrl ?? value.link,
    ),
    sourceListingId: optionalString(
      value.sourceListingId ?? value.listingId ?? value.itemId ?? value.id,
    ),
    soldDateConfidence: ['exact', 'approximate', 'unknown'].includes(
      soldDateConfidence ?? '',
    )
      ? (soldDateConfidence as 'exact' | 'approximate' | 'unknown')
      : 'unknown',
    shippingSemantics: ['included', 'separate', 'unknown'].includes(
      shippingSemantics ?? '',
    )
      ? (shippingSemantics as 'included' | 'separate' | 'unknown')
      : 'unknown',
  };
}

function normalizeProviderStatus(value: unknown, providerKey?: string) {
  const record = isRecord(value) ? value : {};
  const rawStatus = (
    optionalString(isRecord(value) ? record.status : value) ?? 'pending'
  )
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const statusAliases: Record<string, MarketProviderRunStatus> = {
    ready: 'queued',
    queued: 'queued',
    pending: 'pending',
    started: 'running',
    running: 'running',
    success: 'completed',
    succeeded: 'completed',
    completed: 'completed',
    partial: 'partial',
    skipped: 'skipped',
    unavailable: 'unavailable',
    failed: 'failed',
    error: 'failed',
    timed_out: 'timed_out',
    timeout: 'timed_out',
  };
  const rawError = isRecord(record.error) ? record.error : null;
  const errorMessage =
    optionalString(rawError?.message) ??
    optionalString(record.error) ??
    optionalString(record.message);
  const comparableCount =
    optionalNumber(
      record.comparableCount ?? record.compCount ?? record.count,
    ) ?? 0;
  const signalCount = optionalNumber(record.signalCount) ?? 0;
  const providerStatus: ItemMarketProviderStatus = {
    provider: normalizeProviderId(record.provider ?? record.id ?? providerKey),
    status: statusAliases[rawStatus] ?? 'pending',
    query: optionalString(record.query),
    comparableCount: Math.max(0, Math.trunc(comparableCount)),
    signalCount: Math.max(0, Math.trunc(signalCount)),
    searchedAt: optionalString(record.searchedAt ?? record.completedAt),
    warnings: [
      ...(isStringArray(record.warnings) ? record.warnings : []),
      ...(optionalString(record.warning)
        ? [optionalString(record.warning) as string]
        : []),
    ],
  };

  if (errorMessage) {
    providerStatus.error = {
      code: optionalString(rawError?.code ?? record.errorCode) ?? 'PROVIDER_FAILED',
      message: errorMessage,
    };
  }

  return providerStatus;
}

function normalizeProviderStatuses(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeProviderStatus(entry));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([provider, entry]) =>
      normalizeProviderStatus(entry, provider),
    );
  }
  return [];
}

function normalizeMarketSignal(value: unknown): ItemMarketSignal | null {
  if (!isRecord(value)) return null;
  const explicitEvidenceClass = normalizeEvidenceClass(
    value.evidenceClass ?? value.evidence_class,
  );
  const suppliedType = optionalString(value.type ?? value.kind ?? value.signal);
  const type =
    suppliedType ?? explicitEvidenceClass ?? 'market_signal';
  const normalizedType = type.toLowerCase();
  const defaultEvidenceClass: MarketEvidenceClass = normalizedType.includes(
    'last_sale',
  )
    ? 'platform_last_sale'
    : normalizedType.includes('active') || normalizedType.includes('ask')
      ? 'active_ask'
      : 'platform_sold_aggregate';

  return {
    provider: normalizeProviderId(value.provider ?? value.marketplace),
    evidenceClass:
      explicitEvidenceClass ??
      defaultEvidenceClass,
    type,
    label: optionalString(value.label ?? value.title ?? value.name),
    currency: optionalString(value.currency)?.toUpperCase() ?? null,
    value: optionalNumber(value.value ?? value.amount ?? value.lastSale),
    low: optionalNumber(value.low ?? value.min ?? value.priceLow),
    median: optionalNumber(value.median ?? value.medianPrice),
    high: optionalNumber(value.high ?? value.max ?? value.priceHigh),
    sampleSize: optionalNumber(value.sampleSize ?? value.count),
    observedAt: optionalString(
      value.observedAt ?? value.searchedAt ?? value.scrapedAt,
    ),
    sourceUrl: optionalString(
      value.sourceUrl ?? value.listingUrl ?? value.url,
    ),
    note: optionalString(value.note ?? value.description),
  };
}

function normalizeMarketSignals(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeMarketSignal)
    .filter((signal): signal is ItemMarketSignal => signal !== null);
}

function parseMarketFunctionResponse(responseBody: string): MarketFunctionResponse {
  if (!responseBody || responseBody.length > MAX_FUNCTION_RESPONSE_CHARACTERS) {
    throw new ItemAnalysisError(
      'The market-research service returned an unexpected response.',
      'INVALID_MARKET_RESEARCH_RESPONSE',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch (error) {
    throw new ItemAnalysisError(
      'The market-research service returned unreadable data.',
      'INVALID_MARKET_RESEARCH_RESPONSE',
      undefined,
      { cause: error },
    );
  }

  if (isRecord(parsed) && parsed.ok === false) {
    const rawError = isRecord(parsed.error) ? parsed.error : null;
    throw new ItemAnalysisError(
      optionalString(rawError?.message) ??
        optionalString(parsed.error) ??
        'KeepFlip could not research marketplace sold comps.',
      optionalString(rawError?.code) ?? 'MARKET_RESEARCH_REQUEST_FAILED',
    );
  }

  if (!isRecord(parsed) || parsed.ok !== true) {
    throw new ItemAnalysisError(
      'The market-research service returned an unexpected response.',
      'INVALID_MARKET_RESEARCH_RESPONSE',
    );
  }

  const phase = optionalString(parsed.phase)?.toLowerCase();
  const jobId = optionalString(parsed.jobId) ?? undefined;
  const runId = optionalString(parsed.runId ?? parsed.id) ?? undefined;
  const jobToken = optionalString(parsed.jobToken) ?? undefined;
  const providers = normalizeProviderStatuses(
    parsed.providers ?? parsed.providerResults ?? parsed.providerStatuses,
  );
  const signals = normalizeMarketSignals(parsed.signals ?? parsed.marketSignals);
  const allowLegacyEbayEvidence = !jobId && providers.length === 0 && signals.length === 0;
  const rawComps = Array.isArray(parsed.comps)
    ? parsed.comps
    : Array.isArray(parsed.items)
      ? parsed.items
      : [];
  const comps = rawComps
    .map((entry) => normalizeSoldComparable(entry, allowLegacyEbayEvidence))
    .filter((comp): comp is ItemSoldComparable => comp !== null);

  if (
    phase === 'completed' ||
    Array.isArray(parsed.comps) ||
    Array.isArray(parsed.items)
  ) {
    const completed: MarketCompletedResponse = {
      ok: true,
      phase: 'completed',
      ...(runId ? { runId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(jobToken ? { jobToken } : {}),
      query: optionalString(parsed.query) ?? '',
      comps,
      providers,
      signals,
      partial: parsed.partial === true || providers.some((entry) =>
        ['failed', 'timed_out', 'unavailable', 'partial'].includes(entry.status),
      ),
      searchedAt:
        optionalString(parsed.searchedAt) ?? new Date().toISOString(),
    };
    if (isValuation(parsed.valuation)) {
      completed.valuation = parsed.valuation;
    }
    return completed;
  }

  if ((phase === 'started' || phase === 'running') && (jobId || runId)) {
    return {
      ok: true,
      phase,
      ...(runId ? { runId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(jobToken ? { jobToken } : {}),
      query: optionalString(parsed.query) ?? '',
      providers,
    };
  }

  throw new ItemAnalysisError(
    'The market-research service returned an unexpected response.',
    'INVALID_MARKET_RESEARCH_RESPONSE',
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

async function executeMarketFunction(
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
      providerMessage ||
        'The marketplace sold-comps function did not complete successfully.',
      'MARKET_RESEARCH_EXECUTION_FAILED',
      {
        executionId: execution.$id,
        executionStatus: execution.status,
        responseStatusCode: execution.responseStatusCode,
      },
    );
  }

  return parseMarketFunctionResponse(execution.responseBody);
}

function confidencePercent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function identifiedTitleFromSummary(summary: string) {
  return summary
    .split(/\r?\n/)[0]
    .split(/[.!?](?:\s|$)/)[0]
    .replace(
      /^(?:(?:this|the)\s+item|it)\s+(?:appears|looks|seems)\s+to\s+be\s+(?:an?\s+)?/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function buildStrictMarketProfile(
  result: ItemAnalysisSuccess,
): StrictMarketValueProfile {
  const identity = result.analysis.identification;
  const signals = result.analysis.valuationSignals;
  const structuredTitle = [
    identity.brand,
    identity.model,
    identity.variant,
    identity.itemType,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const summaryTitle = identifiedTitleFromSummary(result.analysis.summary);
  const title = identity.model?.trim()
    ? structuredTitle
    : summaryTitle || structuredTitle;
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

function boundedMarketText(value: string | null | undefined, maximum: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function boundedMarketList(
  values: Array<string | null | undefined>,
  maximumItems: number,
  maximumCharacters: number,
) {
  return values
    .map((value) => boundedMarketText(value, maximumCharacters))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) =>
      all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) ===
      index,
    )
    .slice(0, maximumItems);
}

function groundedProviderHints(result: ItemAnalysisSuccess) {
  const groundedValues = result.analysis.evidence
    .filter(
      (entry) =>
        entry.strength !== 'low' &&
        ['photo_text', 'google_vision', 'user_notes'].includes(entry.source),
    )
    .map((entry) => entry.value);
  const priceChartingProducts: string[] = [];
  let brickLinkItemId: string | null = null;

  for (const value of groundedValues) {

    for (const match of value.matchAll(
      /https?:\/\/(?:www\.)?pricecharting\.com\/(?:game|product)\/[^\s<>"]+/gi,
    )) {
      const product = match[0].replace(/[),.;]+$/g, '').slice(0, 500);
      if (!priceChartingProducts.includes(product)) {
        priceChartingProducts.push(product);
      }
    }

    const brickLinkMatch = value.match(
      /bricklink\.com\/[^\s]*[?&](?:S|P|M)=((?:\d{3,7}(?:-\d+)?|sw\d{3,8}))/i,
    );
    if (!brickLinkItemId && brickLinkMatch?.[1]) {
      brickLinkItemId = brickLinkMatch[1].slice(0, 80);
    }
  }

  const providerHints = {
    ...(priceChartingProducts.length
      ? { priceChartingProducts: priceChartingProducts.slice(0, 4) }
      : {}),
    ...(brickLinkItemId ? { brickLinkItemId } : {}),
  };
  return Object.keys(providerHints).length ? providerHints : null;
}

function buildMarketProviderProfile(
  result: ItemAnalysisSuccess,
  profile: StrictMarketValueProfile,
) {
  const identification = result.analysis.identification;
  const signals = result.analysis.valuationSignals;
  const providerHints = groundedProviderHints(result);
  return {
    title: boundedMarketText(profile.title, 220),
    brand: boundedMarketText(identification.brand, 100),
    model: boundedMarketText(identification.model, 140),
    itemType: boundedMarketText(identification.itemType, 100),
    category: boundedMarketText(identification.category, 120),
    subcategory: boundedMarketText(signals.category, 120),
    condition: boundedMarketText(result.analysis.condition.grade, 100),
    descriptorSummary: boundedMarketText(result.analysis.summary, 400),
    searchTerms: boundedMarketList(signals.searchTerms, 8, 180),
    negativeKeywords: boundedMarketList(
      profile.valuationSignals?.negativeKeywords ?? [],
      20,
      80,
    ),
    ...(providerHints ? { providerHints } : {}),
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

function isConfirmedTransaction(comp: ItemSoldComparable) {
  return comp.evidenceClass === 'confirmed_transaction';
}

function preferredCurrency(comps: ItemSoldComparable[]) {
  if (comps.some((comp) => comp.currency.toUpperCase() === 'USD')) {
    return 'USD';
  }

  const counts = new Map<string, number>();
  for (const comp of comps) {
    const currency = comp.currency.toUpperCase();
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function capProviderContribution(comps: ItemSoldComparable[]) {
  const byProvider = new Map<MarketProviderId, ItemSoldComparable[]>();
  for (const comp of comps) {
    const group = byProvider.get(comp.provider) ?? [];
    group.push(comp);
    byProvider.set(comp.provider, group);
  }

  return [...byProvider.values()].flatMap((providerComps) =>
    providerComps
      .map((comp, index) => ({ comp, index }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.comp.soldDate ?? '');
        const rightTime = Date.parse(right.comp.soldDate ?? '');
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return rightTime - leftTime;
        }
        return left.index - right.index;
      })
      .slice(0, MAX_VALUATION_COMPS_PER_PROVIDER)
      .map(({ comp }) => comp),
  );
}

function removeMadOutliers(comps: ItemSoldComparable[]) {
  if (comps.length < 5) return comps;
  const prices = comps
    .map((comp) => comp.totalPrice)
    .sort((left, right) => left - right);
  const center = percentile(prices, 0.5);
  const deviations = prices
    .map((price) => Math.abs(price - center))
    .sort((left, right) => left - right);
  const mad = percentile(deviations, 0.5);

  // A zero MAD is a legitimate tightly clustered market. There is no stable
  // robust z-score denominator, so retain the records instead of inventing a
  // percentage-based substitute while claiming MAD methodology.
  if (!Number.isFinite(mad) || mad <= 0) return comps;

  return comps.filter(
    (comp) => (0.67448975 * Math.abs(comp.totalPrice - center)) / mad <= 3.5,
  );
}

function selectValuationComps(comps: ItemSoldComparable[]) {
  const confirmed = comps.filter(
    (comp) =>
      isConfirmedTransaction(comp) &&
      Number.isFinite(comp.totalPrice) &&
      comp.totalPrice > 0,
  );
  const currency = preferredCurrency(confirmed);
  if (!currency) return [];

  return removeMadOutliers(
    capProviderContribution(
      confirmed.filter((comp) => comp.currency.toUpperCase() === currency),
    ),
  );
}

function valuationFromSelectedComps(
  selected: ItemSoldComparable[],
  suppliedCount: number,
  source: 'ebay_sold' | 'multi_market_sold',
): ItemValuation {
  const valuationComps = selectValuationComps(selected);
  const currency = valuationComps[0]?.currency.toUpperCase();
  const prices = valuationComps
    .map((comp) => comp.totalPrice)
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
      source,
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
    source,
  };
}

function marketResearchFailure(
  status: ItemMarketResearch['status'],
  code: string,
  message: string,
  query: string | null,
  provider: ItemMarketResearch['provider'] = 'multi_market',
): ItemMarketResearch {
  return {
    provider,
    status,
    query,
    searchedAt: null,
    comparableCount: 0,
    comps: [],
    error: { code, message },
  };
}

function completedResearchProvider(completed: MarketCompletedResponse) {
  const sourceProviders = new Set<MarketProviderId>([
    ...completed.comps.map((comp) => comp.provider),
    ...completed.providers.map((entry) => entry.provider),
    ...completed.signals.map((signal) => signal.provider),
  ]);
  sourceProviders.delete('unknown');
  return completed.jobId ||
    sourceProviders.size > 1 ||
    [...sourceProviders].some((provider) => provider !== 'ebay')
    ? 'multi_market'
    : 'ebay';
}

async function researchMarketSoldComps(
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
  const started = await executeMarketFunction(
    functions,
    functionId,
    {
      action: 'start',
      purpose: 'sold_comps',
      query,
      limit: EBAY_COMPS_LIMIT,
      targetCurrency: 'USD',
      profile: buildMarketProviderProfile(result, profile),
    },
    signal,
  );

  const applyCompletedResult = (
    completed: MarketCompletedResponse,
  ): ItemAnalysisSuccess => {
    const confirmedComps = completed.comps.filter(isConfirmedTransaction);
    const selected = selectStrictEbaySoldComps(profile, confirmedComps);
    const provider = completedResearchProvider(completed);
    const valuationComps = selectValuationComps(selected.comps);
    const valuation = valuationFromSelectedComps(
      valuationComps,
      completed.comps.length,
      provider === 'multi_market' ? 'multi_market_sold' : 'ebay_sold',
    );
    return {
      ...result,
      valuation,
      marketResearch: {
        provider,
        status: 'completed',
        ...(completed.jobId ? { jobId: completed.jobId } : {}),
        partial: completed.partial,
        query: selected.query || completed.query,
        searchedAt: completed.searchedAt,
        comparableCount: valuation.usedCount,
        comps: valuationComps,
        providers: completed.providers,
        signals: completed.signals,
        quality: selected.quality,
      },
    };
  };

  if (started.phase === 'completed') {
    return applyCompletedResult(started);
  }

  if (started.phase !== 'started' && started.phase !== 'running') {
    throw new ItemAnalysisError(
      'The marketplace sold-comps service did not start a research job.',
      'MARKET_RESEARCH_START_FAILED',
    );
  }

  let currentJobId = started.jobId;
  let currentRunId = started.runId;
  let currentJobToken = started.jobToken;
  let currentQuery = started.query;

  while (Date.now() - startedAt < EBAY_RESEARCH_TIMEOUT_MS) {
    await waitForDelay(EBAY_POLL_INTERVAL_MS, signal);
    const status = await executeMarketFunction(
      functions,
      functionId,
      {
        action: 'status',
        purpose: 'sold_comps',
        ...(currentJobId ? { jobId: currentJobId } : {}),
        ...(currentJobToken ? { jobToken: currentJobToken } : {}),
        ...(currentRunId ? { runId: currentRunId } : {}),
        query: currentQuery,
        limit: EBAY_COMPS_LIMIT,
      },
      signal,
    );

    currentJobId = status.jobId ?? currentJobId;
    currentRunId = status.runId ?? currentRunId;
    currentJobToken = status.jobToken ?? currentJobToken;
    currentQuery = status.query || currentQuery;

    if (status.phase !== 'completed') continue;
    return applyCompletedResult(status);
  }

  throw new ItemAnalysisError(
    'Marketplace sold-comps research took too long. The item identification is still available.',
    'MARKET_RESEARCH_TIMEOUT',
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
  analysisStartedAt: number,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const executionStartedAt = Date.now();
  logAnalysisDiagnostic(
    request.diagnosticId,
    'function_execution_started',
    analysisStartedAt,
    {
      functionId,
      bucketId: request.bucketId,
      imageCount: request.fileIds.length,
    },
  );

  let execution;
  try {
    execution = await functions.createExecution({
      functionId,
      body: JSON.stringify(request),
      async: false,
      method: ExecutionMethod.POST,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const appwriteDiagnostics = appwriteErrorDiagnostics(error);
    const isSynchronousTimeout =
      error instanceof AppwriteException && error.code === 408;
    logAnalysisDiagnostic(
      request.diagnosticId,
      'function_execution_failed',
      analysisStartedAt,
      {
        functionId,
        executionElapsedMs: Math.max(0, Date.now() - executionStartedAt),
        ...appwriteDiagnostics,
      },
      'error',
    );
    throw new ItemAnalysisError(
      isSynchronousTimeout
        ? 'Item analysis exceeded Appwrite\'s 30-second synchronous limit.'
        : 'KeepFlip could not start the analysis Function.',
      isSynchronousTimeout
        ? 'FUNCTION_EXECUTION_TIMEOUT'
        : 'FUNCTION_EXECUTION_REQUEST_FAILED',
      {
        diagnosticId: request.diagnosticId,
        functionId,
        executionElapsedMs: Math.max(0, Date.now() - executionStartedAt),
        ...appwriteDiagnostics,
      },
      { cause: error },
    );
  }
  throwIfAborted(signal);

  logAnalysisDiagnostic(
    request.diagnosticId,
    'function_execution_returned',
    analysisStartedAt,
    {
      executionId: execution.$id,
      deploymentId: execution.deploymentId,
      executionStatus: execution.status,
      responseStatusCode: execution.responseStatusCode,
      durationSeconds: execution.duration,
      executionElapsedMs: Math.max(0, Date.now() - executionStartedAt),
    },
    execution.status === 'completed' ? 'info' : 'warn',
  );

  if (
    execution.status !== 'completed' ||
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300
  ) {
    const functionFailure = parseBoundedFunctionFailure(
      execution.responseBody,
    );
    if (functionFailure) {
      logAnalysisDiagnostic(
        request.diagnosticId,
        'function_response_error',
        analysisStartedAt,
        {
          executionId: execution.$id,
          deploymentId: execution.deploymentId,
          responseStatusCode: execution.responseStatusCode,
          functionErrorCode: functionFailure.error.code,
        },
        'error',
      );
      throw new ItemAnalysisError(
        functionFailure.error.message,
        functionFailure.error.code,
        {
          diagnosticId: request.diagnosticId,
          executionId: execution.$id,
          deploymentId: execution.deploymentId,
          executionStatus: execution.status,
          responseStatusCode: execution.responseStatusCode,
          functionDetails: functionFailure.error.details,
        },
      );
    }

    throw new ItemAnalysisError(
      'The analysis function did not complete successfully.',
      'FUNCTION_EXECUTION_FAILED',
      {
        diagnosticId: request.diagnosticId,
        executionId: execution.$id,
        deploymentId: execution.deploymentId,
        executionStatus: execution.status,
        responseStatusCode: execution.responseStatusCode,
      },
    );
  }

  const response = parseFunctionResponse(execution.responseBody);
  if (!response.ok) {
    logAnalysisDiagnostic(
      request.diagnosticId,
      'function_response_error',
      analysisStartedAt,
      {
        executionId: execution.$id,
        deploymentId: execution.deploymentId,
        responseStatusCode: execution.responseStatusCode,
        functionErrorCode: response.error.code,
      },
      'error',
    );
    throw new ItemAnalysisError(
      response.error.message,
      response.error.code,
      {
        diagnosticId: request.diagnosticId,
        executionId: execution.$id,
        deploymentId: execution.deploymentId,
        responseStatusCode: execution.responseStatusCode,
        functionDetails: response.error.details,
      },
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

type AnalysisPhotoCompressionAttempt = {
  compress: number;
  maxDimension: number;
};

function analysisPhotoCompressionAttempts(photoCount: number) {
  const primary: AnalysisPhotoCompressionAttempt =
    photoCount <= 1
      ? { compress: 0.84, maxDimension: 2_048 }
      : photoCount === 2
        ? { compress: 0.82, maxDimension: 1_800 }
        : { compress: 0.8, maxDimension: 1_600 };

  return [
    primary,
    { compress: 0.68, maxDimension: Math.min(primary.maxDimension, 1_440) },
    { compress: 0.58, maxDimension: 1_280 },
  ];
}

function targetPreparedPhotoBytes(photoCount: number) {
  return Math.min(
    TARGET_PREPARED_PHOTO_BYTES,
    Math.floor(TARGET_TOTAL_PREPARED_PHOTO_BYTES / Math.max(1, photoCount)),
  );
}

function imageDimensions(uri: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ height, width }),
      (error) => reject(error),
    );
  });
}

function deleteLocalFileBestEffort(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

async function prepareAnalysisPhoto(
  uri: string,
  index: number,
  photoCount: number,
  diagnosticId: string,
  analysisStartedAt: number,
  signal?: AbortSignal,
) {
  const preparationStartedAt = Date.now();
  let sourceFile: File;

  try {
    sourceFile = new File(normalizePhotoUri(uri));
  } catch (error) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} could not be opened.`,
      'PHOTO_UNREADABLE',
      { index },
      { cause: error },
    );
  }

  if (!sourceFile.exists || !Number.isFinite(sourceFile.size) || sourceFile.size <= 0) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} is missing or empty.`,
      'PHOTO_NOT_FOUND',
      { index },
    );
  }

  if (sourceFile.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      `Photo ${index + 1} is too large to prepare safely. Choose an image under 32 MB.`,
      'PHOTO_SOURCE_TOO_LARGE',
      {
        index,
        maximumBytes: MAX_SOURCE_PHOTO_BYTES,
        receivedBytes: sourceFile.size,
      },
    );
  }

  throwIfAborted(signal);
  const sourceDimensions = await imageDimensions(sourceFile.uri).catch((error) => {
    throw new ItemAnalysisError(
      `Photo ${index + 1} could not be decoded.`,
      'PHOTO_DECODE_FAILED',
      { index },
      { cause: error },
    );
  });
  throwIfAborted(signal);

  const attempts = analysisPhotoCompressionAttempts(photoCount);
  const targetBytes = targetPreparedPhotoBytes(photoCount);
  const generatedUris: string[] = [];

  logAnalysisDiagnostic(
    diagnosticId,
    'photo_preparation_started',
    analysisStartedAt,
    {
      photoIndex: index,
      sourceBytes: sourceFile.size,
      sourceWidth: sourceDimensions.width,
      sourceHeight: sourceDimensions.height,
      targetBytes,
    },
  );

  try {
    for (const [attemptIndex, attempt] of attempts.entries()) {
      throwIfAborted(signal);
      const context = ImageManipulator.manipulate(sourceFile.uri);
      const longestEdge = Math.max(sourceDimensions.width, sourceDimensions.height);

      if (longestEdge > attempt.maxDimension) {
        context.resize(
          sourceDimensions.width >= sourceDimensions.height
            ? { width: attempt.maxDimension }
            : { height: attempt.maxDimension },
        );
      }

      const rendered = await context.renderAsync();
      throwIfAborted(signal);
      const saved = await rendered.saveAsync({
        compress: attempt.compress,
        format: SaveFormat.JPEG,
      });
      generatedUris.push(saved.uri);
      throwIfAborted(signal);

      const preparedFile = new File(saved.uri);
      if (
        !preparedFile.exists ||
        !Number.isFinite(preparedFile.size) ||
        preparedFile.size <= 0
      ) {
        throw new ItemAnalysisError(
          `Photo ${index + 1} could not be saved after compression.`,
          'PHOTO_PREPARATION_FAILED',
          { index, attempt: attemptIndex + 1 },
        );
      }

      const isLastAttempt = attemptIndex === attempts.length - 1;
      if (preparedFile.size <= targetBytes || isLastAttempt) {
        for (const intermediateUri of generatedUris.slice(0, -1)) {
          deleteLocalFileBestEffort(intermediateUri);
        }

        logAnalysisDiagnostic(
          diagnosticId,
          'photo_preparation_completed',
          analysisStartedAt,
          {
            photoIndex: index,
            attempt: attemptIndex + 1,
            sourceBytes: sourceFile.size,
            preparedBytes: preparedFile.size,
            preparedWidth: saved.width,
            preparedHeight: saved.height,
            maxDimension: attempt.maxDimension,
            jpegQuality: attempt.compress,
            compressionRatio:
              Math.round((preparedFile.size / sourceFile.size) * 1_000) / 1_000,
            targetMet: preparedFile.size <= targetBytes,
            preparationElapsedMs: Math.max(0, Date.now() - preparationStartedAt),
          },
        );

        return saved.uri;
      }
    }
  } catch (error) {
    for (const generatedUri of generatedUris) {
      deleteLocalFileBestEffort(generatedUri);
    }
    if (
      error instanceof ItemAnalysisError ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw error;
    }
    throw new ItemAnalysisError(
      `Photo ${index + 1} could not be compressed.`,
      'PHOTO_PREPARATION_FAILED',
      { index },
      { cause: error },
    );
  }

  throw new ItemAnalysisError(
    `Photo ${index + 1} could not be compressed.`,
    'PHOTO_PREPARATION_FAILED',
    { index },
  );
}

function deletePreparedPhotoFiles(
  uris: string[],
  diagnosticId: string,
  analysisStartedAt: number,
) {
  let deletedCount = 0;
  let failedCount = 0;

  for (const uri of uris) {
    if (deleteLocalFileBestEffort(uri)) {
      deletedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  if (uris.length > 0) {
    logAnalysisDiagnostic(
      diagnosticId,
      'photo_cache_cleanup_completed',
      analysisStartedAt,
      { requestedCount: uris.length, deletedCount, failedCount },
      failedCount > 0 ? 'warn' : 'info',
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
  diagnosticId: string,
  analysisStartedAt: number,
) {
  let deletedCount = 0;
  let missingCount = 0;
  let failedCount = 0;

  for (const [fileIndex, fileId] of fileIds.entries()) {
    try {
      await storage.deleteFile({ bucketId, fileId });
      deletedCount += 1;
    } catch (error) {
      // A 404 means the temporary upload is already gone. Other cleanup
      // failures are deliberately best-effort: a successful paid analysis
      // must remain usable and must not encourage the user to pay for a retry.
      if (error instanceof AppwriteException && error.code === 404) {
        missingCount += 1;
        continue;
      }
      failedCount += 1;
      logAnalysisDiagnostic(
        diagnosticId,
        'cleanup_file_failed',
        analysisStartedAt,
        {
          bucketId,
          fileIndex,
          fileRef: fileDiagnosticRef(fileId),
          ...appwriteErrorDiagnostics(error),
        },
        'warn',
      );
    }
  }

  logAnalysisDiagnostic(
    diagnosticId,
    'cleanup_completed',
    analysisStartedAt,
    {
      bucketId,
      requestedCount: fileIds.length,
      deletedCount,
      missingCount,
      failedCount,
    },
    failedCount > 0 ? 'warn' : 'info',
  );
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
  const analysisStartedAt = Date.now();
  const diagnosticId = createAnalysisDiagnosticId();
  validateInput(input);
  throwIfAborted(options.signal);

  const { account, configuration, functions, storage } = getAppwriteServices();
  const preparedPhotoUris: string[] = [];
  const uploadedFileIds: string[] = [];
  let result: ItemAnalysisSuccess | undefined;
  let primaryError: unknown;

  try {
    reportStage(options.onStage, 'authenticating');
    const userId = await ensureAuthenticatedUserId(account, options.signal);
    logAnalysisDiagnostic(
      diagnosticId,
      'authentication_completed',
      analysisStartedAt,
      { userRef: fileDiagnosticRef(userId) },
    );
    throwIfAborted(options.signal);

    reportStage(options.onStage, 'uploading');
    const uploadFiles: ReturnType<typeof localUploadFile>[] = [];
    for (const [photoIndex, photoUri] of input.photoUris.entries()) {
      const preparedUri = await prepareAnalysisPhoto(
        photoUri,
        photoIndex,
        input.photoUris.length,
        diagnosticId,
        analysisStartedAt,
        options.signal,
      );
      preparedPhotoUris.push(preparedUri);
      uploadFiles.push(localUploadFile(preparedUri, photoIndex));
    }

    const totalPhotoBytes = uploadFiles.reduce(
      (total, file) => total + file.size,
      0,
    );
    logAnalysisDiagnostic(
      diagnosticId,
      'request_validated',
      analysisStartedAt,
      {
        imageCount: uploadFiles.length,
        totalPhotoBytes,
        bucketId: configuration.scanBucketId,
        functionId: configuration.analyzeFunctionId,
      },
    );
    if (totalPhotoBytes > MAX_TOTAL_PHOTO_BYTES) {
      throw new ItemAnalysisError(
        'The prepared photos total more than 24 MB. Use smaller images.',
        'PHOTOS_TOO_LARGE',
        {
          maximumBytes: MAX_TOTAL_PHOTO_BYTES,
          receivedBytes: totalPhotoBytes,
        },
      );
    }

    for (const [photoIndex, file] of uploadFiles.entries()) {
      throwIfAborted(options.signal);
      const uploadStartedAt = Date.now();
      const requestedPermissions = [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ];
      logAnalysisDiagnostic(
        diagnosticId,
        'storage_upload_started',
        analysisStartedAt,
        {
          bucketId: configuration.scanBucketId,
          photoIndex,
          photoBytes: file.size,
          mimeType: file.type,
        },
      );
      const uploaded = await storage.createFile({
        bucketId: configuration.scanBucketId,
        fileId: ID.unique(),
        file,
        permissions: requestedPermissions,
      });
      uploadedFileIds.push(uploaded.$id);
      const returnedPermissions = Array.isArray(uploaded.$permissions)
        ? uploaded.$permissions
        : [];
      logAnalysisDiagnostic(
        diagnosticId,
        'storage_upload_completed',
        analysisStartedAt,
        {
          bucketId: configuration.scanBucketId,
          photoIndex,
          fileRef: fileDiagnosticRef(uploaded.$id),
          uploadElapsedMs: Math.max(0, Date.now() - uploadStartedAt),
          permissionCount: returnedPermissions.length,
          hasExpectedUserRead: returnedPermissions.includes(requestedPermissions[0]),
          chunksUploaded: uploaded.chunksUploaded,
          chunksTotal: uploaded.chunksTotal,
        },
      );

      try {
        const readbackStartedAt = Date.now();
        const verified = await storage.getFile({
          bucketId: configuration.scanBucketId,
          fileId: uploaded.$id,
        });
        if (verified.$id !== uploaded.$id) {
          throw new Error('Appwrite returned mismatched file metadata.');
        }
        logAnalysisDiagnostic(
          diagnosticId,
          'storage_readback_completed',
          analysisStartedAt,
          {
            bucketId: configuration.scanBucketId,
            photoIndex,
            fileRef: fileDiagnosticRef(uploaded.$id),
            readbackElapsedMs: Math.max(0, Date.now() - readbackStartedAt),
            sizeOriginal: verified.sizeOriginal,
            mimeType: verified.mimeType,
          },
        );
      } catch (error) {
        logAnalysisDiagnostic(
          diagnosticId,
          'storage_readback_failed',
          analysisStartedAt,
          {
            bucketId: configuration.scanBucketId,
            photoIndex,
            fileRef: fileDiagnosticRef(uploaded.$id),
            ...appwriteErrorDiagnostics(error),
          },
          'error',
        );
        throw new ItemAnalysisError(
          'KeepFlip uploaded a photo but could not read it back. Enable File Security on the item_images bucket and preserve the user file permissions.',
          'PHOTO_UPLOAD_NOT_READABLE',
          {
            diagnosticId,
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
      diagnosticId,
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
        analysisStartedAt,
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
          diagnosticId,
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
        diagnosticId,
        analysisStartedAt,
      );
    }
    deletePreparedPhotoFiles(
      preparedPhotoUris,
      diagnosticId,
      analysisStartedAt,
    );
  }

  if (primaryError) {
    logAnalysisDiagnostic(
      diagnosticId,
      'analysis_failed',
      analysisStartedAt,
      {
        errorCode:
          primaryError instanceof ItemAnalysisError
            ? primaryError.code
            : undefined,
        ...appwriteErrorDiagnostics(primaryError),
      },
      'error',
    );
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
      {
        diagnosticId,
        ...appwriteErrorDiagnostics(primaryError),
      },
      { cause: primaryError },
    );
  }

  if (result) {
    logAnalysisDiagnostic(
      diagnosticId,
      'identification_completed',
      analysisStartedAt,
      {
        status: result.status,
        evidenceCount: result.analysis.evidence.length,
        imageCount: result.input.imageCount,
      },
    );
    const identifiedResult: ItemAnalysisSuccess = {
      ...result,
      valuation: {
        ...result.valuation,
        source: result.valuation.usedCount > 0 ? 'caller_supplied' : 'none',
      },
    };
    const marketResearchFunctionId =
      configuration.marketResearchFunctionId ??
      configuration.ebaySoldCompsFunctionId;
    if (!marketResearchFunctionId) {
      logAnalysisDiagnostic(
        diagnosticId,
        'analysis_completed_without_comps',
        analysisStartedAt,
        { reason: 'market_research_function_not_configured' },
        'warn',
      );
      return {
        ...identifiedResult,
        marketResearch: marketResearchFailure(
          'unavailable',
          'MARKET_RESEARCH_NOT_CONFIGURED',
          'Add EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID (or the legacy EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID) to enable sold-comp valuation.',
          buildStrictEbaySearchQuery(
            buildStrictMarketProfile(identifiedResult),
          ) || null,
        ),
      };
    }

    reportStage(options.onStage, 'researching_comps');
    const marketFunctionDiagnostics = {
      functionId: marketResearchFunctionId,
      endpointHost: endpointDiagnosticHost(configuration.endpoint),
      projectRef: identifierDiagnosticRef(configuration.projectId),
    };
    logAnalysisDiagnostic(
      diagnosticId,
      'sold_comps_execution_started',
      analysisStartedAt,
      marketFunctionDiagnostics,
    );
    try {
      const researchedResult = await researchMarketSoldComps(
        identifiedResult,
        functions,
        marketResearchFunctionId,
        options.signal,
      );
      logAnalysisDiagnostic(
        diagnosticId,
        'analysis_completed',
        analysisStartedAt,
        {
          compStatus: researchedResult.marketResearch?.status,
          compCount: researchedResult.marketResearch?.comps.length,
          signalCount: researchedResult.marketResearch?.signals?.length ?? 0,
          partial: researchedResult.marketResearch?.partial ?? false,
          providerDiagnostics: researchedResult.marketResearch?.providers
            ? JSON.stringify(
                researchedResult.marketResearch.providers.map((provider) => ({
                  provider: provider.provider,
                  status: provider.status,
                  comparableCount: provider.comparableCount,
                  signalCount: provider.signalCount,
                  warnings: provider.warnings,
                  errorCode: provider.error?.code,
                })),
              ).slice(0, 2_000)
            : undefined,
        },
      );
      return researchedResult;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      logAnalysisDiagnostic(
        diagnosticId,
        'sold_comps_failed',
        analysisStartedAt,
        {
          errorCode:
            error instanceof ItemAnalysisError ? error.code : undefined,
          ...marketFunctionDiagnostics,
          ...appwriteErrorDiagnostics(error),
        },
        'warn',
      );
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
            : 'MARKET_RESEARCH_REQUEST_FAILED',
          error instanceof Error
            ? error.message
            : 'KeepFlip could not research marketplace sold comps.',
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
