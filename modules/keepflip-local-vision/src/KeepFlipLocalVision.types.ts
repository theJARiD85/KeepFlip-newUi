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

export type KeepFlipYuvFrame = {
  height: number;
  rotationDegrees: number;
  u: Uint8Array;
  uPixelStride: number;
  uRowStride: number;
  v: Uint8Array;
  vPixelStride: number;
  vRowStride: number;
  width: number;
  y: Uint8Array;
  yRowStride: number;
};

export type KeepFlipLiveObjectLabel = {
  confidence: number;
  index: number;
  text: string;
};

export type KeepFlipLiveObjectDetection = {
  boundingBox: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  labels: KeepFlipLiveObjectLabel[];
  trackingId: number | null;
};
