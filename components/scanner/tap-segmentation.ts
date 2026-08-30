/**
 * Shared preprocessing and decoding for the tap-conditioned segmentation
 * model.  Keep these functions free of React/native imports: the same math is
 * needed by a VisionCamera worklet and by ordinary TypeScript tests.
 */

export const TAP_SEG_MODEL_SIZE = 256;
export const TAP_SEG_INPUT_CHANNELS = 4;
export const TAP_SEG_OUTPUT_CHANNELS = 1;

export type TapSegScaleMode = "contain" | "cover";

export type TapSegPoint = {
  x: number;
  y: number;
};

export type TapSegTransform = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
  scaleMode: TapSegScaleMode;
};

export type TapSegMask = {
  data: Uint8Array;
  width: number;
  height: number;
  coverage: number;
};

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Return the exact transform used when a source frame is resized into the
 * model/output rectangle.  `contain` matches the tap model's letterbox
 * training; `cover` is available for preview surfaces that crop the frame.
 */
export function createTapSegTransform(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  scaleMode: TapSegScaleMode = "contain",
): TapSegTransform {
  const safeSourceWidth = positive(sourceWidth, 1);
  const safeSourceHeight = positive(sourceHeight, 1);
  const safeOutputWidth = positive(outputWidth, 1);
  const safeOutputHeight = positive(outputHeight, 1);
  const scale =
    scaleMode === "cover"
      ? Math.max(safeOutputWidth / safeSourceWidth, safeOutputHeight / safeSourceHeight)
      : Math.min(safeOutputWidth / safeSourceWidth, safeOutputHeight / safeSourceHeight);
  const renderedWidth = safeSourceWidth * scale;
  const renderedHeight = safeSourceHeight * scale;

  return {
    sourceWidth: safeSourceWidth,
    sourceHeight: safeSourceHeight,
    outputWidth: safeOutputWidth,
    outputHeight: safeOutputHeight,
    scale,
    offsetX: (safeOutputWidth - renderedWidth) / 2,
    offsetY: (safeOutputHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
    scaleMode,
  };
}

export function mapSourcePointToOutput(
  point: TapSegPoint,
  transform: TapSegTransform,
): TapSegPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function mapOutputPointToSource(
  point: TapSegPoint,
  transform: TapSegTransform,
): TapSegPoint {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}

/** Map a tap in a preview/view rectangle back into the source frame. */
export function mapPreviewPointToSource(
  pointInPreview: TapSegPoint,
  previewWidth: number,
  previewHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  scaleMode: TapSegScaleMode = "contain",
): { point: TapSegPoint; insideSource: boolean } {
  const transform = createTapSegTransform(
    sourceWidth,
    sourceHeight,
    previewWidth,
    previewHeight,
    scaleMode,
  );
  const point = mapOutputPointToSource(pointInPreview, transform);
  return {
    point,
    insideSource:
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= transform.sourceWidth - 1 &&
      point.y <= transform.sourceHeight - 1,
  };
}

/** Build the fourth, Gaussian tap channel in model coordinates. */
export function makeTapHeatmap(
  width: number,
  height: number,
  point: TapSegPoint,
  sigma = 8,
): Float32Array {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const safeSigma = Math.max(0.5, sigma);
  const denominator = 2 * safeSigma * safeSigma;
  const heatmap = new Float32Array(safeWidth * safeHeight);

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const distanceSquared =
        (x - point.x) * (x - point.x) + (y - point.y) * (y - point.y);
      heatmap[y * safeWidth + x] = Math.exp(-distanceSquared / denominator);
    }
  }
  return heatmap;
}

function toFloat32Array(value: Float32Array | ArrayBuffer): Float32Array {
  if (value instanceof Float32Array) return value;
  return new Float32Array(value);
}

/** Append a tap plane after planar R, G, and B planes. */
export function appendTapPlane(
  planarRgb: Float32Array | ArrayBuffer,
  tapMap: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const rgb = toFloat32Array(planarRgb);
  const pixelCount = Math.max(1, Math.floor(width)) * Math.max(1, Math.floor(height));
  const expectedRgbValues = pixelCount * 3;
  if (rgb.length < expectedRgbValues) {
    throw new Error(
      `Tap segmentation RGB buffer has ${rgb.length} floats; expected at least ${expectedRgbValues}.`,
    );
  }
  if (tapMap.length < pixelCount) {
    throw new Error(
      `Tap segmentation heatmap has ${tapMap.length} floats; expected at least ${pixelCount}.`,
    );
  }

  const input = new Float32Array(pixelCount * TAP_SEG_INPUT_CHANNELS);
  input.set(rgb.subarray(0, expectedRgbValues), 0);
  input.set(tapMap.subarray(0, pixelCount), expectedRgbValues);
  return input;
}

export type BuildTapSegInputOptions = {
  rgbPlanar: Float32Array | ArrayBuffer;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  tapInSource: TapSegPoint;
  scaleMode?: TapSegScaleMode;
  sigma?: number;
};

/**
 * Convert a source-frame tap to the model rectangle and append its heatmap to
 * a planar float32 RGB buffer returned by VisionCamera's resizer.
 */
export function buildTapSegInput(options: BuildTapSegInputOptions): Float32Array {
  const transform = createTapSegTransform(
    options.sourceWidth,
    options.sourceHeight,
    options.outputWidth,
    options.outputHeight,
    options.scaleMode ?? "contain",
  );
  const tapInOutput = mapSourcePointToOutput(options.tapInSource, transform);
  const heatmap = makeTapHeatmap(
    options.outputWidth,
    options.outputHeight,
    tapInOutput,
    options.sigma ?? 8,
  );
  return appendTapPlane(
    options.rgbPlanar,
    heatmap,
    options.outputWidth,
    options.outputHeight,
  );
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponent = Math.exp(-value);
    return 1 / (1 + exponent);
  }
  const exponent = Math.exp(value);
  return exponent / (1 + exponent);
}

/** Decode `[1, 1, H, W]` mask logits (or probabilities) from TFLite. */
export function decodeTapSegmentation(
  output: Float32Array | ArrayBuffer,
  width: number,
  height: number,
  options: {
    threshold?: number;
    values?: "logits" | "probabilities";
  } = {},
): TapSegMask {
  const values = toFloat32Array(output);
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const pixelCount = safeWidth * safeHeight;
  if (values.length < pixelCount) {
    throw new Error(
      `Tap segmentation output has ${values.length} floats; expected at least ${pixelCount}.`,
    );
  }

  const threshold = clamp(options.threshold ?? 0.5, 0, 1);
  const interpretation = options.values ?? "logits";
  const mask = new Uint8Array(pixelCount);
  let foreground = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const raw = values[index];
    const probability =
      interpretation === "probabilities"
        ? clamp(Number.isFinite(raw) ? raw : 0, 0, 1)
        : sigmoid(Number.isFinite(raw) ? raw : -Infinity);
    if (probability >= threshold) {
      mask[index] = 255;
      foreground += 1;
    }
  }

  return {
    data: mask,
    width: safeWidth,
    height: safeHeight,
    coverage: foreground / pixelCount,
  };
}
