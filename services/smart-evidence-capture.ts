import type {
  LocalScanDetection,
  LocalScanProofSignals,
} from "@/services/scan-proof-service";

export type SmartEvidenceCategory =
  | "clothing"
  | "laptop"
  | "phone"
  | "camera"
  | "footwear"
  | "collectible"
  | "furniture"
  | "general";

export type SmartEvidenceCategorySource =
  | "manual"
  | "on_device_model"
  | "local_text"
  | "needs_evidence";

export type SmartEvidenceCaptureStep = {
  id: string;
  privacyNote?: string;
  prompt: string;
  title: string;
};

export type SmartEvidenceCapturePlan = {
  category: SmartEvidenceCategory;
  categoryLabel: string;
  confidence?: number;
  source: SmartEvidenceCategorySource;
  sourceDetail: string;
  steps: readonly SmartEvidenceCaptureStep[];
};

type SmartEvidenceCategoryDefinition = {
  label: string;
  steps: readonly SmartEvidenceCaptureStep[];
};

const categoryDefinitions: Record<
  SmartEvidenceCategory,
  SmartEvidenceCategoryDefinition
> = {
  clothing: {
    label: "Clothing",
    steps: [
      {
        id: "overall",
        title: "Full item",
        prompt: "Lay it flat or show it front-on in even light.",
      },
      {
        id: "brand-size-tag",
        title: "Brand + size tag",
        prompt: "Fill the frame with the brand, size, and care tag.",
      },
      {
        id: "condition",
        title: "Back + condition",
        prompt: "Show the back and any wear, stains, holes, or repairs.",
      },
    ],
  },
  laptop: {
    label: "Laptop",
    steps: [
      {
        id: "whole-device",
        title: "Whole device",
        prompt: "Show the lid, keyboard, and visible wear in one clear view.",
      },
      {
        id: "specs",
        title: "Specs screen",
        prompt: "Open About or System Information for model, RAM, and storage.",
        privacyNote: "Hide your name, email, serial number, and license keys.",
      },
      {
        id: "working-display",
        title: "Working display",
        prompt: "Show the screen powered on so condition and function are visible.",
        privacyNote: "Use a neutral screen with no personal accounts open.",
      },
      {
        id: "label-ports",
        title: "Model label + ports",
        prompt: "Capture the underside label, ports, charger, and any damage.",
        privacyNote: "Cover the full serial number before taking the photo.",
      },
    ],
  },
  phone: {
    label: "Phone",
    steps: [
      {
        id: "front-back",
        title: "Front + back",
        prompt: "Show the screen, back, camera area, and visible condition.",
      },
      {
        id: "device-info",
        title: "Device info",
        prompt: "Open Settings → About for model, storage, and carrier status.",
        privacyNote: "Do not capture your phone number, IMEI, or serial number.",
      },
      {
        id: "working-screen",
        title: "Working screen",
        prompt: "Show a powered-on neutral screen with no personal accounts open.",
      },
      {
        id: "ports-condition",
        title: "Ports + condition",
        prompt: "Show charging port, buttons, cameras, and any cracks or repairs.",
      },
    ],
  },
  camera: {
    label: "Camera",
    steps: [
      {
        id: "whole-camera",
        title: "Whole camera",
        prompt: "Show the front, body, lens, and included accessories.",
      },
      {
        id: "model-label",
        title: "Model label",
        prompt: "Capture the model name and lens markings close enough to read.",
      },
      {
        id: "working-screen",
        title: "Power + screen",
        prompt: "Show it powered on with a clean live-view or menu screen.",
      },
      {
        id: "condition-detail",
        title: "Lens + condition",
        prompt: "Show glass, mounts, battery door, and any wear or damage.",
      },
    ],
  },
  footwear: {
    label: "Shoes",
    steps: [
      {
        id: "pair-overall",
        title: "Pair overview",
        prompt: "Show both shoes together from the side in even light.",
      },
      {
        id: "size-style-tag",
        title: "Size + style tag",
        prompt: "Capture the inside size tag and the style or model code.",
      },
      {
        id: "soles-condition",
        title: "Soles + condition",
        prompt: "Show outsole wear, heels, toe boxes, and any flaws.",
      },
    ],
  },
  collectible: {
    label: "Collectible",
    steps: [
      {
        id: "full-piece",
        title: "Full piece",
        prompt: "Show the entire item against a simple, well-lit background.",
      },
      {
        id: "edition-mark",
        title: "Edition or maker mark",
        prompt: "Move close to signatures, dates, edition marks, or copyright text.",
      },
      {
        id: "condition-proof",
        title: "Condition proof",
        prompt: "Show corners, seams, packaging, and any chips, wear, or repairs.",
      },
    ],
  },
  furniture: {
    label: "Furniture",
    steps: [
      {
        id: "full-piece",
        title: "Full piece",
        prompt: "Step back and show the whole piece from its best angle.",
      },
      {
        id: "maker-label",
        title: "Maker label",
        prompt: "Capture any underside label, stamp, hardware, or maker mark.",
      },
      {
        id: "details-condition",
        title: "Details + condition",
        prompt: "Show upholstery, joints, surfaces, dimensions, and visible damage.",
      },
    ],
  },
  general: {
    label: "Item",
    steps: [
      {
        id: "overall",
        title: "Whole item",
        prompt: "Show the full item, front-on, in clear and even light.",
      },
      {
        id: "proof",
        title: "Best ID proof",
        prompt: "Move close to a maker label, model number, tag, or barcode.",
      },
      {
        id: "condition",
        title: "Condition detail",
        prompt: "Show working proof or any damage that affects resale value.",
      },
    ],
  },
};

export const SMART_EVIDENCE_CATEGORY_OPTIONS = [
  "clothing",
  "laptop",
  "phone",
  "camera",
  "footwear",
  "collectible",
  "furniture",
  "general",
] as const satisfies readonly SmartEvidenceCategory[];

export function smartEvidenceCategoryLabel(category: SmartEvidenceCategory) {
  return categoryDefinitions[category].label;
}

function normalizedEvidenceText(signals?: LocalScanProofSignals) {
  return [signals?.text, ...(signals?.textBlocks ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function categoryFromDetectionLabel(label: string) {
  const normalized = label.replace(/[_-]+/g, " ").toLowerCase();

  if (/\b(?:laptop|notebook|computer)\b/.test(normalized)) return "laptop";
  if (/\b(?:cell phone|mobile phone|smartphone|iphone)\b/.test(normalized)) {
    return "phone";
  }
  if (/\b(?:camera|camcorder)\b/.test(normalized)) return "camera";
  if (/\b(?:shoe|sneaker|boot|sandal)\b/.test(normalized)) return "footwear";
  if (/\b(?:chair|couch|sofa|table|desk|bed)\b/.test(normalized)) {
    return "furniture";
  }
  if (/\b(?:book|toy|doll|sports ball|clock|vase|figurine)\b/.test(normalized)) {
    return "collectible";
  }
  if (/\b(?:shirt|jacket|dress|skirt|pants|tie|handbag)\b/.test(normalized)) {
    return "clothing";
  }

  return null;
}

function categoryFromLocalText(text: string) {
  if (!text) return null;

  if (
    /\b(?:macbook|thinkpad|chromebook|laptop|notebook pc|ram|ssd|storage|system information|chrome os)\b/.test(
      text,
    )
  ) {
    return "laptop";
  }
  if (
    /\b(?:iphone|android|galaxy|pixel|smartphone|imei|carrier|sim)\b/.test(text)
  ) {
    return "phone";
  }
  if (
    /\b(?:canon|nikon|fujifilm|olympus|mirrorless|dslr|camcorder|lens)\b/.test(
      text,
    )
  ) {
    return "camera";
  }
  if (
    /\b(?:sneaker|shoe|boot|outsole|us men|us women|eu \d{2}|cm \d{2})\b/.test(
      text,
    )
  ) {
    return "footwear";
  }
  if (
    /\b(?:size|care instructions|machine wash|dry clean|cotton|polyester|viscose|made in|rn\s?\d+|wpl\s?\d+)\b/.test(
      text,
    )
  ) {
    return "clothing";
  }
  if (
    /\b(?:trading card|first edition|limited edition|vinyl|isbn|copyright|issue no|volume \d+)\b/.test(
      text,
    )
  ) {
    return "collectible";
  }

  return null;
}

export function getSmartEvidenceCapturePlan({
  categoryOverride,
  localDetection,
  signals,
}: {
  categoryOverride?: SmartEvidenceCategory;
  localDetection?: LocalScanDetection | null;
  signals?: LocalScanProofSignals;
}): SmartEvidenceCapturePlan {
  let category: SmartEvidenceCategory = "general";
  let source: SmartEvidenceCategorySource = "needs_evidence";
  let confidence: number | undefined;

  if (categoryOverride) {
    category = categoryOverride;
    source = "manual";
  } else {
    const textCategory = categoryFromLocalText(normalizedEvidenceText(signals));
    if (textCategory) {
      category = textCategory;
      source = "local_text";
    } else {
      const detectedCategory = localDetection?.label
        ? categoryFromDetectionLabel(localDetection.label)
        : null;
      const detectedScore = localDetection?.score ?? 0;
      if (detectedCategory && detectedScore >= 0.55) {
        category = detectedCategory;
        source = "on_device_model";
        confidence = Math.max(0, Math.min(1, detectedScore));
      }
    }
  }

  const definition = categoryDefinitions[category];
  const sourceDetail =
    source === "manual"
      ? "Your correction is guiding these evidence photos."
      : source === "local_text"
        ? "A tag or model clue was read on this device."
        : source === "on_device_model"
          ? `On-device visual cue${confidence ? ` · ${Math.round(confidence * 100)}%` : ""}`
          : "Scan a tag, label, barcode, or model number to tailor the next photos.";

  return {
    category,
    categoryLabel:
      source === "manual"
        ? definition.label
        : source === "needs_evidence"
          ? "Need a clearer item cue"
          : `Likely ${definition.label.toLowerCase()}`,
    confidence,
    source,
    sourceDetail,
    steps: definition.steps,
  };
}
