import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTensorflowModel } from "react-native-fast-tflite";
import {
  type CameraFrameOutput,
  useFrameOutput,
} from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const MODEL_SIZE = 320;
const MODEL_INPUT_BYTES = MODEL_SIZE * MODEL_SIZE * 3;
const MAX_DETECTIONS = 25;
const MIN_DETECTION_SCORE = 0.48;
const FRAMES_BETWEEN_INFERENCES = 8;
const STABLE_HITS_REQUIRED = 2;
const MISSES_BEFORE_CLEAR = 4;
const TRACK_MATCH_TOLERANCE = 0.28;
const PUBLISH_MOVEMENT_THRESHOLD = 0.035;

const RADAR_FRAME_RESOLUTION = {
  width: 640,
  height: 480,
} as const;

const TFLITE_DELEGATES: [] = [];

export type ValueRadarStatus = "loading" | "ready" | "error";

export type ValueRadarMarker = {
  classId: number;
  height: number;
  label: string;
  score: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
};

export type ValueRadarViewport = {
  height: number;
  previewHeight: number;
  previewWidth: number;
  width: number;
  x: number;
  y: number;
};

type ValueRadarResult = {
  frameOutput: CameraFrameOutput;
  marker: ValueRadarMarker | null;
  status: ValueRadarStatus;
};

type ValueRadarOverlayProps = {
  disabled?: boolean;
  focusBounds?: ValueRadarViewport | null;
  height: number;
  marker: ValueRadarMarker | null;
  onMarkerPress: (marker: ValueRadarMarker) => void;
  status: ValueRadarStatus;
  width: number;
};

/*
 * Keep the existing radar presentation exactly as designed. Android resolves
 * this file first, while the explicit extension below loads the original
 * visual component without invoking its oversized inference hook.
 */
const radarVisuals = require("./value-radar.native.tsx") as {
  ValueRadarOverlay: ComponentType<ValueRadarOverlayProps>;
};

export const ValueRadarOverlay = radarVisuals.ValueRadarOverlay;

function clamp(value: number, minimum: number, maximum: number) {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
}

function isRadarCategory(classId: number) {
  "worklet";

  switch (classId) {
    case 1: // bicycle
    case 2: // car
    case 3: // motorcycle
    case 7: // truck
    case 8: // boat
    case 14: // bench
    case 26: // backpack
    case 27: // umbrella
    case 30: // handbag
    case 31: // tie
    case 32: // suitcase
    case 33: // frisbee
    case 34: // skis
    case 35: // snowboard
    case 36: // sports ball
    case 37: // kite
    case 38: // baseball bat
    case 39: // baseball glove
    case 40: // skateboard
    case 41: // surfboard
    case 42: // tennis racket
    case 43: // bottle
    case 45: // wine glass
    case 46: // cup
    case 47: // fork
    case 48: // knife
    case 49: // spoon
    case 50: // bowl
    case 61: // chair
    case 62: // couch
    case 63: // potted plant
    case 64: // bed
    case 66: // dining table
    case 71: // tv
    case 72: // laptop
    case 73: // mouse
    case 74: // remote
    case 75: // keyboard
    case 76: // cell phone
    case 77: // microwave
    case 78: // oven
    case 79: // toaster
    case 81: // refrigerator
    case 83: // book
    case 84: // clock
    case 85: // vase
    case 86: // scissors
    case 87: // teddy bear
    case 88: // hair dryer
    case 89: // toothbrush
      return true;
    default:
      return false;
  }
}

function radarCategoryLabel(classId: number) {
  const labels: Record<number, string> = {
    1: "Bicycle",
    2: "Vehicle",
    3: "Motorcycle",
    7: "Truck",
    8: "Boat",
    14: "Bench",
    26: "Backpack",
    27: "Umbrella",
    30: "Handbag",
    31: "Tie",
    32: "Suitcase",
    33: "Frisbee",
    34: "Skis",
    35: "Snowboard",
    36: "Sports gear",
    37: "Kite",
    38: "Baseball bat",
    39: "Baseball glove",
    40: "Skateboard",
    41: "Surfboard",
    42: "Tennis racket",
    43: "Bottle",
    45: "Glassware",
    46: "Cup",
    47: "Flatware",
    48: "Knife",
    49: "Flatware",
    50: "Bowl",
    61: "Chair",
    62: "Couch",
    63: "Plant",
    64: "Bed",
    66: "Table",
    71: "TV",
    72: "Laptop",
    73: "Computer mouse",
    74: "Remote",
    75: "Keyboard",
    76: "Cell phone",
    77: "Microwave",
    78: "Oven",
    79: "Toaster",
    81: "Refrigerator",
    83: "Book",
    84: "Clock",
    85: "Vase",
    86: "Scissors",
    87: "Teddy bear",
    88: "Hair dryer",
    89: "Toothbrush",
  };

  return labels[classId] ?? "Item";
}

export function useValueRadar(
  enabled: boolean,
  viewport?: ValueRadarViewport,
): ValueRadarResult {
  const [marker, setMarker] = useState<ValueRadarMarker | null>(null);
  const [inferenceError, setInferenceError] = useState(false);

  const frameCounter = useSharedValue(0);
  const trackedClass = useSharedValue(-1);
  const trackedX = useSharedValue(0);
  const trackedY = useSharedValue(0);
  const trackedWidth = useSharedValue(0);
  const trackedHeight = useSharedValue(0);
  const trackedScore = useSharedValue(0);
  const stableHits = useSharedValue(0);
  const misses = useSharedValue(0);
  const hasPublishedMarker = useSharedValue(false);
  const publishedClass = useSharedValue(-1);
  const publishedX = useSharedValue(0);
  const publishedY = useSharedValue(0);
  const publishedWidth = useSharedValue(0);
  const publishedHeight = useSharedValue(0);
  const errorReported = useSharedValue(false);

  const detector = useTensorflowModel(
    require("../../assets/models/efficientdet_lite0.tflite"),
    TFLITE_DELEGATES,
  );
  const resizerState = useResizer({
    width: MODEL_SIZE,
    height: MODEL_SIZE,
    channelOrder: "rgb",
    dataType: "uint8",
    scaleMode: "cover",
    pixelLayout: "interleaved",
  });

  const detectorError =
    detector.state === "error" ? detector.error : undefined;
  const resizerError =
    resizerState.state === "error" ? resizerState.error : undefined;

  useEffect(() => {
    if (detector.state === "error" || resizerState.state === "error") {
      console.warn(
        "[KeepFlip Value Radar] Android setup failed:",
        detectorError ?? resizerError,
      );
      setInferenceError(true);
    }
  }, [
    detector.state,
    detectorError,
    resizerError,
    resizerState.state,
  ]);

  useEffect(() => {
    if (enabled) return;

    const resetFrame = requestAnimationFrame(() => {
      setMarker(null);
      setInferenceError(false);
    });

    frameCounter.value = 0;
    trackedClass.value = -1;
    stableHits.value = 0;
    misses.value = 0;
    hasPublishedMarker.value = false;
    errorReported.value = false;

    return () => cancelAnimationFrame(resetFrame);
  }, [
    enabled,
    errorReported,
    frameCounter,
    hasPublishedMarker,
    misses,
    stableHits,
    trackedClass,
  ]);

  const commitMarker = useCallback((payload: number[]) => {
    const [
      x,
      y,
      width,
      height,
      classId,
      score,
      sourceWidth,
      sourceHeight,
    ] = payload;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(classId) ||
      !Number.isFinite(score) ||
      !Number.isFinite(sourceWidth) ||
      !Number.isFinite(sourceHeight)
    ) {
      return;
    }

    setMarker({
      x,
      y,
      width,
      height,
      classId: Math.round(classId),
      label: radarCategoryLabel(Math.round(classId)),
      score,
      sourceWidth,
      sourceHeight,
    });
  }, []);

  const clearMarker = useCallback(() => {
    setMarker(null);
  }, []);

  const clearInferenceError = useCallback(() => {
    setInferenceError(false);
  }, []);

  const reportInferenceError = useCallback((message: string) => {
    console.warn("[KeepFlip Value Radar] Android inference failed:", message);
    setInferenceError(true);
    setMarker(null);
  }, []);

  const model = detector.state === "loaded" ? detector.model : undefined;
  const resizer =
    resizerState.state === "ready" ? resizerState.resizer : undefined;

  const frameOutput = useFrameOutput({
    targetResolution: RADAR_FRAME_RESOLUTION,
    pixelFormat: "yuv",
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: true,
    enablePreviewSizedOutputBuffers: true,
    onFrame(frame) {
      "worklet";

      let resized:
        | ReturnType<NonNullable<typeof resizer>["resize"]>
        | undefined;

      try {
        frameCounter.value += 1;
        const shouldRun =
          enabled &&
          model != null &&
          resizer != null &&
          frameCounter.value % FRAMES_BETWEEN_INFERENCES === 0;

        if (!shouldRun) return;

        resized = resizer.resize(frame);
        const pixels = new Uint8Array(resized.getPixelBuffer());

        if (pixels.byteLength !== MODEL_INPUT_BYTES) {
          throw new Error(
            `EfficientDet expected ${MODEL_INPUT_BYTES} input bytes but received ${pixels.byteLength}.`,
          );
        }

        const inputBuffer =
          pixels.byteOffset === 0 &&
          pixels.byteLength === pixels.buffer.byteLength
            ? pixels.buffer
            : pixels.buffer.slice(
                pixels.byteOffset,
                pixels.byteOffset + pixels.byteLength,
              );

        resized.dispose();
        resized = undefined;

        const outputs = model.runSync([inputBuffer]);
        if (
          outputs[0] == null ||
          outputs[1] == null ||
          outputs[2] == null ||
          outputs[3] == null
        ) {
          throw new Error("EfficientDet returned an incomplete result.");
        }

        const boxes = new Float32Array(outputs[0]);
        const classes = new Float32Array(outputs[1]);
        const scores = new Float32Array(outputs[2]);
        const detectedCount = new Float32Array(outputs[3]);
        const count = Math.min(
          Math.max(Math.floor(detectedCount[0] ?? 0), 0),
          MAX_DETECTIONS,
          Math.floor(boxes.length / 4),
          classes.length,
          scores.length,
        );

        if (errorReported.value) {
          errorReported.value = false;
          scheduleOnRN(clearInferenceError);
        }

        const sourceWidth = Math.max(frame.width, 1);
        const sourceHeight = Math.max(frame.height, 1);
        const cropSide = Math.min(sourceWidth, sourceHeight);
        const cropLeft = (sourceWidth - cropSide) / 2;
        const cropTop = (sourceHeight - cropSide) / 2;
        const previewScale =
          viewport != null
            ? Math.max(
                viewport.previewWidth / sourceWidth,
                viewport.previewHeight / sourceHeight,
              )
            : 0;
        const previewOffsetX =
          viewport != null
            ? (viewport.previewWidth - sourceWidth * previewScale) / 2
            : 0;
        const previewOffsetY =
          viewport != null
            ? (viewport.previewHeight - sourceHeight * previewScale) / 2
            : 0;

        let bestClass = -1;
        let bestScore = 0;
        let bestX = 0;
        let bestY = 0;
        let bestWidth = 0;
        let bestHeight = 0;

        for (let index = 0; index < count; index += 1) {
          const score = scores[index] ?? 0;
          const classId = Math.round(classes[index] ?? -1);
          if (
            score < MIN_DETECTION_SCORE ||
            score <= bestScore ||
            !isRadarCategory(classId)
          ) {
            continue;
          }

          const boxOffset = index * 4;
          const top = clamp(boxes[boxOffset] ?? 0, 0, 1);
          const left = clamp(boxes[boxOffset + 1] ?? 0, 0, 1);
          const bottom = clamp(boxes[boxOffset + 2] ?? 0, 0, 1);
          const right = clamp(boxes[boxOffset + 3] ?? 0, 0, 1);
          const sourceLeft = clamp(
            (cropLeft + left * cropSide) / sourceWidth,
            0,
            1,
          );
          const sourceTop = clamp(
            (cropTop + top * cropSide) / sourceHeight,
            0,
            1,
          );
          const sourceRight = clamp(
            (cropLeft + right * cropSide) / sourceWidth,
            0,
            1,
          );
          const sourceBottom = clamp(
            (cropTop + bottom * cropSide) / sourceHeight,
            0,
            1,
          );
          const width = sourceRight - sourceLeft;
          const height = sourceBottom - sourceTop;

          if (width < 0.04 || height < 0.04) continue;

          if (viewport != null) {
            const sourceCenterX =
              cropLeft + ((left + right) / 2) * cropSide;
            const sourceCenterY =
              cropTop + ((top + bottom) / 2) * cropSide;
            const previewCenterX =
              previewOffsetX + sourceCenterX * previewScale;
            const previewCenterY =
              previewOffsetY + sourceCenterY * previewScale;
            const isInsideFocusBounds =
              previewCenterX >= viewport.x &&
              previewCenterX <= viewport.x + viewport.width &&
              previewCenterY >= viewport.y &&
              previewCenterY <= viewport.y + viewport.height;

            if (!isInsideFocusBounds) continue;
          }

          bestClass = classId;
          bestScore = score;
          bestX = sourceLeft;
          bestY = sourceTop;
          bestWidth = width;
          bestHeight = height;
        }

        if (bestClass < 0) {
          misses.value += 1;
          if (
            misses.value >= MISSES_BEFORE_CLEAR &&
            hasPublishedMarker.value
          ) {
            hasPublishedMarker.value = false;
            stableHits.value = 0;
            scheduleOnRN(clearMarker);
          }
          return;
        }

        misses.value = 0;
        const bestCenterX = bestX + bestWidth / 2;
        const bestCenterY = bestY + bestHeight / 2;
        const trackedCenterX = trackedX.value + trackedWidth.value / 2;
        const trackedCenterY = trackedY.value + trackedHeight.value / 2;
        const movement =
          Math.abs(bestCenterX - trackedCenterX) +
          Math.abs(bestCenterY - trackedCenterY) +
          Math.abs(bestWidth - trackedWidth.value) +
          Math.abs(bestHeight - trackedHeight.value);
        const matchesTrackedObject =
          bestClass === trackedClass.value &&
          movement <= TRACK_MATCH_TOLERANCE;

        if (matchesTrackedObject) {
          const previousWeight = 0.62;
          const currentWeight = 1 - previousWeight;
          trackedX.value =
            trackedX.value * previousWeight + bestX * currentWeight;
          trackedY.value =
            trackedY.value * previousWeight + bestY * currentWeight;
          trackedWidth.value =
            trackedWidth.value * previousWeight + bestWidth * currentWeight;
          trackedHeight.value =
            trackedHeight.value * previousWeight + bestHeight * currentWeight;
          trackedScore.value =
            trackedScore.value * previousWeight + bestScore * currentWeight;
          stableHits.value += 1;
        } else {
          trackedClass.value = bestClass;
          trackedX.value = bestX;
          trackedY.value = bestY;
          trackedWidth.value = bestWidth;
          trackedHeight.value = bestHeight;
          trackedScore.value = bestScore;
          stableHits.value = 1;

          if (
            hasPublishedMarker.value &&
            publishedClass.value !== bestClass
          ) {
            hasPublishedMarker.value = false;
            scheduleOnRN(clearMarker);
          }
        }

        if (stableHits.value < STABLE_HITS_REQUIRED) return;

        const publishedMovement =
          Math.abs(trackedX.value - publishedX.value) +
          Math.abs(trackedY.value - publishedY.value) +
          Math.abs(trackedWidth.value - publishedWidth.value) +
          Math.abs(trackedHeight.value - publishedHeight.value);
        const shouldPublish =
          !hasPublishedMarker.value ||
          publishedClass.value !== trackedClass.value ||
          publishedMovement >= PUBLISH_MOVEMENT_THRESHOLD ||
          stableHits.value % 6 === 0;

        if (shouldPublish) {
          publishedClass.value = trackedClass.value;
          publishedX.value = trackedX.value;
          publishedY.value = trackedY.value;
          publishedWidth.value = trackedWidth.value;
          publishedHeight.value = trackedHeight.value;
          hasPublishedMarker.value = true;
          scheduleOnRN(commitMarker, [
            trackedX.value,
            trackedY.value,
            trackedWidth.value,
            trackedHeight.value,
            trackedClass.value,
            trackedScore.value,
            sourceWidth,
            sourceHeight,
          ]);
        }
      } catch (caughtError) {
        if (!errorReported.value) {
          errorReported.value = true;
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Unknown on-device inference error.";
          scheduleOnRN(reportInferenceError, message);
        }
      } finally {
        resized?.dispose();
        frame.dispose();
      }
    },
  });

  const status: ValueRadarStatus =
    inferenceError ||
    detector.state === "error" ||
    resizerState.state === "error"
      ? "error"
      : detector.state === "loaded" && resizerState.state === "ready"
        ? "ready"
        : "loading";

  return { frameOutput, marker, status };
}
