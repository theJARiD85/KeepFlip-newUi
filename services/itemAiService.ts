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
  condition: "new" | "like_new" | "good" | "fair" | "poor" | "unknown";
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

type JsonRecord = Record<string, unknown>;

type IdentifyItemResponse = {
  ok: boolean;
  error?: string;
  analyzedFileIds?: string[];
  identification?: JsonRecord;
  guidance?: unknown;
  photoGuidance?: unknown;
  suggestedPhotos?: unknown;
  suggestions?: unknown;
  tips?: unknown;
  issues?: unknown;
};

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

const VALID_IDENTIFICATION_BASES: KeepFlipIdentification["identificationBasis"][] = [
  "model_number",
  "brand_and_distinctive_design",
  "brand_only",
  "visual_category_only",
  "insufficient_evidence",
];

const VALID_READINESS: ItemValuationReadiness[] = [
  "ready",
  "directional",
  "needs_evidence",
];

const VALID_EVIDENCE_FIELDS: ItemIdentityEvidence["field"][] = [
  "item_type",
  "brand",
  "model",
  "variant",
  "condition",
];

const VALID_EVIDENCE_SOURCES: ItemIdentityEvidence["source"][] = [
  "photo_text",
  "visual_design",
  "user_notes",
  "external_evidence",
];

const DEFAULT_IDENTIFICATION_TIPS = [
  "Retake the complete item in bright, even light with all edges visible.",
  "Add a sharp close-up of the logo, maker mark, model/MPN label, or settings/about screen.",
  "Add clear condition photos of damage, wear, missing parts, and included accessories.",
];

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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();

        const record = asRecord(item);
        return asString(
          record?.value ??
            record?.label ??
            record?.name ??
            record?.description ??
            record?.text,
        );
      })
      .filter(Boolean);
  }

  const normalized = asString(value);
  if (!normalized) return [];

  return normalized
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[], maximum = 20): string[] {
  const seen = new Set<string>();

  return values
    .filter((value) => {
      const normalized = value.trim();
      if (!normalized) return false;

      const key = normalized.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maximum);
}

function asConfidence(value: unknown, fallback = 0): number {
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

function normalizeCategory(value: unknown): KeepFlipIdentification["category"] {
  const normalized = asString(value);
  return (
    VALID_CATEGORIES.find(
      (category) => category.toLowerCase() === normalized.toLowerCase(),
    ) ?? "Other"
  );
}

function normalizeCondition(value: unknown): KeepFlipIdentification["condition"] {
  const normalized = asString(value).toLowerCase().replace(/\s+/g, "_");

  return (
    VALID_CONDITIONS.find((condition) => condition === normalized) ?? "unknown"
  );
}

function normalizeIdentificationBasis(
  value: unknown,
): KeepFlipIdentification["identificationBasis"] {
  const normalized = asString(value);

  return (
    VALID_IDENTIFICATION_BASES.find((basis) => basis === normalized) ??
    "insufficient_evidence"
  );
}

function normalizeReadiness(value: unknown): ItemValuationReadiness {
  const normalized = asString(value);

  return (
    VALID_READINESS.find((readiness) => readiness === normalized) ??
    "needs_evidence"
  );
}

function normalizeConfidenceBreakdown(
  value: unknown,
  overall: number,
  brand: string | null,
  model: string | null,
  condition: KeepFlipIdentification["condition"],
): ItemConfidenceBreakdown {
  const record = asRecord(value) ?? {};

  return {
    itemType: asConfidence(record.itemType, overall),
    brand: brand ? asConfidence(record.brand, overall) : 0,
    model: model ? asConfidence(record.model, overall) : 0,
    condition:
      condition === "unknown" ? 0 : asConfidence(record.condition, overall),
  };
}

function normalizeIdentityEvidence(value: unknown): ItemIdentityEvidence[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): ItemIdentityEvidence | null => {
      const record = asRecord(entry);
      if (!record) return null;

      const field = asString(record.field) as ItemIdentityEvidence["field"];
      const source = asString(record.source) as ItemIdentityEvidence["source"];
      const evidenceValue = asString(record.value);
      const explanation = asString(record.explanation);

      if (
        !VALID_EVIDENCE_FIELDS.includes(field) ||
        !VALID_EVIDENCE_SOURCES.includes(source) ||
        !evidenceValue ||
        !explanation
      ) {
        return null;
      }

      return {
        field,
        value: evidenceValue,
        source,
        confidence: asConfidence(record.confidence, 0),
        explanation,
      };
    })
    .filter((entry): entry is ItemIdentityEvidence => Boolean(entry))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 10);
}

function normalizeCandidateMatches(value: unknown): ItemCandidateMatch[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((candidate): ItemCandidateMatch | null => {
      const record = asRecord(candidate);
      if (!record) return null;

      const name = asString(record.name);
      const reason = asString(record.reason);
      if (!name || !reason) return null;

      return {
        name,
        brand: asNullableString(record.brand),
        model: asNullableString(record.model),
        confidence: asConfidence(record.confidence, 0),
        reason,
      };
    })
    .filter((candidate): candidate is ItemCandidateMatch => Boolean(candidate))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function normalizeEvidenceField(value: unknown): ItemEvidenceField | null {
  const field = asRecord(value);
  if (!field) return null;

  const key = asString(field.key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const label = asString(field.label);
  const inputType = asString(field.inputType);
  const importance = asString(field.importance);
  const fieldValue = asString(field.value);

  if (!key || !label) return null;

  const normalizedInputType: ItemEvidenceField["inputType"] =
    inputType === "choice" || inputType === "boolean" ? inputType : "text";

  const options =
    normalizedInputType === "choice"
      ? uniqueStrings([...asStringArray(field.options), fieldValue], 8)
      : [];

  return {
    key,
    label,
    inputType: normalizedInputType,
    value:
      normalizedInputType === "boolean" &&
      !["yes", "no", ""].includes(fieldValue.toLowerCase())
        ? ""
        : fieldValue,
    options,
    importance: importance === "critical" ? "critical" : "helpful",
    confidence: asConfidence(field.confidence, 0),
    reason: asString(field.reason),
    photoHint: asString(field.photoHint),
  };
}

function emptyValuationSignals(): ItemValuationSignals {
  return {
    objectType: null,
    subcategory: null,
    style: [],
    materials: [],
    colors: [],
    era: [],
    motifs: [],
    shape: null,
    construction: [],
    conditionSignals: [],
    visibleMarks: [],
    descriptorSummary: "",
    searchQueries: [],
    negativeKeywords: [],
    uncertainty: [],
    suggestedPhotoAngles: [],
    confidence: 0,
  };
}

function normalizeValuationSignals(value: unknown): ItemValuationSignals {
  const source = asRecord(value);
  if (!source) return emptyValuationSignals();

  return {
    objectType: asNullableString(source.objectType),
    subcategory: asNullableString(source.subcategory),
    style: uniqueStrings(asStringArray(source.style), 10),
    materials: uniqueStrings(asStringArray(source.materials), 10),
    colors: uniqueStrings(asStringArray(source.colors), 10),
    era: uniqueStrings(asStringArray(source.era), 10),
    motifs: uniqueStrings(asStringArray(source.motifs), 10),
    shape: asNullableString(source.shape),
    construction: uniqueStrings(asStringArray(source.construction), 10),
    conditionSignals: uniqueStrings(asStringArray(source.conditionSignals), 10),
    visibleMarks: uniqueStrings(asStringArray(source.visibleMarks), 10),
    descriptorSummary: asString(source.descriptorSummary),
    searchQueries: uniqueStrings(asStringArray(source.searchQueries), 5),
    negativeKeywords: uniqueStrings(asStringArray(source.negativeKeywords), 10),
    uncertainty: uniqueStrings(asStringArray(source.uncertainty), 10),
    suggestedPhotoAngles: uniqueStrings(
      asStringArray(source.suggestedPhotoAngles),
      8,
    ),
    confidence: asConfidence(source.confidence, 0),
  };
}

function normalizeIdentification(raw: JsonRecord): KeepFlipIdentification {
  const title = asString(raw.title) || "Unknown item";
  const brand = asNullableString(raw.brand);
  const model = asNullableString(raw.model);
  const category = normalizeCategory(raw.category);
  const condition = normalizeCondition(raw.condition);
  const confidence = asConfidence(raw.confidence, 0);
  const valuationSignals = normalizeValuationSignals(raw.valuationSignals);
  const searchQueries = valuationSignals.searchQueries;
  const productSearchQuery =
    searchQueries[0] ?? asString(raw.productSearchQuery);
  const suggestedPhotos = uniqueStrings(asStringArray(raw.suggestedPhotos), 6);
  const evidenceFields = Array.isArray(raw.evidenceFields)
    ? raw.evidenceFields
        .map(normalizeEvidenceField)
        .filter((field): field is ItemEvidenceField => Boolean(field))
        .slice(0, 6)
    : [];

  return {
    title,
    brand,
    model,
    category,
    condition,
    conditionNotes: asString(raw.conditionNotes),
    detectedText: uniqueStrings(asStringArray(raw.detectedText), 20),
    identificationBasis: normalizeIdentificationBasis(raw.identificationBasis),
    confidence,
    confidenceBreakdown: normalizeConfidenceBreakdown(
      raw.confidenceBreakdown,
      confidence,
      brand,
      model,
      condition,
    ),
    valuationReadiness: normalizeReadiness(raw.valuationReadiness),
    ambiguityNotes: uniqueStrings(asStringArray(raw.ambiguityNotes), 10),
    identityEvidence: normalizeIdentityEvidence(raw.identityEvidence),
    productSearchQuery,
    needsMorePhotos: Boolean(raw.needsMorePhotos),
    suggestedPhotos:
      suggestedPhotos.length > 0
        ? suggestedPhotos
        : uniqueStrings(valuationSignals.suggestedPhotoAngles, 6),
    candidateMatches: normalizeCandidateMatches(raw.candidateMatches),
    evidenceFields,
    valuationSignals,
  };
}

function readNestedStringArray(source: unknown, keys: string[]): string[] {
  const record = asRecord(source);
  if (!record) return [];

  return keys.flatMap((key) => asStringArray(record[key]));
}

function buildPhotoGuidance(
  payload: Partial<IdentifyItemResponse>,
  fallbackMessage: string,
): ItemIdentificationGuidance {
  const tips = uniqueStrings(
    [
      ...asStringArray(payload.suggestedPhotos),
      ...asStringArray(payload.suggestions),
      ...asStringArray(payload.tips),
      ...asStringArray(payload.issues),
      ...readNestedStringArray(payload.guidance, [
        "tips",
        "suggestions",
        "suggestedPhotos",
        "issues",
        "photoIssues",
      ]),
      ...readNestedStringArray(payload.photoGuidance, [
        "tips",
        "suggestions",
        "suggestedPhotos",
        "issues",
        "photoIssues",
      ]),
      ...DEFAULT_IDENTIFICATION_TIPS,
    ],
    4,
  );

  const guidanceRecord =
    asRecord(payload.photoGuidance) ?? asRecord(payload.guidance);

  return {
    title: asString(guidanceRecord?.title) || "Try a clearer item photo",
    message:
      asString(guidanceRecord?.message) ||
      asString(guidanceRecord?.summary) ||
      fallbackMessage ||
      "KeepFlip needs clearer evidence before it can make a reliable identification.",
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
  return [guidance.message, ...guidance.tips.map((tip) => `- ${tip}`)]
    .filter(Boolean)
    .join("\n\n");
}

export async function identifyItemWithAI(
  fileIds: string[],
  notes = "",
): Promise<KeepFlipIdentification> {
  if (!fileIds.length) {
    throw new Error("Upload at least one item photo before identifying it.");
  }

  const execution = await functions.createExecution({
    functionId: APPWRITE.itemAiFunctionId,
    body: JSON.stringify({
      fileIds,
      notes: notes.trim(),
    }),
    async: false,
    method: ExecutionMethod.POST,
    headers: {
      "content-type": "application/json",
    },
  });

  let payload: IdentifyItemResponse;

  try {
    payload = JSON.parse(execution.responseBody || "{}");
  } catch {
    throw new Error(
      "KeepFlip received an unreadable response from the item identifier.",
    );
  }

  if (payload.identification) {
    return normalizeIdentification(payload.identification);
  }

  const fallbackMessage =
    payload.error ||
    "KeepFlip could not get enough reliable evidence from these photos.";

  const isOperationalFailure =
    /sign in|signed in|permission|unauthor|unsupported|too large|provide at least|retrieve|unreadable|valid json|environment variable|function key|use post/i.test(
      fallbackMessage,
    );

  const isPhotoReadFailure =
    /could not identify|identification failed|no identification|visual evidence|photo|image is unclear|too dark|glare|blur|insufficient evidence|unclear/i.test(
      fallbackMessage,
    );

  if (
    execution.responseStatusCode >= 400 &&
    (!isPhotoReadFailure || isOperationalFailure)
  ) {
    throw new Error(fallbackMessage);
  }

  throw new ItemIdentificationGuidanceError(
    buildPhotoGuidance(payload, fallbackMessage),
  );
}
