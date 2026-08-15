import {
  inspectPhotoOnDevice,
  type LocalScanProofSignals,
} from "@/modules/keepflip-scan-proof/src";

export type { LocalScanProofSignals };

export type LocalScanDetection = {
  label: string;
  score: number;
};

export type ScanProofMode = "single" | "multi" | "upload" | "batch";

export type ScanProofEvidenceKind =
  | "barcode"
  | "model_text"
  | "readable_text"
  | "object_category"
  | "photo_set"
  | "none";

export type ScanProofAssessment = {
  evidenceDetail: string;
  evidenceKind: ScanProofEvidenceKind;
  headline: string;
  processingDetail: string;
  photoCount: number;
  source: "on_device" | "camera" | "photo_set" | "none";
};

const MODEL_LABEL_PATTERN =
  /\b(?:model|model\s*(?:no|number)|m\s*\/\s*n|sku|part\s*(?:no|number)?|p\s*\/\s*n|style|item\s*(?:no|number)?|ref(?:erence)?)\b/i;

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength);
}

function candidateLabel(value: string) {
  return compact(value.replace(/[_-]+/g, " "), 30) || "item";
}

function noSignals(): LocalScanProofSignals {
  return {
    availability: "unavailable",
    barcodes: [],
    text: "",
    textBlocks: [],
  };
}

export async function inspectLocalScanProofPhoto(photoUri: string) {
  return inspectPhotoOnDevice(photoUri);
}

export function mergeLocalScanProofSignals(
  signals: readonly (LocalScanProofSignals | undefined)[],
): LocalScanProofSignals {
  const present = signals.filter(
    (value): value is LocalScanProofSignals => value != null,
  );
  if (present.length === 0) return noSignals();

  const availability = present.some((value) => value.availability === "available")
    ? "available"
    : present.some((value) => value.availability === "failed")
      ? "failed"
      : "unavailable";
  const barcodes = [...new Set(present.flatMap((value) => value.barcodes))].slice(
    0,
    4,
  );
  const textBlocks = [
    ...new Set(present.flatMap((value) => value.textBlocks)),
  ].slice(0, 8);
  const text = compact(
    present
      .map((value) => value.text)
      .filter(Boolean)
      .join(" "),
    900,
  );

  return { availability, barcodes, text, textBlocks };
}

/**
 * Converts local signals into capture guidance. It deliberately treats every
 * local read as candidate evidence, never as a final item identification.
 */
export function buildScanProofAssessment({
  localDetection,
  mode,
  photoCount,
  signals,
}: {
  localDetection?: LocalScanDetection;
  mode: ScanProofMode;
  photoCount: number;
  signals?: LocalScanProofSignals;
}): ScanProofAssessment {
  const safePhotoCount = Math.max(0, photoCount);
  const localSignals = signals ?? noSignals();
  const text = [localSignals.text, ...localSignals.textBlocks]
    .filter(Boolean)
    .join(" ");

  if (localSignals.barcodes.length > 0) {
    return {
      evidenceDetail: "Barcode read on this device",
      evidenceKind: "barcode",
      headline: "Local item proof found",
      processingDetail:
        "Using barcode evidence to verify the strongest item match.",
      photoCount: safePhotoCount,
      source: "on_device",
    };
  }

  if (MODEL_LABEL_PATTERN.test(text)) {
    return {
      evidenceDetail: "Candidate model or part-label text found",
      evidenceKind: "model_text",
      headline: "Local item proof found",
      processingDetail:
        "Combining label text with visual evidence before valuation.",
      photoCount: safePhotoCount,
      source: "on_device",
    };
  }

  if (text.length >= 3) {
    return {
      evidenceDetail: "Readable item text found on this device",
      evidenceKind: "readable_text",
      headline: "Local item proof found",
      processingDetail:
        "Using readable text to strengthen the automatic match.",
      photoCount: safePhotoCount,
      source: "on_device",
    };
  }

  if (localDetection && localDetection.score >= 0.55) {
    return {
      evidenceDetail: `Potential ${candidateLabel(localDetection.label)} in view`,
      evidenceKind: "object_category",
      headline: "Local camera candidate",
      processingDetail:
        "Cross-checking the camera candidate against the captured scan.",
      photoCount: safePhotoCount,
      source: "camera",
    };
  }

  if (safePhotoCount > 1 || mode === "multi" || mode === "upload") {
    return {
      evidenceDetail: `${safePhotoCount || "Several"} item view${safePhotoCount === 1 ? "" : "s"} captured`,
      evidenceKind: "photo_set",
      headline: "Build stronger item proof",
      processingDetail:
        "Combining the captured views for the strongest automatic match.",
      photoCount: safePhotoCount,
      source: "photo_set",
    };
  }

  return {
    evidenceDetail: "No model or barcode proof captured yet",
    evidenceKind: "none",
    headline: "Start with item proof",
    processingDetail: "Running the visual analysis automatically.",
    photoCount: safePhotoCount,
    source: "none",
  };
}
