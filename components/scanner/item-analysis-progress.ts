import type {
  AnalysisCallout,
  AnalysisStep,
  ItemAnalysisState,
} from "@/components/scanner/analysis-visual-types";
import { ItemAnalysisError } from "@/services/item-analysis-service";
import type {
  ItemAnalysisStage,
  ItemIdentificationSnapshot,
} from "@/types/item-analysis";
import type { ScanProofAssessment } from "@/services/scan-proof-service";

export type AnalysisProgressContext = {
  localDetection?: {
    label: string;
    score: number;
  };
  modeLabel: string;
  partialResult?: ItemIdentificationSnapshot;
  photoCount: number;
  scanProof?: ScanProofAssessment;
};

const STAGES: Record<
  ItemAnalysisStage,
  { detail: string; progress: number; stage: string }
> = {
  authenticating: {
    detail: "Opening a private valuation session for this scan.",
    progress: 0.1,
    stage: "Securing valuation channel",
  },
  uploading: {
    detail: "Registering every view as sale and condition evidence.",
    progress: 0.3,
    stage: "Preparing market evidence",
  },
  analyzing: {
    detail: "Extracting condition, material, demand, and exact-match price drivers.",
    progress: 0.62,
    stage: "Reading value drivers",
  },
  researching_comps: {
    detail: "Comparing the strongest item signals with current private-sale evidence.",
    progress: 0.86,
    stage: "Calibrating resale range",
  },
  cleaning: {
    detail: "Locking the median valuation and generating profit-maximizing actions.",
    progress: 0.97,
    stage: "Building the profit plan",
  },
};

const STEP_LABELS = [
  "Secure the scan evidence",
  "Extract value drivers and condition",
  "Build the strongest market match",
  "Calibrate low, median, and high value",
  "Generate profit-maximizing actions",
] as const;

const STAGE_INDEX: Record<ItemAnalysisStage, number> = {
  authenticating: 0,
  uploading: 0,
  analyzing: 1,
  researching_comps: 3,
  cleaning: 4,
};

function compact(value: string, maxLength = 52) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildCallouts(
  stage: ItemAnalysisStage,
  context: AnalysisProgressContext,
): AnalysisCallout[] {
  const result = context.partialResult;
  const callouts: AnalysisCallout[] = [];
  const scanProof = context.scanProof;

  if (!result && scanProof && scanProof.source !== "none") {
    const proof = scanProof;
    callouts.push({
      accent: proof.source === "camera" ? "violet" : "cyan",
      id: "local-proof",
      label:
        proof.source === "camera"
          ? "ON-DEVICE CATEGORY"
          : "ON-DEVICE EVIDENCE",
      value: compact(proof.evidenceDetail.toUpperCase(), 44),
    });
    callouts.push({
      accent: "gold",
      id: "evidence-fusion",
      label: "EVIDENCE FUSION",
      value: compact(proof.processingDetail.toUpperCase(), 46),
    });
  }

  if (result) {
    const { condition, identification, valuationSignals } = result.analysis;
    const matchKey = [identification.brand, identification.model]
      .filter(Boolean)
      .join(" ");

    if (matchKey) {
      callouts.push({
        accent: "cyan",
        id: "market-match-key",
        label: "MARKET MATCH KEY",
        value: compact(matchKey, 42),
      });
    }

    if (condition.grade !== "unknown") {
      callouts.push({
        accent: "gold",
        id: "condition-impact",
        label: "CONDITION IMPACT",
        value: titleCase(condition.grade),
      });
    }

    const materialSignal = result.analysis.evidence.find((item) =>
      /material|construction|fabric|leather|metal|wood/i.test(
        `${item.claim} ${item.value}`,
      ),
    );
    if (materialSignal) {
      callouts.push({
        accent: "violet",
        id: "material-signal",
        label: "MATERIAL SIGNAL",
        value: compact(materialSignal.value, 40),
      });
    }

    if (stage === "researching_comps") {
      const query = valuationSignals.searchTerms
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" / ");
      if (query) {
        callouts.unshift({
          accent: "violet",
          id: "market-search",
          label: "MARKET SEARCH",
          value: compact(query, 46),
        });
      }
    }
  }

  if (callouts.length === 0) {
    callouts.push(
      {
        accent: "cyan",
        id: "photo-evidence",
        label: "SALE EVIDENCE",
        value: `${context.photoCount} ${context.photoCount === 1 ? "VIEW" : "VIEWS"}`,
      },
      {
        accent: "violet",
        id: "scan-mode",
        label: "VALUATION MODE",
        value: compact(context.modeLabel.toUpperCase(), 34),
      },
    );
  }

  const stageCallout: AnalysisCallout =
    stage === "researching_comps"
      ? {
        accent: "gold",
        id: "range-calibration",
        label: "RANGE CALIBRATION",
        value: "LOW / MEDIAN / HIGH",
      }
      : stage === "cleaning"
        ? {
          accent: "gold",
          id: "profit-actions",
          label: "PROFIT ACTIONS",
          value: "PRICING / PROOF / LISTING",
        }
        : {
          accent: "cyan",
          id: "value-driver-scan",
          label: "VALUE DRIVER SCAN",
          value: "CONDITION / MATERIAL / DEMAND",
        };

  return [stageCallout, ...callouts]
    .filter(
      (callout, index, values) =>
        values.findIndex((candidate) => candidate.id === callout.id) === index,
    )
    .slice(0, 4);
}

export function analysisProgressState(
  stage: ItemAnalysisStage,
  context: AnalysisProgressContext,
): Extract<ItemAnalysisState, { status: "analyzing" }> {
  const activeIndex = STAGE_INDEX[stage];
  const steps: AnalysisStep[] = STEP_LABELS.map((label, index) => ({
    label,
    status:
      index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "active"
          : "pending",
  }));

  return {
    ...STAGES[stage],
    callouts: buildCallouts(stage, context),
    status: "analyzing",
    steps,
  };
}

export function analysisDiagnosticId(error: unknown) {
  if (!(error instanceof ItemAnalysisError)) return null;
  const details = error.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const value = (details as { diagnosticId?: unknown }).diagnosticId;
  return typeof value === "string" && value ? value : null;
}
