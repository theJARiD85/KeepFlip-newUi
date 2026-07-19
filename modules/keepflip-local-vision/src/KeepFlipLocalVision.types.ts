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

export type KeepFlipSubjectContour = {
  maskHeight: number;
  maskWidth: number;
  points: number[];
  processingMs: number;
};

export type KeepFlipYuvFrame = {
  height: number;
  rotationDegrees: number;
  u: ArrayBuffer;
  uPixelStride: number;
  uRowStride: number;
  v: ArrayBuffer;
  vPixelStride: number;
  vRowStride: number;
  width: number;
  y: ArrayBuffer;
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
