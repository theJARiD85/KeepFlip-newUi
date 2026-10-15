import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import {
  loadTensorflowModel,
  type TensorflowModelDelegate,
  type TfliteModel,
} from "react-native-fast-tflite";

import {
  decodeYoloV8Segmentation,
  inferYoloV8SegmentationLayout,
  YOLOV8_SEG_MODEL_SIZE,
  type YoloV8Segmentation,
} from "@/components/scanner/yolov8-segmentation";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_ASSET = require("@/assets/models/yolov8n-seg-trained.tflite");
// Temporary Android-only evaluation asset with float16 weights and float32 tensors.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BIREFNET_MODEL_ASSET = require("@/assets/models/birefnet_lite_fp16_weights_fp32_io.tflite");
const OUTPUT_LONG_EDGE = 1280;
const MODEL_BACKGROUND = Skia.Color("#727272");
const RGBA_BYTES_PER_PIXEL = 4;
const BIREFNET_INPUT_SIZE = 1024;
const BIREFNET_OUTPUT_LONG_EDGE = 1280;
const BIREFNET_MEAN = [0.485, 0.456, 0.406] as const;
const BIREFNET_STD = [0.229, 0.224, 0.225] as const;
const BIREFNET_DELEGATES: TensorflowModelDelegate[] = ["android-gpu"];

let modelPromise: Promise<TfliteModel> | null = null;
let birefnetModelPromise: Promise<TfliteModel> | null = null;

function getModel(): Promise<TfliteModel> {
  if (!modelPromise) {
    modelPromise = Asset.loadAsync(MODEL_ASSET)
      .then(([asset]) => {
        if (!asset.localUri?.startsWith("file://")) {
          throw new Error("The item cutout model is unavailable on this device.");
        }
        return loadTensorflowModel({ url: asset.localUri }, []);
      })
      .catch((error: unknown) => {
        modelPromise = null;
        throw error;
      });
  }
  return modelPromise;
}

function getBiRefNetModel(): Promise<TfliteModel> {
  if (!birefnetModelPromise) {
    birefnetModelPromise = Asset.loadAsync(BIREFNET_MODEL_ASSET)
      .then(([asset]) => {
        if (!asset.localUri?.startsWith("file://")) {
          throw new Error("The BiRefNet test model is unavailable on this device.");
        }
        return loadTensorflowModel({ url: asset.localUri }, BIREFNET_DELEGATES);
      })
      .catch((error: unknown) => {
        birefnetModelPromise = null;
        throw error;
      });
  }
  return birefnetModelPromise;
}

function bilinearBiRefNetMaskAlpha(mask: Float32Array, modelX: number, modelY: number) {
  const maskX = modelX - 0.5;
  const maskY = modelY - 0.5;
  const left = Math.max(0, Math.min(BIREFNET_INPUT_SIZE - 1, Math.floor(maskX)));
  const top = Math.max(0, Math.min(BIREFNET_INPUT_SIZE - 1, Math.floor(maskY)));
  const right = Math.min(BIREFNET_INPUT_SIZE - 1, left + 1);
  const bottom = Math.min(BIREFNET_INPUT_SIZE - 1, top + 1);
  const weightX = Math.max(0, Math.min(1, maskX - left));
  const weightY = Math.max(0, Math.min(1, maskY - top));
  const row = top * BIREFNET_INPUT_SIZE;
  const nextRow = bottom * BIREFNET_INPUT_SIZE;
  const upper = mask[row + left] * (1 - weightX) + mask[row + right] * weightX;
  const lower = mask[nextRow + left] * (1 - weightX) + mask[nextRow + right] * weightX;
  return Math.round((upper * (1 - weightY) + lower * weightY) * 255);
}

function rgbaPixels(image: SkImage, width: number, height: number) {
  const pixels = image.readPixels(0, 0, {
    alphaType: AlphaType.Unpremul,
    colorType: ColorType.RGBA_8888,
    width,
    height,
  });
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * RGBA_BYTES_PER_PIXEL) {
    throw new Error("KeepFlip could not read the photo pixels for background removal.");
  }
  return pixels;
}

function renderSource(
  source: SkImage,
  width: number,
  height: number,
  inset: { x: number; y: number; width: number; height: number },
  background?: ReturnType<typeof Skia.Color>,
) {
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error("KeepFlip could not prepare this photo for background removal.");
  const canvas = surface.getCanvas();
  canvas.clear(background ?? Skia.Color("transparent"));
  canvas.drawImageRect(
    source,
    Skia.XYWHRect(0, 0, source.width(), source.height()),
    Skia.XYWHRect(inset.x, inset.y, inset.width, inset.height),
    Skia.Paint(),
    true,
  );
  surface.flush();
  return surface.makeImageSnapshot();
}

function bilinearMaskAlpha(
  detection: YoloV8Segmentation,
  modelX: number,
  modelY: number,
) {
  const maskX = modelX * detection.maskWidth / YOLOV8_SEG_MODEL_SIZE - 0.5;
  const maskY = modelY * detection.maskHeight / YOLOV8_SEG_MODEL_SIZE - 0.5;
  const left = Math.max(0, Math.min(detection.maskWidth - 1, Math.floor(maskX)));
  const top = Math.max(0, Math.min(detection.maskHeight - 1, Math.floor(maskY)));
  const right = Math.min(detection.maskWidth - 1, left + 1);
  const bottom = Math.min(detection.maskHeight - 1, top + 1);
  const weightX = Math.max(0, Math.min(1, maskX - left));
  const weightY = Math.max(0, Math.min(1, maskY - top));
  const row = top * detection.maskWidth;
  const nextRow = bottom * detection.maskWidth;
  const upper = detection.mask[row + left] * (1 - weightX) + detection.mask[row + right] * weightX;
  const lower = detection.mask[nextRow + left] * (1 - weightX) + detection.mask[nextRow + right] * weightX;
  return Math.round(upper * (1 - weightY) + lower * weightY);
}

/** Builds a transparent PNG locally. The source photo is never overwritten. */
export async function removePhotoBackground(sourceUri: string): Promise<string> {
  const sourceFile = new File(sourceUri);
  if (!sourceFile.exists || sourceFile.size <= 0) {
    throw new Error("The selected item photo is missing. Try opening it again.");
  }

  const sourceBytes = await sourceFile.bytes();
  const source = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(sourceBytes));
  if (!source || source.width() <= 0 || source.height() <= 0) {
    throw new Error("KeepFlip could not open this photo. Try a JPG or PNG photo.");
  }

  const model = await getModel();
  const sourceWidth = source.width();
  const sourceHeight = source.height();
  const modelScale = Math.min(
    YOLOV8_SEG_MODEL_SIZE / sourceWidth,
    YOLOV8_SEG_MODEL_SIZE / sourceHeight,
  );
  const modelInset = {
    width: sourceWidth * modelScale,
    height: sourceHeight * modelScale,
    x: (YOLOV8_SEG_MODEL_SIZE - sourceWidth * modelScale) / 2,
    y: (YOLOV8_SEG_MODEL_SIZE - sourceHeight * modelScale) / 2,
  };
  const modelImage = renderSource(
    source,
    YOLOV8_SEG_MODEL_SIZE,
    YOLOV8_SEG_MODEL_SIZE,
    modelInset,
    MODEL_BACKGROUND,
  );
  const modelPixels = rgbaPixels(modelImage, YOLOV8_SEG_MODEL_SIZE, YOLOV8_SEG_MODEL_SIZE);
  const planeLength = YOLOV8_SEG_MODEL_SIZE * YOLOV8_SEG_MODEL_SIZE;
  const input = new Float32Array(planeLength * 3);
  for (let index = 0; index < planeLength; index += 1) {
    const pixel = index * RGBA_BYTES_PER_PIXEL;
    input[index] = modelPixels[pixel] / 255;
    input[planeLength + index] = modelPixels[pixel + 1] / 255;
    input[planeLength * 2 + index] = modelPixels[pixel + 2] / 255;
  }

  if (
    model.inputs.length !== 1 ||
    model.inputs[0].dataType !== "float32" ||
    model.inputs[0].shape.join(",") !== `1,3,${YOLOV8_SEG_MODEL_SIZE},${YOLOV8_SEG_MODEL_SIZE}`
  ) {
    throw new Error("The item cutout model has an unexpected input format.");
  }
  const outputs = await model.run([input.buffer]);
  const detectionIndex = model.outputs.findIndex((output) => output.shape.length === 3);
  const prototypeIndex = model.outputs.findIndex((output) => output.shape.length === 4);
  if (detectionIndex < 0 || prototypeIndex < 0 || !outputs[detectionIndex] || !outputs[prototypeIndex]) {
    throw new Error("The item cutout model returned an unexpected result.");
  }
  const layout = inferYoloV8SegmentationLayout(
    model.outputs[detectionIndex],
    model.outputs[prototypeIndex],
  );
  const detections = decodeYoloV8Segmentation(
    new Float32Array(outputs[detectionIndex]),
    new Float32Array(outputs[prototypeIndex]),
    layout,
    {
      coordinateScale: YOLOV8_SEG_MODEL_SIZE,
      maxDetections: 1,
      scoreThreshold: 0.3,
    },
  );
  const detection = detections[0];
  if (!detection || detection.maskCoverage < 0.01) {
    throw new Error("KeepFlip could not find a clear item in this photo. Try a photo with one item fully in frame.");
  }

  const outputScale = Math.min(1, OUTPUT_LONG_EDGE / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * outputScale));
  const outputImage = renderSource(source, outputWidth, outputHeight, {
    x: 0,
    y: 0,
    width: outputWidth,
    height: outputHeight,
  });
  const outputPixels = rgbaPixels(outputImage, outputWidth, outputHeight);
  let retainedPixels = 0;
  for (let y = 0; y < outputHeight; y += 1) {
    const modelY = modelInset.y + ((y + 0.5) / outputHeight) * modelInset.height;
    for (let x = 0; x < outputWidth; x += 1) {
      const modelX = modelInset.x + ((x + 0.5) / outputWidth) * modelInset.width;
      const alpha = bilinearMaskAlpha(detection, modelX, modelY);
      const pixel = (y * outputWidth + x) * RGBA_BYTES_PER_PIXEL;
      outputPixels[pixel + 3] = Math.round(outputPixels[pixel + 3] * alpha / 255);
      if (alpha > 127) retainedPixels += 1;
    }
  }
  if (retainedPixels < outputWidth * outputHeight * 0.005) {
    throw new Error("The item mask was too small to save. Try a closer photo.");
  }

  const cutout = Skia.Image.MakeImage(
    {
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
      width: outputWidth,
      height: outputHeight,
    },
    Skia.Data.fromBytes(outputPixels),
    outputWidth * RGBA_BYTES_PER_PIXEL,
  );
  if (!cutout) throw new Error("KeepFlip could not make the cutout preview.");
  const png = cutout.encodeToBytes(ImageFormat.PNG);
  if (!png.length) throw new Error("KeepFlip could not save the cutout preview.");

  const preview = new File(Paths.cache, `keepflip-item-cutout-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  preview.create({ intermediates: true, overwrite: false });
  preview.write(png);
  return preview.uri;
}

/**
 * Runs the temporary BiRefNet Lite float16-weight artifact through Android GPU and returns
 * a transparent PNG preview plus on-device timing details. It never saves or
 * uploads the photo.
 */
export async function removePhotoBackgroundWithBiRefNet(
  sourceUri: string,
  tapPoint?: { x: number; y: number },
): Promise<{
  uri: string;
  inferenceMs: number;
  totalMs: number;
  delegates: string[];
  tapForeground?: boolean;
  tapMaskAlpha?: number;
}> {
  const totalStartedAt = Date.now();
  const sourceFile = new File(sourceUri);
  if (!sourceFile.exists || sourceFile.size <= 0) {
    throw new Error("The selected item photo is missing. Try opening it again.");
  }

  const sourceBytes = await sourceFile.bytes();
  const source = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(sourceBytes));
  if (!source || source.width() <= 0 || source.height() <= 0) {
    throw new Error("KeepFlip could not open this photo. Try a JPG or PNG photo.");
  }

  const model = await getBiRefNetModel();
  const modelImage = renderSource(source, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE, {
    x: 0,
    y: 0,
    width: BIREFNET_INPUT_SIZE,
    height: BIREFNET_INPUT_SIZE,
  });
  const modelPixels = rgbaPixels(modelImage, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE);
  const planeLength = BIREFNET_INPUT_SIZE * BIREFNET_INPUT_SIZE;
  const input = new Float32Array(planeLength * 3);

  for (let index = 0; index < planeLength; index += 1) {
    const pixel = index * RGBA_BYTES_PER_PIXEL;
    const inputPixel = index * 3;
    input[inputPixel] = (modelPixels[pixel] / 255 - BIREFNET_MEAN[0]) / BIREFNET_STD[0];
    input[inputPixel + 1] = (modelPixels[pixel + 1] / 255 - BIREFNET_MEAN[1]) / BIREFNET_STD[1];
    input[inputPixel + 2] = (modelPixels[pixel + 2] / 255 - BIREFNET_MEAN[2]) / BIREFNET_STD[2];
  }

  if (
    model.inputs.length !== 1 ||
    model.inputs[0].dataType !== "float32" ||
    model.inputs[0].shape.join(",") !== `1,${BIREFNET_INPUT_SIZE},${BIREFNET_INPUT_SIZE},3` ||
    model.outputs.length !== 1 ||
    model.outputs[0].dataType !== "float32" ||
    model.outputs[0].shape.join(",") !== `1,${BIREFNET_INPUT_SIZE},${BIREFNET_INPUT_SIZE},1`
  ) {
    throw new Error("The BiRefNet test model has an unexpected tensor format.");
  }

  const inferenceStartedAt = Date.now();
  const outputs = await model.run([input.buffer]);
  const inferenceMs = Date.now() - inferenceStartedAt;
  if (!outputs[0] || outputs[0].byteLength !== planeLength * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error("BiRefNet Lite returned an unexpected mask size.");
  }

  const logits = new Float32Array(outputs[0]);
  const mask = new Float32Array(planeLength);
  let maskMinimum = Infinity;
  let maskMaximum = -Infinity;
  for (let index = 0; index < planeLength; index += 1) {
    const logit = logits[index];
    const probability = 1 / (1 + Math.exp(-logit));
    mask[index] = probability;
    if (probability < maskMinimum) maskMinimum = probability;
    if (probability > maskMaximum) maskMaximum = probability;
  }
  if (!Number.isFinite(maskMinimum) || maskMaximum - maskMinimum < 0.01) {
    throw new Error("BiRefNet Lite returned a nearly empty mask for this photo.");
  }

  const sourceWidth = source.width();
  const sourceHeight = source.height();
  let tapMaskAlpha: number | undefined;
  if (tapPoint) {
    const insideSource =
      Number.isFinite(tapPoint.x) &&
      Number.isFinite(tapPoint.y) &&
      tapPoint.x >= 0 &&
      tapPoint.y >= 0 &&
      tapPoint.x < sourceWidth &&
      tapPoint.y < sourceHeight;
    tapMaskAlpha = insideSource
      ? bilinearBiRefNetMaskAlpha(
          mask,
          ((tapPoint.x + 0.5) / sourceWidth) * BIREFNET_INPUT_SIZE,
          ((tapPoint.y + 0.5) / sourceHeight) * BIREFNET_INPUT_SIZE,
        )
      : 0;
  }
  const outputScale = Math.min(
    1,
    BIREFNET_OUTPUT_LONG_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * outputScale));
  const outputImage = renderSource(source, outputWidth, outputHeight, {
    x: 0,
    y: 0,
    width: outputWidth,
    height: outputHeight,
  });
  const outputPixels = rgbaPixels(outputImage, outputWidth, outputHeight);
  let retainedPixels = 0;
  for (let y = 0; y < outputHeight; y += 1) {
    const modelY = ((y + 0.5) / outputHeight) * BIREFNET_INPUT_SIZE;
    for (let x = 0; x < outputWidth; x += 1) {
      const modelX = ((x + 0.5) / outputWidth) * BIREFNET_INPUT_SIZE;
      const alpha = bilinearBiRefNetMaskAlpha(mask, modelX, modelY);
      const pixel = (y * outputWidth + x) * RGBA_BYTES_PER_PIXEL;
      outputPixels[pixel + 3] = Math.round(outputPixels[pixel + 3] * alpha / 255);
      if (alpha > 127) retainedPixels += 1;
    }
  }
  if (retainedPixels < outputWidth * outputHeight * 0.005) {
    throw new Error("BiRefNet Lite kept too few pixels. Try a photo with one item fully in frame.");
  }

  const cutout = Skia.Image.MakeImage(
    {
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
      width: outputWidth,
      height: outputHeight,
    },
    Skia.Data.fromBytes(outputPixels),
    outputWidth * RGBA_BYTES_PER_PIXEL,
  );
  if (!cutout) throw new Error("KeepFlip could not make the BiRefNet Lite preview.");
  const png = cutout.encodeToBytes(ImageFormat.PNG);
  if (!png.length) throw new Error("KeepFlip could not save the BiRefNet Lite preview.");

  const preview = new File(
    Paths.cache,
    `keepflip-birefnet-test-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );
  preview.create({ intermediates: true, overwrite: false });
  preview.write(png);
  return {
    uri: preview.uri,
    inferenceMs,
    totalMs: Date.now() - totalStartedAt,
    delegates: model.delegates,
    tapForeground: tapMaskAlpha === undefined ? undefined : tapMaskAlpha >= 128,
    tapMaskAlpha,
  };
}

export function releasePhotoBackgroundPreview(uri: string | null) {
  if (!uri) return;
  try {
    const preview = new File(uri);
    if (preview.exists) preview.delete();
  } catch {
    // Cache cleanup should not replace a useful photo error or success.
  }
}
