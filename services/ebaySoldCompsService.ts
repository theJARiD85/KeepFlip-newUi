import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from "../lib/appwrite";
import type {
  ItemMarketProviderStatus,
  ItemMarketSignal,
  MarketEvidenceClass,
  MarketProviderId,
  MarketProviderRunStatus,
} from "../types/item-analysis";
import type { ItemValuationSignals } from "./itemAiService";

export type EbaySoldComp = {
  provider: MarketProviderId;
  marketplace: string;
  evidenceClass: MarketEvidenceClass;
  title: string;
  soldPrice: number;
  shipping: number;
  totalPrice: number;
  currency: string;
  condition: string | null;
  soldDate: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
  sourceListingId?: string | null;
  soldDateConfidence?: "exact" | "approximate" | "unknown";
  shippingSemantics?: "included" | "separate" | "unknown";
};

export type MarketValueConfidence = "high" | "medium" | "low";

export type MarketValueSearchRoute = "identifier" | "hybrid" | "descriptor";

export type MarketValueQuality = {
  confidence: MarketValueConfidence;
  exactComparableCount: number;
  comparableCount: number;
  warnings: string[];
  searchRoute?: MarketValueSearchRoute;
  searchIntent?: "sold_comps" | "visual_recently_sold";
};

export type EbaySoldCompsResult = {
  ok: true;
  phase: "completed";
  purpose: "sold_comps";
  runId: string;
  jobId?: string;
  query: string;
  comps: EbaySoldComp[];
  summary: {
    count: number;
    low: number;
    median: number;
    average: number;
    high: number;
    currency: string;
  };
  searchedAt: string;
  partial?: boolean;
  providers?: ItemMarketProviderStatus[];
  signals?: ItemMarketSignal[];
  valuation?: MarketValueQuality;
};

export type EbayBarcodeProduct = {
  barcode: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string;
  imageUrl: string | null;
  searchQuery: string;
  source: "ebay";
};

export type EbayBarcodeLookupResult = {
  ok: true;
  phase: "completed";
  purpose: "barcode_lookup";
  runId: string;
  barcode: string;
  found: boolean;
  product: EbayBarcodeProduct | null;
  matches: EbaySoldComp[];
  searchedAt: string;
};

type JsonRecord = Record<string, unknown>;

const POLL_INTERVAL_MS = 2500;
const MAX_WAIT_MS = 180000;
const MAX_VALUATION_COMPS_PER_PROVIDER = 8;

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function asRecord(value: unknown): JsonRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/,/g, "").replace(/[^\d.-]/g, "")
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(
      value.replace(/,/g, "").replace(/[^\d.-]/g, "")
    );
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

const PROVIDER_ALIASES: Record<string, MarketProviderId> = {
  ebay: "ebay",
  mercari: "mercari",
  poshmark: "poshmark",
  grailed: "grailed",
  stockx: "stockx",
  pricecharting: "pricecharting",
  price_charting: "pricecharting",
  tcgplayer: "tcgplayer",
  tcg_player: "tcgplayer",
  reverb: "reverb",
  discogs: "discogs",
  bricklink: "bricklink",
  yahoo_japan: "yahoo_japan",
  yahoojapan: "yahoo_japan",
  yahoo: "yahoo_japan",
};

const EVIDENCE_CLASSES = new Set<MarketEvidenceClass>([
  "confirmed_transaction",
  "platform_last_sale",
  "platform_sold_aggregate",
  "sold_status_last_ask",
  "inferred_sale",
  "active_ask",
]);

function normalizeProviderId(
  value: unknown,
  fallback: MarketProviderId = "unknown"
) {
  const key = asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return PROVIDER_ALIASES[key] ?? fallback;
}

function normalizeEvidenceClass(value: unknown) {
  const normalized = asString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as MarketEvidenceClass;
  return EVIDENCE_CLASSES.has(normalized) ? normalized : null;
}

function normalizeBarcode(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2) {
    return sorted[middle];
  }

  return roundMoney((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return roundMoney(
    values.reduce((total, value) => total + value, 0) /
      values.length
  );
}

function percentile(values: number[], position: number) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, position));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return roundMoney(sorted[lower]);
  }

  const weight = index - lower;
  return roundMoney(
    sorted[lower] * (1 - weight) + sorted[upper] * weight
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized || null;
}

function normalizeComp(
  value: unknown,
  allowLegacyEbayEvidence: boolean
): EbaySoldComp {
  const source = asRecord(value) || {};

  const explicitProvider =
    source.provider ?? source.marketplace ?? source.source;
  const provider = normalizeProviderId(
    explicitProvider,
    allowLegacyEbayEvidence ? "ebay" : "unknown"
  );
  const evidenceClass =
    normalizeEvidenceClass(
      source.evidenceClass ?? source.evidence_class
    ) ??
    (allowLegacyEbayEvidence && provider === "ebay"
      ? "confirmed_transaction"
      : "inferred_sale");

  const soldPrice = asNumber(
    source.soldPrice ??
      source.price ??
      source.currentPrice ??
      source.finalPrice
  );

  const shipping = asNumber(
    source.shipping ??
      source.shippingCost ??
      source.shippingPrice ??
      source.postage
  );

  const totalPrice = asNumber(source.totalPrice) || soldPrice + shipping;

  const soldDateConfidence = asString(
    source.soldDateConfidence
  );
  const shippingSemantics = asString(
    source.shippingSemantics
  );

  return {
    provider,
    marketplace:
      asString(source.marketplace) ||
      (provider === "unknown" ? "unknown" : provider),
    evidenceClass,
    title:
      asString(
        source.title ??
          source.name ??
          source.itemTitle
      ) || "Untitled eBay item",
    soldPrice: roundMoney(soldPrice),
    shipping: roundMoney(shipping),
    totalPrice: roundMoney(totalPrice),
    currency: asString(source.currency) || "USD",
    condition: toNullableString(
      source.condition ?? source.conditionDisplayName
    ),
    soldDate: toNullableString(
      source.soldDate ??
        source.dateSold ??
        source.endDate ??
        source.completedDate
    ),
    imageUrl: toNullableString(
      source.imageUrl ??
        source.image ??
        source.thumbnail ??
        source.thumbnailUrl
    ),
    listingUrl: toNullableString(
      source.listingUrl ??
        source.url ??
        source.itemUrl ??
        source.link
    ),
    sourceListingId: toNullableString(
      source.sourceListingId ??
        source.listingId ??
        source.itemId ??
        source.id
    ),
    soldDateConfidence: ["exact", "approximate", "unknown"].includes(
      soldDateConfidence
    )
      ? (soldDateConfidence as "exact" | "approximate" | "unknown")
      : "unknown",
    shippingSemantics: ["included", "separate", "unknown"].includes(
      shippingSemantics
    )
      ? (shippingSemantics as "included" | "separate" | "unknown")
      : "unknown",
  };
}

function readComps(payload: JsonRecord): EbaySoldComp[] {
  const rawComps =
    (Array.isArray(payload.comps) && payload.comps) ||
    (Array.isArray(payload.matches) && payload.matches) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload.results) && payload.results) ||
    [];

  const hasGenericContract =
    Boolean(asString(payload.jobId)) ||
    Array.isArray(payload.providers) ||
    Boolean(asRecord(payload.providers)) ||
    Array.isArray(payload.signals);
  const allowLegacyEbayEvidence = !hasGenericContract;

  return rawComps
    .map((comp) => normalizeComp(comp, allowLegacyEbayEvidence))
    .filter((comp) => comp.title !== "Untitled eBay item");
}

function normalizeProviderStatus(
  value: unknown,
  providerKey?: string
): ItemMarketProviderStatus {
  const record = asRecord(value) || {};
  const rawStatus = asString(
    asRecord(value) ? record.status : value
  )
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, MarketProviderRunStatus> = {
    ready: "queued",
    queued: "queued",
    pending: "pending",
    started: "running",
    running: "running",
    success: "completed",
    succeeded: "completed",
    completed: "completed",
    partial: "partial",
    skipped: "skipped",
    unavailable: "unavailable",
    failed: "failed",
    error: "failed",
    timed_out: "timed_out",
    timeout: "timed_out",
  };
  const rawError = asRecord(record.error);
  const errorMessage =
    asString(rawError?.message) ||
    asString(record.error) ||
    asString(record.message);
  const result: ItemMarketProviderStatus = {
    provider: normalizeProviderId(
      record.provider ?? record.id ?? providerKey
    ),
    status: aliases[rawStatus] ?? "pending",
    query: toNullableString(record.query),
    comparableCount: Math.max(
      0,
      Math.trunc(
        asNumber(
          record.comparableCount ?? record.compCount ?? record.count
        )
      )
    ),
    signalCount: Math.max(
      0,
      Math.trunc(asNumber(record.signalCount))
    ),
    searchedAt: toNullableString(
      record.searchedAt ?? record.completedAt
    ),
    warnings: [
      ...(Array.isArray(record.warnings)
        ? record.warnings.filter(
            (warning): warning is string => typeof warning === "string"
          )
        : []),
      ...(asString(record.warning) ? [asString(record.warning)] : []),
    ],
  };

  if (errorMessage) {
    result.error = {
      code:
        asString(rawError?.code ?? record.errorCode) ||
        "PROVIDER_FAILED",
      message: errorMessage,
    };
  }

  return result;
}

function readProviderStatuses(payload: JsonRecord) {
  const value =
    payload.providers ??
    payload.providerResults ??
    payload.providerStatuses;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeProviderStatus(entry));
  }
  const record = asRecord(value);
  return record
    ? Object.entries(record).map(([provider, entry]) =>
        normalizeProviderStatus(entry, provider)
      )
    : [];
}

function normalizeMarketSignal(value: unknown): ItemMarketSignal | null {
  const source = asRecord(value);
  if (!source) return null;
  const explicitEvidenceClass = normalizeEvidenceClass(
    source.evidenceClass ?? source.evidence_class
  );
  const type =
    asString(source.type ?? source.kind ?? source.signal) ||
    explicitEvidenceClass ||
    "market_signal";
  const normalizedType = type.toLowerCase();
  const defaultEvidenceClass: MarketEvidenceClass =
    normalizedType.includes("last_sale")
      ? "platform_last_sale"
      : normalizedType.includes("active") || normalizedType.includes("ask")
        ? "active_ask"
        : "platform_sold_aggregate";

  return {
    provider: normalizeProviderId(
      source.provider ?? source.marketplace
    ),
    evidenceClass:
      explicitEvidenceClass ?? defaultEvidenceClass,
    type,
    label: toNullableString(
      source.label ?? source.title ?? source.name
    ),
    currency:
      toNullableString(source.currency)?.toUpperCase() ?? null,
    value: optionalNumber(
      source.value ?? source.amount ?? source.lastSale
    ),
    low: optionalNumber(source.low ?? source.min ?? source.priceLow),
    median: optionalNumber(source.median ?? source.medianPrice),
    high: optionalNumber(source.high ?? source.max ?? source.priceHigh),
    sampleSize: optionalNumber(source.sampleSize ?? source.count),
    observedAt: toNullableString(
      source.observedAt ?? source.searchedAt ?? source.scrapedAt
    ),
    sourceUrl: toNullableString(
      source.sourceUrl ?? source.listingUrl ?? source.url
    ),
    note: toNullableString(source.note ?? source.description),
  };
}

function readMarketSignals(payload: JsonRecord) {
  const value = payload.signals ?? payload.marketSignals;
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeMarketSignal)
    .filter((signal): signal is ItemMarketSignal => signal !== null);
}

function preferredCurrency(comps: EbaySoldComp[]) {
  if (comps.some((comp) => comp.currency.toUpperCase() === "USD")) {
    return "USD";
  }

  const counts = new Map<string, number>();
  for (const comp of comps) {
    const currency = comp.currency.toUpperCase();
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0]?.[0];
}

function capProviderContribution(comps: EbaySoldComp[]) {
  const groups = new Map<MarketProviderId, EbaySoldComp[]>();
  for (const comp of comps) {
    const group = groups.get(comp.provider) ?? [];
    group.push(comp);
    groups.set(comp.provider, group);
  }

  return [...groups.values()].flatMap((providerComps) =>
    providerComps
      .map((comp, index) => ({ comp, index }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.comp.soldDate ?? "");
        const rightTime = Date.parse(right.comp.soldDate ?? "");
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return rightTime - leftTime;
        }
        return left.index - right.index;
      })
      .slice(0, MAX_VALUATION_COMPS_PER_PROVIDER)
      .map(({ comp }) => comp)
  );
}

function rawMedian(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function removeMadOutliers(comps: EbaySoldComp[]) {
  if (comps.length < 5) return comps;
  const prices = comps.map((comp) => comp.totalPrice);
  const center = rawMedian(prices);
  const mad = rawMedian(
    prices.map((price) => Math.abs(price - center))
  );

  if (!Number.isFinite(mad) || mad <= 0) return comps;
  return comps.filter(
    (comp) =>
      (0.67448975 * Math.abs(comp.totalPrice - center)) / mad <= 3.5
  );
}

function selectValuationComps(comps: EbaySoldComp[]) {
  const confirmed = comps.filter(
    (comp) =>
      comp.evidenceClass === "confirmed_transaction" &&
      Number.isFinite(comp.totalPrice) &&
      comp.totalPrice > 0
  );
  const currency = preferredCurrency(confirmed);
  if (!currency) return [];

  return removeMadOutliers(
    capProviderContribution(
      confirmed.filter(
        (comp) => comp.currency.toUpperCase() === currency
      )
    )
  );
}

function makeSummary(comps: EbaySoldComp[]) {
  const selected = selectValuationComps(comps);
  const values = selected
    .map((comp) => comp.totalPrice)
    .filter((value) => Number.isFinite(value) && value > 0);

  const currency =
    selected.find((comp) => comp.currency)?.currency || "USD";

  return {
    count: selected.length,
    low:
      values.length >= 5
        ? percentile(values, 0.2)
        : values.length
          ? Math.min(...values)
          : 0,
    median: median(values),
    average: average(values),
    high:
      values.length >= 5
        ? percentile(values, 0.8)
        : values.length
          ? Math.max(...values)
          : 0,
    currency,
  };
}

function looksCompleted(payload: JsonRecord) {
  const phase = asString(payload.phase).toLowerCase();

  return (
    phase === "completed" ||
    Array.isArray(payload.comps) ||
    Array.isArray(payload.matches) ||
    Array.isArray(payload.items) ||
    Array.isArray(payload.results) ||
    Boolean(payload.product)
  );
}

function looksRunning(payload: JsonRecord) {
  const phase = asString(payload.phase).toLowerCase();
  const status = asString(payload.status).toUpperCase();

  return (
    phase === "queued" ||
    phase === "pending" ||
    phase === "started" ||
    phase === "running" ||
    status === "QUEUED" ||
    status === "PENDING" ||
    status === "READY" ||
    status === "RUNNING"
  );
}

function getPayloadError(payload: JsonRecord) {
  return (
    asString(payload.error) ||
    asString(payload.message) ||
    asString(asRecord(payload.error)?.message)
  );
}

async function callEbayFunction(
  body: JsonRecord
): Promise<JsonRecord> {
  const functionId =
    APPWRITE.marketResearchFunctionId ||
    APPWRITE.ebaySoldCompsFunctionId;
  if (!functionId) {
    throw new Error(
      "Configure EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID (or the legacy EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID) before researching sold comps."
    );
  }

  const execution = await functions.createExecution({
    functionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawBody = execution.responseBody?.trim() || "";

  if (!rawBody) {
    throw new Error(
      "Market research completed without a response. Check the Appwrite Function execution log."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Market research returned invalid JSON: ${rawBody.slice(0, 250)}`
    );
  }

  const payload = asRecord(parsed);

  if (!payload) {
    throw new Error(
      "Market research returned an unexpected response format."
    );
  }

  const errorMessage = getPayloadError(payload);

  if (
    execution.responseStatusCode >= 400 ||
    payload.ok === false
  ) {
    throw new Error(
      errorMessage ||
        "KeepFlip could not complete the marketplace search."
    );
  }

  return payload;
}

async function startSearch(
  purpose: "sold_comps" | "barcode_lookup",
  query: string,
  barcode: string | undefined,
  limit: number
): Promise<JsonRecord> {
  return callEbayFunction({
    action: "start",
    purpose,
    query,
    barcode,
    limit,
  });
}

async function waitForResult(
  startedPayload: JsonRecord,
  purpose: "sold_comps" | "barcode_lookup",
  query: string,
  barcode: string | undefined
): Promise<JsonRecord> {
  /*
    Some prior Function builds can return their final payload immediately.
    Accept the actual data shape instead of rejecting it based on `purpose`.
  */
  if (looksCompleted(startedPayload)) {
    return startedPayload;
  }

  let jobId = asString(startedPayload.jobId);
  let runId = asString(startedPayload.runId ?? startedPayload.id);
  let jobToken = asString(startedPayload.jobToken);

  if (!jobId && !runId) {
    throw new Error(
      "Market research started but did not return a job ID."
    );
  }

  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const progress = await callEbayFunction({
      action: "status",
      purpose,
      ...(jobId ? { jobId } : {}),
      ...(jobToken ? { jobToken } : {}),
      ...(runId ? { runId } : {}),
      query,
      barcode,
    });

    jobId = asString(progress.jobId) || jobId;
    runId = asString(progress.runId ?? progress.id) || runId;
    jobToken = asString(progress.jobToken) || jobToken;

    if (looksCompleted(progress)) {
      return progress;
    }

    if (!looksRunning(progress)) {
      const message = getPayloadError(progress);

      if (message) {
        throw new Error(message);
      }
    }
  }

  throw new Error(
    "The eBay search is taking longer than expected. Please try again."
  );
}

function toSoldCompsResult(
  payload: JsonRecord,
  query: string
): EbaySoldCompsResult {
  const comps = readComps(payload);
  const providers = readProviderStatuses(payload);
  const signals = readMarketSignals(payload);

  if (!comps.length) {
    throw new Error(
      "eBay completed the search but returned no usable sold listings."
    );
  }

  const fallbackSummary = makeSummary(comps);
  const jobId = asString(payload.jobId);

  return {
    ok: true,
    phase: "completed",
    purpose: "sold_comps",
    runId: asString(payload.runId ?? payload.id) || "completed",
    ...(jobId ? { jobId } : {}),
    query: asString(payload.query) || query,
    comps,
    summary: fallbackSummary,
    searchedAt:
      asString(payload.searchedAt) ||
      new Date().toISOString(),
    partial:
      payload.partial === true ||
      providers.some((entry) =>
        ["failed", "timed_out", "unavailable", "partial"].includes(
          entry.status
        )
      ),
    providers,
    signals,
  };
}

function guessCategoryFromTitle(title: string): string {
  const value = title.toLowerCase();

  if (
    /iphone|samsung|pixel|ipad|tablet|laptop|computer|camera|tv|speaker|headphone|console|electronic/.test(
      value
    )
  ) {
    return "Electronics";
  }

  if (
    /drill|saw|tool|wrench|dewalt|milwaukee|makita/.test(
      value
    )
  ) {
    return "Tools";
  }

  if (/sofa|chair|table|dresser|bed|furniture/.test(value)) {
    return "Furniture";
  }

  if (
    /shoe|sneaker|jacket|shirt|pants|dress/.test(value)
  ) {
    return "Fashion";
  }

  if (/card|collectible|vintage|figure|toy/.test(value)) {
    return "Collectible";
  }

  return "Other";
}

function toBarcodeLookupResult(
  payload: JsonRecord,
  barcode: string
): EbayBarcodeLookupResult {
  const rawProduct = asRecord(payload.product);
  const matches = readComps(payload);

  const firstMatch = matches[0];

  const title =
    asString(rawProduct?.title) || firstMatch?.title || "";

  const product: EbayBarcodeProduct | null = title
    ? {
        barcode:
          asString(rawProduct?.barcode) || barcode,
        title,
        brand: toNullableString(rawProduct?.brand),
        model: toNullableString(rawProduct?.model),
        category:
          asString(rawProduct?.category) ||
          guessCategoryFromTitle(title),
        description:
          asString(rawProduct?.description) ||
          `Matched from eBay search results for barcode ${barcode}.`,
        imageUrl:
          toNullableString(rawProduct?.imageUrl) ||
          firstMatch?.imageUrl ||
          null,
        searchQuery:
          asString(rawProduct?.searchQuery) ||
          [
            toNullableString(rawProduct?.brand),
            toNullableString(rawProduct?.model),
            title,
          ]
            .filter(Boolean)
            .join(" "),
        source: "ebay",
      }
    : null;

  return {
    ok: true,
    phase: "completed",
    purpose: "barcode_lookup",
    runId: asString(payload.runId ?? payload.id) || "completed",
    barcode: asString(payload.barcode) || barcode,
    found: Boolean(product),
    product,
    matches,
    searchedAt:
      asString(payload.searchedAt) ||
      new Date().toISOString(),
  };
}

export async function runEbaySoldComps(
  rawQuery: string,
  limit = 12
): Promise<EbaySoldCompsResult> {
  const query = rawQuery.trim();

  if (query.length < 3) {
    throw new Error(
      "Enter a more specific item name before researching sold comps."
    );
  }

  const started = await startSearch(
    "sold_comps",
    query,
    undefined,
    limit
  );

  const completed = await waitForResult(
    started,
    "sold_comps",
    query,
    undefined
  );

  /*
    Intentional compatibility behavior:
    A valid response with `comps` is a sold-comps result even when the
    Function omitted or incorrectly labeled `purpose`.
  */
  return toSoldCompsResult(completed, query);
}

export async function lookupBarcodeWithEbay(
  rawBarcode: string
): Promise<EbayBarcodeLookupResult> {
  const barcode = normalizeBarcode(rawBarcode);

  if (barcode.length < 6) {
    throw new Error(
      "Scan a complete product barcode before searching."
    );
  }

  const started = await startSearch(
    "barcode_lookup",
    barcode,
    barcode,
    5
  );

  const completed = await waitForResult(
    started,
    "barcode_lookup",
    barcode,
    barcode
  );

  /*
    A valid product result can arrive as `product` or as ordinary `comps`
    from the same actor. Both are accepted and normalized for the scanner.
  */
  return toBarcodeLookupResult(completed, barcode);
}


/*
  Precision-first market-value research

  This path stays aggressive about rejecting bulk / multi-item / parts-only
  listings, but it no longer refuses to give a usable estimate merely because
  the photo AI cannot prove every detail. Instead it returns a confidence tier
  and explains exactly what would make the estimate tighter.
*/

export type StrictMarketValueProfile = {
  title: string;
  brand: string | null;
  model: string | null;
  condition: string;
  conditionNotes: string;
  photoCount: number;
  valuationSignals?: ItemValuationSignals | null;
};

type SearchPlan = {
  route: MarketValueSearchRoute;
  query: string;
  identityText: string;
  descriptorText: string;
  searchIntent: "sold_comps" | "visual_recently_sold";
};

type ConditionBucket =
  | "new"
  | "like_new"
  | "pre_owned"
  | "refurbished"
  | "fair"
  | "poor"
  | "parts"
  | "unknown";

const BULK_OR_MULTI_ITEM_PATTERN =
  /\b(?:lot|bulk|bundle|wholesale|job\s*lot|collection|assorted|mixed)\b|\bset\s+of\s+\d+\b|\b(?:[2-9]|\d{2,})\s*(?:pack|pcs?|pieces?|units?|items?)\b|\bqty\s*\d+\b/i;

const DAMAGE_TERMS_PATTERN =
  /\b(?:for\s+parts|parts\s+only|not\s+working|broken|damaged|repair|as[\s-]?is|untested|salvage|faulty|no\s+power)\b/i;

const SOLD_INTENT_PATTERN =
  /\b(?:recently\s+sold|sold\s+prices?|sold\s+comps?|completed\s+(?:sales|listings)|auction\s+results?|hammer\s+price|final\s+price)\b/gi;

const STOP_WORDS = new Set([
  "a", "an", "and", "the", "with", "for", "from", "edition",
  "model", "series", "version", "new", "pre-owned", "good", "condition",
  "item", "original", "authentic", "genuine",
]);

function strictText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string | null | undefined) {
  return strictText(value).replace(/\s/g, "");
}

function uniqueWords(value: string) {
  return Array.from(
    new Set(
      strictText(value)
        .split(" ")
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    )
  );
}

function uniqueValues(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeCondition(condition: string, notes = ""): ConditionBucket {
  const value = `${condition} ${notes}`.toLowerCase();

  if (/\b(?:for\s+parts|parts\s+only|not\s+working|broken|repair|as[\s-]?is|untested|faulty|no\s+power)\b/.test(value)) return "parts";
  if (/\bpoor\b/.test(value)) return "poor";
  if (/\bfair\b/.test(value)) return "fair";

  if (/\brefurb(?:ished)?\b/.test(value)) return "refurbished";
  if (/\b(?:open\s*box|like\s*new|excellent|new\s+other)\b/.test(value)) return "like_new";
  if (/\bnew(?:\s+with\s+tags)?\b/.test(value)) return "new";
  if (/\b(?:used|good)\b/.test(value)) return "pre_owned";

  return "unknown";
}

function getPreferredModel(profile: StrictMarketValueProfile) {
  const explicit = profile.model?.trim();

  if (explicit && compactText(explicit).length >= 3) {
    return explicit;
  }

  return uniqueWords(profile.title)
    .filter((token) => /[a-z]/.test(token) && /\d/.test(token))
    .sort((left, right) => right.length - left.length)[0] || null;
}

function buildPrecisionSearchQuery(
  profile: StrictMarketValueProfile,
  model: string | null,
  condition: ConditionBucket
) {
  const conditionTerm = {
    new: "new",
    like_new: "open box",
    pre_owned: "pre-owned",
    refurbished: "refurbished",
    fair: "pre-owned",
    poor: "pre-owned",
    parts: "for parts",
    unknown: "",
  }[condition];

  const brand = profile.brand?.trim() || "";
  const modelText = model?.trim() || "";
  const title = profile.title.trim();
  const normalizedBrand = strictText(brand);
  const normalizedModel = strictText(modelText);
  const normalizedTitle = strictText(title);

  const titleAlreadyHasBrand =
    Boolean(normalizedBrand) &&
    normalizedTitle.includes(normalizedBrand);

  const titleAlreadyHasModel =
    Boolean(normalizedModel) &&
    normalizedTitle.includes(normalizedModel);

  const modelAlreadyHasBrand =
    Boolean(normalizedBrand) &&
    Boolean(normalizedModel) &&
    normalizedModel.startsWith(normalizedBrand);

  const includeModel =
    Boolean(modelText) && !titleAlreadyHasModel;

  const includeBrand =
    Boolean(brand) &&
    !titleAlreadyHasBrand &&
    !(includeModel && modelAlreadyHasBrand);

  return [
    includeBrand ? brand : null,
    includeModel ? modelText : null,
    title,
    conditionTerm
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function conditionSearchTerm(condition: ConditionBucket) {
  return {
    new: "new",
    like_new: "open box",
    pre_owned: "pre-owned",
    refurbished: "refurbished",
    fair: "pre-owned",
    poor: "pre-owned",
    parts: "for parts",
    unknown: "",
  }[condition];
}

function descriptorTerms(signals?: ItemValuationSignals | null) {
  if (!signals) {
    return [];
  }

  return uniqueValues([
    signals.objectType,
    signals.subcategory,
    ...signals.style,
    ...signals.era,
    ...signals.materials,
    ...signals.colors,
    ...signals.motifs,
    signals.shape,
    ...signals.construction,
  ]);
}

function hasUsefulDescriptors(profile: StrictMarketValueProfile) {
  const signals = profile.valuationSignals;

  if (!signals) {
    return false;
  }

  return (
    signals.searchQueries.some((query) => query.trim().length >= 4) ||
    descriptorTerms(signals).length >= 3 ||
    Boolean(signals.descriptorSummary.trim())
  );
}

function selectSearchRoute(
  profile: StrictMarketValueProfile,
  model: string | null
): MarketValueSearchRoute {
  if (model) {
    return "identifier";
  }

  if (!hasUsefulDescriptors(profile)) {
    return "identifier";
  }

  if (profile.brand?.trim()) {
    return "hybrid";
  }

  return "descriptor";
}

function appendConditionTerm(query: string, condition: ConditionBucket) {
  const term = conditionSearchTerm(condition);

  if (!term) {
    return query.trim();
  }

  const normalizedQuery = strictText(query);
  const normalizedTerm = strictText(term);

  if (normalizedQuery.includes(normalizedTerm)) {
    return query.trim();
  }

  return `${query.trim()} ${term}`.trim();
}

function cleanSoldCompQuery(query: string) {
  return query
    .replace(SOLD_INTENT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDescriptorSearchQuery(
  profile: StrictMarketValueProfile,
  route: MarketValueSearchRoute,
  condition: ConditionBucket
) {
  const signals = profile.valuationSignals;
  const brand = profile.brand?.trim() || "";
  const suppliedQuery =
    signals?.searchQueries.find((query) => query.trim().length >= 4) || "";

  if (suppliedQuery) {
    const queryHasBrand =
      Boolean(brand) && strictText(suppliedQuery).includes(strictText(brand));
    const prefixedQuery =
      route === "hybrid" && brand && !queryHasBrand
        ? `${brand} ${suppliedQuery}`
        : suppliedQuery;

    return cleanSoldCompQuery(
      appendConditionTerm(prefixedQuery, condition)
    );
  }

  const terms = descriptorTerms(signals);
  const descriptorQuery = uniqueValues([
    route === "hybrid" ? brand : null,
    ...terms.slice(0, 8),
    terms.length < 3 ? profile.title : null,
  ]).join(" ");

  return cleanSoldCompQuery(
    appendConditionTerm(descriptorQuery || profile.title, condition)
  );
}

function buildSearchPlan(
  profile: StrictMarketValueProfile,
  model: string | null,
  condition: ConditionBucket
): SearchPlan {
  const identifierQuery = buildPrecisionSearchQuery(
    profile,
    model,
    condition
  );
  const route = selectSearchRoute(profile, model);

  if (route === "identifier") {
    return {
      route,
      query: identifierQuery,
      identityText: [profile.brand, model, profile.title]
        .filter(Boolean)
        .join(" "),
      descriptorText: "",
      searchIntent: "sold_comps",
    };
  }

  const descriptorQuery = buildDescriptorSearchQuery(
    profile,
    route,
    condition
  );

  if (descriptorQuery.length < 3) {
    return {
      route: "identifier",
      query: identifierQuery,
      identityText: [profile.brand, model, profile.title]
        .filter(Boolean)
        .join(" "),
      descriptorText: "",
      searchIntent: "sold_comps",
    };
  }

  const descriptorText = uniqueValues([
    profile.valuationSignals?.descriptorSummary,
    ...descriptorTerms(profile.valuationSignals),
  ]).join(" ");

  return {
    route,
    query: descriptorQuery,
    identityText: [profile.brand, profile.title, descriptorText]
      .filter(Boolean)
      .join(" "),
    descriptorText,
    searchIntent: "visual_recently_sold",
  };
}

export function buildStrictEbaySearchQuery(
  profile: StrictMarketValueProfile
) {
  const model = getPreferredModel(profile);
  const condition = normalizeCondition(
    profile.condition,
    profile.conditionNotes
  );
  return buildSearchPlan(profile, model, condition).query;
}

function compConditionBucket(comp: EbaySoldComp): ConditionBucket {
  return normalizeCondition(comp.condition || "", comp.title);
}

function exactConditionMatches(target: ConditionBucket, comp: EbaySoldComp) {
  const actual = compConditionBucket(comp);
  return target !== "unknown" && actual !== "unknown" && target === actual;
}

function compatibleConditionMatches(target: ConditionBucket, comp: EbaySoldComp) {
  const actual = compConditionBucket(comp);

  if (actual === "unknown" || target === "unknown") {
    return true;
  }

  if (target === actual) return true;
  if (target === "like_new") return actual === "new";
  if (target === "fair") return actual === "pre_owned" || actual === "poor";
  if (target === "poor") return actual === "fair" || actual === "pre_owned";

  return false;
}

function identityMatches(
  comp: EbaySoldComp,
  profile: StrictMarketValueProfile,
  model: string | null,
  requireDistinctiveToken: boolean,
  plan: SearchPlan
) {
  const title = strictText(comp.title);
  const compact = compactText(comp.title);
  const brand = strictText(profile.brand);
  const modelVariants = uniqueValues([
    compactText(model),
    compactText(model?.split("/")[0]),
  ]).filter((value) => value.length >= 5);
  const excludedMatches = (profile.valuationSignals?.negativeKeywords || [])
    .map(strictText)
    .filter((keyword) => keyword.length >= 3)
    .some((keyword) => title.includes(keyword));

  if (excludedMatches) {
    return false;
  }

  if (brand && !title.includes(brand)) {
    return false;
  }

  if (modelVariants.length) {
    if (!modelVariants.some((variant) => compact.includes(variant))) return false;
  } else if (plan.route === "identifier") {
    const titleTokens = uniqueWords(profile.title);
    const overlap = titleTokens.filter((token) => title.includes(token));
    if (overlap.length < 2) return false;
  } else {
    const coreTokens = uniqueWords(
      [
        profile.valuationSignals?.objectType,
        profile.valuationSignals?.subcategory,
        profile.title,
      ]
        .filter(Boolean)
        .join(" ")
    );
    const descriptorTokens = uniqueWords(plan.descriptorText);
    const coreOverlap = coreTokens.filter((token) => title.includes(token));
    const descriptorOverlap = descriptorTokens.filter((token) =>
      title.includes(token)
    );

    if (!coreOverlap.length) {
      return false;
    }

    if (
      requireDistinctiveToken &&
      descriptorTokens.length > 0 &&
      !descriptorOverlap.length
    ) {
      return false;
    }

    if (
      !requireDistinctiveToken &&
      descriptorTokens.length > 0 &&
      descriptorOverlap.length < 1 &&
      coreOverlap.length < 2
    ) {
      return false;
    }
  }

  if (!requireDistinctiveToken) return true;

  const distinctive = uniqueWords(`${profile.title} ${profile.brand || ""}`)
    .filter((token) => !strictText(model).includes(token) && token !== brand)
    .find((token) => token.length >= 4);

  return !distinctive || title.includes(distinctive);
}

function isUsableIndividualSale(comp: EbaySoldComp, target: ConditionBucket) {
  if (comp.evidenceClass !== "confirmed_transaction") return false;
  if (!comp.totalPrice || comp.totalPrice <= 0) return false;
  if (BULK_OR_MULTI_ITEM_PATTERN.test(comp.title)) return false;

  if (target !== "parts" && DAMAGE_TERMS_PATTERN.test(`${comp.title} ${comp.condition || ""}`)) {
    return false;
  }

  return true;
}

function dedupeComps(comps: EbaySoldComp[]) {
  const seen = new Set<string>();

  return comps.filter((comp) => {
    const key = [
      comp.listingUrl || "",
      strictText(comp.title),
      comp.totalPrice.toFixed(2),
      comp.soldDate || "",
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function buildQuality(
  profile: StrictMarketValueProfile,
  model: string | null,
  plan: SearchPlan,
  exactCount: number,
  comparableCount: number
): MarketValueQuality {
  const warnings: string[] = [];
  const targetCondition = normalizeCondition(profile.condition, profile.conditionNotes);
  const route = plan.route;

  if (profile.photoCount < 2) {
    addWarning(
      warnings,
      route === "descriptor"
        ? "Add an overview photo plus close-ups of marks, materials, hardware, or decorative details to improve confidence."
        : "Add an overview photo and a close-up of the model/serial label to improve confidence."
    );
  }

  if (!profile.brand?.trim() && route === "identifier") {
    addWarning(warnings, "Adding the brand will reduce the chance of matching a similar item from another maker.");
  }

  if (!model && route === "identifier") {
    addWarning(warnings, "Adding the exact model, MPN, or part number will make the estimate substantially tighter.");
  } else if (route === "hybrid") {
    addWarning(warnings, "KeepFlip kept the brand in the sold-comps search, then used visual descriptors because no exact model was available.");
  } else if (route === "descriptor") {
    addWarning(warnings, "No reliable brand or model was available, so KeepFlip used a descriptor-based sold-comps search. Treat this as directional until a maker mark, hallmark, label, or signature is added.");
  }

  if (targetCondition === "unknown") {
    addWarning(warnings, "Choose a clearer condition so KeepFlip can narrow the comp set.");
  }

  if (profile.conditionNotes.trim().length < 12) {
    addWarning(warnings, "Add condition notes for working status, flaws, included accessories, and missing parts.");
  }

  if (exactCount < 3) {
    addWarning(
      warnings,
      route === "identifier"
        ? "Fewer than three exact same-condition sales were available, so compatible same-model sales were used where necessary."
        : "Fewer than three same-condition visual matches were available, so KeepFlip used the closest compatible sales it could verify."
    );
  }

  const baseConfidence: MarketValueConfidence =
    exactCount >= 4 && warnings.length === 0
      ? "high"
      : exactCount >= 2 || comparableCount >= 5
        ? "medium"
        : "low";

  const confidence: MarketValueConfidence =
    route === "identifier"
      ? baseConfidence
      : baseConfidence === "high"
        ? "medium"
        : baseConfidence;

  return {
    confidence,
    exactComparableCount: exactCount,
    comparableCount,
    warnings,
    searchRoute: route,
    searchIntent: plan.searchIntent,
  };
}

export function selectStrictEbaySoldComps(
  profile: StrictMarketValueProfile,
  comps: EbaySoldComp[]
) {
  const model = getPreferredModel(profile);
  const targetCondition = normalizeCondition(
    profile.condition,
    profile.conditionNotes
  );
  const plan = buildSearchPlan(profile, model, targetCondition);
  const individualSales = comps.filter((comp) =>
    isUsableIndividualSale(comp, targetCondition)
  );
  const exact = individualSales.filter(
    (comp) =>
      identityMatches(comp, profile, model, true, plan) &&
      exactConditionMatches(targetCondition, comp)
  );
  const compatible = individualSales.filter(
    (comp) =>
      identityMatches(comp, profile, model, false, plan) &&
      compatibleConditionMatches(targetCondition, comp)
  );
  const selected = selectValuationComps(
    dedupeComps(exact.length >= 3 ? exact : [...exact, ...compatible])
  );

  return {
    comps: selected,
    query: plan.query,
    quality: buildQuality(
      profile,
      model,
      plan,
      exact.length,
      selected.length
    ),
  };
}

export async function runStrictEbaySoldComps(
  profile: StrictMarketValueProfile,
  limit = 100
): Promise<EbaySoldCompsResult> {
  const title = profile.title.trim();
  const query = buildStrictEbaySearchQuery(profile);

  if (query.length < 3 || !title) {
    throw new Error("Add at least an item title before researching its market value.");
  }

  const raw = await runEbaySoldComps(
    query,
    Math.max(100, Math.min(limit, 250))
  );

  const selected = selectStrictEbaySoldComps(profile, raw.comps);

  if (!selected.comps.length) {
    throw new Error(
      "KeepFlip could not find usable individual sold listings for this item. Try a more specific model number or title."
    );
  }

  return {
    ...raw,
    query,
    comps: selected.comps,
    summary: makeSummary(selected.comps),
    valuation: selected.quality,
  };
}
