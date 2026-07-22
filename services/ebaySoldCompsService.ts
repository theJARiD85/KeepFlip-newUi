import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from "../lib/appwrite";
import type { ItemValuationSignals } from "./itemAiService";

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

type JsonRecord = Record<string, unknown>;

type StartedSearch = {
  runId: string;
  query: string;
  barcode?: string;
};

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

async function callEbayFunction(
  body: JsonRecord
): Promise<JsonRecord> {
  // Each Appwrite invocation only starts or checks the long-running Apify job.
  // Wait for this short wrapper response directly; the job itself remains
  // asynchronous and is polled below with its signed jobToken.
  const execution = await functions.createExecution({
    functionId: APPWRITE.ebaySoldCompsFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawBody = execution.responseBody?.trim() || "";

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

    const progress = await callEbayFunction({
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

  return `${trimmed} recently sold`;
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

function removePriceOutliers(comps: EbaySoldComp[]) {
  if (comps.length < 5) return comps;

  const values = comps
    .map((comp) => comp.totalPrice)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  const middle = median(values);
  if (!middle) return comps;

  return comps.filter(
    (comp) => comp.totalPrice >= middle * 0.45 && comp.totalPrice <= middle * 2.2
  );
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
