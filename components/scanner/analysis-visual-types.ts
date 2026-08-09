export type AnalysisCallout = {
  accent: "cyan" | "gold" | "violet";
  id: string;
  label: string;
  value: string;
};

export type AnalysisSuggestedPhoto = {
  description?: string;
  id?: string;
  label: string;
  priority?: "required" | "recommended";
};

export type AnalysisEvidence = {
  confidence?: number;
  id?: string;
  label: string;
  source?: string;
  value: string;
};

export type AnalysisIdentity = {
  brand?: string;
  category?: string;
  confidence?: number;
  model?: string;
  title: string;
  variant?: string;
};

export type AnalysisCondition = {
  details?: string[];
  label: string;
  score?: number;
  summary?: string;
};

export type AnalysisConfidenceBreakdown = {
  brand?: number;
  condition?: number;
  identity?: number;
  itemType?: number;
  model?: number;
  overall: number;
  valuation?: number;
};

export type AnalysisMarketReference = {
  id: string;
  link?: string;
  snippet?: string;
  source?: string;
  title: string;
};

export type AnalysisRefinementQuestion = {
  id: string;
  prompt: string;
  reason?: string;
};

export type AnalysisValuationReadiness = {
  label?: string;
  reason?: string;
  score?: number;
  status: "ready" | "limited" | "not-ready";
};

export type AnalysisValuation = {
  basis?: string;
  comparableCount?: number;
  currency?: string;
  high: number;
  low: number;
  median: number;
  query?: string;
  snapshot?: boolean;
  source?: "ebay" | "multi_market" | "serpapi_ai" | "supplied";
};

export type AnalysisProfitAction = {
  confidence?: number;
  detail: string;
  guidance?: AnalysisProfitActionGuidance;
  id: string;
  kind?: "decision" | "enhancement";
  label: string;
};

export type AnalysisProfitActionGuidance = {
  references?: AnalysisMarketReference[];
  safetyWarnings: string[];
  searchedAt?: string;
  steps: string[];
  summary: string | null;
  toolsOrParts: string[];
};

export type AnalysisProfitPlan = {
  actions: AnalysisProfitAction[];
  currency?: string;
  expectedSale?: number;
  listTarget?: number;
  quickSale?: number;
};

export type ItemAnalysisResult = {
  condition?: AnalysisCondition;
  confidence?: AnalysisConfidenceBreakdown;
  evidence?: AnalysisEvidence[];
  identity: AnalysisIdentity;
  marketReferences?: AnalysisMarketReference[];
  profitPlan: AnalysisProfitPlan;
  refinementQuestions?: AnalysisRefinementQuestion[];
  suggestedPhotos?: AnalysisSuggestedPhoto[];
  summary?: string;
  valuation?: AnalysisValuation;
  valuationReadiness: AnalysisValuationReadiness;
};

export type AnalysisStep = {
  label: string;
  status: "pending" | "active" | "complete";
};

export type ItemAnalysisState =
  | {
      message?: string;
      requirements?: string[];
      status: "setup";
      title?: string;
    }
  | {
      callouts?: AnalysisCallout[];
      detail?: string;
      progress?: number;
      stage?: string;
      status: "analyzing";
      steps?: AnalysisStep[];
    }
  | {
      code?: string;
      message: string;
      status: "error";
      title?: string;
    }
  | {
      evidence?: string[];
      message?: string;
      status: "insufficient-evidence";
      suggestedPhotos: AnalysisSuggestedPhoto[];
      title?: string;
    }
  | {
      data: ItemAnalysisResult;
      status: "result";
    };
