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

export type ItemIdentificationGuidance = {
  title: string;
  message: string;
  tips: string[];
};

export type IdentificationEvidence = {
  field: "item_type" | "brand" | "model" | "variant" | "condition";
  value: string;
  source: "photo_text" | "visual_design" | "user_notes" | "external_evidence";
  confidence: number;
  explanation: string;
};

export type IdentificationConfidenceBreakdown = {
  itemType: number;
  brand: number;
  model: number;
  condition: number;
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
  confidenceBreakdown: IdentificationConfidenceBreakdown;
  valuationReadiness: "ready" | "directional" | "needs_evidence";
  ambiguityNotes: string[];
  identityEvidence: IdentificationEvidence[];
  productSearchQuery: string;
  needsMorePhotos: boolean;
  suggestedPhotos: string[];
  candidateMatches: Array<{
    name: string;
    brand: string | null;
    model: string | null;
    confidence: number;
    reason: string;
  }>;
  evidenceFields: ItemEvidenceField[];
  valuationSignals: ItemValuationSignals;
};

type IdentifyItemResponse = {
  ok: boolean;
  error?: string;
  analyzedFileIds?: string[];
  identification?: RawIdentification;
  guidance?: unknown;
  photoGuidance?: unknown;
  suggestedPhotos?: unknown;
  suggestions?: unknown;
  tips?: unknown;
  issues?: unknown;
};

type JsonRecord = Record<string, unknown>;

type RawIdentification = Partial<
  Omit<KeepFlipIdentification, "valuationSignals">
> &
  JsonRecord & {
    valuationSignals?: Partial<ItemValuationSignals> & JsonRecord;
    appraisalProfile?: Partial<ItemValuationSignals> & JsonRecord;
    visualValuationProfile?: Partial<ItemValuationSignals> & JsonRecord;
    searchQueries?: unknown;
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

const VALUATION_SIGNAL_INSTRUCTIONS = [
  "KeepFlip valuation routing instructions:",
  "- Preserve brand/model/MPN/serial identifiers when visible or supplied; they are the preferred high-confidence valuation path.",
  "- When exact identifiers are unavailable or weak, return valuationSignals for descriptor-based valuation.",
  "- valuationSignals should include objectType, subcategory, style, materials, colors, era, motifs, shape, construction, conditionSignals, visibleMarks, descriptorSummary, searchQueries, negativeKeywords, uncertainty, suggestedPhotoAngles, and confidence.",
  "- searchQueries should be clean item-identity phrases ordered from most specific to broadest, using visual descriptors such as style, material, era, motif, shape, and color.",
  '- Do not add "recently sold", "sold", "price", "value", marketplace names, or transaction intent. The downstream service already searches completed sales.',
  '- Example descriptor query shape: "vintage brass lotus flower lamp" or "sterling silver turquoise squash blossom necklace".',
  "- Include likely premium maker/attribution names only in uncertainty or visibleMarks unless there is readable evidence. Do not invent a brand.",
  "- Use cautious language for guesses. Mark uncertain materials, eras, gemstones, metals, makers, and authenticity as uncertainty rather than fact.",
].join("\n");

const PHOTO_READ_INSTRUCTIONS = [
  "Photo-read fallback instructions:",
  "- Do not fail only because the product cannot be confidently identified.",
  '- If the photos are unclear, return ok true with an identification object using title "Unclear item", identificationBasis "insufficient_evidence", condition "unknown", confidence 0-40, needsMorePhotos true, and suggestedPhotos.',
  "- Base suggestedPhotos on the uploaded photos, not generic advice. Mention specific blockers when visible: too dark, glare, blur, cropped item, label hidden, logo covered, hands blocking marks, packaging covering model details, reflective surfaces, missing underside/back/tag/serial plate/accessories.",
  "- If the item type is visible but brand/model is not, identify the broad visual category and explain exactly which close-up would improve the read.",
].join("\n");

const DEFAULT_IDENTIFICATION_TIPS = [
  "Retake the item in bright, even light so edges, labels, logos, and controls are visible.",
  "Uncover the full item and move hands, packaging, cases, cords, or clutter away from brand marks, ports, tags, serial plates, and model labels.",
  "Add one full-item photo plus sharp close-ups of the label, underside/back, damage, included accessories, and any text or maker mark.",
];

export class ItemIdentificationGuidanceError extends Error {
  guidance: ItemIdentificationGuidance;

  constructor(guidance: ItemIdentificationGuidance) {
    super(guidance.message);
    this.name = "ItemIdentificationGuidanceError";
    this.guidance = guidance;
  }
}

function buildIdentificationNotes(notes: string) {
  return [
    notes.trim(),
    VALUATION_SIGNAL_INSTRUCTIONS,
    PHOTO_READ_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join("\n\n");
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
            record?.text
        );
      })
      .filter(Boolean);
  }

  const normalized = asString(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readNestedStringArray(
  source: unknown,
  keys: string[]
): string[] {
  const record = asRecord(source);

  if (!record) {
    return [];
  }

  return keys.flatMap((key) => asStringArray(record[key]));
}

function asConfidence(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const scaled = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;

  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function normalizeConfidenceBreakdown(
  value: unknown,
  fallback: number,
  hasModel: boolean
): IdentificationConfidenceBreakdown {
  const source = asRecord(value) || {};

  return {
    itemType: asConfidence(source.itemType, fallback),
    brand: asConfidence(source.brand, fallback),
    model: asConfidence(source.model, hasModel ? fallback : 0),
    condition: asConfidence(source.condition, fallback),
  };
}

function normalizeValuationReadiness(
  value: unknown,
  fallback: KeepFlipIdentification["valuationReadiness"]
): KeepFlipIdentification["valuationReadiness"] {
  const normalized = asString(value);

  return normalized === "ready" || normalized === "directional"
    ? normalized
    : fallback;
}

function normalizeIdentityEvidence(value: unknown): IdentificationEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields = new Set<IdentificationEvidence["field"]>([
    "item_type",
    "brand",
    "model",
    "variant",
    "condition",
  ]);
  const sources = new Set<IdentificationEvidence["source"]>([
    "photo_text",
    "visual_design",
    "user_notes",
    "external_evidence",
  ]);

  return value
    .map((entry) => {
      const source = asRecord(entry);
      const field = asString(source?.field) as IdentificationEvidence["field"];
      const evidenceSource = asString(
        source?.source
      ) as IdentificationEvidence["source"];
      const evidenceValue = asString(source?.value);

      if (!source || !fields.has(field) || !sources.has(evidenceSource) || !evidenceValue) {
        return null;
      }

      return {
        field,
        value: evidenceValue,
        source: evidenceSource,
        confidence: asConfidence(source.confidence, 0),
        explanation: asString(source.explanation),
      };
    })
    .filter((entry): entry is IdentificationEvidence => Boolean(entry))
    .slice(0, 10);
}

function normalizeCategory(value: unknown): KeepFlipIdentification["category"] {
  const normalized = asString(value);
  const match = VALID_CATEGORIES.find(
    (category) => category.toLowerCase() === normalized.toLowerCase()
  );

  return match || "Other";
}

function normalizeCondition(value: unknown): KeepFlipIdentification["condition"] {
  const normalized = asString(value)
    .toLowerCase()
    .replace(/\s+/g, "_");

  const match = VALID_CONDITIONS.find(
    (condition) => condition === normalized
  );

  return match || "unknown";
}

function normalizeIdentificationBasis(
  value: unknown
): KeepFlipIdentification["identificationBasis"] {
  const normalized = asString(value);
  const match = VALID_IDENTIFICATION_BASES.find(
    (basis) => basis === normalized
  );

  return match || "insufficient_evidence";
}

function readSignalSource(raw: RawIdentification) {
  return (
    asRecord(raw.valuationSignals) ||
    asRecord(raw.visualValuationProfile) ||
    asRecord(raw.appraisalProfile) ||
    {}
  );
}

function normalizeValuationSignals(
  raw: RawIdentification,
  base: Pick<
    KeepFlipIdentification,
    | "title"
    | "category"
    | "conditionNotes"
    | "detectedText"
    | "productSearchQuery"
    | "suggestedPhotos"
    | "confidence"
  >
): ItemValuationSignals {
  const source = readSignalSource(raw);
  const objectType =
    asNullableString(source.objectType) ||
    asNullableString(source.itemType) ||
    asNullableString(source.categoryLabel) ||
    asNullableString(base.title) ||
    base.category;

  const searchQueries = uniqueStrings([
    ...asStringArray(source.searchQueries),
    ...asStringArray(raw.searchQueries),
    asString(source.primarySearchQuery),
    base.productSearchQuery,
  ]).filter((query) => query.length >= 3);

  return {
    objectType,
    subcategory:
      asNullableString(source.subcategory) ||
      asNullableString(source.subCategory),
    style: uniqueStrings([
      ...asStringArray(source.style),
      ...asStringArray(source.styles),
      ...asStringArray(source.visualStyle),
    ]),
    materials: uniqueStrings([
      ...asStringArray(source.materials),
      ...asStringArray(source.materialGuesses),
      ...asStringArray(source.materialsGuess),
    ]),
    colors: uniqueStrings([
      ...asStringArray(source.colors),
      ...asStringArray(source.color),
    ]),
    era: uniqueStrings([
      ...asStringArray(source.era),
      ...asStringArray(source.period),
      ...asStringArray(source.likelyPeriod),
    ]),
    motifs: uniqueStrings([
      ...asStringArray(source.motifs),
      ...asStringArray(source.patterns),
      ...asStringArray(source.designMotifs),
    ]),
    shape:
      asNullableString(source.shape) ||
      asNullableString(source.formFactor) ||
      null,
    construction: uniqueStrings([
      ...asStringArray(source.construction),
      ...asStringArray(source.technique),
      ...asStringArray(source.buildDetails),
    ]),
    conditionSignals: uniqueStrings([
      ...asStringArray(source.conditionSignals),
      ...asStringArray(source.conditionNotes),
      base.conditionNotes,
    ]),
    visibleMarks: uniqueStrings([
      ...asStringArray(source.visibleMarks),
      ...asStringArray(source.markings),
      ...base.detectedText,
    ]),
    descriptorSummary:
      asString(source.descriptorSummary) ||
      asString(source.summary) ||
      base.conditionNotes,
    searchQueries,
    negativeKeywords: uniqueStrings([
      ...asStringArray(source.negativeKeywords),
      ...asStringArray(source.excludeTerms),
    ]),
    uncertainty: uniqueStrings([
      ...asStringArray(source.uncertainty),
      ...asStringArray(source.uncertainties),
      ...asStringArray(source.valuationWarnings),
    ]),
    suggestedPhotoAngles: uniqueStrings([
      ...asStringArray(source.suggestedPhotoAngles),
      ...asStringArray(source.neededPhotos),
      ...base.suggestedPhotos,
    ]),
    confidence: asConfidence(source.confidence, base.confidence),
  };
}

function normalizeEvidenceField(value: unknown): ItemEvidenceField | null {
  const field = asRecord(value);

  if (!field) {
    return null;
  }

  const key = asString(field.key);
  const label = asString(field.label);
  const inputType = asString(field.inputType);
  const importance = asString(field.importance);

  if (!key || !label) {
    return null;
  }

  return {
    key,
    label,
    inputType:
      inputType === "choice" || inputType === "boolean"
        ? inputType
        : "text",
    value: asString(field.value),
    options: asStringArray(field.options),
    importance: importance === "critical" ? "critical" : "helpful",
    confidence: asConfidence(field.confidence, 0),
    reason: asString(field.reason),
    photoHint: asString(field.photoHint),
  };
}

function makeSignalField(
  key: string,
  label: string,
  value: string,
  confidence: number,
  reason: string,
  photoHint: string
): ItemEvidenceField | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  return {
    key,
    label,
    inputType: "text",
    value: normalizedValue,
    options: [],
    importance: "helpful",
    confidence,
    reason,
    photoHint,
  };
}

function fieldsFromValuationSignals(
  signals: ItemValuationSignals,
  existingFields: ItemEvidenceField[]
) {
  const existingKeys = new Set(existingFields.map((field) => field.key));
  const candidates = [
    makeSignalField(
      "visual_object_type",
      "Visual item type",
      [signals.objectType, signals.subcategory].filter(Boolean).join(" / "),
      signals.confidence,
      "Item type anchors broad comparable-search terms when no model number is visible.",
      "Add a full item photo from the front and side."
    ),
    makeSignalField(
      "visual_style_period",
      "Style or period",
      [...signals.style, ...signals.era].join(", "),
      signals.confidence,
      "Style and era terms help value antiques, decor, fashion, and collectibles without model numbers.",
      "Add photos of decorative details, joinery, clasp, base, or maker marks."
    ),
    makeSignalField(
      "visual_materials",
      "Visible materials",
      signals.materials.join(", "),
      signals.confidence,
      "Material guesses can materially change comparable sales and should be verified when possible.",
      "Add a close-up of texture, underside, hallmark, tag, or worn edges."
    ),
    makeSignalField(
      "visual_descriptors",
      "Search descriptors",
      [
        ...signals.colors,
        ...signals.motifs,
        signals.shape,
        ...signals.construction,
      ]
        .filter(Boolean)
        .join(", "),
      signals.confidence,
      "Visual descriptors make comparable-sale research work for items without brand or model identifiers.",
      "Add close-ups of patterns, hardware, clasp, shade, base, or distinctive silhouette."
    ),
    makeSignalField(
      "visible_marks",
      "Visible text or marks",
      signals.visibleMarks.join(", "),
      signals.confidence,
      "Readable marks can turn a broad visual estimate into a maker-specific estimate.",
      "Add sharp close-ups of labels, stamps, hallmarks, signatures, and underside markings."
    ),
  ].filter((field): field is ItemEvidenceField => Boolean(field));

  return candidates.filter((field) => !existingKeys.has(field.key));
}

function normalizeIdentification(
  rawIdentification: RawIdentification
): KeepFlipIdentification {
  const candidateMatches = Array.isArray(rawIdentification.candidateMatches)
    ? rawIdentification.candidateMatches.map((candidate) => {
        const record = asRecord(candidate) || {};

        return {
          name: asString(record.name),
          brand: asNullableString(record.brand),
          model: asNullableString(record.model),
          confidence: asConfidence(record.confidence, 0),
          reason: asString(record.reason),
        };
      })
    : [];

  const confidence = asConfidence(rawIdentification.confidence, 0);
  const model = asNullableString(rawIdentification.model);
  const base = {
    title: asString(rawIdentification.title) || "Unknown item",
    brand: asNullableString(rawIdentification.brand),
    model,
    category: normalizeCategory(rawIdentification.category),
    condition: normalizeCondition(rawIdentification.condition),
    conditionNotes: asString(rawIdentification.conditionNotes),
    detectedText: asStringArray(rawIdentification.detectedText),
    identificationBasis: normalizeIdentificationBasis(
      rawIdentification.identificationBasis
    ),
    confidence,
    confidenceBreakdown: normalizeConfidenceBreakdown(
      rawIdentification.confidenceBreakdown,
      confidence,
      Boolean(model)
    ),
    valuationReadiness: normalizeValuationReadiness(
      rawIdentification.valuationReadiness,
      model && confidence >= 80
        ? "ready"
        : confidence >= 45
          ? "directional"
          : "needs_evidence"
    ),
    ambiguityNotes: asStringArray(rawIdentification.ambiguityNotes),
    identityEvidence: normalizeIdentityEvidence(
      rawIdentification.identityEvidence
    ),
    productSearchQuery: asString(rawIdentification.productSearchQuery),
    needsMorePhotos: Boolean(rawIdentification.needsMorePhotos),
    suggestedPhotos: asStringArray(rawIdentification.suggestedPhotos),
    candidateMatches,
    evidenceFields: Array.isArray(rawIdentification.evidenceFields)
      ? rawIdentification.evidenceFields
          .map(normalizeEvidenceField)
          .filter((field): field is ItemEvidenceField => Boolean(field))
      : [],
  };

  const valuationSignals = normalizeValuationSignals(rawIdentification, base);
  const evidenceFields = [
    ...base.evidenceFields,
    ...fieldsFromValuationSignals(valuationSignals, base.evidenceFields),
  ];

  return {
    ...base,
    productSearchQuery:
      base.productSearchQuery ||
      valuationSignals.searchQueries[0] ||
      [base.brand, base.model, base.title].filter(Boolean).join(" "),
    suggestedPhotos:
      base.suggestedPhotos.length > 0
        ? base.suggestedPhotos
        : valuationSignals.suggestedPhotoAngles,
    needsMorePhotos:
      base.needsMorePhotos ||
      valuationSignals.suggestedPhotoAngles.length > 0,
    evidenceFields,
    valuationSignals,
  };
}

function identificationEvidenceScore(
  identification: KeepFlipIdentification
) {
  const basisScore = {
    model_number: 500,
    brand_and_distinctive_design: 360,
    brand_only: 230,
    visual_category_only: 120,
    insufficient_evidence: 0,
  }[identification.identificationBasis];
  const directModelEvidence = identification.identityEvidence.some(
    (evidence) =>
      evidence.field === "model" &&
      (evidence.source === "photo_text" || evidence.source === "user_notes") &&
      evidence.confidence >= 70
  );
  const readinessScore = {
    ready: 120,
    directional: 55,
    needs_evidence: 0,
  }[identification.valuationReadiness];

  return (
    basisScore +
    readinessScore +
    identification.confidence +
    identification.confidenceBreakdown.itemType * 0.4 +
    identification.confidenceBreakdown.brand * 0.35 +
    identification.confidenceBreakdown.model * 0.65 +
    identification.detectedText.length * 5 +
    (directModelEvidence ? 120 : 0) -
    identification.ambiguityNotes.length * 12
  );
}

export function selectStrongerIdentification(
  first: KeepFlipIdentification,
  second: KeepFlipIdentification
) {
  return identificationEvidenceScore(second) > identificationEvidenceScore(first)
    ? second
    : first;
}

function buildPhotoGuidance(
  payload: Partial<IdentifyItemResponse>,
  fallbackMessage: string
): ItemIdentificationGuidance {
  const tips = uniqueStrings([
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
  ]).slice(0, 4);

  const guidanceRecord =
    asRecord(payload.photoGuidance) || asRecord(payload.guidance);

  const title =
    asString(guidanceRecord?.title) ||
    "Try a clearer item photo";

  const message =
    asString(guidanceRecord?.message) ||
    asString(guidanceRecord?.summary) ||
    fallbackMessage ||
    "KeepFlip needs a clearer photo before it can make a confident read.";

  return {
    title,
    message,
    tips,
  };
}

export function getItemIdentificationGuidance(
  error: unknown
): ItemIdentificationGuidance | null {
  return error instanceof ItemIdentificationGuidanceError
    ? error.guidance
    : null;
}

export function formatItemIdentificationGuidance(
  guidance: ItemIdentificationGuidance
) {
  return [guidance.message, ...guidance.tips.map((tip) => `- ${tip}`)]
    .filter(Boolean)
    .join("\n\n");
}

export async function identifyItemWithAI(
  fileIds: string[],
  notes = "",
  diagnosticId?: string,
): Promise<KeepFlipIdentification> {
  if (!fileIds.length) {
    throw new Error("Upload at least one item photo before identifying it.");
  }

  const execution = await functions.createExecution({
    functionId: APPWRITE.itemAiFunctionId,
    body: JSON.stringify({
      fileIds,
      notes: buildIdentificationNotes(notes),
      ...(diagnosticId ? { diagnosticId } : {}),
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
      "KeepFlip received an unreadable response from the item identifier."
    );
  }

  if (payload.identification) {
    return normalizeIdentification(payload.identification);
  }

  const fallbackMessage =
    payload.error ||
    "KeepFlip could not get enough visual evidence from this photo.";

  const isOperationalFailure =
    /sign in|signed in|permission|unauthor|unsupported|too large|provide at least|retrieve|unreadable|valid json|environment variable|function key|use post/i.test(
      fallbackMessage
    );

  const isPhotoReadFailure =
    /could not identify|identification failed|no identification|visual evidence|photo|image is unclear|too dark|glare|blur|insufficient evidence|unclear/i.test(
      fallbackMessage
    );

  if (
    execution.responseStatusCode >= 400 &&
    (!isPhotoReadFailure || isOperationalFailure)
  ) {
    throw new Error(fallbackMessage);
  }

  if (!payload.ok || isPhotoReadFailure) {
    throw new ItemIdentificationGuidanceError(
      buildPhotoGuidance(payload, fallbackMessage)
    );
  }

  throw new ItemIdentificationGuidanceError(
    buildPhotoGuidance(payload, fallbackMessage)
  );
}
