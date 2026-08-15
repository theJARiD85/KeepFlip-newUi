export const ITEM_ANALYSIS_VERSION = '2026-07-15' as const;
export const ITEM_ANALYSIS_CONTRACT_VERSION = 1 as const;

export type ItemAnalysisStatus = 'identified' | 'insufficient_evidence';

export type ItemConditionGrade =
  | 'new'
  | 'like_new'
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'unknown';

export type ItemAnalysisEvidenceSource =
  | 'photo_visual'
  | 'photo_text'
  | 'user_notes'
  | 'google_vision'
  | 'web_market';

export type ItemAnalysisEvidenceStrength = 'high' | 'medium' | 'low';

export type ItemAnalysisInputSummary = {
  imageCount: number;
  source: 'appwrite_storage' | 'direct' | 'mixed';
};

export type ItemIdentification = {
  itemType: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  variant: string | null;
  color: string | null;
  era: string | null;
  serialNumber: string | null;
};

export type ItemCondition = {
  grade: ItemConditionGrade;
  confidence: number;
  notes: string[];
};

export type ItemAnalysisConfidence = {
  overall: number;
  itemType: number;
  brand: number;
  model: number;
  condition: number;
  valuation?: number;
};

export type ItemAnalysisEvidence = {
  claim: string;
  value: string;
  source: ItemAnalysisEvidenceSource;
  imageIndex: number | null;
  strength: ItemAnalysisEvidenceStrength;
  rationale: string;
};

export type ItemValuationSignals = {
  searchTerms: string[];
  category: string | null;
  conditionAdjustment: string;
  positiveFactors: string[];
  negativeFactors: string[];
};

export type ItemAnalysis = {
  summary: string;
  displayTitles?: {
    exactItemName: string;
    currentResaleMarketValue: string;
    observedCondition: string;
  };
  identification: ItemIdentification;
  condition: ItemCondition;
  confidence: ItemAnalysisConfidence;
  evidence: ItemAnalysisEvidence[];
  ambiguities: string[];
  suggestedPhotos: string[];
  valuationSignals: ItemValuationSignals;
};

export type ItemVisionLabel = {
  description: string;
  score: number;
};

export type ItemVisionObject = {
  name: string;
  score: number;
};

export type ItemVisionImage = {
  imageIndex: number;
  text: string | null;
  labels: ItemVisionLabel[];
  objects: ItemVisionObject[];
};

export type ItemVisionResult = {
  enabled: boolean;
  succeeded: boolean;
  images: ItemVisionImage[];
  warnings: string[];
};

export type ItemValuation = {
  status: 'ready' | 'limited_comps' | 'needs_comps';
  currency: string | null;
  suppliedCount: number;
  usedCount: number;
  rejectedCount: number;
  median: number | null;
  p20: number | null;
  p80: number | null;
  methodology:
  | 'median_linear_p20_p80_mad_outlier_filter_v1'
  | 'keepflip_ai_private_sale_range_v1'
  | 'keepflip_ai_private_sale_range_v2'
  | 'none';
  source?:
  | 'caller_supplied'
  | 'ebay_sold'
  | 'multi_market_sold'
  | 'keepflip_ai'
  | 'none';
};

export type MarketProviderId =
  | 'ebay'
  | 'mercari'
  | 'poshmark'
  | 'grailed'
  | 'pricecharting'
  | 'tcgplayer'
  | 'reverb'
  | 'discogs'
  | 'bricklink'
  | 'yahoo_japan'
  | 'keepflip_ai'
  | 'unknown';

export type MarketEvidenceClass =
  | 'confirmed_transaction'
  | 'platform_last_sale'
  | 'platform_sold_aggregate'
  | 'sold_status_last_ask'
  | 'inferred_sale'
  | 'active_ask';

export type MarketProviderRunStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'unavailable'
  | 'failed'
  | 'timed_out';

export type ItemMarketProviderStatus = {
  provider: MarketProviderId;
  status: MarketProviderRunStatus;
  query: string | null;
  comparableCount: number;
  signalCount: number;
  searchedAt: string | null;
  warnings: string[];
  error?: {
    code: string;
    message: string;
  };
};

export type ItemMarketSignal = {
  provider: MarketProviderId;
  evidenceClass: MarketEvidenceClass;
  type: string;
  label: string | null;
  currency: string | null;
  value: number | null;
  low: number | null;
  median: number | null;
  high: number | null;
  sampleSize: number | null;
  observedAt: string | null;
  sourceUrl: string | null;
  note?: string | null;
  confidencePercent?: number | null;
};

export type ItemSoldComparable = {
  provider: MarketProviderId;
  marketplace: string;
  evidenceClass: MarketEvidenceClass;
  title: string;
  soldPrice: number;
  shipping: number;
  totalPrice: number;
  currency: string;
  condition: string | null;
  soldDate: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
  sourceListingId?: string | null;
  soldDateConfidence?: 'exact' | 'approximate' | 'unknown';
  shippingSemantics?: 'included' | 'separate' | 'unknown';
};

export type ItemMarketReference = {
  title: string;
  link: string;
  snippet: string | null;
  source: string | null;
};

export type ItemProfitabilityAction = {
  title: string;
  detail: string;
  confidencePercent: number | null;
};

export type ItemProfitabilityGuidance = {
  actionTitle: string;
  references?: ItemMarketReference[];
  safetyWarnings: string[];
  searchedAt: string;
  steps: string[];
  summary: string | null;
  toolsOrParts: string[];
};

export type ItemValuationRefinementQuestion = {
  prompt: string;
  reason: string | null;
};

export type ItemValuationLadder = {
  level: "Level 1" | "Level 2" | "Level 3" | "Level 4" | "Level 5";
  reason: string | null;
  confidence: number;
};

export type ItemMarketResaleVelocity = {
  demand: 'fast' | 'moderate' | 'slow' | 'unknown';
  lowDays: number | null;
  typicalDays: number | null;
  highDays: number | null;
  evidence: string | null;
  confidence: 'high' | 'medium' | 'low';
  confidencePercent: number | null;
};

export type ItemMarketFlipComplexity = {
  level: 'easy' | 'moderate' | 'complex' | 'unknown';
  summary: string | null;
  requiredWork: string[];
  partsOrTools: string[];
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'unknown';
  safetyWarnings: string[];
  confidence: 'high' | 'medium' | 'low';
  confidencePercent: number | null;
};

export type ItemMarketFlipDecision = {
  verdict:
    | 'flip'
    | 'conditional_flip'
    | 'sell_as_is'
    | 'part_out'
    | 'skip'
    | 'unknown';
  summary: string | null;
  assumptions: string[];
  missingInputs: string[];
  confidence: 'high' | 'medium' | 'low';
  confidencePercent: number | null;
};

export type ItemMarketResearch = {
  provider: 'ebay' | 'multi_market' | 'keepflip_ai';
  status: 'completed' | 'unavailable' | 'failed';
  jobId?: string;
  partial?: boolean;
  query: string | null;
  searchedAt: string | null;
  comparableCount: number;
  comps: ItemSoldComparable[];
  providers?: ItemMarketProviderStatus[];
  signals?: ItemMarketSignal[];
  references?: ItemMarketReference[];
  identification?: string | null;
  condition?: {
    grade: 'new' | 'like_new' | 'good' | 'fair' | 'poor' | 'parts' | 'unknown';
    summary: string | null;
    confidence: 'high' | 'medium' | 'low';
    confidencePercent?: number | null;
  } | null;
  factors?: string[];
  profitabilityActions?: ItemProfitabilityAction[];
  profitabilityGuidance?: ItemProfitabilityGuidance[];
  refinementQuestions?: ItemValuationRefinementQuestion[];
  valuationLadder?: ItemValuationLadder;
  marketVelocity?: ItemMarketResaleVelocity;
  flipComplexity?: ItemMarketFlipComplexity;
  flipDecision?: ItemMarketFlipDecision;
  suggestedDetails?: string[];
  answerMarkdown?: string | null;
  normalization?: {
    method: 'openai_structured_outputs' | 'deterministic_fallback';
    model: string | null;
  } | null;
  quality?: {
    confidence: 'high' | 'medium' | 'low';
    confidencePercent?: number | null;
    exactComparableCount: number;
    comparableCount: number;
    warnings: string[];
    searchRoute?: 'identifier' | 'hybrid' | 'descriptor' | 'visual';
    searchIntent?:
    | 'sold_comps'
    | 'visual_recently_sold'
    | 'ai_mode_image_valuation';
  };
  error?: {
    code: string;
    message: string;
  };
};

export type ItemAnalysisSuccess = {
  ok: true;
  contractVersion: typeof ITEM_ANALYSIS_CONTRACT_VERSION;
  version: string;
  status: ItemAnalysisStatus;
  input: ItemAnalysisInputSummary;
  analysis: ItemAnalysis;
  vision: ItemVisionResult;
  valuation: ItemValuation;
  marketResearch?: ItemMarketResearch;
};

export type ItemIdentificationSnapshot = Omit<
  ItemAnalysisSuccess,
  'valuation' | 'marketResearch'
>;

export type ItemAnalysisPartialEvent = {
  phase: 'identification';
  result: ItemIdentificationSnapshot;
};

export type ItemAnalysisFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ItemAnalysisResponse = ItemAnalysisSuccess | ItemAnalysisFailure;

// The service only resolves successful function responses. This alias keeps UI
// call sites readable while retaining the complete evidence and valuation data.
export type ItemAnalysisResult = ItemAnalysisSuccess;

export type ItemAnalysisOcrInput = string | string[];

export type ItemComparableInput = {
  price: number;
  currency?: string;
  title?: string;
  condition?: string;
  source?: string;
  url?: string;
  soldAt?: string;
};

export type AnalyzeItemPhotosInput = {
  photoUris: string[];
  ocr?: ItemAnalysisOcrInput;
  userNotes?: string;
  comps?: ItemComparableInput[];
};

export type ItemAnalysisStage =
  | 'authenticating'
  | 'uploading'
  | 'analyzing'
  | 'cleaning'
  | 'researching_comps';

export type AnalyzeItemPhotosOptions = {
  signal?: AbortSignal;
  onPartialResult?: (event: ItemAnalysisPartialEvent) => void;
  onStage?: (stage: ItemAnalysisStage) => void;
};

export type ItemAnalysisFunctionRequest = {
  bucketId: string;
  diagnosticId: string;
  fileIds: string[];
  ocr?: ItemAnalysisOcrInput;
  userNotes?: string;
  comps?: ItemComparableInput[];
};
