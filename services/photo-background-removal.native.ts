import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import { loadTensorflowModel, type TfliteModel } from "react-native-fast-tflite";

import {
  decodeYoloV8Segmentation,
  inferYoloV8SegmentationLayout,
  YOLOV8_SEG_MODEL_SIZE,
  type YoloV8Segmentation,
} from "@/components/scanner/yolov8-segmentation";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_ASSET = require("@/assets/models/yolov8n-seg-trained.tflite");
const OUTPUT_LONG_EDGE = 1280;
const MODEL_BACKGROUND = Skia.Color("#727272");
const RGBA_BYTES_PER_PIXEL = 4;

let modelPromise: Promise<TfliteModel> | null = null;

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

  if (model.inputs.length !== 1 || model.inputs[0].dataType !== "float32") {
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

export function releasePhotoBackgroundPreview(uri: string | null) {
  if (!uri) return;
  try {
    const preview = new File(uri);
    if (preview.exists) preview.delete();
  } catch {
    // Cache cleanup should not replace a useful photo error or success.
  }
}
