import { RNMLKitDefaultObjectDetector } from "@infinitered/react-native-mlkit-object-detection";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { KeepFlipLiveObjectDetection } from "@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types";

const DETECTION_IMAGE_MAX_EDGE = 640;

const capturedObjectDetector = new RNMLKitDefaultObjectDetector({
  detectorMode: "singleImage",
  shouldEnableClassification: true,
  shouldEnableMultipleObjects: true,
});

let detectorLoadPromise: Promise<void> | null = null;

export type CapturedObjectTraceResult = {
  detections: KeepFlipLiveObjectDetection[];
  frameHeight: number;
  frameWidth: number;
  sourceUri: string;
};

function toFileUri(source: string) {
  const trimmed = source.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `file://${trimmed.replaceAll("\\", "/")}`;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function ensureDetectorLoaded() {
  if (capturedObjectDetector.isLoaded()) return Promise.resolve();

  detectorLoadPromise ??= capturedObjectDetector.load().catch((error) => {
    detectorLoadPromise = null;
    throw error;
  });
  return detectorLoadPromise;
}

function deleteTemporaryFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Expo's cache directory can clean up a failed temporary detection image.
  }
}

async function prepareDetectionImage(sourceUri: string) {
  const sourceImage = await ImageManipulator.manipulate(sourceUri).renderAsync();
  let detectionImage = sourceImage;

  try {
    const longestEdge = Math.max(sourceImage.width, sourceImage.height);
    if (longestEdge > DETECTION_IMAGE_MAX_EDGE) {
      const resizeContext = ImageManipulator.manipulate(sourceImage);
      resizeContext.resize(
        sourceImage.width >= sourceImage.height
          ? { width: DETECTION_IMAGE_MAX_EDGE }
          : { height: DETECTION_IMAGE_MAX_EDGE },
      );
      detectionImage = await resizeContext.renderAsync();
    }

    return await detectionImage.saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
    });
  } finally {
    if (detectionImage !== sourceImage) detectionImage.release();
    sourceImage.release();
  }
}

export async function detectObjectsInCapturedPhoto(
  source: string,
): Promise<CapturedObjectTraceResult> {
  const sourceUri = toFileUri(source);
  const detectorReady = ensureDetectorLoaded();
  const prepared = await prepareDetectionImage(sourceUri);

  try {
    await detectorReady;
    const rawDetections = await capturedObjectDetector.detectObjects(
      prepared.uri,
    );
    const frameWidth = prepared.width;
    const frameHeight = prepared.height;

    const detections = rawDetections
      .map((detection) => {
        const left = clampUnit(detection.frame.origin.x / frameWidth);
        const top = clampUnit(detection.frame.origin.y / frameHeight);
        const right = clampUnit(
          (detection.frame.origin.x + detection.frame.size.x) / frameWidth,
        );
        const bottom = clampUnit(
          (detection.frame.origin.y + detection.frame.size.y) / frameHeight,
        );
        const width = right - left;
        const height = bottom - top;
        const runtimeTrackingId = (
          detection as typeof detection & { trackingId?: unknown }
        ).trackingId;
        const trackingId =
          typeof detection.trackingID === "number"
            ? detection.trackingID
            : typeof runtimeTrackingId === "number"
              ? runtimeTrackingId
              : null;

        if (width <= 0 || height <= 0) return null;

        return {
          boundingBox: { x: left, y: top, width, height },
          labels: detection.labels.map((label) => ({
            confidence: label.confidence,
            index: label.index,
            text: label.text,
          })),
          trackingId,
        } satisfies KeepFlipLiveObjectDetection;
      })
      .filter(
        (detection): detection is KeepFlipLiveObjectDetection =>
          detection != null,
      )
      .sort(
        (left, right) =>
          right.boundingBox.width * right.boundingBox.height -
          left.boundingBox.width * left.boundingBox.height,
      );

    return {
      detections,
      frameHeight,
      frameWidth,
      sourceUri,
    };
  } finally {
    deleteTemporaryFile(prepared.uri);
  }
}
