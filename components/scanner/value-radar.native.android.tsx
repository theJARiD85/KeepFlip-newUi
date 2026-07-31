import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useYoloV8Model } from "@/hooks/use-yolov8-model.native";
import {
  type CameraFrameOutput,
  useAsyncRunner,
  useFrameOutput,
} from "react-native-vision-camera";
import type { TensorflowModelDelegate } from "react-native-fast-tflite";
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
} from "@/components/scanner/value-radar-visual.native";
import {
  YOLOV8_CANDIDATE_COUNT,
  YOLOV8_CLASS_COUNT,
  YOLOV8_INPUT_BYTES,
  YOLOV8_MODEL_SIZE,
  YOLOV8_OUTPUT_ELEMENTS,
  yoloV8RadarCategoryLabel,
} from "@/components/scanner/yolov8-radar";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "@/components/scanner/value-radar-visual.native";

const MIN_DETECTION_SCORE = 0.48;

// YOLOv8n's 640px float tensor is substantially heavier than the previous
// detector. At 30 FPS this requests inference about 1.25 times per second, and
// the single-flight gate prevents overlap while the worker is still busy.
const FRAMES_BETWEEN_INFERENCES = 24;

const BRIDGE_EVENT_MARKER = 1;
const BRIDGE_EVENT_CLEAR_MARKER = 2;
const BRIDGE_EVENT_ERROR = 3;

const RADAR_FRAME_RESOLUTION = {
  width: 640,
  height: 640,
} as const;


const TFLITE_DELEGATES: TensorflowModelDelegate[] = [];
type ValueRadarResult = {
  frameOutput: CameraFrameOutput;
  marker: ValueRadarMarker | null;
  status: ValueRadarStatus;
};

type ValueRadarOverlayProps = {
  avoidBottomAction?: boolean;
  disabled?: boolean;
  flashButton?: ReactNode;
  focusBounds?: ValueRadarViewport | null;
  height: number;
  marker: ValueRadarMarker | null;
  onMarkerPress: (marker: ValueRadarMarker) => void;
  status: ValueRadarStatus;
  width: number;
};

type ResizedFrame = {
  dispose(): void;
  getPixelBuffer(): ArrayBuffer;
};

const radarPresentation = require("@/components/scanner/value-radar.native.tsx") as {
  ValueRadarOverlay: ComponentType<ValueRadarOverlayProps>;
};

export const ValueRadarOverlay = radarPresentation.ValueRadarOverlay;

export function useValueRadar(
  enabled: boolean,
  viewport?: ValueRadarViewport,
): ValueRadarResult {
  const [marker, setMarker] = useState<ValueRadarMarker | null>(null);
  const [inferenceError, setInferenceError] = useState(false);

  const asyncRunner = useAsyncRunner();
  const frameCounter = useSharedValue(0);

  // This gate is intentionally owned by the camera/worklet runtimes rather
  // than React state. Calling runAsync while its runtime mutex is already held
  // can block com.margelo.camera.frame. A true value means every incoming frame
  // must be discarded before runAsync is touched.
  const workerBusy = useSharedValue(false);
  const inferenceBlocked = useSharedValue(false);
  const bridgeSequence = useSharedValue(0);
  const bridgeKind = useSharedValue(0);
  const bridgePayload = useSharedValue<number[]>([]);
  const bridgeMessage = useSharedValue("");

  const detector = useYoloV8Model(TFLITE_DELEGATES);
  const resizerState = useResizer({
    width: YOLOV8_MODEL_SIZE,
    height: YOLOV8_MODEL_SIZE,
    channelOrder: "rgb",
    dataType: "float32",
    scaleMode: "cover",
    pixelLayout: "planar",
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

    setMarker(null);
    setInferenceError(false);
    frameCounter.value = 0;
    workerBusy.value = false;
    inferenceBlocked.value = false;
    bridgeKind.value = 0;
    bridgePayload.value = [];
    bridgeMessage.value = "";
  }, [
    bridgeKind,
    bridgeMessage,
    bridgePayload,
    enabled,
    frameCounter,
    inferenceBlocked,
    workerBusy,
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

    const roundedClassId = Math.round(classId);
    setInferenceError(false);
    setMarker({
      classId: roundedClassId,
      height,
      label: yoloV8RadarCategoryLabel(roundedClassId),
      score,
      sourceHeight,
      sourceWidth,
      width,
      x,
      y,
    });
  }, []);

  const clearMarker = useCallback(() => {
    // Reaching this callback means inference completed successfully but
    // no eligible object was found in the current frame.
    setInferenceError(false);
    setMarker(null);
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
      }
    },
    [clearMarker, commitMarker, reportInferenceError],
  );

  const model = detector.state === "loaded" ? detector.model : undefined;
  const resizer =
    resizerState.state === "ready" ? resizerState.resizer : undefined;

  const frameOutput = useFrameOutput({
    targetResolution: RADAR_FRAME_RESOLUTION,
    pixelFormat: "yuv",
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: false,
    enablePreviewSizedOutputBuffers: true,
    onFrame(frame) {
      "worklet";

      frameCounter.value += 1;
      const isInferenceFrame =
        frameCounter.value % FRAMES_BETWEEN_INFERENCES === 0;

        if (
          !enabled ||
          model == null ||
          resizer == null ||
          !isInferenceFrame ||
          workerBusy.value ||
          inferenceBlocked.value
        ) {
          frame.dispose();
          return;
        }

      // Set this before touching runAsync. This is the critical difference from
      // the previous implementation: no later frame may attempt to enter the
      // worker runtime while its recursive mutex is owned by inference.
      workerBusy.value = true;

      const workerModel = model;
      const workerResizer = resizer;
      
      const wasHandled = asyncRunner.runAsync(() => {
        "worklet";
      
        let resized: ResizedFrame | undefined;
        let stage = "resize";
      
        try {
          const sourceWidth = Math.max(frame.width, 1);
          const sourceHeight = Math.max(frame.height, 1);

          stage = "resize";
          resized = workerResizer.resize(frame) as ResizedFrame;

          stage = "pixel-buffer";
          const pixels = new Float32Array(resized.getPixelBuffer());
          if (pixels.byteLength !== YOLOV8_INPUT_BYTES) {
            throw new Error(
              `YOLOv8 input buffer size mismatch: ${pixels.byteLength} bytes received, ${YOLOV8_INPUT_BYTES} expected.`,
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
          if (outputs[0] == null) {
            throw new Error("YOLOv8 returned no detection tensor.");
          }

          stage = "parse-output";
          const detectionOutput = new Float32Array(outputs[0]);
          if (detectionOutput.length < YOLOV8_OUTPUT_ELEMENTS) {
            throw new Error(
              `YOLOv8 output size mismatch: ${detectionOutput.length} floats received, ${YOLOV8_OUTPUT_ELEMENTS} expected.`,
            );
          }

          // Keep decoding inside this async camera worklet. Imported worklet
          // functions are serialized as objects when they cross into this
          // secondary runtime and are therefore not callable here.
          let bestCandidate = -1;
          let modelClass = -1;
          let modelScore = MIN_DETECTION_SCORE;

          for (
            let classId = 0;
            classId < YOLOV8_CLASS_COUNT;
            classId += 1
          ) {
            let isAllowedCategory = false;
            switch (classId) {
              case 1:
              case 2:
              case 3:
              case 5:
              case 7:
              case 8:
              case 13:
              case 24:
              case 25:
              case 26:
              case 27:
              case 28:
              case 29:
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
              case 44:
              case 45:
              case 56:
              case 57:
              case 58:
              case 59:
              case 60:
              case 62:
              case 63:
              case 64:
              case 65:
              case 66:
              case 67:
              case 68:
              case 69:
              case 70:
              case 72:
              case 73:
              case 74:
              case 75:
              case 76:
              case 77:
              case 78:
              case 79:
                isAllowedCategory = true;
                break;
              default:
                break;
            }

            if (!isAllowedCategory) continue;

            const classOffset =
              (4 + classId) * YOLOV8_CANDIDATE_COUNT;
            for (
              let candidate = 0;
              candidate < YOLOV8_CANDIDATE_COUNT;
              candidate += 1
            ) {
              const score =
                detectionOutput[classOffset + candidate] ?? 0;
              if (
                !Number.isFinite(score) ||
                score <= modelScore
              ) {
                continue;
              }

              bestCandidate = candidate;
              modelClass = classId;
              modelScore = score;
            }
          }

          let modelLeft = 0;
          let modelTop = 0;
          let modelWidth = 0;
          let modelHeight = 0;

          if (bestCandidate >= 0 && modelClass >= 0) {
            const centerX =
              detectionOutput[bestCandidate] ?? 0;
            const centerY =
              detectionOutput[
                YOLOV8_CANDIDATE_COUNT + bestCandidate
              ] ?? 0;
            const rawWidth =
              detectionOutput[
                YOLOV8_CANDIDATE_COUNT * 2 + bestCandidate
              ] ?? 0;
            const rawHeight =
              detectionOutput[
                YOLOV8_CANDIDATE_COUNT * 3 + bestCandidate
              ] ?? 0;

            if (
              Number.isFinite(centerX) &&
              Number.isFinite(centerY) &&
              Number.isFinite(rawWidth) &&
              Number.isFinite(rawHeight) &&
              rawWidth > 0 &&
              rawHeight > 0
            ) {
              modelLeft = Math.min(
                Math.max(centerX - rawWidth / 2, 0),
                1,
              );
              modelTop = Math.min(
                Math.max(centerY - rawHeight / 2, 0),
                1,
              );
              const modelRight = Math.min(
                Math.max(centerX + rawWidth / 2, 0),
                1,
              );
              const modelBottom = Math.min(
                Math.max(centerY + rawHeight / 2, 0),
                1,
              );
              modelWidth = modelRight - modelLeft;
              modelHeight = modelBottom - modelTop;
            }

            if (modelWidth <= 0 || modelHeight <= 0) {
              modelClass = -1;
            }
          }

          stage = "publish";
          if (modelClass < 0) {
            bridgeKind.value = BRIDGE_EVENT_CLEAR_MARKER;
            bridgeSequence.value += 1;
            return;
          }

          const cropSide = Math.min(sourceWidth, sourceHeight);
          const cropLeft = (sourceWidth - cropSide) / 2;
          const cropTop = (sourceHeight - cropSide) / 2;
          const previewScale =
            viewport == null
              ? 0
              : Math.max(
                  viewport.previewWidth / sourceWidth,
                  viewport.previewHeight / sourceHeight,
                );
          const previewOffsetX =
            viewport == null
              ? 0
              : (viewport.previewWidth - sourceWidth * previewScale) / 2;
          const previewOffsetY =
            viewport == null
              ? 0
              : (viewport.previewHeight - sourceHeight * previewScale) / 2;

          stage = "map-detection-box";
          const right = modelLeft + modelWidth;
          const bottom = modelTop + modelHeight;
          const sourceLeft = Math.min(
            Math.max(
              (cropLeft + modelLeft * cropSide) / sourceWidth,
              0,
            ),
            1,
          );
          const sourceTop = Math.min(
            Math.max(
              (cropTop + modelTop * cropSide) / sourceHeight,
              0,
            ),
            1,
          );
          const sourceRight = Math.min(
            Math.max((cropLeft + right * cropSide) / sourceWidth, 0),
            1,
          );
          const sourceBottom = Math.min(
            Math.max((cropTop + bottom * cropSide) / sourceHeight, 0),
            1,
          );
          const detectionWidth = sourceRight - sourceLeft;
          const detectionHeight = sourceBottom - sourceTop;

          if (detectionWidth < 0.04 || detectionHeight < 0.04) {
            bridgeKind.value = BRIDGE_EVENT_CLEAR_MARKER;
            bridgeSequence.value += 1;
            return;
          }

          if (viewport != null) {
            const sourceCenterX =
              cropLeft +
              (modelLeft + modelWidth / 2) * cropSide;
            const sourceCenterY =
              cropTop +
              (modelTop + modelHeight / 2) * cropSide;
            const previewCenterX =
              previewOffsetX + sourceCenterX * previewScale;
            const previewCenterY =
              previewOffsetY + sourceCenterY * previewScale;

            if (
              previewCenterX < viewport.x ||
              previewCenterX > viewport.x + viewport.width ||
              previewCenterY < viewport.y ||
              previewCenterY > viewport.y + viewport.height
            ) {
              bridgeKind.value = BRIDGE_EVENT_CLEAR_MARKER;
              bridgeSequence.value += 1;
              return;
            }
          }

          stage = "publish";
          bridgePayload.value = [
            sourceLeft,
            sourceTop,
            detectionWidth,
            detectionHeight,
            modelClass,
            modelScore,
            sourceWidth,
            sourceHeight,
          ];
          bridgeKind.value = BRIDGE_EVENT_MARKER;
          bridgeSequence.value += 1;

        } catch (caughtError) {
          inferenceBlocked.value = true;
        
          let errorDetail = "Unknown native error";
        
          try {
            errorDetail = String(caughtError);
          } catch {
            // Keep the fallback description.
          }
        
          bridgeMessage.value =
            `[${stage}] asynchronous inference failed: ${errorDetail}`;
        
          bridgeKind.value = BRIDGE_EVENT_ERROR;
          bridgeSequence.value += 1;
        } finally {
          resized?.dispose();
          frame.dispose();
          workerBusy.value = false;
        }
      });

      if (!wasHandled) {
        workerBusy.value = false;
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
