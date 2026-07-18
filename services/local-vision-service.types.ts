export type LocalVisionLabel = {
  confidence: number;
  text: string;
};

export type LocalVisionBarcode = {
  displayValue: string;
  rawValue: string;
};

export type LocalVisionSignals = {
  available: boolean;
  barcodes: LocalVisionBarcode[];
  brand: string | null;
  candidateTitle: string | null;
  category: string | null;
  confidence: number;
  elapsedMs: number;
  itemType: string | null;
  labels: LocalVisionLabel[];
  model: string | null;
  notes: string[];
  ocrTexts: string[];
  searchTerms: string[];
  warnings: string[];
};

export type LocalVisionOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};
