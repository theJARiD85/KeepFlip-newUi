export type KeepFlipLocalVisionLabel = {
  confidence: number;
  index: number;
  text: string;
};

export type KeepFlipLocalVisionBarcode = {
  displayValue: string;
  format: number;
  rawValue: string;
  valueType: number;
};

export type KeepFlipLocalVisionResult = {
  barcodes: KeepFlipLocalVisionBarcode[];
  labels: KeepFlipLocalVisionLabel[];
  lines: string[];
  processingMs: number;
  text: string;
  warnings: string[];
};

export type KeepFlipLocalVisionModuleEvents = Record<string, never>;
