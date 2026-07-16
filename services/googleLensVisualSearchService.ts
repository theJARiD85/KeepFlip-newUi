import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from "../lib/appwrite";
import type {
  ItemValuationSignals,
  KeepFlipIdentification,
} from "./itemAiService";

type JsonRecord = Record<string, unknown>;

export type GoogleLensVisualMatch = {
  title: string;
  url: string | null;
  source: string | null;
  imageUrl: string | null;
  priceText: string | null;
  snippet: string | null;
};

export type GoogleLensVisualSearchResult = {
  ok: true;
  status: "completed";
  provider: "google_cloud_vision";
  searchQueries: string[];
  summary: string;
  matches: GoogleLensVisualMatch[];
  valuationSignals: Partial<ItemValuationSignals>;
  searchedAt: string;
};

export function formatGoogleVisionEvidence(
  result: GoogleLensVisualSearchResult
) {
  const marks = result.valuationSignals.visibleMarks || [];
  const matchTitles = result.matches
    .map((match) => match.title)
    .filter(Boolean)
    .slice(0, 8);

  return [
    "External evidence from Google Cloud Vision (candidate evidence; verify against the photos):",
    result.summary ? `Summary: ${result.summary}` : "",
    marks.length ? `OCR, logos, and visible marks: ${marks.slice(0, 15).join(" | ")}` : "",
    matchTitles.length ? `Visual-match page titles: ${matchTitles.join(" | ")}` : "",
    result.searchQueries.length
      ? `Candidate identity queries: ${result.searchQueries.slice(0, 5).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type RunGoogleLensVisualSearchArgs = {
  itemId: string;
  ownerId: string;
  fileIds: string[];
  title: string;
  brand: string | null;
  model: string | null;
  condition: string;
  notes: string;
  identification: KeepFlipIdentification | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized || null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const record = asRecord(item);
        return asString(
          record?.query ??
            record?.value ??
            record?.title ??
            record?.text ??
            record?.name
        );
      })
      .filter(Boolean);
  }

  const normalized = asString(value);

  return normalized
    ? normalized
        .split(/[,;\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeMatch(value: unknown): GoogleLensVisualMatch | null {
  const source = asRecord(value);

  if (!source) {
    return null;
  }

  const title =
    asString(source.title ?? source.name ?? source.productTitle) ||
    asString(source.snippet ?? source.description);

  if (!title) {
    return null;
  }

  return {
    title,
    url: asNullableString(
      source.url ?? source.link ?? source.productUrl ?? source.sourceUrl
    ),
    source: asNullableString(
      source.source ?? source.siteName ?? source.domain ?? source.seller
    ),
    imageUrl: asNullableString(
      source.imageUrl ?? source.thumbnail ?? source.thumbnailUrl
    ),
    priceText: asNullableString(
      source.price ?? source.priceText ?? source.extractedPrice
    ),
    snippet: asNullableString(
      source.snippet ?? source.description ?? source.subtitle
    ),
  };
}

function readMatches(payload: JsonRecord): GoogleLensVisualMatch[] {
  const candidates =
    (Array.isArray(payload.matches) && payload.matches) ||
    (Array.isArray(payload.visualMatches) && payload.visualMatches) ||
    (Array.isArray(payload.productMatches) && payload.productMatches) ||
    (Array.isArray(payload.results) && payload.results) ||
    (Array.isArray(payload.items) && payload.items) ||
    [];

  return candidates
    .map(normalizeMatch)
    .filter((match): match is GoogleLensVisualMatch => Boolean(match));
}

function readValuationSignals(payload: JsonRecord) {
  const source =
    asRecord(payload.valuationSignals) ||
    asRecord(payload.visualValuationProfile) ||
    asRecord(payload.appraisalProfile) ||
    {};

  return {
    objectType: asNullableString(source.objectType ?? source.itemType),
    subcategory: asNullableString(source.subcategory ?? source.subCategory),
    style: asStringArray(source.style ?? source.styles),
    materials: asStringArray(source.materials),
    colors: asStringArray(source.colors ?? source.color),
    era: asStringArray(source.era ?? source.period),
    motifs: asStringArray(source.motifs ?? source.patterns),
    shape: asNullableString(source.shape),
    construction: asStringArray(source.construction),
    conditionSignals: asStringArray(source.conditionSignals),
    visibleMarks: asStringArray(source.visibleMarks ?? source.markings),
    descriptorSummary: asString(
      source.descriptorSummary ?? source.summary ?? payload.summary
    ),
    searchQueries: uniqueStrings([
      ...asStringArray(source.searchQueries),
      ...asStringArray(payload.searchQueries),
      ...asStringArray(payload.queries),
    ]),
    negativeKeywords: asStringArray(source.negativeKeywords),
    uncertainty: asStringArray(source.uncertainty ?? source.uncertainties),
    suggestedPhotoAngles: asStringArray(
      source.suggestedPhotoAngles ?? source.neededPhotos
    ),
    confidence: Math.max(
      0,
      Math.min(100, Number(source.confidence) || 0)
    ),
  } satisfies Partial<ItemValuationSignals>;
}

function normalizePayload(payload: JsonRecord): GoogleLensVisualSearchResult {
  const visualSearch = asRecord(payload.visualSearch) || payload;
  const valuationSignals = readValuationSignals(visualSearch);
  const matches = readMatches(visualSearch);

  return {
    ok: true,
    status: "completed",
    provider: "google_cloud_vision",
    searchQueries: uniqueStrings([
      ...valuationSignals.searchQueries,
    ]),
    summary:
      asString(visualSearch.summary ?? visualSearch.aiSummary) ||
      valuationSignals.descriptorSummary ||
      "",
    matches,
    valuationSignals,
    searchedAt:
      asString(visualSearch.searchedAt ?? payload.searchedAt) ||
      new Date().toISOString(),
  };
}

export async function runGoogleLensVisualSearch({
  itemId,
  ownerId,
  fileIds,
  title,
  brand,
  model,
  condition,
  notes,
  identification,
}: RunGoogleLensVisualSearchArgs): Promise<GoogleLensVisualSearchResult> {
  if (!fileIds.length) {
    throw new Error("Add at least one photo before running visual search.");
  }

  // The selected primary photo receives web matching. Every remaining photo
  // contributes OCR/logo evidence so labels in photos 3 and 4 are not ignored.
  const searchQuery = [
    model,
    brand,
    title,
    condition,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  const execution = await functions.createExecution({
    functionId: APPWRITE.googleLensVisualSearchFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      itemId,
      ownerId,
      fileIds: fileIds.slice(0, 4),
      context: {
        title,
        brand,
        model,
        condition,
        notes,
        identification,
        searchQuery,
      },
    }),
  });

  let payload: JsonRecord | { ok?: false; error?: string };

  try {
    payload = JSON.parse(execution.responseBody || "{}");
  } catch {
    throw new Error(
      "KeepFlip received an unreadable response from visual search."
    );
  }

  const payloadRecord = asRecord(payload);

  if (!payloadRecord) {
    throw new Error(
      "KeepFlip received an unexpected visual search response."
    );
  }

  if (
    execution.responseStatusCode >= 400 ||
    payloadRecord.ok === false
  ) {
    throw new Error(
      asString(payloadRecord.error) ||
        "KeepFlip could not complete Google Cloud Vision research."
    );
  }

  return normalizePayload(payloadRecord);
}
