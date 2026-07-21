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
  analyzePhotosLocally,
  type LocalVisionSignals,
} from '@/services/local-vision-service';
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
const TARGET_PREPARED_PHOTO_BYTES = 850_000;
const TARGET_TOTAL_PREPARED_PHOTO_BYTES = 2_500_000;
const MAX_USER_NOTES_CHARACTERS = 4_000;
const MAX_OCR_CHARACTERS = 12_000;
const MAX_COMPARABLES = 100;
const MAX_COMPARABLE_PRICE = 10_000_000;
const MAX_FUNCTION_ERROR_CHARACTERS = 16_384;
const MAX_FUNCTION_RESPONSE_CHARACTERS = 1_000_000;
const EBAY_COMPS_LIMIT = 8;
const EBAY_POLL_INTERVAL_MS = 650;
const EBAY_RESEARCH_TIMEOUT_MS = 11_000;
const TOTAL_ANALYSIS_BUDGET_MS = 28_000;
const LOCAL_VISION_TIMEOUT_MS = 4_500;
const PRIMARY_ANALYSIS_MAX_MS = 12_000;
const LEGACY_ANALYSIS_MAX_MS = 6_000;
const CLEANUP_DELAY_AFTER_PRIMARY_TIMEOUT_MS = 35_000;
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

function remainingAnalysisMs(deadlineAt: number) {
  return Math.max(0, deadlineAt - Date.now());
}

function withTimeLimit<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  const boundedTimeout = Math.max(1, Math.floor(timeoutMs));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));
    const timeout = setTimeout(
      () =>
        finish(() =>
          reject(
            new ItemAnalysisError(message, code, {
              timeoutMs: boundedTimeout,
            }),
          ),
        ),
      boundedTimeout,
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function withinAnalysisDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
  code: string,
  message: string,
  signal?: AbortSignal,
  maximumMs?: number,
) {
  const remaining = remainingAnalysisMs(deadlineAt);
  const timeoutMs = maximumMs == null ? remaining : Math.min(remaining, maximumMs);
  return withTimeLimit(promise, timeoutMs, code, message, signal);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
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
  deadlineAt?: number,
) {
  throwIfAborted(signal);
  const executionPromise = functions.createExecution({
    functionId,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
    headers: { 'content-type': 'application/json' },
  });
  const execution = deadlineAt
    ? await withinAnalysisDeadline(
        executionPromise,
        deadlineAt,
        'MARKET_RESEARCH_TIMEOUT',
        'KeepFlip stopped waiting for market research so the scan could finish on time.',
        signal,
        6_000,
      )
    : await executionPromise;
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
  signal: AbortSignal | undefined,
  deadlineAt: number,
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
  const marketDeadlineAt = Math.min(
    deadlineAt,
    startedAt + EBAY_RESEARCH_TIMEOUT_MS,
  );
  const started = await executeMarketFunction(
    functions,
    functionId,
    {
      action: 'start',
      purpose: 'sold_comps',
      query,
      limit: EBAY_COMPS_LIMIT,
      targetCurrency: 'USD',
      fastMode: true,
      profile: buildMarketProviderProfile(result, profile),
    },
    signal,
    marketDeadlineAt,
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

  while (Date.now() + EBAY_POLL_INTERVAL_MS < marketDeadlineAt) {
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
      marketDeadlineAt,
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

function localVisionStrength(confidence: number): ItemAnalysisEvidenceStrength {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

function localVisionFallbackResult(
  localVision: LocalVisionSignals,
  imageCount: number,
): ItemAnalysisSuccess {
  const candidateTitle = localVision.candidateTitle?.trim() || null;
  const identified = Boolean(
    candidateTitle &&
      (localVision.brand ||
        localVision.model ||
        localVision.barcodes.length > 0 ||
        localVision.confidence >= 0.55),
  );
  const barcodeValue =
    localVision.barcodes[0]?.rawValue ||
    localVision.barcodes[0]?.displayValue ||
    null;
  const evidence = [
    ...localVision.ocrTexts.slice(0, 6).map((value, index) => ({
      claim: index === 0 ? 'visible_product_text' : 'visible_text',
      value,
      source: 'photo_text' as const,
      imageIndex: null,
      strength: localVisionStrength(localVision.confidence),
      rationale: 'Read locally on the device before the cloud request started.',
    })),
    ...localVision.labels.slice(0, 4).map((label) => ({
      claim: 'on_device_image_label',
      value: label.text,
      source: 'photo_visual' as const,
      imageIndex: null,
      strength: localVisionStrength(label.confidence),
      rationale: 'Generated by the bundled on-device image-labeling model.',
    })),
    ...(barcodeValue
      ? [
          {
            claim: 'barcode',
            value: barcodeValue,
            source: 'photo_text' as const,
            imageIndex: null,
            strength: 'high' as const,
            rationale: 'Decoded locally from the captured image.',
          },
        ]
      : []),
  ];
  const title =
    candidateTitle ||
    localVision.itemType ||
    localVision.category ||
    'Unclear item';
  const summary = identified
    ? `${title} identified from on-device text, barcode, and image-label clues.`
    : 'The on-device scan found some clues, but not enough to identify this item confidently.';

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-on-device-fallback`,
    status: identified ? 'identified' : 'insufficient_evidence',
    input: { imageCount, source: 'direct' },
    analysis: {
      summary,
      identification: {
        itemType: localVision.itemType,
        category: localVision.category,
        brand: localVision.brand,
        model: localVision.model,
        variant: null,
        color: null,
        era: null,
        serialNumber: null,
      },
      condition: {
        grade: 'unknown',
        confidence: 0,
        notes: [
          'Condition could not be confirmed locally; review the photos before listing.',
        ],
      },
      confidence: {
        overall: localVision.confidence,
        itemType: localVision.itemType ? Math.min(0.9, localVision.confidence) : 0,
        brand: localVision.brand ? Math.min(0.95, localVision.confidence + 0.05) : 0,
        model: localVision.model ? Math.min(0.92, localVision.confidence) : 0,
        condition: 0,
      },
      evidence,
      ambiguities: identified
        ? ["Cloud verification did not finish inside KeepFlip's time budget."]
        : ['Capture a clear model label, logo, barcode, or full product view.'],
      suggestedPhotos: identified
        ? []
        : [
            'Photograph the product label or model number.',
            'Capture the full item with the brand logo visible.',
          ],
      valuationSignals: {
        searchTerms: localVision.searchTerms,
        category: localVision.category,
        conditionAdjustment:
          'No condition adjustment was applied because the local fallback did not grade condition.',
        positiveFactors: localVision.notes,
        negativeFactors: localVision.warnings,
      },
    },
    vision: {
      enabled: localVision.available,
      succeeded: localVision.available,
      images: localVision.available
        ? [
            {
              imageIndex: 0,
              text: localVision.ocrTexts.join('\n').slice(0, 4_000) || null,
              labels: localVision.labels.map((label) => ({
                description: label.text,
                score: label.confidence,
              })),
              objects: [],
            },
          ]
        : [],
      warnings: localVision.warnings,
    },
    valuation: emptyMarketValuation(),
  };
}

function mergedOcrInput(
  input: AnalyzeItemPhotosInput['ocr'],
  localVision: LocalVisionSignals,
) {
  const supplied = input === undefined ? [] : Array.isArray(input) ? input : [input];
  const localText = localVision.ocrTexts.join('\n').trim();
  const entries = [...supplied, ...(localText ? [localText] : [])]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_ANALYSIS_PHOTOS);

  let remainingCharacters = MAX_OCR_CHARACTERS;
  const bounded = entries
    .map((entry) => {
      const value = entry.slice(0, remainingCharacters);
      remainingCharacters -= value.length;
      return value;
    })
    .filter(Boolean);
  return bounded.length ? bounded : undefined;
}

function mergedUserNotes(
  suppliedNotes: string | undefined,
  localVision: LocalVisionSignals,
) {
  const localContext = [
    localVision.candidateTitle
      ? `On-device candidate: ${localVision.candidateTitle}`
      : '',
    localVision.brand ? `Brand clue: ${localVision.brand}` : '',
    localVision.model ? `Model clue: ${localVision.model}` : '',
    localVision.category ? `Category clue: ${localVision.category}` : '',
    localVision.labels.length
      ? `Image labels: ${localVision.labels
          .slice(0, 6)
          .map((label) => `${label.text} ${Math.round(label.confidence * 100)}%`)
          .join(', ')}`
      : '',
    localVision.barcodes.length
      ? `Barcode: ${
          localVision.barcodes[0].rawValue ||
          localVision.barcodes[0].displayValue
        }`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const combined = [suppliedNotes?.trim(), localContext && `[ON-DEVICE AI]\n${localContext}`]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_USER_NOTES_CHARACTERS);
  return combined || undefined;
}

function identityCompatible(
  localResult: ItemAnalysisSuccess,
  confirmedResult: ItemAnalysisSuccess,
) {
  const local = localResult.analysis.identification;
  const confirmed = confirmedResult.analysis.identification;
  if (
    local.brand &&
    confirmed.brand &&
    local.brand.toLowerCase() !== confirmed.brand.toLowerCase()
  ) {
    return false;
  }
  if (local.model && confirmed.model) {
    const compactLocal = local.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    const compactConfirmed = confirmed.model
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (
      compactLocal &&
      compactConfirmed &&
      !compactLocal.includes(compactConfirmed) &&
      !compactConfirmed.includes(compactLocal)
    ) {
      return false;
    }
  }
  return true;
}

function mergeMarketOutcome(
  identifiedResult: ItemAnalysisSuccess,
  researchedResult: ItemAnalysisSuccess,
): ItemAnalysisSuccess {
  return {
    ...identifiedResult,
    valuation:
      researchedResult.valuation.usedCount > 0
        ? researchedResult.valuation
        : identifiedResult.valuation,
    marketResearch: researchedResult.marketResearch,
  };
}

function scheduleAnalysisCleanup({
  analysisStartedAt,
  bucketId,
  delayMs,
  diagnosticId,
  preparedPhotoUris,
  storage,
  uploadedFileIds,
}: {
  analysisStartedAt: number;
  bucketId: string;
  delayMs: number;
  diagnosticId: string;
  preparedPhotoUris: string[];
  storage: Storage;
  uploadedFileIds: string[];
}) {
  const cleanup = async () => {
    if (uploadedFileIds.length > 0) {
      await deleteUploadedFiles(
        storage,
        bucketId,
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
  };

  if (delayMs > 0) {
    setTimeout(() => void cleanup(), delayMs);
  } else {
    void cleanup();
  }
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
      ? { compress: 0.78, maxDimension: 1_600 }
      : photoCount === 2
        ? { compress: 0.74, maxDimension: 1_440 }
        : { compress: 0.72, maxDimension: 1_280 };

  return [
    primary,
    { compress: 0.62, maxDimension: Math.min(primary.maxDimension, 1_080) },
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
  const deadlineAt = analysisStartedAt + TOTAL_ANALYSIS_BUDGET_MS;
  const diagnosticId = createAnalysisDiagnosticId();
  validateInput(input);
  throwIfAborted(options.signal);

  const { account, configuration, functions, storage } = getAppwriteServices();
  const preparedPhotoUris: string[] = [];
  const uploadedFileIds: string[] = [];
  let result: ItemAnalysisSuccess | undefined;
  let primaryError: unknown;
  let primaryTimedOut = false;
  let cleanupScheduled = false;

  reportStage(options.onStage, 'authenticating');
  const localVisionPromise = analyzePhotosLocally(input.photoUris, {
    signal: options.signal,
    timeoutMs: LOCAL_VISION_TIMEOUT_MS,
  });
  const authOutcomePromise = withinAnalysisDeadline(
    ensureAuthenticatedUserId(account, options.signal),
    deadlineAt,
    'AUTHENTICATION_TIMEOUT',
    'KeepFlip could not verify the signed-in session quickly enough.',
    options.signal,
    5_500,
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const preparationOutcomePromise = withinAnalysisDeadline(
    mapWithConcurrency(input.photoUris, 2, async (photoUri, photoIndex) => {
      const preparedUri = await prepareAnalysisPhoto(
        photoUri,
        photoIndex,
        input.photoUris.length,
        diagnosticId,
        analysisStartedAt,
        options.signal,
      );
      preparedPhotoUris[photoIndex] = preparedUri;
      return preparedUri;
    }),
    deadlineAt,
    'PHOTO_PREPARATION_TIMEOUT',
    'KeepFlip stopped preparing photos so the scan could finish on time.',
    options.signal,
    8_500,
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const localVision = await localVisionPromise;
  logAnalysisDiagnostic(
    diagnosticId,
    'on_device_vision_completed',
    analysisStartedAt,
    {
      available: localVision.available,
      elapsedMs: localVision.elapsedMs,
      ocrClueCount: localVision.ocrTexts.length,
      labelCount: localVision.labels.length,
      barcodeCount: localVision.barcodes.length,
      candidateTitle: localVision.candidateTitle,
      confidence: localVision.confidence,
      warnings: localVision.warnings.join(',') || undefined,
    },
    localVision.available ? 'info' : 'warn',
  );
  const localFallback = localVisionFallbackResult(
    localVision,
    input.photoUris.length,
  );

  const authOutcome = await authOutcomePromise;
  if (!authOutcome.ok) throw authOutcome.error;
  const userId = authOutcome.value;
  logAnalysisDiagnostic(
    diagnosticId,
    'authentication_completed',
    analysisStartedAt,
    { userRef: fileDiagnosticRef(userId) },
  );

  const marketResearchFunctionId =
    configuration.marketResearchFunctionId ??
    configuration.ebaySoldCompsFunctionId;
  let preliminaryMarketPromise: Promise<ItemAnalysisSuccess | null> | null = null;
  if (
    marketResearchFunctionId &&
    localFallback.status === 'identified' &&
    localVision.confidence >= 0.5 &&
    remainingAnalysisMs(deadlineAt) > 4_000
  ) {
    logAnalysisDiagnostic(
      diagnosticId,
      'fast_market_research_started_from_local_clues',
      analysisStartedAt,
      {
        query: buildStrictEbaySearchQuery(
          buildStrictMarketProfile(localFallback),
        ).slice(0, 180),
      },
    );
    preliminaryMarketPromise = researchMarketSoldComps(
      localFallback,
      functions,
      marketResearchFunctionId,
      options.signal,
      deadlineAt,
    ).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return null;
      logAnalysisDiagnostic(
        diagnosticId,
        'fast_market_research_failed',
        analysisStartedAt,
        {
          errorCode:
            error instanceof ItemAnalysisError ? error.code : undefined,
          ...appwriteErrorDiagnostics(error),
        },
        'warn',
      );
      return null;
    });
  }

  try {
    const preparationOutcome = await preparationOutcomePromise;
    if (!preparationOutcome.ok) throw preparationOutcome.error;

    reportStage(options.onStage, 'uploading');
    const uploadFiles = preparationOutcome.value.map((uri, index) =>
      localUploadFile(uri, index),
    );
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

    const requestedPermissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ];
    await withinAnalysisDeadline(
      Promise.all(
        uploadFiles.map(async (file, photoIndex) => {
          throwIfAborted(options.signal);
          const uploadStartedAt = Date.now();
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
          uploadedFileIds[photoIndex] = uploaded.$id;
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
              hasExpectedUserRead: returnedPermissions.includes(
                requestedPermissions[0],
              ),
              chunksUploaded: uploaded.chunksUploaded,
              chunksTotal: uploaded.chunksTotal,
            },
          );
          return uploaded.$id;
        }),
      ),
      deadlineAt,
      'PHOTO_UPLOAD_TIMEOUT',
      'KeepFlip stopped uploading photos so the scan could finish on time.',
      options.signal,
      7_000,
    );

    const request: ItemAnalysisFunctionRequest = {
      bucketId: configuration.scanBucketId,
      diagnosticId,
      fileIds: uploadedFileIds.filter(Boolean),
      ...(mergedOcrInput(input.ocr, localVision)
        ? { ocr: mergedOcrInput(input.ocr, localVision) }
        : {}),
      ...(mergedUserNotes(input.userNotes, localVision)
        ? { userNotes: mergedUserNotes(input.userNotes, localVision) }
        : {}),
      ...(input.comps === undefined
        ? {}
        : {
            comps: input.comps.map(({ price, currency }) => ({
              price,
              ...(currency === undefined ? {} : { currency }),
            })),
          }),
    };

    const reserveForMarketMs = preliminaryMarketPromise ? 1_500 : 7_000;
    const primaryBudgetMs = Math.min(
      PRIMARY_ANALYSIS_MAX_MS,
      Math.max(1, remainingAnalysisMs(deadlineAt) - reserveForMarketMs),
    );

    if (primaryBudgetMs >= 1_500) {
      reportStage(options.onStage, 'analyzing');
      try {
        result = await withTimeLimit(
          executePrimaryAnalysis(
            functions,
            configuration.analyzeFunctionId,
            request,
            analysisStartedAt,
            options.signal,
          ),
          primaryBudgetMs,
          'PRIMARY_ANALYSIS_BUDGET_EXCEEDED',
          'Cloud verification did not finish inside KeepFlip\'s fast analysis budget.',
          options.signal,
        );
      } catch (primaryAnalysisError) {
        primaryError = primaryAnalysisError;
        primaryTimedOut =
          primaryAnalysisError instanceof ItemAnalysisError &&
          primaryAnalysisError.code === 'PRIMARY_ANALYSIS_BUDGET_EXCEEDED';

        if (localFallback.status === 'identified') {
          result = localFallback;
        } else if (
          shouldTryLegacyItemAi(primaryAnalysisError) &&
          remainingAnalysisMs(deadlineAt) > 2_500
        ) {
          try {
            const legacyIdentification = await withinAnalysisDeadline(
              identifyItemWithAI(
                uploadedFileIds.filter(Boolean),
                mergedUserNotes(input.userNotes, localVision),
                diagnosticId,
              ),
              deadlineAt,
              'LEGACY_ANALYSIS_TIMEOUT',
              'KeepFlip stopped the backup cloud analysis so the scan could finish on time.',
              options.signal,
              LEGACY_ANALYSIS_MAX_MS,
            );
            result = legacyIdentificationResult(
              legacyIdentification,
              uploadedFileIds.filter(Boolean).length,
            );
          } catch (legacyError) {
            const guidance = getItemIdentificationGuidance(legacyError);
            result = guidance
              ? legacyGuidanceResult(
                  guidance,
                  uploadedFileIds.filter(Boolean).length,
                )
              : localFallback;
          }
        } else {
          result = localFallback;
        }
      }
    } else {
      primaryTimedOut = true;
      primaryError = new ItemAnalysisError(
        'Cloud verification was skipped to preserve time for the market estimate.',
        'PRIMARY_ANALYSIS_BUDGET_EXCEEDED',
      );
      result = localFallback;
    }
  } catch (error) {
    primaryError = error;
    result = localFallback;
  } finally {
    scheduleAnalysisCleanup({
      analysisStartedAt,
      bucketId: configuration.scanBucketId,
      delayMs: primaryTimedOut
        ? CLEANUP_DELAY_AFTER_PRIMARY_TIMEOUT_MS
        : 0,
      diagnosticId,
      preparedPhotoUris: preparedPhotoUris.filter(Boolean),
      storage,
      uploadedFileIds: uploadedFileIds.filter(Boolean),
    });
    cleanupScheduled = true;
  }

  if (!cleanupScheduled) {
    scheduleAnalysisCleanup({
      analysisStartedAt,
      bucketId: configuration.scanBucketId,
      delayMs: 0,
      diagnosticId,
      preparedPhotoUris: preparedPhotoUris.filter(Boolean),
      storage,
      uploadedFileIds: uploadedFileIds.filter(Boolean),
    });
  }

  if (primaryError) {
    logAnalysisDiagnostic(
      diagnosticId,
      'cloud_analysis_fell_back',
      analysisStartedAt,
      {
        fallbackStatus: result?.status,
        errorCode:
          primaryError instanceof ItemAnalysisError
            ? primaryError.code
            : undefined,
        ...appwriteErrorDiagnostics(primaryError),
      },
      'warn',
    );
  }

  const resolvedResult = result ?? localFallback;
  logAnalysisDiagnostic(
    diagnosticId,
    'identification_completed',
    analysisStartedAt,
    {
      status: resolvedResult.status,
      evidenceCount: resolvedResult.analysis.evidence.length,
      imageCount: resolvedResult.input.imageCount,
      usedOnDeviceFallback: resolvedResult.version.includes('on-device-fallback'),
    },
  );
  const identifiedResult: ItemAnalysisSuccess = {
    ...resolvedResult,
    valuation: {
      ...resolvedResult.valuation,
      source: resolvedResult.valuation.usedCount > 0 ? 'caller_supplied' : 'none',
    },
  };

  if (identifiedResult.status !== 'identified') {
    return {
      ...identifiedResult,
      marketResearch: marketResearchFailure(
        'unavailable',
        'IDENTIFICATION_NOT_READY_FOR_COMPS',
        'KeepFlip needs a clearer product identity before estimating the sold market.',
        null,
      ),
    };
  }

  if (!marketResearchFunctionId) {
    return {
      ...identifiedResult,
      marketResearch: marketResearchFailure(
        'unavailable',
        'MARKET_RESEARCH_NOT_CONFIGURED',
        'Add the market-comps Function ID to enable sold-market valuation.',
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

  if (preliminaryMarketPromise) {
    const preliminary = await preliminaryMarketPromise;
    if (
      preliminary?.marketResearch?.status === 'completed' &&
      identityCompatible(localFallback, identifiedResult)
    ) {
      const merged = mergeMarketOutcome(identifiedResult, preliminary);
      logAnalysisDiagnostic(
        diagnosticId,
        'analysis_completed',
        analysisStartedAt,
        {
          elapsedMs: Date.now() - analysisStartedAt,
          compStatus: merged.marketResearch?.status,
          compCount: merged.marketResearch?.comps.length,
          fastLane: true,
        },
      );
      return merged;
    }
  }

  if (remainingAnalysisMs(deadlineAt) < 1_000) {
    return {
      ...identifiedResult,
      marketResearch: marketResearchFailure(
        'failed',
        'MARKET_RESEARCH_TIMEOUT',
        'KeepFlip finished identification but stopped waiting for market comps at the 30-second limit.',
        buildStrictEbaySearchQuery(
          buildStrictMarketProfile(identifiedResult),
        ) || null,
      ),
    };
  }

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
      deadlineAt,
    );
    logAnalysisDiagnostic(
      diagnosticId,
      'analysis_completed',
      analysisStartedAt,
      {
        elapsedMs: Date.now() - analysisStartedAt,
        compStatus: researchedResult.marketResearch?.status,
        compCount: researchedResult.marketResearch?.comps.length,
        signalCount: researchedResult.marketResearch?.signals?.length ?? 0,
        partial: researchedResult.marketResearch?.partial ?? false,
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
