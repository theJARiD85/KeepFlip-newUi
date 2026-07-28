import {
  type AnalysisStep,
  type ItemAnalysisState,
} from "@/components/scanner/item-analysis-overlay";
import {
  buildAnalysisThoughts,
  type AnalysisThoughtContext,
} from "@/components/scanner/scanner-thought-stream";
import { ItemAnalysisError } from "@/services/item-analysis-service";
import type { ItemAnalysisStage } from "@/types/item-analysis";

const ANALYSIS_STAGES: Record<
  ItemAnalysisStage,
  { detail: string; progress: number; stage: string }
> = {
  authenticating: {
    detail: "Verifying your signed-in Appwrite session for this scan.",
    progress: 0.12,
    stage: "Securing your session",
  },
  uploading: {
    detail: "Sending up to four item views through private temporary storage.",
    progress: 0.36,
    stage: "Uploading photo evidence",
  },
  analyzing: {
    detail:
      "Cross-checking visual details, text, condition, and identity signals.",
    progress: 0.7,
    stage: "Reading item evidence",
  },
  cleaning: {
    detail:
      "Removing the temporary cloud copies while preserving your local scan.",
    progress: 0.82,
    stage: "Protecting your photos",
  },
  researching_comps: {
    detail:
      "Searching completed marketplace sales that match the identified item.",
    progress: 0.94,
    stage: "Researching the sold market",
  },
};

const ANALYSIS_STEP_LABELS = [
  "Verify your signed-in session",
  "Upload private photo evidence",
  "Identify and evaluate the item",
  "Remove temporary cloud copies",
  "Research completed marketplace sales",
] as const;

export function analysisProgressState(
  stage: ItemAnalysisStage,
  context: Omit<AnalysisThoughtContext, "stage">,
): Extract<ItemAnalysisState, { status: "analyzing" }> {
  const stageIndex: Record<ItemAnalysisStage, number> = {
    authenticating: 0,
    uploading: 1,
    analyzing: 2,
    cleaning: 3,
    researching_comps: 4,
  };
  const activeIndex = stageIndex[stage];
  const steps: AnalysisStep[] = ANALYSIS_STEP_LABELS.map((label, index) => ({
    label,
    status:
      index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "active"
          : "pending",
  }));

  return {
    ...ANALYSIS_STAGES[stage],
    insights: buildAnalysisThoughts({
      ...context,
      stage,
    }),
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
