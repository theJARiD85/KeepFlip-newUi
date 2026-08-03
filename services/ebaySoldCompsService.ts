import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from "../lib/appwrite";
import type { ItemValuationSignals } from "./itemAiService";

export const SERPAPI_IMAGE_VALUATION_BASE_QUERY =
  "Give distinct information answers along with corresponding confidence values: exact item title, brand (if available), model (if available), observed condition, current resale market value, and any fixes or alters to enhance profitability.";
const MAX_REFINEMENT_CONTEXT_LENGTH = 600;

export type EbaySoldComp = {
  title: string;
  soldPrice: number;
  shipping: number;
  totalPrice: number;
  currency: string;
  condition: string | null;
  soldDate: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
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

export type SerpApiValuationEstimate = {
  type:
  | "private_sale"
  | "quick_sale"
  | "online_curated"
  | "trade_in"
  | "retail_refurbished"
  | "other";
  label: string;
  low: number;
  median: number;
  high: number;
  currency: string;
  note: string;
  confidence: MarketValueConfidence;
  confidencePercent: number | null;
};

export type SerpApiValuationReference = {
  title: string;
  link: string;
  snippet: string | null;
  source: string | null;
};

export type SerpApiConditionAssessment = {
  grade: "new" | "like_new" | "good" | "fair" | "poor" | "parts" | "unknown";
  summary: string | null;
  confidence: MarketValueConfidence;
  confidencePercent: number | null;
};

export type SerpApiIdentityAssessment = {
  itemName: string | null;
  summary: string | null;
  brand: string | null;
  model: string | null;
  variant: string | null;
  category: string | null;
  candidateModels: string[];
  confidence: MarketValueConfidence;
  confidencePercent: number | null;
  itemNameConfidencePercent?: number | null;
  brandConfidencePercent?: number | null;
  modelConfidencePercent?: number | null;
};

export type SerpApiProfitabilityAction = {
  title: string;
  detail: string;
  confidencePercent: number | null;
};

export type SerpApiRefinementQuestion = {
  prompt: string;
  reason: string | null;
};

export type SerpApiDisplayReadyResult = {
  title: string;
  summary: string;
  identity: SerpApiIdentityAssessment;
  condition: (SerpApiConditionAssessment & { label: string }) | null;
  valuation: {
    label: string;
    rangeLabel: string | null;
    low: number;
    lowLabel: string | null;
    median: number;
    medianLabel: string | null;
    high: number;
    highLabel: string | null;
    currency: string;
    confidence: MarketValueConfidence;
    confidencePercent: number | null;
    basis: string;
    disclaimer: string;
  };
  factors: string[];
  suggestedDetails: string[];
  profitabilityActions: SerpApiProfitabilityAction[];
  refinementQuestions: SerpApiRefinementQuestion[];
};

export type SerpApiNormalization = {
  method: "openai_structured_outputs" | "deterministic_fallback";
  model: string | null;
};

export type SerpApiImageReference = {
  bucketId: string;
  fileId: string;
  imageUrl: string | null;
};

export type SerpApiImageValuationResult = {
  ok: true;
  phase: "completed";
  purpose: "image_valuation";
  provider: "keepflip_ai";
  runId: string;
  query: string;
  imageUrl: string | null;
  image: SerpApiImageReference | null;
  sourceImage: SerpApiImageReference | null;
  valuation: {
    status: "ready";
    currency: string;
    suppliedCount: number;
    usedCount: number;
    rejectedCount: number;
    median: number;
    p20: number;
    p80: number;
    methodology: "keepflip_ai_private_sale_range_v2";
    source: "keepflip_ai";
  };
  estimates: SerpApiValuationEstimate[];
  references: SerpApiValuationReference[];
  identification: string | null;
  identificationSummary: string | null;
  identity: SerpApiIdentityAssessment | null;
  display: SerpApiDisplayReadyResult;
  condition: SerpApiConditionAssessment | null;
  factors: string[];
  suggestedDetails: string[];
  profitabilityActions: SerpApiProfitabilityAction[];
  refinementQuestions: SerpApiRefinementQuestion[];
  reconstructedMarkdown: string | null;
  normalization: SerpApiNormalization | null;
  quality: {
    confidence: MarketValueConfidence;
    confidencePercent: number | null;
    exactComparableCount: 0;
    comparableCount: 0;
    warnings: string[];
    searchRoute: "visual";
    searchIntent: "ai_mode_image_valuation";
  };
  searchedAt: string;
};

export type SerpApiImageValuationInput = {
  bucketId: string;
  fileId: string;
  refinementContext?: string | null;
};

type JsonRecord = Record<string, unknown>;

const POLL_INTERVAL_MS = 2500;

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

function redactSensitiveResponseText(value: string): string {
  return value
    .replace(
      /([?&](?:token|jwt|secret|api[_-]?key)=)[^&\\s"']+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /("(?:token|jwt|secret|apiKey|api_key)"\\s*:\\s*")[^"]+/gi,
      '$1[REDACTED]'
    );
}

function debugResponseJson(value: unknown): string {
  try {
    return redactSensitiveResponseText(JSON.stringify(value, null, 2));
  } catch {
    return redactSensitiveResponseText(String(value));
  }
}

export function buildSerpApiImageValuationQuery(
  refinementContext?: string | null
) {
  const boundedContext = asString(refinementContext)
    .replace(/\s+/g, " ")
    .slice(0, MAX_REFINEMENT_CONTEXT_LENGTH)
    .trim();

  return boundedContext
    ? `${SERPAPI_IMAGE_VALUATION_BASE_QUERY} Owner-provided details (unverified): ${boundedContext}`
    : SERPAPI_IMAGE_VALUATION_BASE_QUERY;
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

function isSynchronousExecutionTimeout(error: unknown) {
  const details = asRecord(error);
  const code = asNumber(details?.code ?? details?.status);
  const message = asString(details?.message);

  return (
    code === 408 ||
    /synchronous function execution timed out/i.test(message)
  );
}

function statusStillRunningPayload(body: JsonRecord): JsonRecord {
  return {
    ok: true,
    phase: "running",
    status: "RUNNING",
    runId: asString(body.runId),
    jobToken: asString(body.jobToken),
    query: asString(body.query),
  };
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized || null;
}

function normalizeImageReference(
  value: unknown,
  fallbackBucketId?: string,
  fallbackFileId?: string
): SerpApiImageReference | null {
  const source = asRecord(value);
  const bucketId =
    asString(source?.bucketId) || asString(fallbackBucketId);
  const fileId =
    asString(source?.fileId) || asString(fallbackFileId);

  if (!bucketId || !fileId) {
    return null;
  }

  return {
    bucketId,
    fileId,
    imageUrl: toNullableString(
      source?.imageUrl ??
      source?.url ??
      source?.photoUrl
    ),
  };
}

function normalizeComp(value: unknown): EbaySoldComp {
  const source = asRecord(value) || {};

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

  return {
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
  };
}

function readComps(payload: JsonRecord): EbaySoldComp[] {
  const rawComps =
    (Array.isArray(payload.comps) && payload.comps) ||
    (Array.isArray(payload.matches) && payload.matches) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload.results) && payload.results) ||
    [];

  return rawComps
    .map(normalizeComp)
    .filter((comp) => comp.title !== "Untitled eBay item");
}

function makeSummary(comps: EbaySoldComp[]) {
  const values = comps
    .map((comp) => comp.totalPrice)
    .filter((value) => Number.isFinite(value) && value > 0);

  const currency =
    comps.find((comp) => comp.currency)?.currency || "USD";

  return {
    count: comps.length,
    low: values.length ? Math.min(...values) : 0,
    median: median(values),
    average: average(values),
    high: values.length ? Math.max(...values) : 0,
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
    phase === "started" ||
    phase === "running" ||
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

async function callMarketCompsFunction(
  body: JsonRecord
): Promise<JsonRecord> {
  // SerpApi completes in the start invocation. The status compatibility path
  // remains for older asynchronous Function deployments during rollout.
  const action = asString(body.action).toLowerCase();
  const functionId =
    APPWRITE.marketResearchFunctionId ||
    APPWRITE.ebaySoldCompsFunctionId;

  if (!functionId) {
    throw new Error(
      "Add EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID before researching sold comps."
    );
  }

  let execution;

  try {
    execution = await functions.createExecution({
      functionId,
      async: false,
      method: ExecutionMethod.POST,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    /*
      Appwrite stops a synchronous caller after 30 seconds even when the
      Function keeps running and completes normally. A legacy status request
      is idempotent, so preserve its job state and let waitForResult() check
      again. Never retry "start" automatically because it can duplicate paid
      provider searches.
    */
    if (
      action === "status" &&
      isSynchronousExecutionTimeout(error)
    ) {
      console.warn(
        "KeepFlip market status check exceeded Appwrite's response window; continuing to wait.",
        {
          runId: asString(body.runId),
        },
      );
      return statusStillRunningPayload(body);
    }

    throw error;
  }

  if (
    action === "status" &&
    execution.responseStatusCode === 408
  ) {
    return statusStillRunningPayload(body);
  }

  const rawBody = execution.responseBody?.trim() || "";

  if (__DEV__) {
    console.log("[KeepFlip Appwrite Function] execution metadata", {
      executionId: execution.$id,
      status: execution.status,
      responseStatusCode: execution.responseStatusCode,
      duration: execution.duration,
      functionId,
      action,
      purpose: asString(body.purpose),
    });

    console.log(
      "[KeepFlip Appwrite Function] raw response body",
      redactSensitiveResponseText(rawBody)
    );
  }

  if (!rawBody) {
    const executionError =
      typeof execution.errors === "string" ? execution.errors.trim() : "";
    throw new Error(
      executionError ||
      "eBay research completed without a response. Check the Appwrite Function execution log."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `eBay research returned invalid JSON: ${rawBody.slice(0, 250)}`
    );
  }

  const payload = asRecord(parsed);

  if (__DEV__) {
    console.log(
      "[KeepFlip Appwrite Function] parsed response",
      debugResponseJson(payload)
    );

    const image = asRecord(payload?.image);
    const sourceImage = asRecord(payload?.sourceImage);
    const display = asRecord(payload?.display);
    const displayImage = asRecord(display?.image);

    console.log("[KeepFlip Appwrite Function] returned image references", {
      imageUrl: toNullableString(payload?.imageUrl),
      imageBucketId: asString(image?.bucketId),
      imageFileId: asString(image?.fileId),
      imageReferenceUrl: toNullableString(image?.imageUrl),
      sourceImageBucketId: asString(sourceImage?.bucketId),
      sourceImageFileId: asString(sourceImage?.fileId),
      sourceImageReferenceUrl: toNullableString(sourceImage?.imageUrl),
      displayImageUrl: toNullableString(display?.imageUrl),
      displayImageBucketId: asString(displayImage?.bucketId),
      displayImageFileId: asString(displayImage?.fileId),
    });
  }

  if (!payload) {
    throw new Error(
      "eBay research returned an unexpected response format."
    );
  }

  const errorMessage = getPayloadError(payload);

  if (
    execution.responseStatusCode >= 400 ||
    payload.ok === false
  ) {
    throw new Error(
      errorMessage ||
      "KeepFlip could not complete the eBay search."
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
  return callMarketCompsFunction({
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

  const runId = asString(
    startedPayload.runId ?? startedPayload.id
  );

  if (!runId) {
    throw new Error(
      "eBay research started but did not return a run ID."
    );
  }

  let jobToken = asString(startedPayload.jobToken);

  while (true) {
    await sleep(POLL_INTERVAL_MS);

    const progress = await callMarketCompsFunction({
      action: "status",
      purpose,
      runId,
      jobToken,
      query,
      barcode,
    });

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

}

function toSoldCompsResult(
  payload: JsonRecord,
  query: string
): EbaySoldCompsResult {
  const comps = readComps(payload);

  if (!comps.length) {
    throw new Error(
      "eBay completed the search but returned no usable sold listings."
    );
  }

  const rawSummary = asRecord(payload.summary);
  const fallbackSummary = makeSummary(comps);

  return {
    ok: true,
    phase: "completed",
    purpose: "sold_comps",
    runId: asString(payload.runId ?? payload.id) || "completed",
    query: asString(payload.query) || query,
    comps,
    summary: {
      count: asNumber(rawSummary?.count) || fallbackSummary.count,
      low:
        asNumber(rawSummary?.low) || fallbackSummary.low,
      median:
        asNumber(rawSummary?.median) || fallbackSummary.median,
      average:
        asNumber(rawSummary?.average) ||
        fallbackSummary.average,
      high:
        asNumber(rawSummary?.high) || fallbackSummary.high,
      currency:
        asString(rawSummary?.currency) ||
        fallbackSummary.currency,
    },
    searchedAt:
      asString(payload.searchedAt) ||
      new Date().toISOString(),
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function cleanSerpApiIdentityText(value: unknown): string | null {
  const cleaned = toNullableString(value)
    ?.slice(0, 10_000)
    .replace(
      /!?\[([^\]\r\n]+)\]\(\s*(?:https?:\/\/|www\.)[^)\s]+(?:\s+["'][^"']*["'])?\s*\)/gi,
      "$1"
    )
    .replace(/<\s*(?:https?:\/\/|www\.)[^>]+>/gi, "")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*|__|`|~~/g, "")
    .replace(/Go to product viewer dialog(?:ue)? for this item\.?/gi, "")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || null;
}

function cleanSerpApiItemTitle(value: unknown): string | null {
  const source = toNullableString(value)?.slice(0, 10_000);
  if (!source) return null;

  const linkedTitle = source.match(
    /!?\[([^\]\r\n]+)\]\(\s*(?:https?:\/\/|www\.)[^)\s]+(?:\s+["'][^"']*["'])?\s*\)/i
  )?.[1];
  const cleaned = cleanSerpApiIdentityText(linkedTitle ?? source)
    ?.replace(
      /^(?:(?:exact item title|item identification|item name|item)\s*:\s*)+/i,
      ""
    )
    .replace(
      /^(?:the\s+)?(?:device|item|product|object)\s+(?:(?:shown|pictured|visible)(?:\s+in\s+(?:the\s+)?(?:image|photo|hand))?|in\s+(?:the\s+)?(?:image|photo|hand))\s+(?:is\s+identified\s+as|appears\s+to\s+be|looks\s+like|is)\s+(?:(?:the|an?)\s+)?/i,
      ""
    )
    .replace(
      /^(?:this\s+)?(?:device|item|product|object)\s+(?:appears\s+to\s+be|looks\s+like|is)\s+(?:(?:the|an?)\s+)?/i,
      ""
    )
    .replace(/^["']+|["']+$/g, "")
    .replace(/[.]+$/g, "")
    .trim();

  return cleaned?.slice(0, 140) || null;
}

function normalizeConfidencePercent(value: unknown): number | null {
  const percent =
    typeof value === "number" ? value : Number.parseFloat(asString(value));

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round(percent * 10) / 10;
}

function normalizeValuationEstimate(
  value: unknown
): SerpApiValuationEstimate | null {
  const source = asRecord(value);
  const low = asNumber(source?.low);
  const medianValue = asNumber(source?.median);
  const high = asNumber(source?.high);
  const rawType = asString(source?.type);
  const type: SerpApiValuationEstimate["type"] =
    rawType === "private_sale" ||
      rawType === "quick_sale" ||
      rawType === "online_curated" ||
      rawType === "trade_in" ||
      rawType === "retail_refurbished"
      ? rawType
      : "other";

  if (low <= 0 || medianValue <= 0 || high <= 0) {
    return null;
  }

  return {
    type,
    label: asString(source?.label) || "Market estimate",
    low: roundMoney(low),
    median: roundMoney(medianValue),
    high: roundMoney(high),
    currency: asString(source?.currency) || "USD",
    note: asString(source?.note),
    confidence:
      asString(source?.confidence) === "high" ||
        asString(source?.confidence) === "medium"
        ? (asString(source?.confidence) as "high" | "medium")
        : "low",
    confidencePercent: normalizeConfidencePercent(source?.confidencePercent),
  };
}

function normalizeValuationReference(
  value: unknown
): SerpApiValuationReference | null {
  const source = asRecord(value);
  const title = asString(source?.title);
  const link = asString(source?.link);

  if (!title || !/^https?:\/\//i.test(link)) {
    return null;
  }

  return {
    title,
    link,
    snippet: toNullableString(source?.snippet),
    source: toNullableString(source?.source),
  };
}

function normalizeConditionAssessment(
  value: unknown
): SerpApiConditionAssessment | null {
  const source = asRecord(value);
  if (!source) return null;

  const rawGrade = asString(source.grade);
  const grade: SerpApiConditionAssessment["grade"] =
    rawGrade === "new" ||
      rawGrade === "like_new" ||
      rawGrade === "good" ||
      rawGrade === "fair" ||
      rawGrade === "poor" ||
      rawGrade === "parts"
      ? rawGrade
      : "unknown";
  const rawConfidence = asString(source.confidence);
  const confidence: MarketValueConfidence =
    rawConfidence === "high" || rawConfidence === "medium"
      ? rawConfidence
      : "low";

  return {
    grade,
    summary: toNullableString(source.summary),
    confidence,
    confidencePercent: normalizeConfidencePercent(source.confidencePercent),
  };
}

function normalizeIdentityAssessment(
  value: unknown,
  fallbackName: string | null,
  fallbackSummary: string | null
): SerpApiIdentityAssessment | null {
  const source = asRecord(value);
  if (!source && !fallbackName && !fallbackSummary) return null;

  const rawConfidence = asString(source?.confidence);
  const confidence: MarketValueConfidence =
    rawConfidence === "high" || rawConfidence === "medium"
      ? rawConfidence
      : "low";
  const itemName = cleanSerpApiItemTitle(source?.itemName) ?? fallbackName;
  const brand = cleanSerpApiIdentityText(source?.brand);
  const model = cleanSerpApiIdentityText(source?.model);
  const confidencePercent = normalizeConfidencePercent(source?.confidencePercent);

  return {
    itemName,
    summary: cleanSerpApiIdentityText(source?.summary) ?? fallbackSummary,
    brand,
    model,
    variant: cleanSerpApiIdentityText(source?.variant),
    category: cleanSerpApiIdentityText(source?.category),
    candidateModels: asStringArray(source?.candidateModels)
      .map(cleanSerpApiIdentityText)
      .filter((candidate): candidate is string => Boolean(candidate)),
    confidence,
    confidencePercent,
    itemNameConfidencePercent:
      normalizeConfidencePercent(source?.itemNameConfidencePercent) ??
      confidencePercent,
    brandConfidencePercent: brand
      ? normalizeConfidencePercent(source?.brandConfidencePercent)
      : null,
    modelConfidencePercent: model
      ? normalizeConfidencePercent(source?.modelConfidencePercent)
      : null,
  };
}

function normalizeProfitabilityActions(
  value: unknown
): SerpApiProfitabilityAction[] {
  const seen = new Set<string>();

  return (Array.isArray(value) ? value : [])
    .map((entry): SerpApiProfitabilityAction | null => {
      const source = asRecord(entry);
      const title = cleanSerpApiIdentityText(source?.title)?.slice(0, 120);
      const detail = cleanSerpApiIdentityText(source?.detail)?.slice(0, 700);
      if (!title || !detail) return null;

      const key = `${title}\n${detail}`.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        title,
        detail,
        confidencePercent: normalizeConfidencePercent(
          source?.confidencePercent
        ),
      };
    })
    .filter((entry): entry is SerpApiProfitabilityAction => Boolean(entry))
    .slice(0, 8);
}

function normalizeRefinementQuestions(
  value: unknown
): SerpApiRefinementQuestion[] {
  const seen = new Set<string>();

  return (Array.isArray(value) ? value : [])
    .map((entry): SerpApiRefinementQuestion | null => {
      const source = asRecord(entry);
      const prompt = cleanSerpApiIdentityText(source?.prompt)?.slice(0, 300);
      if (!prompt) return null;

      const key = prompt.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        prompt,
        reason: cleanSerpApiIdentityText(source?.reason)?.slice(0, 400) ?? null,
      };
    })
    .filter((entry): entry is SerpApiRefinementQuestion => Boolean(entry))
    .slice(0, 8);
}

function displayConditionLabel(grade: SerpApiConditionAssessment["grade"]) {
  switch (grade) {
    case "new":
      return "New";
    case "like_new":
      return "Like New";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    case "parts":
      return "For Parts";
    default:
      return "Condition Unknown";
  }
}

function fallbackUsdLabel(value: number) {
  return `$${roundMoney(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;
}

function normalizeDisplayReadyResult(
  value: unknown,
  fallback: {
    identification: string | null;
    identificationSummary: string | null;
    identity: SerpApiIdentityAssessment | null;
    condition: SerpApiConditionAssessment | null;
    low: number;
    median: number;
    high: number;
    currency: string;
    valuationConfidence: MarketValueConfidence;
    valuationConfidencePercent: number | null;
    factors: string[];
    suggestedDetails: string[];
    profitabilityActions: SerpApiProfitabilityAction[];
    refinementQuestions: SerpApiRefinementQuestion[];
  }
): SerpApiDisplayReadyResult {
  const source = asRecord(value);
  const sourceValuation = asRecord(source?.valuation);
  const sourceCondition = asRecord(source?.condition);
  const profitabilityActions = normalizeProfitabilityActions(
    source?.profitabilityActions
  );
  const refinementQuestions = normalizeRefinementQuestions(
    source?.refinementQuestions
  );
  const identity =
    normalizeIdentityAssessment(
      source?.identity,
      cleanSerpApiItemTitle(source?.title) ??
      fallback.identity?.itemName ??
      fallback.identification,
      cleanSerpApiIdentityText(source?.summary) ??
      fallback.identity?.summary ??
      fallback.identificationSummary
    ) ?? {
      itemName: fallback.identification,
      summary: fallback.identificationSummary,
      brand: null,
      model: null,
      variant: null,
      category: null,
      candidateModels: [],
      confidence: "low",
      confidencePercent: null,
    };
  const condition =
    normalizeConditionAssessment(source?.condition) ?? fallback.condition;
  const title =
    cleanSerpApiItemTitle(source?.title) ??
    identity.itemName ??
    "Unidentified Item";
  const summary =
    cleanSerpApiIdentityText(source?.summary) ?? identity.summary ?? title;
  const valuationConfidenceRaw = asString(sourceValuation?.confidence);
  const valuationConfidence: MarketValueConfidence =
    valuationConfidenceRaw === "high" || valuationConfidenceRaw === "medium"
      ? valuationConfidenceRaw
      : fallback.valuationConfidence;

  return {
    title,
    summary,
    identity,
    condition: condition
      ? {
        ...condition,
        label:
          cleanSerpApiIdentityText(sourceCondition?.label) ??
          displayConditionLabel(condition.grade),
      }
      : null,
    valuation: {
      label:
        asString(sourceValuation?.label) || "Current Resale Market Value",
      rangeLabel:
        toNullableString(sourceValuation?.rangeLabel) ??
        `${fallbackUsdLabel(fallback.low)} - ${fallbackUsdLabel(
          fallback.high
        )} ${fallback.currency}`,
      low: asNumber(sourceValuation?.low) || fallback.low,
      lowLabel:
        toNullableString(sourceValuation?.lowLabel) ??
        fallbackUsdLabel(fallback.low),
      median: asNumber(sourceValuation?.median) || fallback.median,
      medianLabel:
        toNullableString(sourceValuation?.medianLabel) ??
        fallbackUsdLabel(fallback.median),
      high: asNumber(sourceValuation?.high) || fallback.high,
      highLabel:
        toNullableString(sourceValuation?.highLabel) ??
        fallbackUsdLabel(fallback.high),
      currency: asString(sourceValuation?.currency) || fallback.currency,
      confidence: valuationConfidence,
      confidencePercent:
        normalizeConfidencePercent(sourceValuation?.confidencePercent) ??
        fallback.valuationConfidencePercent,
      basis:
        asString(sourceValuation?.basis) ||
        "Current private-sale estimate from the submitted item photo",
      disclaimer:
        asString(sourceValuation?.disclaimer) ||
        "Directional AI market estimate; not a verified completed sale.",
    },
    factors: asStringArray(source?.factors).length
      ? asStringArray(source?.factors)
      : fallback.factors,
    suggestedDetails: asStringArray(source?.suggestedDetails).length
      ? asStringArray(source?.suggestedDetails)
      : fallback.suggestedDetails,
    profitabilityActions: profitabilityActions.length
      ? profitabilityActions
      : fallback.profitabilityActions,
    refinementQuestions: refinementQuestions.length
      ? refinementQuestions
      : fallback.refinementQuestions,
  };
}

function normalizeNormalization(value: unknown): SerpApiNormalization | null {
  const source = asRecord(value);
  const method = asString(source?.method);

  if (
    method !== "openai_structured_outputs" &&
    method !== "deterministic_fallback"
  ) {
    return null;
  }

  return {
    method,
    model: toNullableString(source?.model),
  };
}

export async function runSerpApiImageValuation(
  input: SerpApiImageValuationInput
): Promise<SerpApiImageValuationResult> {
  const refinementContext = asString(input.refinementContext)
    .replace(/\s+/g, " ")
    .slice(0, MAX_REFINEMENT_CONTEXT_LENGTH)
    .trim();
  const requestedQuery = buildSerpApiImageValuationQuery(refinementContext);
  const payload = await callMarketCompsFunction({
    action: "start",
    purpose: "image_valuation",
    query: requestedQuery,
    targetCurrency: "USD",
    bucketId: input.bucketId,
    fileId: input.fileId,
    ...(refinementContext ? { refinementContext } : {}),
  });
  const valuation = asRecord(payload.valuation);
  const low = asNumber(valuation?.p20);
  const medianValue = asNumber(valuation?.median);
  const high = asNumber(valuation?.p80);

  if (low <= 0 || medianValue <= 0 || high <= 0) {
    throw new Error(
      "KeepFlip AI completed without a usable private-sale valuation range."
    );
  }

  const rawQuality = asRecord(payload.quality);
  const rawConfidence = asString(rawQuality?.confidence);
  const confidence: MarketValueConfidence =
    rawConfidence === "high" || rawConfidence === "medium"
      ? rawConfidence
      : "low";
  const identification = cleanSerpApiItemTitle(payload.identification);
  const identificationSummary =
    cleanSerpApiIdentityText(payload.identificationSummary) ?? identification;
  const identity = normalizeIdentityAssessment(
    payload.identity,
    identification,
    identificationSummary
  );
  const condition = normalizeConditionAssessment(payload.condition);
  const factors = asStringArray(payload.factors);
  const suggestedDetails = asStringArray(payload.suggestedDetails);
  const profitabilityActions = normalizeProfitabilityActions(
    payload.profitabilityActions
  );
  const refinementQuestions = normalizeRefinementQuestions(
    payload.refinementQuestions
  );
  const valuationConfidencePercent = normalizeConfidencePercent(
    rawQuality?.confidencePercent
  );
  const payloadDisplay = asRecord(payload.display);
  const payloadDisplayImage = asRecord(payloadDisplay?.image);
  const fallbackImage: SerpApiImageReference = {
    bucketId: input.bucketId.trim(),
    fileId: input.fileId.trim(),
    imageUrl: null,
  };
  const image =
    normalizeImageReference(
      payload.image,
      input.bucketId,
      input.fileId
    ) ??
    normalizeImageReference(
      payloadDisplayImage,
      input.bucketId,
      input.fileId
    ) ??
    fallbackImage;
  const sourceImage =
    normalizeImageReference(
      payload.sourceImage,
      input.bucketId,
      input.fileId
    ) ?? image;
  const imageUrl =
    toNullableString(payload.imageUrl) ??
    toNullableString(payloadDisplay?.imageUrl) ??
    image.imageUrl ??
    sourceImage.imageUrl;

  if (__DEV__) {
    console.log("[KeepFlip AI] normalized image reference", {
      imageUrl,
      image,
      sourceImage,
    });
  }

  const display = normalizeDisplayReadyResult(payload.display, {
    identification,
    identificationSummary,
    identity,
    condition,
    low,
    median: medianValue,
    high,
    currency: asString(valuation?.currency) || "USD",
    valuationConfidence: confidence,
    valuationConfidencePercent,
    factors,
    suggestedDetails,
    profitabilityActions,
    refinementQuestions,
  });

  return {
    ok: true,
    phase: "completed",
    purpose: "image_valuation",
    provider: "keepflip_ai",
    runId: asString(payload.runId ?? payload.id) || "completed",
    query: asString(payload.query) || requestedQuery,
    imageUrl,
    image,
    sourceImage,
    valuation: {
      status: "ready",
      currency: asString(valuation?.currency) || "USD",
      suppliedCount: asNumber(valuation?.suppliedCount),
      usedCount: asNumber(valuation?.usedCount) || 1,
      rejectedCount: asNumber(valuation?.rejectedCount),
      median: roundMoney(medianValue),
      p20: roundMoney(low),
      p80: roundMoney(high),
      methodology: "keepflip_ai_private_sale_range_v2",
      source: "keepflip_ai",
    },
    estimates: (Array.isArray(payload.estimates) ? payload.estimates : [])
      .map(normalizeValuationEstimate)
      .filter((value): value is SerpApiValuationEstimate => Boolean(value)),
    references: (Array.isArray(payload.references) ? payload.references : [])
      .map(normalizeValuationReference)
      .filter((value): value is SerpApiValuationReference => Boolean(value)),
    identification: display.title,
    identificationSummary: display.summary,
    identity: display.identity,
    display,
    condition: display.condition,
    factors: display.factors,
    suggestedDetails: display.suggestedDetails,
    profitabilityActions: display.profitabilityActions,
    refinementQuestions: display.refinementQuestions,
    reconstructedMarkdown: toNullableString(
      payload.reconstructedMarkdown
    ),
    normalization: normalizeNormalization(payload.normalization),
    quality: {
      confidence,
      confidencePercent: valuationConfidencePercent,
      exactComparableCount: 0,
      comparableCount: 0,
      warnings: asStringArray(rawQuality?.warnings),
      searchRoute: "visual",
      searchIntent: "ai_mode_image_valuation",
    },
    searchedAt:
      asString(payload.searchedAt) || new Date().toISOString(),
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
  | "damaged"
  | "unknown";

const BULK_OR_MULTI_ITEM_PATTERN =
  /\b(?:lot|bulk|bundle|wholesale|job\s*lot|collection|assorted|mixed)\b|\bset\s+of\s+\d+\b|\b(?:[2-9]|\d{2,})\s*(?:pack|pcs?|pieces?|units?|items?)\b|\bqty\s*\d+\b/i;

const DAMAGE_TERMS_PATTERN =
  /\b(?:for\s+parts|parts\s+only|not\s+working|broken|damaged|repair|as[\s-]?is|untested|salvage|faulty|no\s+power)\b/i;

const RECENTLY_SOLD_PATTERN =
  /\b(?:recently\s+sold|sold\s+prices?|sold\s+comps?|completed\s+(?:sales|listings)|auction\s+results?|hammer\s+price|final\s+price)\b/i;

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

function uniqueValues(values: (string | null | undefined)[]) {
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

  if (/\b(?:for\s+parts|parts\s+only|not\s+working|broken|damaged|repair|as[\s-]?is|untested|faulty|poor|fair)\b/.test(value)) {
    return "damaged";
  }

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
    damaged: "for parts",
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
    damaged: "for parts",
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

function appendRecentlySoldIntent(query: string) {
  const trimmed = query.trim();

  if (!trimmed || RECENTLY_SOLD_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}`;
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

    return appendRecentlySoldIntent(
      appendConditionTerm(prefixedQuery, condition)
    );
  }

  const terms = descriptorTerms(signals);
  const descriptorQuery = uniqueValues([
    route === "hybrid" ? brand : null,
    ...terms.slice(0, 8),
    terms.length < 3 ? profile.title : null,
  ]).join(" ");

  return appendRecentlySoldIntent(
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
  const modelCompact = compactText(model);

  if (brand && !title.includes(brand)) {
    return false;
  }

  if (modelCompact) {
    if (!compact.includes(modelCompact)) return false;
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
  if (!comp.totalPrice || comp.totalPrice <= 0) return false;
  if (BULK_OR_MULTI_ITEM_PATTERN.test(comp.title)) return false;

  if (target !== "damaged" && DAMAGE_TERMS_PATTERN.test(`${comp.title} ${comp.condition || ""}`)) {
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
    addWarning(warnings, 'KeepFlip kept the brand in the search, then used visual descriptors with "recently sold" because no exact model was available.');
  } else if (route === "descriptor") {
    addWarning(warnings, 'No reliable brand or model was available, so KeepFlip used visual descriptors with "recently sold". Treat this as directional until a maker mark, hallmark, label, or signature is added.');
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

export async function runStrictEbaySoldComps(
  profile: StrictMarketValueProfile,
  limit = 100
): Promise<EbaySoldCompsResult> {
  const title = profile.title.trim();
  const model = getPreferredModel(profile);
  const targetCondition = normalizeCondition(profile.condition, profile.conditionNotes);
  const plan = buildSearchPlan(profile, model, targetCondition);
  const query = plan.query;

  if (query.length < 3 || !title) {
    throw new Error("Add at least an item title before researching its market value.");
  }

  const raw = await runEbaySoldComps(
    query,
    Math.max(1, Math.floor(limit) || 100)
  );

  const positiveSales = raw.comps.filter(
    (comp) => Number.isFinite(comp.totalPrice) && comp.totalPrice > 0
  );
  const individualSales = positiveSales.filter((comp) =>
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

  const preferred = exact.length >= 3
    ? exact
    : compatible.length > 0
      ? [...exact, ...compatible]
      : individualSales.length > 0
        ? individualSales
        : positiveSales;
  const selected = dedupeComps(preferred);

  if (!selected.length) {
    return {
      ...raw,
      query,
      comps: raw.comps,
      summary: raw.summary,
      valuation: buildQuality(profile, model, plan, 0, raw.comps.length),
    };
  }

  return {
    ...raw,
    query,
    comps: selected,
    summary: makeSummary(selected),
    valuation: buildQuality(
      profile,
      model,
      plan,
      exact.length,
      selected.length
    ),
  };
}
