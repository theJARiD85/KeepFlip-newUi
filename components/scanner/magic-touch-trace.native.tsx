import {
  BlurMask,
  Canvas,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
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

const MODEL_SIZE = 512;
const RGB_CHANNELS = 3;
const RGBA_CHANNELS = 4;
const CONTOUR_STEP = 4;
const MASK_THRESHOLD = 0.5;
const FRAMES_BETWEEN_INFERENCES = 6;

export type MagicTouchTraceStatus =
  | "loading"
  | "ready"
  | "cpu-fallback"
  | "error";

type MagicTouchTraceResult = {
  frameOutput: CameraFrameOutput;
  segments: number[];
  status: MagicTouchTraceStatus;
};

type MagicTouchTraceOverlayProps = {
  height: number;
  segments: number[];
  status: MagicTouchTraceStatus;
  width: number;
};

function addSegment(
  segments: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  "worklet";
  segments.push(x1, y1, x2, y2);
}

/**
 * Converts the 512×512 confidence mask into compact marching-squares line
 * segments. Only these contour points cross back to the React Native thread;
 * the full 1 MB float mask stays on the camera worklet.
 */
function extractContourSegments(mask: Float32Array) {
  "worklet";

  const segments: number[] = [];

  for (let y = 0; y < MODEL_SIZE - CONTOUR_STEP; y += CONTOUR_STEP) {
    const nextY = y + CONTOUR_STEP;

    for (let x = 0; x < MODEL_SIZE - CONTOUR_STEP; x += CONTOUR_STEP) {
      const nextX = x + CONTOUR_STEP;
      const topLeft =
        mask[y * MODEL_SIZE + x] >= MASK_THRESHOLD ? 8 : 0;
      const topRight =
        mask[y * MODEL_SIZE + nextX] >= MASK_THRESHOLD ? 4 : 0;
      const bottomRight =
        mask[nextY * MODEL_SIZE + nextX] >= MASK_THRESHOLD ? 2 : 0;
      const bottomLeft =
        mask[nextY * MODEL_SIZE + x] >= MASK_THRESHOLD ? 1 : 0;
      const cell = topLeft | topRight | bottomRight | bottomLeft;

      if (cell === 0 || cell === 15) continue;

      const middleX = x + CONTOUR_STEP / 2;
      const middleY = y + CONTOUR_STEP / 2;

      switch (cell) {
        case 1:
        case 14:
          addSegment(segments, x, middleY, middleX, nextY);
          break;
        case 2:
        case 13:
          addSegment(segments, middleX, nextY, nextX, middleY);
          break;
        case 3:
        case 12:
          addSegment(segments, x, middleY, nextX, middleY);
          break;
        case 4:
        case 11:
          addSegment(segments, middleX, y, nextX, middleY);
          break;
        case 5:
          addSegment(segments, middleX, y, x, middleY);
          addSegment(segments, middleX, nextY, nextX, middleY);
          break;
        case 6:
        case 9:
          addSegment(segments, middleX, y, middleX, nextY);
          break;
        case 7:
        case 8:
          addSegment(segments, middleX, y, x, middleY);
          break;
        case 10:
          addSegment(segments, middleX, y, nextX, middleY);
          addSegment(segments, x, middleY, middleX, nextY);
          break;
      }
    }
  }

  return segments;
}

export function useMagicTouchTrace(enabled: boolean): MagicTouchTraceResult {
  const [segments, setSegments] = useState<number[]>([]);
  const [forceCpu, setForceCpu] = useState(false);
  const [inferenceError, setInferenceError] = useState(false);
  const frameCounter = useSharedValue(0);
  const errorReported = useSharedValue(false);

  const delegates = useMemo(
    () =>
      forceCpu
        ? []
        : Platform.OS === "android"
          ? (["android-gpu"] as const)
          : (["metal"] as const),
    [forceCpu],
  );

  const segmenter = useTensorflowModel(
    require("../../assets/models/magic_touch.tflite"),
    [...delegates],
  );
  const resizerState = useResizer({
    width: MODEL_SIZE,
    height: MODEL_SIZE,
    channelOrder: "rgb",
    dataType: "float32",
    scaleMode: "cover",
    pixelLayout: "interleaved",
  });

  useEffect(() => {
    if (segmenter.state !== "error") return;

    if (!forceCpu) {
      setForceCpu(true);
      return;
    }

    setInferenceError(true);
  }, [forceCpu, segmenter.state]);

  useEffect(() => {
    if (resizerState.state === "error") setInferenceError(true);
  }, [resizerState.state]);

  useEffect(() => {
    if (!enabled) setSegments([]);
  }, [enabled]);

  useEffect(() => {
    // Permit one fresh error report after switching delegates or reloading.
    errorReported.value = false;
  }, [errorReported, forceCpu, segmenter.state]);

  const commitContour = useCallback((nextSegments: number[]) => {
    setSegments(nextSegments);
  }, []);

  const reportInferenceError = useCallback(() => {
    if (!forceCpu) {
      setForceCpu(true);
      return;
    }

    setInferenceError(true);
  }, [forceCpu]);

  const model = segmenter.state === "loaded" ? segmenter.model : undefined;
  const resizer =
    resizerState.state === "ready" ? resizerState.resizer : undefined;

  const frameOutput = useFrameOutput({
    targetResolution: { width: 720, height: 720 },
    pixelFormat: Platform.OS === "android" ? "native" : "yuv",
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
        const rgb = new Float32Array(resized.getPixelBuffer());
        const input = new Float32Array(
          MODEL_SIZE * MODEL_SIZE * RGBA_CHANNELS,
        );

        for (let pixel = 0; pixel < MODEL_SIZE * MODEL_SIZE; pixel += 1) {
          const rgbOffset = pixel * RGB_CHANNELS;
          const rgbaOffset = pixel * RGBA_CHANNELS;
          input[rgbaOffset] = rgb[rgbOffset];
          input[rgbaOffset + 1] = rgb[rgbOffset + 1];
          input[rgbaOffset + 2] = rgb[rgbOffset + 2];
          input[rgbaOffset + 3] = 0;
        }

        // MagicTouch's fourth input channel is the user's point-of-interest
        // mask. Match MediaPipe's center keypoint with a three-pixel marker.
        const center = Math.floor(MODEL_SIZE / 2);
        for (let pointY = center - 1; pointY <= center + 1; pointY += 1) {
          for (let pointX = center - 1; pointX <= center + 1; pointX += 1) {
            const pointOffset =
              (pointY * MODEL_SIZE + pointX) * RGBA_CHANNELS + 3;
            input[pointOffset] = 1;
          }
        }

        resized.dispose();
        resized = undefined;

        const outputs = model.runSync([input.buffer]);
        const maskBuffer = outputs[0];
        if (maskBuffer == null) {
          throw new Error("MagicTouch did not return a segmentation mask.");
        }

        const contour = extractContourSegments(
          new Float32Array(maskBuffer),
        );
        scheduleOnRN(commitContour, contour);
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

  const status: MagicTouchTraceStatus = inferenceError
    ? "error"
    : segmenter.state === "loaded" && resizerState.state === "ready"
      ? forceCpu
        ? "cpu-fallback"
        : "ready"
      : "loading";

  return { frameOutput, segments, status };
}

export function MagicTouchTraceOverlay({
  height,
  segments,
  status,
  width,
}: MagicTouchTraceOverlayProps) {
  const tracePath = useMemo(() => {
    const path = Skia.Path.Make();
    const scaleX = width / MODEL_SIZE;
    const scaleY = height / MODEL_SIZE;

    for (let index = 0; index + 3 < segments.length; index += 4) {
      path.moveTo(segments[index] * scaleX, segments[index + 1] * scaleY);
      path.lineTo(
        segments[index + 2] * scaleX,
        segments[index + 3] * scaleY,
      );
    }

    return path;
  }, [height, segments, width]);

  const label =
    status === "ready"
      ? "ON-DEVICE TRACE"
      : status === "cpu-fallback"
        ? "ON-DEVICE TRACE · CPU"
        : status === "error"
          ? "TRACE UNAVAILABLE"
          : "LOADING TRACE";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {segments.length > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Path
            color="rgba(70, 255, 203, 0.68)"
            path={tracePath}
            strokeCap="round"
            strokeJoin="round"
            strokeWidth={8}
            style="stroke"
          >
            <BlurMask blur={12} style="normal" />
          </Path>
          <Path
            color="#A8FFE5"
            path={tracePath}
            strokeCap="round"
            strokeJoin="round"
            strokeWidth={2.25}
            style="stroke"
          />
        </Canvas>
      ) : null}

      <View style={styles.centerPoint}>
        <View style={styles.centerPointCore} />
      </View>

      <View
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
        <Text style={styles.statusText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerPoint: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 18,
    height: 18,
    marginTop: -9,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(168, 255, 229, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerPointCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#A8FFE5",
  },
  statusBadge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(168, 255, 229, 0.24)",
    backgroundColor: "rgba(2, 14, 13, 0.72)",
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
});
