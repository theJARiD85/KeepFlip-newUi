import { File } from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat,
} from "expo-image-manipulator";
import { Storage } from "react-native-appwrite";

import {
  APPWRITE,
  ID,
  Permission,
  Role,
  getAppwriteCoreServices,
} from "@/lib/appwrite";
import {
  runSerpApiImageValuation,
  type SerpApiImageValuationResult,
} from "@/services/ebaySoldCompsService";
import {
  identifyItemWithAI,
  type KeepFlipIdentification,
} from "@/services/itemAiService";
import { getScannerPhotoFileId } from "@/services/scan-photo-service";
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  ITEM_ANALYSIS_VERSION,
  type AnalyzeItemPhotosInput,
  type AnalyzeItemPhotosOptions,
  type ItemAnalysisEvidenceStrength,
  type ItemAnalysisStage,
  type ItemAnalysisSuccess,
  type ItemIdentificationSnapshot,
  type ItemValuation,
} from "@/types/item-analysis";

export { AppwriteSetupError } from "@/lib/appwrite";
export type {
  AnalyzeItemPhotosInput,
  AnalyzeItemPhotosOptions,
  ItemAnalysisResult,
  ItemAnalysisStage,
  ItemAnalysisSuccess
} from "@/types/item-analysis";

export const MAX_ANALYSIS_PHOTOS = 4;
const MAX_SOURCE_PHOTO_BYTES = 64 * 1024 * 1024;
const MAX_CLOUD_PHOTO_BYTES = 16 * 1024 * 1024;
const MAX_REFINEMENT_CONTEXT_LENGTH = 600;
const MAX_SERPAPI_SUBSEQUENT_REQUEST_TOKEN_LENGTH = 24_000;
const refinementRequests = new Map<string, Promise<ItemAnalysisSuccess>>();

const CLOUD_PHOTO_PROFILES = Object.freeze({
  single: Object.freeze({ width: 2048, compress: 0.86 }),
  pair: Object.freeze({ width: 1800, compress: 0.82 }),
  multi: Object.freeze({ width: 1600, compress: 0.8 }),
});

export class ItemAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ItemAnalysisError";
  }
}

function reportStage(
  onStage: AnalyzeItemPhotosOptions["onStage"],
  stage: ItemAnalysisStage,
) {
  try {
    onStage?.(stage);
  } catch {
    // Presentation callbacks must never interrupt analysis.
  }
}

function reportPartialResult(
  onPartialResult: AnalyzeItemPhotosOptions["onPartialResult"],
  result: ItemIdentificationSnapshot,
) {
  try {
    onPartialResult?.({
      phase: "identification",
      result,
    });
  } catch {
    // Presentation callbacks must never interrupt analysis.
  }
}

function identificationSnapshot(
  result: ItemAnalysisSuccess,
): ItemIdentificationSnapshot {
  return {
    ok: result.ok,
    contractVersion: result.contractVersion,
    version: result.version,
    status: result.status,
    input: result.input,
    analysis: result.analysis,
    vision: result.vision,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Item analysis was canceled.");
  error.name = "AbortError";
  throw error;
}

function normalizePhotoUri(uri: string) {
  const trimmed = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `file://${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function openSourcePhoto(uri: string) {
  const file = new File(normalizePhotoUri(uri));

  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new ItemAnalysisError(
      "One of the selected item photos is missing or empty.",
      "INVALID_PHOTO",
    );
  }

  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      "One of the selected photos is larger than 64 MB.",
      "PHOTO_TOO_LARGE",
      { size: file.size, maximumBytes: MAX_SOURCE_PHOTO_BYTES },
    );
  }

  return file;
}

function openCloudPhoto(uri: string) {
  const file = new File(normalizePhotoUri(uri));

  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new ItemAnalysisError(
      "KeepFlip could not prepare one of the photos for AI analysis.",
      "CLOUD_PHOTO_PREPARATION_FAILED",
    );
  }

  if (file.size > MAX_CLOUD_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      "A prepared AI photo is larger than 16 MB.",
      "CLOUD_PHOTO_TOO_LARGE",
      { size: file.size, maximumBytes: MAX_CLOUD_PHOTO_BYTES },
    );
  }

  return file;
}

function cloudPhotoProfile(photoCount: number) {
  if (photoCount <= 1) return CLOUD_PHOTO_PROFILES.single;
  if (photoCount === 2) return CLOUD_PHOTO_PROFILES.pair;
  return CLOUD_PHOTO_PROFILES.multi;
}

function deletePreparedCloudPhoto(uri: string) {
  try {
    const file = new File(normalizePhotoUri(uri));
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never replace the useful analysis result or error.
  }
}

async function preparePhotoForCloudAnalysis(
  sourceUri: string,
  photoCount: number,
) {
  const source = openSourcePhoto(sourceUri);
  const profile = cloudPhotoProfile(photoCount);
  const context = ImageManipulator.manipulate(source.uri);
  let preparedUri: string | null = null;

  try {
    context.resize({ width: profile.width });
    const image = await context.renderAsync();

    try {
      const result = await image.saveAsync({
        compress: profile.compress,
        format: SaveFormat.JPEG,
      });
      preparedUri = result.uri;
      return {
        file: openCloudPhoto(result.uri),
        uri: result.uri,
      };
    } finally {
      image.release();
    }
  } catch (error) {
    if (preparedUri) deletePreparedCloudPhoto(preparedUri);
    if (error instanceof ItemAnalysisError) throw error;

    throw new ItemAnalysisError(
      "KeepFlip could not prepare one of the photos for AI analysis.",
      "CLOUD_PHOTO_PREPARATION_FAILED",
      undefined,
      { cause: error },
    );
  } finally {
    context.release();
  }
}

function confidenceFromLabel(
  value: "high" | "medium" | "low",
  confidencePercent?: number | null,
) {
  if (
    typeof confidencePercent === "number" &&
    Number.isFinite(confidencePercent)
  ) {
    return Math.max(0, Math.min(1, confidencePercent / 100));
  }
  if (value === "high") return 0.85;
  if (value === "medium") return 0.65;
  return 0.35;
}

export type RefineItemAnalysisInput = {
  answers: {
    answer: string;
    question: string;
  }[];
  imageCount?: number;
  ownerId: string;
  photoFileId?: string | null;
  scanId: string;
  subsequentRequestToken?: string | null;
};

function refinementContext(
  answers: RefineItemAnalysisInput["answers"],
) {
  if (!Array.isArray(answers)) return "";

  const context = answers
    .slice(0, 10)
    .map(({ answer, question }) => ({
      answer: String(answer ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
      question: String(question ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
    }))
    .filter(({ answer, question }) => answer && question)
    .map(({ answer, question }) => `${question}: ${answer}`)
    .join("\n");

  return context.slice(0, MAX_REFINEMENT_CONTEXT_LENGTH).trim();
}

function strengthFromLabel(
  value: "high" | "medium" | "low",
): ItemAnalysisEvidenceStrength {
  return value;
}

function valuationFromSerpApiResult(
  result: SerpApiImageValuationResult,
): ItemValuation {
  return {
    ...result.valuation,
  };
}

function uniqueMarketText(values: (string | null | undefined)[]) {
  const seen = new Set<string>();

  return values.filter((value): value is string => {
    const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceFromSerpApiResult(
  result: SerpApiImageValuationResult,
): ItemAnalysisSuccess["analysis"]["evidence"] {
  const strength = strengthFromLabel(result.quality.confidence);
  const identityStrength = strengthFromLabel(
    result.identity?.confidence ?? result.quality.confidence,
  );
  const identificationDetail =
    result.identity?.summary ??
    result.identificationSummary ??
    result.identification;
  const identification = identificationDetail
    ? [
      {
        claim: "visual_market_identification",
        value: identificationDetail,
        source: "web_market" as const,
        imageIndex: null,
        strength: identityStrength,
        rationale:
          "KeepFlip AI identified product details from the same item photo; the concise inventory name is stored separately from this supporting explanation.",
      },
    ]
    : [];
  const condition = result.condition?.summary
    ? [
      {
        claim: "visual_market_condition",
        value: result.condition.summary,
        source: "web_market" as const,
        imageIndex: null,
        strength:
          strengthFromLabel(result.condition.confidence),
        rationale:
          "KeepFlip AI assessed the visible condition from the item photo during the single analysis request.",
      },
    ]
    : [];
  const normalizedIdentification = identificationDetail
    ?.replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const factors = uniqueMarketText(result.factors)
    .filter(
      (factor) =>
        factor.replace(/\s+/g, " ").trim().toLowerCase() !==
        normalizedIdentification,
    )
    .map((factor) => ({
      claim: "market_value_factor",
      value: factor,
      source: "web_market" as const,
      imageIndex: null,
      strength,
      rationale:
        "A value factor returned with the visual market estimate; conditional language is preserved.",
    }));
  const estimates = result.estimates.map((estimate) => ({
    claim: `${estimate.type}_estimate`,
    value: estimate.note,
    source: "web_market" as const,
    imageIndex: null,
    strength,
    rationale:
      estimate.type === "private_sale"
        ? "The private-sale band drives KeepFlip's displayed valuation range."
        : "This supporting band is retained separately from the private-sale estimate.",
  }));
  const references = result.references.map((reference) => ({
    claim: "market_reference",
    value: [reference.source, reference.title].filter(Boolean).join(": "),
    source: "web_market" as const,
    imageIndex: null,
    strength,
    rationale: reference.link,
  }));

  return [
    ...identification,
    ...condition,
    ...estimates,
    ...factors,
    ...references,
  ];
}

function itemTypeFromMarketIdentity(value: string | null) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!cleaned) return null;

  return (
    cleaned
      .split(/\s+\((?:specifically|likely|possibly)\b/i)[0]
      .replace(/[.:]\s*$/, "")
      .slice(0, 160) || null
  );
}

function meaningfulIdentificationTitle(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!cleaned || /^(?:unclear|unknown|unidentified) item$/i.test(cleaned)) {
    return null;
  }

  return cleaned.slice(0, 160);
}

function isStrongMultiPhotoIdentification(
  value: KeepFlipIdentification | null | undefined,
): value is KeepFlipIdentification {
  if (
    !value ||
    value.identificationBasis === "insufficient_evidence" ||
    value.confidence < 0.55
  ) {
    return false;
  }

  return Boolean(
    value.model?.trim() ||
      (value.brand?.trim() && meaningfulIdentificationTitle(value.title)),
  );
}

function strengthFromScore(value: number): ItemAnalysisEvidenceStrength {
  if (value >= 0.75) return "high";
  if (value >= 0.5) return "medium";
  return "low";
}

function evidenceFromMultiPhotoIdentification(
  identification: KeepFlipIdentification | null,
): ItemAnalysisSuccess["analysis"]["evidence"] {
  if (!identification) return [];

  const seen = new Set<string>();

  return identification.identityEvidence
    .map((entry) => {
      const value = entry.value.replace(/\s+/g, " ").trim();
      const key = `${entry.field}:${value.toLowerCase()}`;
      if (!value || seen.has(key)) return null;
      seen.add(key);

      return {
        claim: `multi_photo_${entry.field}`,
        value,
        source:
          entry.source === "photo_text" ? "photo_text" : "photo_visual",
        imageIndex: entry.imageIndex,
        strength: strengthFromScore(entry.confidence),
        rationale: `Automatic multi-photo identification: ${entry.explanation}`,
      };
    })
    .filter(
      (
        entry,
      ): entry is ItemAnalysisSuccess["analysis"]["evidence"][number] =>
        entry != null,
    )
    .slice(0, 12);
}

function marketIdentityContext(
  identification: KeepFlipIdentification | null,
) {
  if (!isStrongMultiPhotoIdentification(identification)) return "";

  return uniqueMarketText([
    identification.productSearchQuery,
    [identification.brand, identification.model].filter(Boolean).join(" "),
    meaningfulIdentificationTitle(identification.title),
    identification.category ? `Category: ${identification.category}` : null,
    identification.condition !== "unknown"
      ? `Visible condition: ${identification.condition.replace(/_/g, " ")}`
      : null,
  ])
    .join(". ")
    .slice(0, MAX_REFINEMENT_CONTEXT_LENGTH)
    .trim();
}

function analysisResultFromSerpApi(
  market: SerpApiImageValuationResult,
  imageCount: number,
  multiPhotoIdentification: KeepFlipIdentification | null = null,
  multiPhotoPassCompleted = false,
): ItemAnalysisSuccess {
  const displayIdentity = market.display.identity;
  const displayCondition = market.display.condition ?? market.condition;
  const marketDisplayName =
    market.display.title.replace(/\s+/g, " ").trim() || null;
  const fusedIdentification = isStrongMultiPhotoIdentification(
    multiPhotoIdentification,
  )
    ? multiPhotoIdentification
    : null;
  const fusedTitle =
    marketDisplayName ??
    meaningfulIdentificationTitle(fusedIdentification?.title);
  const identificationSummary =
    (market.display.summary ?? market.identificationSummary ?? fusedTitle)
      ?.replace(/\s+/g, " ")
      .trim() || null;
  const itemType =
    itemTypeFromMarketIdentity(marketDisplayName) ??
    meaningfulIdentificationTitle(fusedIdentification?.title);
  const marketConditionSummary =
    displayCondition?.summary?.replace(/\s+/g, " ").trim() || null;
  const conditionSummary =
    marketConditionSummary || fusedIdentification?.conditionNotes || null;
  const marketIdentityConfidence = marketDisplayName
    ? confidenceFromLabel(
      displayIdentity.confidence ?? market.quality.confidence,
      displayIdentity.itemNameConfidencePercent ??
      displayIdentity.confidencePercent ??
      market.quality.confidencePercent,
    )
    : 0;
  const identityConfidence = Math.max(
    marketIdentityConfidence,
    fusedIdentification?.confidence ?? 0,
  );
  const marketBrandConfidence = displayIdentity.brand
    ? confidenceFromLabel(
      displayIdentity.confidence,
      displayIdentity.brandConfidencePercent,
    )
    : 0;
  const brandConfidence = Math.max(
    marketBrandConfidence,
    fusedIdentification?.confidenceBreakdown.brand ?? 0,
  );
  const marketModelConfidence = displayIdentity.model
    ? confidenceFromLabel(
      displayIdentity.confidence,
      displayIdentity.modelConfidencePercent,
    )
    : 0;
  const modelConfidence = Math.max(
    marketModelConfidence,
    fusedIdentification?.confidenceBreakdown.model ?? 0,
  );
  const marketConditionConfidence = displayCondition
    ? confidenceFromLabel(
      displayCondition.confidence,
      displayCondition.confidencePercent,
    )
    : 0;
  const conditionConfidence = Math.max(
    marketConditionConfidence,
    fusedIdentification?.confidenceBreakdown.condition ?? 0,
  );
  const fallbackCondition = fusedIdentification?.condition ?? "unknown";
  const conditionGrade = displayCondition?.grade === "parts"
    ? "poor"
    : (displayCondition?.grade ?? fallbackCondition);
  const status =
    (market.identificationStatus === "needs_identification" &&
      !fusedIdentification) ||
    !fusedTitle
      ? "insufficient_evidence"
      : "identified";
  const warnings = uniqueMarketText([
    ...market.quality.warnings,
    ...displayIdentity.candidateModels.map(
      (candidate) => `Possible model: ${candidate}`,
    ),
    multiPhotoPassCompleted && imageCount > 1
      ? `KeepFlip combined ${imageCount} captured views before market research.`
      : imageCount > 1
        ? "KeepFlip's multi-photo identifier was unavailable, so the market estimate used the primary view."
        : null,
    fusedIdentification
      ? "A separate multi-photo visual pass supplied candidate identity evidence that was cross-checked for market research."
      : null,
  ]);
  const automaticEvidence = evidenceFromMultiPhotoIdentification(
    fusedIdentification,
  );
  const analyzedImageCount = multiPhotoPassCompleted ? imageCount : 1;

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-${
      multiPhotoPassCompleted ? "evidence-fusion" : "serpapi-single-function"
    }`,
    status,
    input: {
      imageCount,
      source: "appwrite_storage",
    },
    analysis: {
      summary:
        uniqueMarketText([identificationSummary, conditionSummary]).join(" ") ||
        (market.valuation.status === "ready"
          ? "KeepFlip AI returned a valuation but could not establish a usable item identity."
          : "KeepFlip AI needs more identifying evidence before it can provide a defensible resale range."),
      displayTitles: market.display.fieldTitles,
      identification: {
        itemType,
        category: displayIdentity.category ?? fusedIdentification?.category ?? null,
        brand: displayIdentity.brand ?? fusedIdentification?.brand ?? null,
        model: displayIdentity.model ?? fusedIdentification?.model ?? null,
        variant: displayIdentity.variant,
        color: null,
        era: null,
        serialNumber: null,
      },
      condition: {
        grade: conditionGrade,
        confidence: conditionConfidence,
        notes: conditionSummary ? [conditionSummary] : [],
      },
      confidence: {
        overall: identityConfidence,
        itemType: identityConfidence,
        brand: brandConfidence,
        model: modelConfidence,
        condition: conditionConfidence,
        valuation: confidenceFromLabel(
          market.display.valuation.confidence,
          market.display.valuation.confidencePercent,
        ),
      },
      evidence: [
        ...automaticEvidence,
        ...evidenceFromSerpApiResult(market),
      ].slice(0, 30),
      ambiguities: warnings.slice(0, 15),
      suggestedPhotos: market.suggestedDetails.slice(0, 10),
      valuationSignals: {
        searchTerms: uniqueMarketText([
          fusedIdentification?.productSearchQuery,
          meaningfulIdentificationTitle(fusedIdentification?.title),
          [displayIdentity.brand, displayIdentity.model]
            .filter(Boolean)
            .join(" "),
          itemType,
        ]),
        category: displayIdentity.category ?? fusedIdentification?.category ?? null,
        conditionAdjustment:
          conditionSummary ||
          (multiPhotoPassCompleted
            ? "KeepFlip combined visible condition evidence across the captured views."
            : "Only the visible condition returned by KeepFlip AI was used."),
        positiveFactors: market.factors,
        negativeFactors: warnings,
      },
    },
    vision: {
      enabled: true,
      succeeded:
        multiPhotoPassCompleted ||
        (status === "identified" && Boolean(marketDisplayName)),
      images: Array.from({ length: analyzedImageCount }, (_, imageIndex) => ({
        imageIndex,
          text: null,
          labels: [],
          objects: [],
      })),
      warnings,
    },
    valuation: valuationFromSerpApiResult(market),
    marketResearch: {
      provider: "keepflip_ai",
      status: "completed",
      // The full research prompt is internal operational context, never a
      // customer-facing valuation fact.
      query: null,
      searchedAt: market.searchedAt,
      comparableCount: 0,
      comps: [],
      signals: market.estimates.map((estimate) => ({
        provider: "keepflip_ai",
        evidenceClass: "inferred_sale",
        type: estimate.type,
        label: estimate.label,
        currency: estimate.currency,
        value: estimate.median,
        low: estimate.low,
        median: estimate.median,
        high: estimate.high,
        sampleSize: null,
        observedAt: market.searchedAt,
        sourceUrl: null,
        note: estimate.note,
        confidencePercent: estimate.confidencePercent,
      })),
      references: market.references,
      aiModeConversation: market.aiModeConversation,
      identification: identificationSummary,
      condition: market.condition,
      factors: market.factors,
      profitabilityActions: market.profitabilityActions,
      refinementQuestions: market.refinementQuestions,
      valuationLadder: market.valuationLadder,
      acquisitionGuidance: market.acquisitionGuidance,
      marketVelocity: market.marketVelocity,
      flipComplexity: market.flipComplexity,
      flipDecision: market.flipDecision,
      decisionCard: market.decisionCard,
      suggestedDetails: market.suggestedDetails,
      answerMarkdown: market.reconstructedMarkdown,
      normalization: market.normalization,
      quality: market.quality,
    },
  };
}

async function deleteTemporaryFiles(
  storage: Storage,
  bucketId: string,
  fileIds: string[],
) {
  await Promise.allSettled(
    fileIds.map((fileId) =>
      storage.deleteFile({
        bucketId,
        fileId,
      }),
    ),
  );
}

function validateInput(input: AnalyzeItemPhotosInput) {
  if (
    !Array.isArray(input.photoUris) ||
    input.photoUris.length < 1 ||
    input.photoUris.length > MAX_ANALYSIS_PHOTOS
  ) {
    throw new ItemAnalysisError(
      `Choose between 1 and ${MAX_ANALYSIS_PHOTOS} item photos.`,
      "INVALID_PHOTO_COUNT",
    );
  }

  if (input.photoUris.some((uri) => typeof uri !== "string" || !uri.trim())) {
    throw new ItemAnalysisError(
      "Every item photo needs a valid local URI.",
      "INVALID_PHOTO_URI",
    );
  }
}

export async function analyzeItemPhotos(
  input: AnalyzeItemPhotosInput,
  options: AnalyzeItemPhotosOptions = {},
): Promise<ItemAnalysisSuccess> {
  validateInput(input);
  throwIfAborted(options.signal);

  if (!APPWRITE.itemImagesBucketId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID before running old-UI analysis.",
      "ITEM_IMAGES_BUCKET_NOT_CONFIGURED",
    );
  }

  if (!APPWRITE.marketResearchFunctionId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID before running old-UI valuation.",
      "MARKET_COMPS_FUNCTION_NOT_CONFIGURED",
    );
  }

  reportStage(options.onStage, "authenticating");
  const { account, client } = getAppwriteCoreServices();
  const user = await account.get();
  throwIfAborted(options.signal);

  const storage = new Storage(client);
  const uploadedFileIds: string[] = [];
  const preparedCloudPhotoUris: string[] = [];
  let cleaned = false;

  try {
    reportStage(options.onStage, "uploading");

    for (const photoUri of input.photoUris) {
      throwIfAborted(options.signal);
      /*
       * saveScannerPhoto owns the durable, full-resolution inventory image.
       * This cache JPEG is a separate working copy used only by cloud AI.
       */
      const prepared = await preparePhotoForCloudAnalysis(
        photoUri,
        input.photoUris.length,
      );
      preparedCloudPhotoUris.push(prepared.uri);
      const uploaded = await storage.createFile({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId: ID.unique(),
        file: prepared.file as any,
        permissions: [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      });
      uploadedFileIds.push(uploaded.$id);
    }

    throwIfAborted(options.signal);
    reportStage(options.onStage, "analyzing");

    let multiPhotoIdentification: KeepFlipIdentification | null = null;
    let multiPhotoPassCompleted = false;

    if (APPWRITE.itemAiFunctionId) {
      try {
        /*
         * This pass receives every selected view. It is deliberately optional:
         * a temporarily unavailable identifier must not turn a usable market
         * estimate into a hard failure.
         */
        multiPhotoIdentification = await identifyItemWithAI(uploadedFileIds);
        multiPhotoPassCompleted = true;
      } catch {
        console.warn(
          "[KeepFlip] The multi-photo identifier was unavailable; continuing with market visual analysis.",
        );
      }
    }

    throwIfAborted(options.signal);
    reportStage(options.onStage, "researching_comps");

    let market: SerpApiImageValuationResult;
    try {
      market = await runSerpApiImageValuation({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId: uploadedFileIds[0],
        identityContext: marketIdentityContext(multiPhotoIdentification),
      });
    } catch (error) {
      throw new ItemAnalysisError(
        error instanceof Error
          ? error.message
          : "KeepFlip AI could not complete item analysis.",
        "ITEM_ANALYSIS_FAILED",
        undefined,
        { cause: error },
      );
    }

    const completedResult = analysisResultFromSerpApi(
      market,
      input.photoUris.length,
      multiPhotoIdentification,
      multiPhotoPassCompleted,
    );
    throwIfAborted(options.signal);
    reportPartialResult(
      options.onPartialResult,
      identificationSnapshot(completedResult),
    );

    reportStage(options.onStage, "cleaning");
    await deleteTemporaryFiles(
      storage,
      APPWRITE.itemImagesBucketId,
      uploadedFileIds,
    );
    cleaned = true;

    return completedResult;
  } finally {
    if (!cleaned && uploadedFileIds.length > 0) {
      await deleteTemporaryFiles(
        storage,
        APPWRITE.itemImagesBucketId,
        uploadedFileIds,
      );
    }

    for (const uri of preparedCloudPhotoUris) {
      deletePreparedCloudPhoto(uri);
    }
  }
}

export async function refineItemAnalysis({
  answers,
  imageCount = 1,
  ownerId,
  photoFileId,
  scanId,
  subsequentRequestToken: suppliedSubsequentRequestToken,
}: RefineItemAnalysisInput): Promise<ItemAnalysisSuccess> {
  const cleanOwnerId = ownerId.trim();
  const cleanScanId = scanId.trim();
  const cleanPhotoFileId = photoFileId?.trim() || null;
  const context = refinementContext(answers);
  const subsequentRequestToken =
    typeof suppliedSubsequentRequestToken === "string"
      ? suppliedSubsequentRequestToken.trim()
      : "";

  if (!cleanOwnerId) {
    throw new ItemAnalysisError(
      "Sign in before refining a valuation.",
      "AUTH_REQUIRED",
    );
  }
  if (!cleanScanId) {
    throw new ItemAnalysisError(
      "The scanner session ID is missing.",
      "SCAN_ID_REQUIRED",
    );
  }
  if (!context && !cleanPhotoFileId) {
    throw new ItemAnalysisError(
      "Answer a valuation question or add a clear detail photo before recalculating.",
      "REFINEMENT_ANSWERS_REQUIRED",
    );
  }
  if (
    subsequentRequestToken.length >
    MAX_SERPAPI_SUBSEQUENT_REQUEST_TOKEN_LENGTH
  ) {
    throw new ItemAnalysisError(
      "KeepFlip could not continue the previous Google AI Mode valuation. Start a new item valuation.",
      "AI_MODE_CONVERSATION_INVALID",
    );
  }
  if (!APPWRITE.itemImagesBucketId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_ITEM_IMAGES_BUCKET_ID before refining valuation.",
      "ITEM_IMAGES_BUCKET_NOT_CONFIGURED",
    );
  }
  if (!APPWRITE.marketResearchFunctionId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID before refining valuation.",
      "MARKET_COMPS_FUNCTION_NOT_CONFIGURED",
    );
  }

  const normalizedImageCount = Math.max(
    1,
    Math.min(MAX_ANALYSIS_PHOTOS, Math.floor(imageCount) || 1),
  );
  const requestKey = JSON.stringify([
    cleanOwnerId,
    cleanScanId,
    context,
    normalizedImageCount,
    cleanPhotoFileId,
    subsequentRequestToken,
  ]);
  const activeRequest = refinementRequests.get(requestKey);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    try {
      const { account } = getAppwriteCoreServices();
      const user = await account.get();
      if (user.$id !== cleanOwnerId) {
        throw new ItemAnalysisError(
          "The signed-in user does not own this scan.",
          "SCAN_OWNER_MISMATCH",
        );
      }

      const fileId = await getScannerPhotoFileId(
        cleanOwnerId,
        cleanScanId,
        cleanPhotoFileId,
      );
      const market = await runSerpApiImageValuation({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId,
        ...(context ? { refinementContext: context } : {}),
        ...(subsequentRequestToken ? { subsequentRequestToken } : {}),
        ...(cleanPhotoFileId ? { hasRefinementImage: true } : {}),
      });
      return analysisResultFromSerpApi(market, normalizedImageCount);
    } catch (error) {
      if (error instanceof ItemAnalysisError) throw error;
      throw new ItemAnalysisError(
        error instanceof Error
          ? error.message
          : "KeepFlip could not refine this valuation.",
        "ITEM_ANALYSIS_REFINEMENT_FAILED",
        undefined,
        { cause: error },
      );
    }
  })();

  refinementRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (refinementRequests.get(requestKey) === request) {
      refinementRequests.delete(requestKey);
    }
  }
}
