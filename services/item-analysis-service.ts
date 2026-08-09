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
import { getPrimaryScannerPhotoFileId } from "@/services/scan-photo-service";
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
  scanId: string;
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

function analysisResultFromSerpApi(
  market: SerpApiImageValuationResult,
  imageCount: number,
): ItemAnalysisSuccess {
  const displayIdentity = market.display.identity;
  const displayCondition = market.display.condition ?? market.condition;
  const displayName = market.display.title.replace(/\s+/g, " ").trim() || null;
  const identificationSummary =
    (market.display.summary ?? market.identificationSummary ?? displayName)
      ?.replace(/\s+/g, " ")
      .trim() || null;
  const itemType = itemTypeFromMarketIdentity(displayName);
  const conditionSummary = displayCondition?.summary?.replace(/\s+/g, " ").trim() || null;
  const identityConfidence = displayName
    ? confidenceFromLabel(
      displayIdentity.confidence ?? market.quality.confidence,
      displayIdentity.itemNameConfidencePercent ??
      displayIdentity.confidencePercent ??
      market.quality.confidencePercent,
    )
    : 0;
  const brandConfidence = displayIdentity.brand
    ? confidenceFromLabel(
      displayIdentity.confidence,
      displayIdentity.brandConfidencePercent,
    )
    : 0;
  const modelConfidence = displayIdentity.model
    ? confidenceFromLabel(
      displayIdentity.confidence,
      displayIdentity.modelConfidencePercent,
    )
    : 0;
  const conditionConfidence = displayCondition
    ? confidenceFromLabel(
      displayCondition.confidence,
      displayCondition.confidencePercent,
    )
    : 0;
  const status =
    market.identificationStatus === "needs_identification" || !displayName
      ? "insufficient_evidence"
      : "identified";
  const warnings = uniqueMarketText([
    ...market.quality.warnings,
    ...displayIdentity.candidateModels.map(
      (candidate) => `Possible model: ${candidate}`,
    ),
    imageCount > 1
      ? "KeepFlip AI Mode analyzed the first photo; the remaining photos were retained locally and were not sent to another analysis function."
      : null,
  ]);

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-serpapi-single-function`,
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
      identification: {
        itemType,
        category: displayIdentity.category,
        brand: displayIdentity.brand,
        model: displayIdentity.model,
        variant: displayIdentity.variant,
        color: null,
        era: null,
        serialNumber: null,
      },
      condition: {
        grade:
          displayCondition?.grade === "parts"
            ? "poor"
            : (displayCondition?.grade ?? "unknown"),
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
      evidence: evidenceFromSerpApiResult(market).slice(0, 30),
      ambiguities: warnings.slice(0, 15),
      suggestedPhotos: market.suggestedDetails.slice(0, 10),
      valuationSignals: {
        searchTerms: uniqueMarketText([
          [displayIdentity.brand, displayIdentity.model]
            .filter(Boolean)
            .join(" "),
          itemType,
        ]),
        category: displayIdentity.category,
        conditionAdjustment:
          conditionSummary ||
          "Only the visible condition returned by KeepFlip AI was used.",
        positiveFactors: market.factors,
        negativeFactors: warnings,
      },
    },
    vision: {
      enabled: true,
      succeeded: status === "identified" && Boolean(displayName),
      images: [
        {
          imageIndex: 0,
          text: null,
          labels: [],
          objects: [],
        },
      ],
      warnings,
    },
    valuation: valuationFromSerpApiResult(market),
    marketResearch: {
      provider: "keepflip_ai",
      status: "completed",
      query: market.query,
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
      identification: identificationSummary,
      condition: market.condition,
      factors: market.factors,
      profitabilityActions: market.profitabilityActions,
      refinementQuestions: market.refinementQuestions,
      marketVelocity: market.marketVelocity,
      flipComplexity: market.flipComplexity,
      flipDecision: market.flipDecision,
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

    for (const photoUri of input.photoUris.slice(0, 1)) {
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
    reportStage(options.onStage, "researching_comps");

    let market: SerpApiImageValuationResult;
    try {
      market = await runSerpApiImageValuation({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId: uploadedFileIds[0],
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
  scanId,
}: RefineItemAnalysisInput): Promise<ItemAnalysisSuccess> {
  const cleanOwnerId = ownerId.trim();
  const cleanScanId = scanId.trim();
  const context = refinementContext(answers);

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
  if (!context) {
    throw new ItemAnalysisError(
      "Answer at least one valuation question before recalculating.",
      "REFINEMENT_ANSWERS_REQUIRED",
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

      const fileId = await getPrimaryScannerPhotoFileId(
        cleanOwnerId,
        cleanScanId,
      );
      const market = await runSerpApiImageValuation({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId,
        refinementContext: context,
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
