import type { Tensor } from "react-native-fast-tflite";

export const YOLOV8_SEG_MODEL_SIZE = 640;
export const YOLOV8_SEG_INPUT_BYTES =
  YOLOV8_SEG_MODEL_SIZE *
  YOLOV8_SEG_MODEL_SIZE *
  3 *
  Float32Array.BYTES_PER_ELEMENT;

export type YoloV8SegDetectionLayout =
  | "channels_first"
  | "candidates_first";

export type YoloV8SegPrototypeLayout = "chw" | "hwc";

export type YoloV8SegmentationLayout = {
  candidateCount: number;
  detectionChannels: number;
  detectionLayout: YoloV8SegDetectionLayout;
  classCount: number;
  maskDimension: number;
  prototypeWidth: number;
  prototypeHeight: number;
  prototypeChannels: number;
  prototypeLayout: YoloV8SegPrototypeLayout;
};

export type YoloV8SegmentationBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type YoloV8Segmentation = {
  classId: number;
  score: number;
  box: YoloV8SegmentationBox;
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  maskCoverage: number;
};

export type DecodeYoloV8SegmentationOptions = {
  scoreThreshold?: number;
  maskThreshold?: number;
  maxDetections?: number;
  classIds?: readonly number[];
};

function withoutBatch(shape: readonly number[]): number[] {
  if (shape.length === 0) {
    throw new Error("YOLOv8-seg tensor shape is empty.");
  }

  return shape[0] === 1 ? shape.slice(1) : [...shape];
}

function product(values: readonly number[]): number {
  return values.reduce((total, value) => total * value, 1);
}

function tensorShape(
  value: Pick<Tensor, "shape"> | readonly number[],
): readonly number[] {
  return "shape" in value ? value.shape : value;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Infer the decoder contract from the model rather than hard-coding 80 COCO
 * classes. A fine-tuned one-class model normally changes 116 channels to 37
 * while keeping the same 8,400 candidates and 32 mask prototypes.
 */
export function inferYoloV8SegmentationLayout(
  detectionTensor: Pick<Tensor, "shape"> | readonly number[],
  prototypeTensor: Pick<Tensor, "shape"> | readonly number[],
): YoloV8SegmentationLayout {
  const detectionShape = tensorShape(detectionTensor);
  const prototypeShape = tensorShape(prototypeTensor);
  const detection = withoutBatch(detectionShape);
  const prototype = withoutBatch(prototypeShape);

  if (detection.length !== 2) {
    throw new Error(
      `YOLOv8-seg detection output must have two non-batch dimensions; received ${detectionShape.join("x")}.`,
    );
  }

  if (prototype.length !== 3) {
    throw new Error(
      `YOLOv8-seg prototype output must have three non-batch dimensions; received ${prototypeShape.join("x")}.`,
    );
  }

  const candidateCount = Math.max(detection[0], detection[1]);
  const detectionChannels = Math.min(detection[0], detection[1]);
  const detectionLayout: YoloV8SegDetectionLayout =
    detection[0] === candidateCount ? "candidates_first" : "channels_first";
  const prototypeChannels = Math.min(...prototype);
  const prototypeChannelIndex = prototype.indexOf(prototypeChannels);

  if (
    !isPositiveInteger(candidateCount) ||
    !isPositiveInteger(detectionChannels) ||
    !isPositiveInteger(prototypeChannels) ||
    prototypeChannelIndex < 0
  ) {
    throw new Error("YOLOv8-seg output dimensions must be positive integers.");
  }

  const maskDimension = prototypeChannels;
  const classCount = detectionChannels - 4 - maskDimension;

  if (classCount < 1) {
    throw new Error(
      `YOLOv8-seg detection output has ${detectionChannels} channels, which is not enough for boxes and ${maskDimension} mask coefficients.`,
    );
  }

  const prototypeLayout: YoloV8SegPrototypeLayout =
    prototypeChannelIndex === 0 ? "chw" : "hwc";
  const prototypeHeight =
    prototypeLayout === "chw" ? prototype[1] : prototype[0];
  const prototypeWidth =
    prototypeLayout === "chw" ? prototype[2] : prototype[1];

  if (
    !isPositiveInteger(prototypeWidth) ||
    !isPositiveInteger(prototypeHeight) ||
    product([prototypeWidth, prototypeHeight, prototypeChannels]) !==
      product(prototype)
  ) {
    throw new Error("YOLOv8-seg prototype dimensions are invalid.");
  }

  return {
    candidateCount,
    detectionChannels,
    detectionLayout,
    classCount,
    maskDimension,
    prototypeWidth,
    prototypeHeight,
    prototypeChannels,
    prototypeLayout,
  };
}

function readDetectionValue(
  output: Float32Array,
  layout: YoloV8SegmentationLayout,
  channel: number,
  candidate: number,
): number {
  const index =
    layout.detectionLayout === "channels_first"
      ? channel * layout.candidateCount + candidate
      : candidate * layout.detectionChannels + channel;

  return output[index] ?? Number.NaN;
}

function readPrototypeValue(
  output: Float32Array,
  layout: YoloV8SegmentationLayout,
  x: number,
  y: number,
  channel: number,
): number {
  const index =
    layout.prototypeLayout === "chw"
      ? channel * layout.prototypeHeight * layout.prototypeWidth +
        y * layout.prototypeWidth +
        x
      : (y * layout.prototypeWidth + x) * layout.prototypeChannels + channel;

  return output[index] ?? 0;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponent = Math.exp(-value);
    return 1 / (1 + exponent);
  }

  const exponent = Math.exp(value);
  return exponent / (1 + exponent);
}

function scoreProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  // Ultralytics' exported head normally contains sigmoid class scores. The
  // fallback keeps the decoder tolerant of an export that leaves class logits.
  return value >= 0 && value <= 1 ? value : sigmoid(value);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function intersectionOverUnion(
  first: YoloV8SegmentationBox,
  second: YoloV8SegmentationBox,
): number {
  const intersectionLeft = Math.max(first.left, second.left);
  const intersectionTop = Math.max(first.top, second.top);
  const intersectionRight = Math.min(first.right, second.right);
  const intersectionBottom = Math.min(first.bottom, second.bottom);
  const intersectionWidth = Math.max(intersectionRight - intersectionLeft, 0);
  const intersectionHeight = Math.max(intersectionBottom - intersectionTop, 0);
  const intersection = intersectionWidth * intersectionHeight;
  const firstArea = Math.max(first.width, 0) * Math.max(first.height, 0);
  const secondArea = Math.max(second.width, 0) * Math.max(second.height, 0);
  const union = firstArea + secondArea - intersection;

  return union > 0 ? intersection / union : 0;
}

function buildMask(
  coefficients: Float32Array,
  prototypes: Float32Array,
  layout: YoloV8SegmentationLayout,
  box: YoloV8SegmentationBox,
  maskThreshold: number,
): { mask: Uint8Array; coverage: number } {
  const mask = new Uint8Array(
    layout.prototypeWidth * layout.prototypeHeight,
  );
  const left = box.left * layout.prototypeWidth;
  const top = box.top * layout.prototypeHeight;
  const right = box.right * layout.prototypeWidth;
  const bottom = box.bottom * layout.prototypeHeight;
  let foregroundPixels = 0;
  let boxPixels = 0;

  for (let y = 0; y < layout.prototypeHeight; y += 1) {
    for (let x = 0; x < layout.prototypeWidth; x += 1) {
      if (
        x + 0.5 < left ||
        x + 0.5 > right ||
        y + 0.5 < top ||
        y + 0.5 > bottom
      ) {
        continue;
      }

      boxPixels += 1;
      let value = 0;

      for (let channel = 0; channel < layout.maskDimension; channel += 1) {
        value +=
          coefficients[channel] *
          readPrototypeValue(prototypes, layout, x, y, channel);
      }

      if (sigmoid(value) >= maskThreshold) {
        mask[y * layout.prototypeWidth + x] = 255;
        foregroundPixels += 1;
      }
    }
  }

  return {
    mask,
    coverage: boxPixels > 0 ? foregroundPixels / boxPixels : 0,
  };
}

/**
 * Decode the two-output, NMS-free YOLOv8-seg export. The returned mask stays
 * at prototype resolution (normally 160x160) so it can be sampled cheaply;
 * callers can upscale only when they need to draw the silhouette.
 */
export function decodeYoloV8Segmentation(
  detectionOutput: Float32Array,
  prototypeOutput: Float32Array,
  layout: YoloV8SegmentationLayout,
  options: DecodeYoloV8SegmentationOptions = {},
): YoloV8Segmentation[] {
  const scoreThreshold = options.scoreThreshold ?? 0.35;
  const maskThreshold = options.maskThreshold ?? 0.5;
  const maxDetections = Math.max(1, options.maxDetections ?? 3);
  const allowedClasses = options.classIds
    ? new Set(options.classIds)
    : undefined;
  const expectedDetectionElements =
    layout.candidateCount * layout.detectionChannels;
  const expectedPrototypeElements =
    layout.prototypeWidth *
    layout.prototypeHeight *
    layout.prototypeChannels;

  if (detectionOutput.length < expectedDetectionElements) {
    throw new Error(
      `YOLOv8-seg detection buffer is ${detectionOutput.length} floats; expected at least ${expectedDetectionElements}.`,
    );
  }

  if (prototypeOutput.length < expectedPrototypeElements) {
    throw new Error(
      `YOLOv8-seg prototype buffer is ${prototypeOutput.length} floats; expected at least ${expectedPrototypeElements}.`,
    );
  }

  const candidates: Array<{
    classId: number;
    score: number;
    box: YoloV8SegmentationBox;
    candidate: number;
  }> = [];

  for (let candidate = 0; candidate < layout.candidateCount; candidate += 1) {
    let classId = -1;
    let score = 0;

    for (let classIndex = 0; classIndex < layout.classCount; classIndex += 1) {
      if (allowedClasses && !allowedClasses.has(classIndex)) {
        continue;
      }

      const classScore = scoreProbability(
        readDetectionValue(
          detectionOutput,
          layout,
          4 + classIndex,
          candidate,
        ),
      );

      if (classScore > score) {
        score = classScore;
        classId = classIndex;
      }
    }

    if (classId < 0 || score < scoreThreshold) {
      continue;
    }

    const centerX = readDetectionValue(
      detectionOutput,
      layout,
      0,
      candidate,
    );
    const centerY = readDetectionValue(
      detectionOutput,
      layout,
      1,
      candidate,
    );
    const width = readDetectionValue(detectionOutput, layout, 2, candidate);
    const height = readDetectionValue(detectionOutput, layout, 3, candidate);

    if (
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      continue;
    }

    const left = clamp01(centerX - width / 2);
    const top = clamp01(centerY - height / 2);
    const right = clamp01(centerX + width / 2);
    const bottom = clamp01(centerY + height / 2);

    if (right <= left || bottom <= top) {
      continue;
    }

    candidates.push({
      classId,
      score,
      box: {
        left,
        top,
        right,
        bottom,
        centerX: clamp01(centerX),
        centerY: clamp01(centerY),
        width: right - left,
        height: bottom - top,
      },
      candidate,
    });
  }

  candidates.sort((first, second) => second.score - first.score);
  const selected: typeof candidates = [];

  for (const candidate of candidates) {
    if (
      selected.some(
        (other) =>
          other.classId === candidate.classId &&
          intersectionOverUnion(other.box, candidate.box) > 0.55,
      )
    ) {
      continue;
    }

    selected.push(candidate);

    if (selected.length >= maxDetections) {
      break;
    }
  }

  return selected.map((candidate) => {
    const coefficients = new Float32Array(layout.maskDimension);

    for (let channel = 0; channel < layout.maskDimension; channel += 1) {
      coefficients[channel] = readDetectionValue(
        detectionOutput,
        layout,
        4 + layout.classCount + channel,
        candidate.candidate,
      );
    }

    const { mask, coverage } = buildMask(
      coefficients,
      prototypeOutput,
      layout,
      candidate.box,
      maskThreshold,
    );

    return {
      classId: candidate.classId,
      score: candidate.score,
      box: candidate.box,
      mask,
      maskWidth: layout.prototypeWidth,
      maskHeight: layout.prototypeHeight,
      maskCoverage: coverage,
    };
  });
}

