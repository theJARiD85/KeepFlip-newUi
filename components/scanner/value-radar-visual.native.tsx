import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { TensorflowModelDelegate } from "react-native-fast-tflite";
import { useYoloV8Model } from "@/hooks/use-yolov8-model.native";
import { Image } from 'expo-image';
import {
  type CameraFrameOutput,
  useFrameOutput,
} from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import {
  YOLOV8_CANDIDATE_COUNT,
  YOLOV8_CLASS_COUNT,
  YOLOV8_INPUT_BYTES,
  YOLOV8_MODEL_SIZE,
  YOLOV8_OUTPUT_ELEMENTS,
  yoloV8RadarCategoryLabel,
} from "@/components/scanner/yolov8-radar";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const MIN_DETECTION_SCORE = 0.48;
const FRAMES_BETWEEN_INFERENCES = 24;
const STABLE_HITS_REQUIRED = 2;
const MISSES_BEFORE_CLEAR = 4;
const TRACK_MATCH_TOLERANCE = 0.28;
const PUBLISH_MOVEMENT_THRESHOLD = 0.035;

const RADAR_FRAME_RESOLUTION = {
  width: 640,
  height: 640,
} as const;

const TFLITE_DELEGATES: TensorflowModelDelegate[] = [];

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

function clamp(value: number, minimum: number, maximum: number) {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
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
    if (detector.state === "error" || resizerState.state === "error") {
      const error = detectorError ?? resizerError;
      console.warn("[KeepFlip Value Radar] setup failed:", error);
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
    });

    return () => cancelAnimationFrame(resetFrame);
  }, [enabled]);

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
    setMarker({
      x,
      y,
      width,
      height,
      classId: roundedClassId,
      label: yoloV8RadarCategoryLabel(roundedClassId),
      score,
      sourceHeight,
      sourceWidth,
    });
  }, []);

  const clearMarker = useCallback(() => {
    setMarker(null);
  }, []);

  const clearInferenceError = useCallback(() => {
    setInferenceError(false);
  }, []);

  const reportInferenceError = useCallback((message: string) => {
    console.warn("[KeepFlip Value Radar] inference failed:", message);
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
        const pixels = new Float32Array(resized.getPixelBuffer());
        if (pixels.byteLength !== YOLOV8_INPUT_BYTES) {
          throw new Error(
            `YOLOv8 input buffer size mismatch: ${pixels.byteLength} bytes received, ${YOLOV8_INPUT_BYTES} expected.`,
          );
        }

        const inputBuffer = pixels.buffer.slice(
          pixels.byteOffset,
          pixels.byteOffset + pixels.byteLength,
        );
        resized.dispose();
        resized = undefined;

        const outputs = model.runSync([inputBuffer]);
        if (outputs[0] == null) {
          throw new Error("YOLOv8 returned no detection tensor.");
        }

        const detectionOutput = new Float32Array(outputs[0]);
        if (detectionOutput.length < YOLOV8_OUTPUT_ELEMENTS) {
          throw new Error(
            `YOLOv8 output size mismatch: ${detectionOutput.length} floats received, ${YOLOV8_OUTPUT_ELEMENTS} expected.`,
          );
        }

        // This decoder intentionally lives inside the camera worklet. Passing
        // imported worklet functions into a secondary runtime turns them into
        // non-callable serialized objects on affected Android builds.
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
          const centerX = detectionOutput[bestCandidate] ?? 0;
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

        if (modelClass >= 0) {
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
            Math.max(
              (cropLeft + right * cropSide) / sourceWidth,
              0,
            ),
            1,
          );
          const sourceBottom = Math.min(
            Math.max(
              (cropTop + bottom * cropSide) / sourceHeight,
              0,
            ),
            1,
          );
          const width = sourceRight - sourceLeft;
          const height = sourceBottom - sourceTop;
          let isInsideFocusBounds = true;

          if (width >= 0.04 && height >= 0.04 && viewport != null) {
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
            isInsideFocusBounds =
              previewCenterX >= viewport.x &&
              previewCenterX <= viewport.x + viewport.width &&
              previewCenterY >= viewport.y &&
              previewCenterY <= viewport.y + viewport.height;
          }

          if (
            width >= 0.04 &&
            height >= 0.04 &&
            isInsideFocusBounds
          ) {
            bestClass = modelClass;
            bestScore = modelScore;
            bestX = sourceLeft;
            bestY = sourceTop;
            bestWidth = width;
            bestHeight = height;
          }
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

        if (stableHits.value < STABLE_HITS_REQUIRED) {
          return;
        }

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

export function ValueRadarOverlay({
  disabled = false,
  focusBounds,
  height,
  marker,
  onMarkerPress,
  status,
  width,
}: ValueRadarOverlayProps) {
  const hasMarker = marker != null;
  const markerClassId = marker?.classId;
  const orbitProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(orbitProgress);
    cancelAnimation(pulseProgress);
    orbitProgress.value = 0;
    pulseProgress.value = 0;

    if (status !== "error") {
      pulseProgress.value = withRepeat(
        withTiming(1, {
          duration: 980,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      );
    }

    if (hasMarker && status === "ready") {
      orbitProgress.value = withRepeat(
        withTiming(1, {
          duration: 3200,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    }

    return () => {
      cancelAnimation(orbitProgress);
      cancelAnimation(pulseProgress);
    };
  }, [
    hasMarker,
    markerClassId,
    orbitProgress,
    pulseProgress,
    status,
  ]);

  const orbitAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitProgress.value * 360}deg` }],
  }));
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.38 + pulseProgress.value * 0.62,
    transform: [{ scale: 0.88 + pulseProgress.value * 0.18 }],
  }));

  const focusScaleX =
    focusBounds != null
      ? width / Math.max(focusBounds.previewWidth, 1)
      : 1;
  const focusScaleY =
    focusBounds != null
      ? height / Math.max(focusBounds.previewHeight, 1)
      : 1;
  const focusX = focusBounds ? focusBounds.x * focusScaleX : 12;
  const focusY = focusBounds
    ? focusBounds.y * focusScaleY
    : Math.max(96, height * 0.22);
  const focusWidth = focusBounds
    ? focusBounds.width * focusScaleX
    : width - 24;
  const focusHeight = focusBounds
    ? focusBounds.height * focusScaleY
    : Math.min(360, height * 0.48);

  const statusWidth = Math.min(194, Math.max(154, focusWidth - 24));
  const statusLeft = clamp(
    focusX + focusWidth - statusWidth - 12,
    8,
    Math.max(8, width - statusWidth - 8),
  );
  const statusTop = clamp(
    marker && status === "ready" ? focusY - 58 : focusY + 12,
    8,
    Math.max(8, height - 60),
  );
  const statusLabel =
    status === "ready"
      ? "ONLINE"
      : status === "error"
        ? "OFFLINE"
        : "CALIBRATING";
  const statusMeta =
    status === "ready"
      ? "LOCAL VISION // PASSIVE"
      : status === "error"
        ? "MODEL RETRY REQUIRED"
        : "LOADING ON-DEVICE MODEL";
  const acquisitionLabel =
    status === "ready"
      ? marker
        ? "TARGET 01 // LOCKED"
        : "SEARCHING OBJECT FIELD"
      : status === "error"
        ? "SENSOR PATH INTERRUPTED"
        : "INITIALIZING SENSOR PATH";

  const sourceWidth = Math.max(marker?.sourceWidth ?? width, 1);
  const sourceHeight = Math.max(marker?.sourceHeight ?? height, 1);
  const previewScale = Math.max(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * previewScale;
  const renderedHeight = sourceHeight * previewScale;
  const previewOffsetX = (width - renderedWidth) / 2;
  const previewOffsetY = (height - renderedHeight) / 2;
  const rawMarkerLeft = marker
    ? previewOffsetX + marker.x * renderedWidth
    : focusX;
  const rawMarkerTop = marker
    ? previewOffsetY + marker.y * renderedHeight
    : focusY;
  const rawMarkerWidth = marker ? marker.width * renderedWidth : 0;
  const rawMarkerHeight = marker ? marker.height * renderedHeight : 0;
  const rawMarkerCenterX = rawMarkerLeft + rawMarkerWidth / 2;
  const rawMarkerCenterY = rawMarkerTop + rawMarkerHeight / 2;
  const maxTargetWidth = Math.max(
    72,
    Math.min(280, focusWidth - 12),
  );
  
  const maxTargetHeight = Math.max(
    72,
    Math.min(320, focusHeight - 12),
  );
  const minTargetWidth = Math.min(46, maxTargetWidth);
  const minTargetHeight = Math.min(46, maxTargetHeight);
  const targetWidth = clamp(
    rawMarkerWidth + 26,
    minTargetWidth,
    maxTargetWidth,
  );
  const targetHeight = clamp(
    rawMarkerHeight + 26,
    minTargetHeight,
    maxTargetHeight,
  );
  const targetLeft = clamp(
    rawMarkerCenterX - targetWidth / 2,
    focusX + 8,
    Math.max(focusX + 8, focusX + focusWidth - targetWidth - 8),
  );
  const targetTop = clamp(
    rawMarkerCenterY - targetHeight / 2,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - targetHeight - 8),
  );
  const orbitSize = Math.max(48, Math.min(targetWidth, targetHeight) - 18);
  const scanBeamAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: orbitProgress.value * Math.max(0, targetHeight - 2),
        },
      ],
    }),
    [targetHeight],
  );

  const panelWidth = Math.min(238, Math.max(154, focusWidth - 18));
  const panelHeight = 78;
  const panelLeft = clamp(
    targetLeft + targetWidth / 2 - panelWidth / 2,
    focusX + 8,
    Math.max(focusX + 8, focusX + focusWidth - panelWidth - 8),
  );
  const canPlacePanelAbove =
    targetTop - panelHeight - 12 >= focusY + 8;
  const panelTop = clamp(
    canPlacePanelAbove
      ? targetTop - panelHeight - 12
      : targetTop + targetHeight + 12,
    focusY + 8,
    Math.max(focusY + 8, focusY + focusHeight - panelHeight - 8),
  );
  const railWidth = Math.min(224, Math.max(150, focusWidth - 24));
  const railLeft = clamp(
    focusX + 12,
    8,
    Math.max(8, width - railWidth - 8),
  );
  const railTop = clamp(
    focusY + focusHeight - 12,
    8,
    Math.max(8, height - 28),
  );

  return (
    <View pointerEvents="box-none" style={styles.overlayRoot}>
      <View
        pointerEvents="none"
        style={[
          styles.statusModule,
          { left: statusLeft, top: statusTop, width: statusWidth },
          status === "error" && styles.statusModuleError,
        ]}
      >
        <View
          style={[
            styles.statusAccent,
            status === "loading" && styles.statusAccentLoading,
            status === "error" && styles.statusAccentError,
          ]}
        />
        <View style={styles.statusHeading}>
          <Animated.View
            style={[
              styles.statusPulse,
              pulseAnimatedStyle,
              status === "loading" && styles.statusPulseLoading,
              status === "error" && styles.statusPulseError,
            ]}
          />
          <Text style={styles.statusName}>VALUE RADAR</Text>
          <Text style={styles.statusSeparator}>{"//"}</Text>
          <Text
            style={[
              styles.statusState,
              status === "loading" && styles.statusStateLoading,
              status === "error" && styles.statusStateError,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
        <View style={styles.statusFooter}>
          <Text numberOfLines={1} style={styles.statusMeta}>
            {statusMeta}
          </Text>
          <View style={styles.signalBars}>
            <View style={[styles.signalBar, styles.signalBarLow]} />
            <View style={[styles.signalBar, styles.signalBarMid]} />
            <View
              style={[
                styles.signalBar,
                styles.signalBarHigh,
                status === "error" && styles.signalBarError,
              ]}
            />
          </View>
        </View>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.acquisitionRail,
          { left: railLeft, top: railTop, width: railWidth },
          status === "error" && styles.acquisitionRailError,
        ]}
      >
        <View style={styles.acquisitionIndex}>
          <Text style={styles.acquisitionIndexText}>
            {marker && status === "ready" ? "01" : "--"}
          </Text>
        </View>
        <View style={styles.acquisitionTrack}>
          <View style={styles.acquisitionTrackLine} />
          <Animated.View
            style={[
              styles.acquisitionTrackNode,
              pulseAnimatedStyle,
              status === "error" && styles.acquisitionTrackNodeError,
            ]}
          />
        </View>
        <Text numberOfLines={1} style={styles.acquisitionText}>
          {acquisitionLabel}
        </Text>
      </View>

      {marker && status === "ready" ? (
        <>
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(140)}
            pointerEvents="none"
            style={[
              styles.targetHost,
              {
                height: targetHeight,
                left: targetLeft,
                top: targetTop,
                width: targetWidth,
              },
            ]}
          >
            <Animated.View
              style={[styles.targetHalo, pulseAnimatedStyle]}
            />
            <Animated.View
              style={[
                styles.targetOrbit,
                {
                  height: orbitSize,
                  left: (targetWidth - orbitSize) / 2,
                  top: (targetHeight - orbitSize) / 2,
                  width: orbitSize,
                },
                orbitAnimatedStyle,
              ]}
            />
            <View style={styles.targetInnerRing} />
            <View style={[styles.targetCorner, styles.targetCornerTopLeft]} />
            <View style={[styles.targetCorner, styles.targetCornerTopRight]} />
            <View
              style={[styles.targetCorner, styles.targetCornerBottomLeft]}
            />
            <View
              style={[styles.targetCorner, styles.targetCornerBottomRight]}
            />
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairVertical} />
            <View style={styles.targetCore}>
              <View style={styles.targetCoreDot} />
            </View>
            <Animated.View
              style={[styles.targetScanBeam, scanBeamAnimatedStyle]}
            />
            <View style={styles.targetId}>
              <Text style={styles.targetIdText}>T-01</Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(70).duration(220)}
            exiting={FadeOut.duration(120)}
            style={[
              styles.markerPanelHost,
              {
                left: panelLeft,
                top: panelTop,
                width: panelWidth,
                height: 100,
              },
            ]}
          >
            <Image
              source={require("@/assets/potential-find.svg")}
              contentFit="fill"
              transition={100}
              pointerEvents="none"
              style={[
                {
                  flex: 1,
                  height: '75%',
                  width: '100%',
                },
              ]}
            />
            <Pressable
              accessibilityHint="Captures this item for full KeepFlip identification and current market analysis"
              accessibilityLabel={`Analyze potential ${marker.label}`}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => onMarkerPress(marker)}
              style={({ pressed }) => [
                styles.markerPanel,
                pressed && styles.markerPanelPressed,
                disabled && styles.markerPanelDisabled,
              ]}
            >
              <View style={styles.markerPanelAccent} />
              <View style={styles.markerPanelHeading}>
                <View style={styles.lockGlyph}>
                  <View style={styles.lockGlyphCore} />
                </View>
                <Text style={styles.markerEyebrow}>POTENTIAL FIND</Text>
                <View style={styles.confidencePill}>
                  <Text style={styles.confidenceText}>
                    {Math.round(marker.score * 100)
                      .toString()
                      .padStart(2, "0")}
                    % LOCK
                  </Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.markerLabel}>
                {marker.label}
              </Text>
              <View style={styles.markerPanelFooter}>
                <Text numberOfLines={1} style={styles.markerAction}>
                  CLASS {marker.classId.toString().padStart(2, "0")} {"//"} TAP
                  TO ANALYZE VALUE
                </Text>
                <Text style={styles.markerChevron}>›</Text>
              </View>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFill,
    bottom: 40
  },
  statusModule: {
    position: "absolute",
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(3, 7, 12, 0.88)",
    experimental_backgroundImage: `
      radial-gradient(circle at 100% 0%, rgba(141, 114, 255, 0.18) 0%, transparent 48%),
      linear-gradient(110deg, rgba(88, 223, 232, 0.09) 0%, rgba(4, 6, 11, 0.02) 48%)
    `,
    boxShadow:
      "0 0 24px rgba(88, 223, 232, 0.12), 0 7px 20px rgba(0, 0, 0, 0.36)",
    gap: 5,
  },
  statusModuleError: {
    borderColor: "rgba(232, 97, 88, 0.48)",
  },
  statusAccent: {
    position: "absolute",
    top: 7,
    bottom: 7,
    left: 0,
    width: 2,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  statusAccentLoading: {
    backgroundColor: theme.colors.goldBright,
  },
  statusAccentError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "0 0 8px rgba(232, 97, 88, 0.72)",
  },
  statusHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.88)",
  },
  statusPulseLoading: {
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 8px rgba(242, 211, 138, 0.72)",
  },
  statusPulseError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "none",
  },
  statusName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 1.2,
  },
  statusSeparator: {
    color: "rgba(141, 114, 255, 0.78)",
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
  },
  statusState: {
    marginLeft: "auto",
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.9,
  },
  statusStateLoading: {
    color: theme.colors.goldBright,
  },
  statusStateError: {
    color: theme.colors.danger,
  },
  statusFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  statusMeta: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.52)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.72,
  },
  signalBars: {
    height: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.scannerCyan,
  },
  signalBarLow: {
    height: 3,
    opacity: 0.4,
  },
  signalBarMid: {
    height: 6,
    opacity: 0.66,
  },
  signalBarHigh: {
    height: 9,
  },
  signalBarError: {
    backgroundColor: theme.colors.danger,
  },
  acquisitionRail: {
    position: "absolute",
    minHeight: 22,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(2, 5, 9, 0.58)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  acquisitionRailError: {
    borderColor: "rgba(232, 97, 88, 0.38)",
  },
  acquisitionIndex: {
    width: 19,
    height: 14,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(141, 114, 255, 0.16)",
    borderWidth: 0.5,
    borderColor: "rgba(141, 114, 255, 0.38)",
  },
  acquisitionIndexText: {
    color: theme.colors.scannerViolet,
    fontFamily: theme.fonts.analysis,
    fontSize: 7,
    lineHeight: 9,
    fontVariant: ["tabular-nums"],
  },
  acquisitionTrack: {
    width: 25,
    height: 8,
    justifyContent: "center",
  },
  acquisitionTrackLine: {
    height: 1,
    backgroundColor: "rgba(88, 223, 232, 0.34)",
  },
  acquisitionTrackNode: {
    position: "absolute",
    left: 9,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  acquisitionTrackNodeError: {
    backgroundColor: theme.colors.danger,
    boxShadow: "none",
  },
  acquisitionText: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.58)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.66,
  },
  targetHost: {
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  targetHalo: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    experimental_backgroundImage: `
      radial-gradient(circle at center, rgba(88, 223, 232, 0.19) 0%, rgba(141, 114, 255, 0.08) 38%, transparent 72%)
    `,
  },
  targetOrbit: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(141, 114, 255, 0.66)",
    boxShadow: "0 0 12px rgba(141, 114, 255, 0.18)",
  },
  targetInnerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(3, 8, 13, 0.16)",
  },
  targetCorner: {
    position: "absolute",
    width: 25,
    height: 25,
    borderColor: theme.colors.scannerCyan,
  },
  targetCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    boxShadow: "-2px -2px 10px rgba(88, 223, 232, 0.34)",
  },
  targetCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.colors.scannerViolet,
    boxShadow: "2px -2px 10px rgba(141, 114, 255, 0.34)",
  },
  targetCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.goldBright,
    boxShadow: "-2px 2px 10px rgba(242, 211, 138, 0.26)",
  },
  targetCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    boxShadow: "2px 2px 10px rgba(88, 223, 232, 0.34)",
  },
  crosshairHorizontal: {
    position: "absolute",
    left: "31%",
    right: "31%",
    height: 1,
    backgroundColor: "rgba(88, 223, 232, 0.42)",
  },
  crosshairVertical: {
    position: "absolute",
    top: "31%",
    bottom: "31%",
    width: 1,
    backgroundColor: "rgba(88, 223, 232, 0.42)",
  },
  targetCore: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.64)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 10px rgba(242, 211, 138, 0.34)",
  },
  targetCoreDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.goldBright,
  },
  targetScanBeam: {
    position: "absolute",
    top: 0,
    right: 5,
    left: 5,
    height: 1,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  targetId: {
    position: "absolute",
    top: 5,
    left: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "rgba(3, 7, 12, 0.76)",
    borderWidth: 0.5,
    borderColor: "rgba(88, 223, 232, 0.34)",
  },
  targetIdText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 6,
    lineHeight: 7,
    letterSpacing: 0.6,
  },
  markerPanelHost: {
    position: "absolute",
    zIndex: 12,
  },
  markerPanel: {
    width: "100%",
    minHeight: 45,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.52)",
    backgroundColor: "rgba(3, 7, 12, 0.94)",
    experimental_backgroundImage: `
      radial-gradient(circle at 100% 0%, rgba(141, 114, 255, 0.17) 0%, transparent 44%),
      linear-gradient(115deg, rgba(88, 223, 232, 0.10) 0%, rgba(3, 7, 12, 0.02) 54%)
    `,
    boxShadow:
      "0 0 28px rgba(88, 223, 232, 0.18), 0 8px 22px rgba(0, 0, 0, 0.52)",
    gap: 3,
  },
  markerPanelAccent: {
    position: "absolute",
    top: 9,
    bottom: 9,
    left: 0,
    width: 2,
    borderRadius: 2,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 8px rgba(88, 223, 232, 0.82)",
  },
  markerPanelHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockGlyph: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 7px rgba(88, 223, 232, 0.46)",
  },
  lockGlyphCore: {
    width: 3,
    height: 3,
    backgroundColor: theme.colors.goldBright,
  },
  markerEyebrow: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 7.5,
    lineHeight: 9,
    letterSpacing: 1.1,
  },
  confidencePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "rgba(242, 211, 138, 0.38)",
    backgroundColor: "rgba(242, 211, 138, 0.08)",
  },
  confidenceText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.35,
  },
  markerLabel: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  markerPanelFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  markerAction: {
    flex: 1,
    minWidth: 0,
    color: "rgba(247, 242, 232, 0.5)",
    fontFamily: theme.fonts.analysis,
    fontSize: 6.5,
    lineHeight: 8,
    letterSpacing: 0.48,
  },
  markerChevron: {
    color: theme.colors.scannerViolet,
    fontSize: 16,
    lineHeight: 16,
    fontWeight: "800",
  },
  markerPanelPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  markerPanelDisabled: {
    opacity: 0.46,
  },
});
