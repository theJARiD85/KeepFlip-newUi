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
  | 'google_vision';

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
  methodology: 'median_linear_p20_p80_mad_outlier_filter_v1' | 'none';
  source?: 'caller_supplied' | 'ebay_sold' | 'none';
};

export type ItemSoldComparable = {
  title: string;
  soldPrice: number;
  shipping: number;
  totalPrice: number;
  currency: string;
  condition: string | null;
  soldDate: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
};

export type ItemMarketResearch = {
  provider: 'ebay';
  status: 'completed' | 'unavailable' | 'failed';
  query: string | null;
  searchedAt: string | null;
  comparableCount: number;
  comps: ItemSoldComparable[];
  quality?: {
    confidence: 'high' | 'medium' | 'low';
    exactComparableCount: number;
    comparableCount: number;
    warnings: string[];
    searchRoute?: 'identifier' | 'hybrid' | 'descriptor';
    searchIntent?: 'sold_comps' | 'visual_recently_sold';
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
  onStage?: (stage: ItemAnalysisStage) => void;
};

export type ItemAnalysisFunctionRequest = {
  bucketId: string;
  fileIds: string[];
  ocr?: ItemAnalysisOcrInput;
  userNotes?: string;
  comps?: ItemComparableInput[];
};
