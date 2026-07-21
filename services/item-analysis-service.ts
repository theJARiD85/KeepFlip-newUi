import { File } from "expo-file-system";
import { Storage } from "react-native-appwrite";

import {
  APPWRITE,
  AppwriteSetupError,
  ID,
  Permission,
  Role,
  getAppwriteCoreServices,
} from "@/lib/appwrite";
import {
  getItemIdentificationGuidance,
  identifyItemWithAI,
  type ItemIdentificationGuidance,
  type KeepFlipIdentification,
} from "@/services/itemAiService";
import {
  runStrictEbaySoldComps,
  type EbaySoldComp,
  type EbaySoldCompsResult,
} from "@/services/ebaySoldCompsService";
import {
  ITEM_ANALYSIS_CONTRACT_VERSION,
  ITEM_ANALYSIS_VERSION,
  type AnalyzeItemPhotosInput,
  type AnalyzeItemPhotosOptions,
  type ItemAnalysisEvidenceStrength,
  type ItemAnalysisStage,
  type ItemAnalysisSuccess,
  type ItemSoldComparable,
  type ItemValuation,
} from "@/types/item-analysis";

export { AppwriteSetupError } from "@/lib/appwrite";
export type {
  AnalyzeItemPhotosInput,
  AnalyzeItemPhotosOptions,
  ItemAnalysisResult,
  ItemAnalysisStage,
  ItemAnalysisSuccess,
} from "@/types/item-analysis";

export const MAX_ANALYSIS_PHOTOS = 4;
const MAX_PHOTO_BYTES = 16 * 1024 * 1024;

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

function openPhoto(uri: string) {
  const file = new File(normalizePhotoUri(uri));

  if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
    throw new ItemAnalysisError(
      "One of the selected item photos is missing or empty.",
      "INVALID_PHOTO",
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new ItemAnalysisError(
      "One of the selected photos is larger than 16 MB.",
      "PHOTO_TOO_LARGE",
      { size: file.size, maximumBytes: MAX_PHOTO_BYTES },
    );
  }

  return file;
}

function confidence01(value: number) {
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function strengthFromConfidence(value: number): ItemAnalysisEvidenceStrength {
  const normalized = value > 1 ? value : value * 100;
  if (normalized >= 75) return "high";
  if (normalized >= 45) return "medium";
  return "low";
}

function percentile(values: number[], amount: number) {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  const position = (values.length - 1) * amount;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];

  const weight = position - lower;
  return values[lower] * (1 - weight) + values[upper] * weight;
}

function roundMoney(value: number | null) {
  return value == null
    ? null
    : Math.round((value + Number.EPSILON) * 100) / 100;
}

function toComparable(comp: EbaySoldComp): ItemSoldComparable {
  return {
    provider: "ebay",
    marketplace: "ebay",
    evidenceClass: "confirmed_transaction",
    title: comp.title,
    soldPrice: comp.soldPrice,
    shipping: comp.shipping,
    totalPrice: comp.totalPrice,
    currency: comp.currency,
    condition: comp.condition,
    soldDate: comp.soldDate,
    imageUrl: comp.imageUrl,
    listingUrl: comp.listingUrl,
    soldDateConfidence: comp.soldDate ? "exact" : "unknown",
    shippingSemantics: comp.shipping > 0 ? "separate" : "unknown",
  };
}

function valuationFromOldUiResult(result: EbaySoldCompsResult): ItemValuation {
  const prices = result.comps
    .map((comp) => comp.totalPrice)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (prices.length === 0) {
    return {
      status: "needs_comps",
      currency: null,
      suppliedCount: result.comps.length,
      usedCount: 0,
      rejectedCount: result.comps.length,
      median: null,
      p20: null,
      p80: null,
      methodology: "none",
      source: "ebay_sold",
    };
  }

  return {
    status: prices.length >= 3 ? "ready" : "limited_comps",
    currency: result.summary.currency || result.comps[0]?.currency || "USD",
    suppliedCount: result.comps.length,
    usedCount: prices.length,
    rejectedCount: Math.max(0, result.comps.length - prices.length),
    median: roundMoney(percentile(prices, 0.5)),
    p20: roundMoney(percentile(prices, 0.2)),
    p80: roundMoney(percentile(prices, 0.8)),
    methodology: "median_linear_p20_p80_mad_outlier_filter_v1",
    source: "ebay_sold",
  };
}

function identificationResult(
  identification: KeepFlipIdentification,
  imageCount: number,
): ItemAnalysisSuccess {
  const overall = confidence01(identification.confidence);
  const signals = identification.valuationSignals;
  const status =
    identification.identificationBasis === "insufficient_evidence"
      ? "insufficient_evidence"
      : "identified";

  const textEvidence = identification.detectedText.map((value) => ({
    claim: "visible_text",
    value,
    source: "photo_text" as const,
    imageIndex: null,
    strength: strengthFromConfidence(identification.confidence),
    rationale: "Read from the uploaded item photos by the proven old-UI item AI service.",
  }));

  const fieldEvidence = identification.evidenceFields
    .filter((field) => field.value.trim())
    .map((field) => ({
      claim: field.key || field.label,
      value: field.value,
      source: "photo_visual" as const,
      imageIndex: null,
      strength: strengthFromConfidence(field.confidence),
      rationale:
        field.reason ||
        "Derived from the uploaded item photos by the old-UI identification service.",
    }));

  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-old-ui-services`,
    status,
    input: {
      imageCount,
      source: "appwrite_storage",
    },
    analysis: {
      summary:
        identification.conditionNotes ||
        `${identification.title} identified from the uploaded item photos.`,
      identification: {
        itemType:
          signals.objectType ||
          (identification.title.toLowerCase() === "unclear item"
            ? null
            : identification.title),
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
        confidence:
          identification.condition === "unknown" ? 0 : Math.min(1, overall),
        notes: identification.conditionNotes
          ? [identification.conditionNotes]
          : signals.conditionSignals,
      },
      confidence: {
        overall,
        itemType:
          signals.objectType || identification.title ? overall : 0,
        brand: identification.brand ? overall : 0,
        model: identification.model ? overall : 0,
        condition:
          identification.condition === "unknown" ? 0 : overall,
      },
      evidence: [...textEvidence, ...fieldEvidence].slice(0, 30),
      ambiguities: signals.uncertainty,
      suggestedPhotos: identification.suggestedPhotos,
      valuationSignals: {
        searchTerms:
          signals.searchQueries.length > 0
            ? signals.searchQueries
            : [identification.productSearchQuery].filter(Boolean),
        category: signals.subcategory ?? identification.category,
        conditionAdjustment:
          identification.conditionNotes ||
          "The selected condition was used when filtering sold listings.",
        positiveFactors: signals.conditionSignals,
        negativeFactors: signals.uncertainty,
      },
    },
    vision: {
      enabled: true,
      succeeded: status === "identified",
      images: [
        {
          imageIndex: 0,
          text: identification.detectedText.join("\n") || null,
          labels: [],
          objects: [],
        },
      ],
      warnings:
        status === "identified"
          ? []
          : ["The old-UI item service requested clearer photo evidence."],
    },
    valuation: {
      status: "needs_comps",
      currency: null,
      suppliedCount: 0,
      usedCount: 0,
      rejectedCount: 0,
      median: null,
      p20: null,
      p80: null,
      methodology: "none",
      source: "none",
    },
  };
}

function guidanceResult(
  guidance: ItemIdentificationGuidance,
  imageCount: number,
): ItemAnalysisSuccess {
  return {
    ok: true,
    contractVersion: ITEM_ANALYSIS_CONTRACT_VERSION,
    version: `${ITEM_ANALYSIS_VERSION}-old-ui-guidance`,
    status: "insufficient_evidence",
    input: { imageCount, source: "appwrite_storage" },
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
        grade: "unknown",
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
        conditionAdjustment:
          "Condition cannot be assessed from the current photos.",
        positiveFactors: [],
        negativeFactors: [],
      },
    },
    vision: {
      enabled: true,
      succeeded: false,
      images: [],
      warnings: [guidance.message],
    },
    valuation: {
      status: "needs_comps",
      currency: null,
      suppliedCount: 0,
      usedCount: 0,
      rejectedCount: 0,
      median: null,
      p20: null,
      p80: null,
      methodology: "none",
      source: "none",
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

  if (!APPWRITE.itemAiFunctionId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_ITEM_AI_FUNCTION_ID before running old-UI analysis.",
      "ITEM_AI_FUNCTION_NOT_CONFIGURED",
    );
  }

  if (!APPWRITE.ebaySoldCompsFunctionId) {
    throw new ItemAnalysisError(
      "Add EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID before running old-UI valuation.",
      "EBAY_SOLD_COMPS_FUNCTION_NOT_CONFIGURED",
    );
  }

  reportStage(options.onStage, "authenticating");
  const { account, client } = getAppwriteCoreServices();
  const user = await account.get();
  throwIfAborted(options.signal);

  const storage = new Storage(client);
  const uploadedFileIds: string[] = [];
  let cleaned = false;

  try {
    reportStage(options.onStage, "uploading");

    for (const photoUri of input.photoUris) {
      throwIfAborted(options.signal);
      const photo = openPhoto(photoUri);
      const uploaded = await storage.createFile({
        bucketId: APPWRITE.itemImagesBucketId,
        fileId: ID.unique(),
        file: photo as any,
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

    let identification: KeepFlipIdentification;
    try {
      identification = await identifyItemWithAI(
        uploadedFileIds,
        input.userNotes?.trim() || "",
      );
    } catch (error) {
      const guidance = getItemIdentificationGuidance(error);

      reportStage(options.onStage, "cleaning");
      await deleteTemporaryFiles(
        storage,
        APPWRITE.itemImagesBucketId,
        uploadedFileIds,
      );
      cleaned = true;

      if (guidance) {
        return guidanceResult(guidance, input.photoUris.length);
      }

      throw new ItemAnalysisError(
        error instanceof Error
          ? error.message
          : "The old-UI item identifier could not analyze these photos.",
        "OLD_UI_IDENTIFICATION_FAILED",
        undefined,
        { cause: error },
      );
    }

    const identified = identificationResult(
      identification,
      input.photoUris.length,
    );

    reportStage(options.onStage, "cleaning");
    await deleteTemporaryFiles(
      storage,
      APPWRITE.itemImagesBucketId,
      uploadedFileIds,
    );
    cleaned = true;

    if (identified.status !== "identified") return identified;

    throwIfAborted(options.signal);
    reportStage(options.onStage, "researching_comps");

    try {
      const sold = await runStrictEbaySoldComps({
        title: identification.title,
        brand: identification.brand,
        model: identification.model,
        condition: identification.condition,
        conditionNotes: identification.conditionNotes,
        photoCount: input.photoUris.length,
        valuationSignals: identification.valuationSignals,
      });

      const comps = sold.comps.map(toComparable);
      return {
        ...identified,
        valuation: valuationFromOldUiResult(sold),
        marketResearch: {
          provider: "ebay",
          status: "completed",
          query: sold.query,
          searchedAt: sold.searchedAt,
          comparableCount: comps.length,
          comps,
          quality: sold.valuation,
        },
      };
    } catch (error) {
      return {
        ...identified,
        marketResearch: {
          provider: "ebay",
          status: "failed",
          query:
            identification.productSearchQuery ||
            [
              identification.brand,
              identification.model,
              identification.title,
            ]
              .filter(Boolean)
              .join(" "),
          searchedAt: null,
          comparableCount: 0,
          comps: [],
          error: {
            code: "OLD_UI_VALUATION_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "The old-UI eBay sold-comps service could not complete valuation.",
          },
        },
      };
    }
  } finally {
    if (!cleaned && uploadedFileIds.length > 0) {
      await deleteTemporaryFiles(
        storage,
        APPWRITE.itemImagesBucketId,
        uploadedFileIds,
      );
    }
  }
}
