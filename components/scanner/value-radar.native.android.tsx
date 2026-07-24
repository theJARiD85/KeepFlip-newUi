import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";
import {
  type CameraFrameOutput,
  useAsyncRunner,
  useFrameOutput,
} from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import {
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

const MODEL_SIZE = 320;
const MODEL_INPUT_BYTES = MODEL_SIZE * MODEL_SIZE * 3;
const MAX_DETECTIONS = 25;
const MIN_DETECTION_SCORE = 0.48;
const FRAMES_BETWEEN_INFERENCES = 12;
const MISSES_BEFORE_CLEAR = 3;
const PUBLISH_MOVEMENT_THRESHOLD = 0.015;

const BRIDGE_EVENT_MARKER = 1;
const BRIDGE_EVENT_CLEAR_MARKER = 2;
const BRIDGE_EVENT_ERROR = 3;
const BRIDGE_EVENT_CLEAR_ERROR = 4;

const RADAR_FRAME_RESOLUTION = {
  width: 320,
  height: 240,
} as const;

const TFLITE_DELEGATES: [] = [];

type ValueRadarResult = {
  frameOutput: CameraFrameOutput;
  marker: ValueRadarMarker | null;
  status: ValueRadarStatus;
};

type ValueRadarOverlayProps = {
  disabled?: boolean;
  flashButton?: ReactNode;
  focusBounds?: ValueRadarViewport | null;
  height: number;
  marker: ValueRadarMarker | null;
  onMarkerPress: (marker: ValueRadarMarker) => void;
  status: ValueRadarStatus;
  width: number;
};

/*
 * Android resolves this module before value-radar.native.tsx. Keep the
 * existing static HUD presentation while replacing only its frame processor.
 */
const radarPresentation = require("./value-radar.native.tsx") as {
  ValueRadarOverlay: ComponentType<ValueRadarOverlayProps>;
};

export const ValueRadarOverlay = radarPresentation.ValueRadarOverlay;

function clamp(value: number, minimum: number, maximum: number) {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
}

function isRadarCategory(classId: number) {
  "worklet";

  switch (classId) {
    case 1:
    case 2:
    case 3:
    case 7:
    case 8:
    case 14:
    case 26:
    case 27:
    case 30:
    case 31:
    case 32:
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 45:
    case 46:
    case 47:
    case 48:
    case 49:
    case 50:
    case 61:
    case 62:
    case 63:
    case 64:
    case 66:
    case 71:
    case 72:
    case 73:
    case 74:
    case 75:
    case 76:
    case 77:
    case 78:
    case 79:
    case 81:
    case 83:
    case 84:
    case 85:
    case 86:
    case 87:
    case 88:
    case 89:
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

  const asyncRunner = useAsyncRunner();
  const frameCounter = useSharedValue(0);
  const misses = useSharedValue(0);
  const hasPublishedMarker = useSharedValue(false);
  const publishedClass = useSharedValue(-1);
  const publishedX = useSharedValue(0);
  const publishedY = useSharedValue(0);
  const publishedWidth = useSharedValue(0);
  const publishedHeight = useSharedValue(0);
  const workerErrorActive = useSharedValue(false);

  const bridgeSequence = useSharedValue(0);
  const bridgeKind = useSharedValue(0);
  const bridgePayload = useSharedValue<number[]>([]);
  const bridgeMessage = useSharedValue("");

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
    if (detector.state !== "error" && resizerState.state !== "error") return;

    console.warn(
      "[KeepFlip Value Radar] Android setup failed:",
      detectorError ?? resizerError,
    );
    setInferenceError(true);
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
    misses.value = 0;
    hasPublishedMarker.value = false;
    publishedClass.value = -1;
    workerErrorActive.value = false;
    bridgeKind.value = 0;
    bridgePayload.value = [];
    bridgeMessage.value = "";

    return () => cancelAnimationFrame(resetFrame);
  }, [
    bridgeKind,
    bridgeMessage,
    bridgePayload,
    enabled,
    frameCounter,
    hasPublishedMarker,
    misses,
    publishedClass,
    workerErrorActive,
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

    setInferenceError(false);
    setMarker({
      classId: Math.round(classId),
      height,
      label: radarCategoryLabel(Math.round(classId)),
      score,
      sourceHeight,
      sourceWidth,
      width,
      x,
      y,
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

  useAnimatedReaction(
    () => bridgeSequence.value,
    (sequence, previousSequence) => {
      if (sequence === 0 || sequence === previousSequence) return;

      const kind = bridgeKind.value;
      if (kind === BRIDGE_EVENT_MARKER) {
        scheduleOnRN(commitMarker, bridgePayload.value);
      } else if (kind === BRIDGE_EVENT_CLEAR_MARKER) {
        scheduleOnRN(clearMarker);
      } else if (kind === BRIDGE_EVENT_ERROR) {
        scheduleOnRN(reportInferenceError, bridgeMessage.value);
      } else if (kind === BRIDGE_EVENT_CLEAR_ERROR) {
        scheduleOnRN(clearInferenceError);
      }
    },
    [clearInferenceError, clearMarker, commitMarker, reportInferenceError],
  );

  const model = detector.state === "loaded" ? detector.model : undefined;
  const resizer =
    resizerState.state === "ready" ? resizerState.resizer : undefined;

  /*
   * The AsyncRunner owns a separate JS runtime. Nitro HybridObjects must be
   * boxed on the RN runtime and unboxed inside that worker runtime so their
   * native methods remain callable there.
   */
  const boxedModel = useMemo(
    () => (model == null ? undefined : NitroModules.box(model)),
    [model],
  );
  const boxedResizer = useMemo(
    () => (resizer == null ? undefined : NitroModules.box(resizer)),
    [resizer],
  );

  const frameOutput = useFrameOutput({
    targetResolution: RADAR_FRAME_RESOLUTION,
    pixelFormat: "yuv",
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: true,
    enablePreviewSizedOutputBuffers: true,
    onFrame(frame) {
      "worklet";

      frameCounter.value += 1;
      const shouldRun =
        enabled &&
        boxedModel != null &&
        boxedResizer != null &&
        frameCounter.value % FRAMES_BETWEEN_INFERENCES === 0;

      if (!shouldRun) {
        frame.dispose();
        return;
      }

      const wasHandled = asyncRunner.runAsync(() => {
        "worklet";

        let resized:
          | ReturnType<ReturnType<typeof boxedResizer.unbox>["resize"]>
          | undefined;
        let stage = "unbox";

        try {
          const workerModel = boxedModel.unbox();
          const workerResizer = boxedResizer.unbox();
          const sourceWidth = Math.max(frame.width, 1);
          const sourceHeight = Math.max(frame.height, 1);

          stage = "resize";
          resized = workerResizer.resize(frame);

          stage = "pixel-buffer";
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

          stage = "tflite";
          const outputs = workerModel.runSync([inputBuffer]);
          if (
            outputs[0] == null ||
            outputs[1] == null ||
            outputs[2] == null ||
            outputs[3] == null
          ) {
            throw new Error("EfficientDet returned an incomplete result.");
          }

          const hadWorkerError = workerErrorActive.value;
          workerErrorActive.value = false;

          stage = "parse";
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
            const detectionWidth = sourceRight - sourceLeft;
            const detectionHeight = sourceBottom - sourceTop;

            if (detectionWidth < 0.04 || detectionHeight < 0.04) continue;

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
            bestWidth = detectionWidth;
            bestHeight = detectionHeight;
          }

          stage = "publish";
          if (bestClass < 0) {
            misses.value += 1;
            if (
              misses.value >= MISSES_BEFORE_CLEAR &&
              hasPublishedMarker.value
            ) {
              hasPublishedMarker.value = false;
              publishedClass.value = -1;
              bridgeKind.value = BRIDGE_EVENT_CLEAR_MARKER;
              bridgeSequence.value += 1;
            } else if (hadWorkerError) {
              bridgeKind.value = BRIDGE_EVENT_CLEAR_ERROR;
              bridgeSequence.value += 1;
            }
            return;
          }

          misses.value = 0;
          const publishedMovement =
            Math.abs(bestX - publishedX.value) +
            Math.abs(bestY - publishedY.value) +
            Math.abs(bestWidth - publishedWidth.value) +
            Math.abs(bestHeight - publishedHeight.value);
          const shouldPublish =
            !hasPublishedMarker.value ||
            publishedClass.value !== bestClass ||
            publishedMovement >= PUBLISH_MOVEMENT_THRESHOLD;

          if (!shouldPublish) {
            if (hadWorkerError) {
              bridgeKind.value = BRIDGE_EVENT_CLEAR_ERROR;
              bridgeSequence.value += 1;
            }
            return;
          }

          publishedClass.value = bestClass;
          publishedX.value = bestX;
          publishedY.value = bestY;
          publishedWidth.value = bestWidth;
          publishedHeight.value = bestHeight;
          hasPublishedMarker.value = true;
          bridgePayload.value = [
            bestX,
            bestY,
            bestWidth,
            bestHeight,
            bestClass,
            bestScore,
            sourceWidth,
            sourceHeight,
          ];
          bridgeKind.value = BRIDGE_EVENT_MARKER;
          bridgeSequence.value += 1;
        } catch (caughtError) {
          if (!workerErrorActive.value) {
            workerErrorActive.value = true;
            const detail =
              caughtError instanceof Error
                ? caughtError.message
                : String(caughtError);
            bridgeMessage.value = `[${stage}] ${detail}`;
            bridgeKind.value = BRIDGE_EVENT_ERROR;
            bridgeSequence.value += 1;
          }
        } finally {
          resized?.dispose();
          frame.dispose();
        }
      });

      if (!wasHandled) {
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
