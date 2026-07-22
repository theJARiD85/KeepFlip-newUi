import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from "../lib/appwrite";

export type ItemEvidenceField = {
  key: string;
  label: string;
  inputType: "text" | "choice" | "boolean";
  value: string;
  options: string[];
  importance: "critical" | "helpful";
  confidence: number;
  reason: string;
  photoHint: string;
};

export type ItemValuationSignals = {
  objectType: string | null;
  subcategory: string | null;
  style: string[];
  materials: string[];
  colors: string[];
  era: string[];
  motifs: string[];
  shape: string | null;
  construction: string[];
  conditionSignals: string[];
  visibleMarks: string[];
  descriptorSummary: string;
  searchQueries: string[];
  negativeKeywords: string[];
  uncertainty: string[];
  suggestedPhotoAngles: string[];
  confidence: number;
};

export type ItemConfidenceBreakdown = {
  itemType: number;
  brand: number;
  model: number;
  condition: number;
};

export type ItemValuationReadiness =
  | "ready"
  | "directional"
  | "needs_evidence";

export type ItemIdentityEvidence = {
  field: "item_type" | "brand" | "model" | "variant" | "condition";
  value: string;
  source:
    | "photo_text"
    | "visual_design"
    | "user_notes"
    | "external_evidence";
  confidence: number;
  explanation: string;
  imageIndex: number | null;
};

export type ItemCandidateMatch = {
  name: string;
  brand: string | null;
  model: string | null;
  confidence: number;
  reason: string;
};

export type ItemIdentificationGuidance = {
  title: string;
  message: string;
  tips: string[];
};

export type KeepFlipIdentification = {
  title: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  category:
    | "Audio"
    | "Appliances"
    | "Electronics"
    | "Tools"
    | "Furniture"
    | "Home"
    | "Fashion"
    | "Collectible"
    | "Sporting Goods"
    | "Vehicle"
    | "Other";
  condition:
    | "new"
    | "like_new"
    | "good"
    | "fair"
    | "poor"
    | "unknown";
  conditionNotes: string;
  detectedText: string[];
  identificationBasis:
    | "model_number"
    | "brand_and_distinctive_design"
    | "brand_only"
    | "visual_category_only"
    | "insufficient_evidence";
  confidence: number;
  confidenceBreakdown: ItemConfidenceBreakdown;
  valuationReadiness: ItemValuationReadiness;
  ambiguityNotes: string[];
  identityEvidence: ItemIdentityEvidence[];
  productSearchQuery: string;
  needsMorePhotos: boolean;
  suggestedPhotos: string[];
  candidateMatches: ItemCandidateMatch[];
  evidenceFields: ItemEvidenceField[];
  valuationSignals: ItemValuationSignals;
};

type OptimizedIdentityEvidence = {
  aspect: "item_type" | "brand" | "model" | "variant" | "condition";
  source:
    | "photo_text"
    | "visual_design"
    | "user_notes"
    | "external_evidence";
  value: string;
  quote: string;
  imageIndex: number;
  notes: string;
};

type OptimizedCandidateMatch = {
  title: string;
  brand: string;
  model: string;
  variant: string;
  confidence: number;
  reason: string;
};

type OptimizedEvidenceField = {
  name: string;
  label: string;
  inputType: "text" | "choice" | "boolean";
  value: string;
  options: string[];
  importance: "critical" | "helpful";
  confidence: number;
  reason: string;
  photoHint: string;
};

type OptimizedIdentification = {
  title: string;
  category: string;
  brand: string;
  model: string;
  variant: string;
  modelNumber: string;
  serialNumber: string;
  condition: string;
  identificationBasis:
    | "model_number"
    | "product_name"
    | "brand_and_visual_match"
    | "visual_match"
    | "insufficient_evidence";
  confidence: number;
  confidenceBreakdown: ItemConfidenceBreakdown;
  detectedText: string[];
  identityEvidence: OptimizedIdentityEvidence[];
  ambiguityNotes: string[];
  uncertainty: string[];
  candidateMatches: OptimizedCandidateMatch[];
  needsMorePhotos: boolean;
  suggestedPhotos: string[];
  valuationReadiness: ItemValuationReadiness;
  valuationSignals: string[];
  descriptorSummary: string;
  searchQueries: string[];
  productSearchQuery: string;
  negativeKeywords: string[];
  evidenceFields: OptimizedEvidenceField[];
};

type IdentifyItemResponse = {
  ok: boolean;
  error?: string;
  analyzedFileIds?: string[];
  identification?: unknown;
  guidance?: unknown;
  photoGuidance?: unknown;
  suggestedPhotos?: unknown;
  suggestions?: unknown;
  tips?: unknown;
  issues?: unknown;
};

type JsonRecord = Record<string, unknown>;

const VALID_CATEGORIES: KeepFlipIdentification["category"][] = [
  "Audio",
  "Appliances",
  "Electronics",
  "Tools",
  "Furniture",
  "Home",
  "Fashion",
  "Collectible",
  "Sporting Goods",
  "Vehicle",
  "Other",
];

const VALID_CONDITIONS: KeepFlipIdentification["condition"][] = [
  "new",
  "like_new",
  "good",
  "fair",
  "poor",
  "unknown",
];

const DEFAULT_IDENTIFICATION_TIPS = [
  "Retake the complete item in bright, even light with all edges visible.",
  "Add a sharp close-up of the brand, model, serial, maker, or settings label.",
  "Add close-ups of damage, wear, included accessories, ports, and the underside or back.",
];

const FUNCTION_EXECUTION_POLL_INTERVAL_MS = 2500;
const TERMINAL_FUNCTION_STATUSES = new Set(["completed", "failed"]);

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function executionErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;

  return {
    name: String(record?.name || typeof error),
    message: String(record?.message || error || "Unknown execution error"),
    code: Number(record?.code || 0) || null,
    type: String(record?.type || ""),
    status: Number(record?.status || 0) || null,
  };
}

function isExecutionNotFound(error: unknown) {
  const details = executionErrorDetails(error);
  return (
    details.code === 404 ||
    details.status === 404 ||
    details.type === "execution_not_found" ||
    /execution with the requested id could not be found/i.test(
      details.message,
    )
  );
}

async function waitForItemAiExecution(initialExecution: any) {
  let execution = initialExecution;
  const executionId = String(initialExecution?.$id || "").trim();
  let notFoundAttempts = 0;
  let pollAttempt = 0;

  if (!executionId) {
    throw new Error(
      "Appwrite started item analysis without returning an execution ID.",
    );
  }

  while (true) {
    const status = String(execution?.status || "").toLowerCase();

    if (TERMINAL_FUNCTION_STATUSES.has(status)) {
      return execution;
    }

    pollAttempt += 1;
    await sleep(FUNCTION_EXECUTION_POLL_INTERVAL_MS);

    try {
      execution = await functions.getExecution({
        functionId: APPWRITE.itemAiFunctionId,
        executionId,
      });
      notFoundAttempts = 0;
    } catch (error) {
      const details = executionErrorDetails(error);

      if (isExecutionNotFound(error)) {
        notFoundAttempts += 1;
        if (
          notFoundAttempts === 1 ||
          notFoundAttempts % 5 === 0
        ) {
          console.warn(
            "KeepFlip item-AI execution is not visible yet; continuing to poll.",
            {
              executionId,
              pollAttempt,
              notFoundAttempts,
              ...details,
            },
          );
        }
        continue;
      }

      console.error("KeepFlip item-AI execution polling failed.", {
        executionId,
        pollAttempt,
        ...details,
      });
      throw error;
    }
  }
}


export class ItemIdentificationGuidanceError extends Error {
  guidance: ItemIdentificationGuidance;

  constructor(guidance: ItemIdentificationGuidance) {
    super(guidance.message);
    this.name = "ItemIdentificationGuidanceError";
    this.guidance = guidance;
  }
}

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

function asStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    const normalized = asString(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result;
}

function asConfidence(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : fallback;

  if (!Number.isFinite(parsed)) return fallback;

  const scaled = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function normalizeCategory(
  value: unknown,
): KeepFlipIdentification["category"] {
  const normalized = asString(value);
  const match = VALID_CATEGORIES.find(
    (category) =>
      category.toLowerCase() === normalized.toLowerCase(),
  );
  return match || "Other";
}

function normalizeCondition(
  value: unknown,
): KeepFlipIdentification["condition"] {
  const normalized = asString(value)
    .toLowerCase()
    .replace(/\s+/g, "_");

  const match = VALID_CONDITIONS.find(
    (condition) => condition === normalized,
  );
  return match || "unknown";
}

function normalizeBasis(
  raw: OptimizedIdentification,
): KeepFlipIdentification["identificationBasis"] {
  switch (raw.identificationBasis) {
    case "model_number":
      return "model_number";
    case "product_name":
      return raw.brand
        ? "brand_and_distinctive_design"
        : "visual_category_only";
    case "brand_and_visual_match":
      return "brand_and_distinctive_design";
    case "visual_match":
      return "visual_category_only";
    case "insufficient_evidence":
    default:
      return "insufficient_evidence";
  }
}

function confidenceForAspect(
  breakdown: ItemConfidenceBreakdown,
  aspect: OptimizedIdentityEvidence["aspect"],
) {
  switch (aspect) {
    case "item_type":
      return breakdown.itemType;
    case "brand":
      return breakdown.brand;
    case "model":
    case "variant":
      return breakdown.model;
    case "condition":
      return breakdown.condition;
  }
}

function normalizeOptimizedRaw(value: unknown): OptimizedIdentification {
  const raw = asRecord(value) || {};
  const confidenceBreakdown = asRecord(raw.confidenceBreakdown) || {};

  const identityEvidence = Array.isArray(raw.identityEvidence)
    ? raw.identityEvidence
        .map((entry): OptimizedIdentityEvidence | null => {
          const record = asRecord(entry);
          if (!record) return null;

          const aspect = asString(
            record.aspect,
          ) as OptimizedIdentityEvidence["aspect"];
          const source = asString(
            record.source,
          ) as OptimizedIdentityEvidence["source"];

          if (
            ![
              "item_type",
              "brand",
              "model",
              "variant",
              "condition",
            ].includes(aspect) ||
            ![
              "photo_text",
              "visual_design",
              "user_notes",
              "external_evidence",
            ].includes(source)
          ) {
            return null;
          }

          const imageIndex = Number(record.imageIndex);

          return {
            aspect,
            source,
            value: asString(record.value),
            quote: asString(record.quote),
            imageIndex: Number.isInteger(imageIndex)
              ? imageIndex
              : -1,
            notes: asString(record.notes),
          };
        })
        .filter(
          (entry): entry is OptimizedIdentityEvidence =>
            Boolean(entry?.value),
        )
        .slice(0, 12)
    : [];

  const candidateMatches = Array.isArray(raw.candidateMatches)
    ? raw.candidateMatches
        .map((entry): OptimizedCandidateMatch | null => {
          const record = asRecord(entry);
          if (!record || !asString(record.title)) return null;
          return {
            title: asString(record.title),
            brand: asString(record.brand),
            model: asString(record.model),
            variant: asString(record.variant),
            confidence: asConfidence(record.confidence),
            reason: asString(record.reason),
          };
        })
        .filter(
          (entry): entry is OptimizedCandidateMatch =>
            Boolean(entry),
        )
        .slice(0, 3)
    : [];

  const evidenceFields = Array.isArray(raw.evidenceFields)
    ? raw.evidenceFields
        .map((entry): OptimizedEvidenceField | null => {
          const record = asRecord(entry);
          if (!record || !asString(record.name)) return null;

          const rawInputType = asString(record.inputType);
          const inputType: OptimizedEvidenceField["inputType"] =
            rawInputType === "choice" ||
            rawInputType === "boolean"
              ? rawInputType
              : "text";

          const rawImportance = asString(record.importance);

          return {
            name: asString(record.name),
            label: asString(record.label),
            inputType,
            value: asString(record.value),
            options:
              inputType === "choice"
                ? asStringArray(record.options, 8)
                : [],
            importance:
              rawImportance === "critical"
                ? "critical"
                : "helpful",
            confidence: asConfidence(record.confidence),
            reason: asString(record.reason),
            photoHint: asString(record.photoHint),
          };
        })
        .filter(
          (entry): entry is OptimizedEvidenceField =>
            Boolean(entry),
        )
        .slice(0, 6)
    : [];

  const readiness = asString(raw.valuationReadiness);

  return {
    title: asString(raw.title) || "Unclear item",
    category: asString(raw.category) || "Other",
    brand: asString(raw.brand),
    model: asString(raw.model),
    variant: asString(raw.variant),
    modelNumber: asString(raw.modelNumber),
    serialNumber: asString(raw.serialNumber),
    condition: asString(raw.condition) || "unknown",
    identificationBasis: [
      "model_number",
      "product_name",
      "brand_and_visual_match",
      "visual_match",
      "insufficient_evidence",
    ].includes(asString(raw.identificationBasis))
      ? (asString(
          raw.identificationBasis,
        ) as OptimizedIdentification["identificationBasis"])
      : "insufficient_evidence",
    confidence: asConfidence(raw.confidence),
    confidenceBreakdown: {
      itemType: asConfidence(confidenceBreakdown.itemType),
      brand: asConfidence(confidenceBreakdown.brand),
      model: asConfidence(confidenceBreakdown.model),
      condition: asConfidence(confidenceBreakdown.condition),
    },
    detectedText: asStringArray(raw.detectedText, 20),
    identityEvidence,
    ambiguityNotes: asStringArray(raw.ambiguityNotes),
    uncertainty: asStringArray(raw.uncertainty),
    candidateMatches,
    needsMorePhotos: Boolean(raw.needsMorePhotos),
    suggestedPhotos: asStringArray(raw.suggestedPhotos, 8),
    valuationReadiness:
      readiness === "ready" ||
      readiness === "directional"
        ? readiness
        : "needs_evidence",
    valuationSignals: asStringArray(raw.valuationSignals),
    descriptorSummary: asString(raw.descriptorSummary),
    searchQueries: asStringArray(raw.searchQueries, 5),
    productSearchQuery: asString(raw.productSearchQuery),
    negativeKeywords: asStringArray(raw.negativeKeywords),
    evidenceFields,
  };
}

function normalizeIdentification(
  value: unknown,
): KeepFlipIdentification {
  const raw = normalizeOptimizedRaw(value);
  const modelParts = [raw.model, raw.modelNumber].filter(
    (part, index, values) =>
      part && values.indexOf(part) === index,
  );
  const model = modelParts.length
    ? modelParts.join(" / ")
    : null;

  const identityEvidence: ItemIdentityEvidence[] =
    raw.identityEvidence.map((entry) => ({
      field: entry.aspect,
      value: entry.value,
      source: entry.source,
      confidence: confidenceForAspect(
        raw.confidenceBreakdown,
        entry.aspect,
      ),
      explanation:
        [entry.notes, entry.quote ? `Visible text: ${entry.quote}` : ""]
          .filter(Boolean)
          .join(" ") ||
        "Evidence returned by KeepFlip's item intelligence engine.",
      imageIndex:
        entry.imageIndex >= 0 ? entry.imageIndex : null,
    }));

  if (
    raw.variant &&
    !identityEvidence.some(
      (entry) =>
        entry.field === "variant" &&
        entry.value.toLowerCase() === raw.variant.toLowerCase(),
    )
  ) {
    identityEvidence.push({
      field: "variant",
      value: raw.variant,
      source: "visual_design",
      confidence: raw.confidenceBreakdown.model,
      explanation:
        "Variant returned by the optimized item-identification prompt.",
      imageIndex: null,
    });
  }

  const conditionEvidence = identityEvidence
    .filter((entry) => entry.field === "condition")
    .flatMap((entry) => [entry.value, entry.explanation])
    .filter(Boolean);

  const valuationSignals: ItemValuationSignals = {
    objectType:
      raw.title.toLowerCase() === "unclear item"
        ? null
        : raw.title,
    subcategory: raw.category || null,
    style: [],
    materials: [],
    colors: [],
    era: [],
    motifs: [],
    shape: null,
    construction: [],
    conditionSignals: raw.valuationSignals,
    visibleMarks: raw.detectedText,
    descriptorSummary: raw.descriptorSummary,
    searchQueries: raw.searchQueries,
    negativeKeywords: raw.negativeKeywords,
    uncertainty: [
      ...raw.uncertainty,
      ...raw.ambiguityNotes,
    ],
    suggestedPhotoAngles: raw.suggestedPhotos,
    confidence: raw.confidence,
  };

  return {
    title: raw.title,
    brand: asNullableString(raw.brand),
    model,
    serialNumber: asNullableString(raw.serialNumber),
    category: normalizeCategory(raw.category),
    condition: normalizeCondition(raw.condition),
    conditionNotes: Array.from(
      new Set([
        ...conditionEvidence,
        ...raw.valuationSignals,
      ]),
    ).join("; "),
    detectedText: raw.detectedText,
    identificationBasis: normalizeBasis(raw),
    confidence: raw.confidence,
    confidenceBreakdown: raw.confidenceBreakdown,
    valuationReadiness: raw.valuationReadiness,
    ambiguityNotes: [
      ...raw.ambiguityNotes,
      ...raw.uncertainty,
    ],
    identityEvidence,
    productSearchQuery:
      raw.searchQueries[0] ||
      raw.productSearchQuery ||
      "",
    needsMorePhotos: raw.needsMorePhotos,
    suggestedPhotos:
      raw.needsMorePhotos &&
      raw.suggestedPhotos.length === 0
        ? DEFAULT_IDENTIFICATION_TIPS
        : raw.suggestedPhotos,
    candidateMatches: raw.candidateMatches.map(
      (candidate) => ({
        name: candidate.title,
        brand: asNullableString(candidate.brand),
        model: asNullableString(
          [candidate.model, candidate.variant]
            .filter(Boolean)
            .join(" "),
        ),
        confidence: candidate.confidence,
        reason: candidate.reason,
      }),
    ),
    evidenceFields: raw.evidenceFields.map((field) => ({
      key: field.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
      label: field.label || field.name,
      inputType: field.inputType,
      value: field.value,
      options: field.options,
      importance: field.importance,
      confidence: field.confidence,
      reason: field.reason,
      photoHint: field.photoHint,
    })),
    valuationSignals,
  };
}

function readNestedStringArray(
  source: unknown,
  keys: string[],
): string[] {
  const record = asRecord(source);
  if (!record) return [];
  return keys.flatMap((key) =>
    asStringArray(record[key]),
  );
}

function buildPhotoGuidance(
  payload: Partial<IdentifyItemResponse>,
  fallbackMessage: string,
): ItemIdentificationGuidance {
  const tips = Array.from(
    new Set([
      ...asStringArray(payload.suggestedPhotos),
      ...asStringArray(payload.suggestions),
      ...asStringArray(payload.tips),
      ...asStringArray(payload.issues),
      ...readNestedStringArray(payload.guidance, [
        "tips",
        "suggestions",
        "suggestedPhotos",
        "issues",
      ]),
      ...readNestedStringArray(payload.photoGuidance, [
        "tips",
        "suggestions",
        "suggestedPhotos",
        "issues",
      ]),
      ...DEFAULT_IDENTIFICATION_TIPS,
    ]),
  ).slice(0, 4);

  const guidance =
    asRecord(payload.photoGuidance) ||
    asRecord(payload.guidance);

  return {
    title:
      asString(guidance?.title) ||
      "Try clearer item photos",
    message:
      asString(guidance?.message) ||
      asString(guidance?.summary) ||
      fallbackMessage ||
      "KeepFlip needs stronger visual evidence before it can make a reliable identification.",
    tips,
  };
}

export function getItemIdentificationGuidance(
  error: unknown,
): ItemIdentificationGuidance | null {
  return error instanceof ItemIdentificationGuidanceError
    ? error.guidance
    : null;
}

export function formatItemIdentificationGuidance(
  guidance: ItemIdentificationGuidance,
) {
  return [
    guidance.message,
    ...guidance.tips.map((tip) => `- ${tip}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function identifyItemWithAI(
  fileIds: string[],
  notes = "",
): Promise<KeepFlipIdentification> {
  if (!fileIds.length) {
    throw new Error(
      "Upload at least one item photo before identifying it.",
    );
  }

  const startedExecution = await functions.createExecution({
    functionId: APPWRITE.itemAiFunctionId,
    body: JSON.stringify({
      fileIds,
      notes: notes.trim(),
    }),
    async: true,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });

  const execution = await waitForItemAiExecution(startedExecution);
  let payload: IdentifyItemResponse;

  try {
    payload = JSON.parse(
      execution.responseBody || "{}",
    );
  } catch {
    throw new Error(
      "KeepFlip received an unreadable response from the item identifier.",
    );
  }

  if (payload.identification) {
    return normalizeIdentification(
      payload.identification,
    );
  }

  const fallbackMessage =
    payload.error ||
    (typeof execution.errors === "string" ? execution.errors.trim() : "") ||
    "KeepFlip could not get enough visual evidence from this photo.";

  const isOperationalFailure =
    /sign in|signed in|permission|unauthor|unsupported|too large|provide at least|retrieve|unreadable|valid json|environment variable|function key|use post/i.test(
      fallbackMessage,
    );

  const isPhotoReadFailure =
    /could not identify|identification failed|no identification|visual evidence|photo|image is unclear|too dark|glare|blur|insufficient evidence|unclear/i.test(
      fallbackMessage,
    );

  if (
    String(execution.status || "").toLowerCase() === "failed" ||
    (execution.responseStatusCode >= 400 &&
      (!isPhotoReadFailure || isOperationalFailure))
  ) {
    throw new Error(fallbackMessage);
  }

  throw new ItemIdentificationGuidanceError(
    buildPhotoGuidance(
      payload,
      fallbackMessage,
    ),
  );
}
