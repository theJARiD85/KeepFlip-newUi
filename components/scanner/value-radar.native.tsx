import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSharedValue } from "react-native-reanimated";
import { useTensorflowModel } from "react-native-fast-tflite";
import {
  type CameraFrameOutput,
  useFrameOutput,
} from "react-native-vision-camera";
import { useResizer } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const MODEL_SIZE = 320;
const MAX_DETECTIONS = 25;
const MIN_DETECTION_SCORE = 0.55;
const FRAMES_BETWEEN_INFERENCES = 5;
const STABLE_HITS_REQUIRED = 3;
const MISSES_BEFORE_CLEAR = 2;
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

/**
 * COCO classes that represent durable or collectible goods people commonly
 * resell. Detections remain internal; this only decides whether KeepFlip
 * should surface a small "CHECK" marker.
 */
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
    case 82: // book
    case 83: // clock
    case 84: // vase
    case 85: // scissors
    case 86: // teddy bear
    case 87: // hair drier
    case 88: // toothbrush
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
    82: "Book",
    83: "Clock",
    84: "Vase",
    85: "Scissors",
    86: "Teddy bear",
    87: "Hair dryer",
    88: "Toothbrush",
  };

  return labels[classId] ?? "Item";
}

export function useValueRadar(enabled: boolean): ValueRadarResult {
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

  useEffect(() => {
    if (detector.state === "error" || resizerState.state === "error") {
      setInferenceError(true);
    }
  }, [detector.state, resizerState.state]);

  useEffect(() => {
    if (enabled) return;

    setMarker(null);
    stableHits.value = 0;
    misses.value = 0;
    hasPublishedMarker.value = false;
  }, [enabled, hasPublishedMarker, misses, stableHits]);

  const commitMarker = useCallback((payload: number[]) => {
    const [x, y, width, height, classId, score] = payload;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(classId) ||
      !Number.isFinite(score)
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
    });
  }, []);

  const clearMarker = useCallback(() => {
    setMarker(null);
  }, []);

  const reportInferenceError = useCallback(() => {
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
        const inputBuffer = pixels.buffer.slice(
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
        );

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
          const width = right - left;
          const height = bottom - top;

          if (width < 0.04 || height < 0.04) continue;

          bestClass = classId;
          bestScore = score;
          bestX = left;
          bestY = top;
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
          errorReported.value = false;
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
          errorReported.value = false;
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
          publishedMovement >= PUBLISH_MOVEMENT_THRESHOLD;

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
          ]);
        }

        errorReported.value = false;
      } catch {
        if (!errorReported.value) {
          errorReported.value = true;
          scheduleOnRN(reportInferenceError);
        }
      } finally {
        resized?.dispose();
        frame.dispose();
      }
    },
  });

  const status: ValueRadarStatus = inferenceError
    ? "error"
    : detector.state === "loaded" && resizerState.state === "ready"
      ? "ready"
      : "loading";

  return { frameOutput, marker, status };
}

export function ValueRadarOverlay({
  disabled = false,
  height,
  marker,
  onMarkerPress,
  status,
  width,
}: ValueRadarOverlayProps) {
  const markerWidth = 96;
  const markerHeight = 46;
  const markerCenterX = marker ? (marker.x + marker.width / 2) * width : 0;
  const markerTopY = marker ? marker.y * height : 0;
  const markerLeft = clamp(
    markerCenterX - markerWidth / 2,
    8,
    Math.max(8, width - markerWidth - 8),
  );
  const markerTop = clamp(
    markerTopY - markerHeight - 8,
    44,
    Math.max(44, height - markerHeight - 8),
  );

  const statusLabel =
    status === "ready"
      ? "VALUE RADAR"
      : status === "error"
        ? "RADAR UNAVAILABLE"
        : "STARTING RADAR";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="none"
        style={[
          styles.statusBadge,
          status === "error" && styles.statusBadgeError,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            status === "loading" && styles.statusDotLoading,
            status === "error" && styles.statusDotError,
          ]}
        />
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>

      {marker && status === "ready" ? (
        <Animated.View
          entering={FadeIn.duration(170)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.markerHost,
            {
              left: markerLeft,
              top: markerTop,
              width: markerWidth,
            },
          ]}
        >
          <Pressable
            accessibilityHint="Captures this item for full KeepFlip identification and current market analysis"
            accessibilityLabel={`Check ${marker.label}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onMarkerPress(marker)}
            style={({ pressed }) => [
              styles.marker,
              pressed && styles.markerPressed,
              disabled && styles.markerDisabled,
            ]}
          >
            <Text style={styles.markerSpark}>✦</Text>
            <View style={styles.markerCopy}>
              <Text style={styles.markerTitle}>CHECK</Text>
              <Text numberOfLines={1} style={styles.markerLabel}>
                {marker.label}
              </Text>
            </View>
          </Pressable>
          <View pointerEvents="none" style={styles.markerPin} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(168, 255, 229, 0.24)",
    backgroundColor: "rgba(2, 14, 13, 0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadgeError: {
    borderColor: "rgba(255, 116, 116, 0.4)",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#55F2BF",
  },
  statusDotLoading: {
    backgroundColor: theme.colors.goldBright,
  },
  statusDotError: {
    backgroundColor: "#FF7474",
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.35,
  },
  markerHost: {
    position: "absolute",
    zIndex: 8,
    alignItems: "center",
  },
  marker: {
    width: "100%",
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(168, 255, 229, 0.72)",
    backgroundColor: "rgba(3, 18, 15, 0.94)",
    boxShadow:
      "0 0 22px rgba(85, 242, 191, 0.36), 0 4px 14px rgba(0, 0, 0, 0.48)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  markerPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  markerDisabled: {
    opacity: 0.5,
  },
  markerSpark: {
    color: "#A8FFE5",
    fontSize: 16,
    lineHeight: 18,
  },
  markerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  markerTitle: {
    color: "#A8FFE5",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  markerLabel: {
    color: "rgba(242, 255, 250, 0.76)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
  },
  markerPin: {
    width: 2,
    height: 12,
    backgroundColor: "rgba(168, 255, 229, 0.8)",
    boxShadow: "0 0 8px rgba(85, 242, 191, 0.68)",
  },
});
