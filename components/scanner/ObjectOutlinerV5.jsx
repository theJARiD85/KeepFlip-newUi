import {
  AlphaType,
  Blur,
  Canvas,
  ColorType,
  Image as SkiaImage,
  Skia,
} from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const EDGE_OUTPUT_TARGET = Object.freeze({ width: 320, height: 240 });
const PROCESS_EVERY_NTH_FRAME = 5;
const LOW_THRESHOLD = 72;
const HIGH_THRESHOLD = 176;
const EDGE_COLOR = Object.freeze({ red: 0, green: 255, blue: 210 });

function detectCannyEdges(
  luminance,
  width,
  height,
  bytesPerRow,
  requestedLowThreshold,
  requestedHighThreshold,
) {
  'worklet';

  const pixelCount = width * height;
  const blurred = new Float32Array(pixelCount);
  const magnitude = new Float32Array(pixelCount);
  const direction = new Uint8Array(pixelCount);
  const suppressed = new Float32Array(pixelCount);
  const classified = new Uint8Array(pixelCount);
  const output = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);

  // A small Gaussian blur is part of the Canny pipeline and prevents sensor
  // noise from becoming thousands of unstable one-pixel edge fragments.
  for (let y = 1; y < height - 1; y += 1) {
    const previousRow = (y - 1) * bytesPerRow;
    const currentRow = y * bytesPerRow;
    const nextRow = (y + 1) * bytesPerRow;
    const targetRow = y * width;

    for (let x = 1; x < width - 1; x += 1) {
      const weighted =
        luminance[previousRow + x - 1] +
        luminance[previousRow + x] * 2 +
        luminance[previousRow + x + 1] +
        luminance[currentRow + x - 1] * 2 +
        luminance[currentRow + x] * 4 +
        luminance[currentRow + x + 1] * 2 +
        luminance[nextRow + x - 1] +
        luminance[nextRow + x] * 2 +
        luminance[nextRow + x + 1];

      blurred[targetRow + x] = weighted / 16;
    }
  }

  // Sobel gradient magnitude and a four-way direction approximation.
  for (let y = 2; y < height - 2; y += 1) {
    const row = y * width;
    const previousRow = row - width;
    const nextRow = row + width;

    for (let x = 2; x < width - 2; x += 1) {
      const index = row + x;
      const gx =
        -blurred[previousRow + x - 1] +
        blurred[previousRow + x + 1] -
        blurred[row + x - 1] * 2 +
        blurred[row + x + 1] * 2 -
        blurred[nextRow + x - 1] +
        blurred[nextRow + x + 1];
      const gy =
        -blurred[previousRow + x - 1] -
        blurred[previousRow + x] * 2 -
        blurred[previousRow + x + 1] +
        blurred[nextRow + x - 1] +
        blurred[nextRow + x] * 2 +
        blurred[nextRow + x + 1];

      const absoluteX = Math.abs(gx);
      const absoluteY = Math.abs(gy);
      magnitude[index] = absoluteX + absoluteY;

      if (absoluteY * 2 <= absoluteX) {
        direction[index] = 0;
      } else if (absoluteX * 2 <= absoluteY) {
        direction[index] = 1;
      } else {
        direction[index] = gx * gy >= 0 ? 2 : 3;
      }
    }
  }

  // Non-maximum suppression thins broad gradients into crisp single-pixel
  // edge candidates instead of glowing filled bands.
  for (let y = 2; y < height - 2; y += 1) {
    const row = y * width;

    for (let x = 2; x < width - 2; x += 1) {
      const index = row + x;
      const value = magnitude[index];
      if (value <= 0) continue;

      let previous;
      let next;
      const angle = direction[index];

      if (angle === 0) {
        previous = magnitude[index - 1];
        next = magnitude[index + 1];
      } else if (angle === 1) {
        previous = magnitude[index - width];
        next = magnitude[index + width];
      } else if (angle === 2) {
        previous = magnitude[index - width - 1];
        next = magnitude[index + width + 1];
      } else {
        previous = magnitude[index - width + 1];
        next = magnitude[index + width - 1];
      }

      if (value >= previous && value >= next) {
        suppressed[index] = value;
      }
    }
  }

  const lowThreshold = Math.max(1, requestedLowThreshold);
  const highThreshold = Math.max(lowThreshold + 1, requestedHighThreshold);
  let queueHead = 0;
  let queueTail = 0;

  // Ignore a narrow outer margin. The feature is intended to trace the item
  // centered in KeepFlip's scanner, not high-contrast UI and room boundaries.
  const minX = Math.round(width * 0.055);
  const maxX = Math.round(width * 0.945);
  const minY = Math.round(height * 0.07);
  const maxY = Math.round(height * 0.93);

  for (let y = minY; y < maxY; y += 1) {
    const row = y * width;
    for (let x = minX; x < maxX; x += 1) {
      const index = row + x;
      const value = suppressed[index];

      if (value >= highThreshold) {
        classified[index] = 255;
        queue[queueTail] = index;
        queueTail += 1;
      } else if (value >= lowThreshold) {
        classified[index] = 96;
      }
    }
  }

  // Hysteresis keeps weak edges only when they connect to a strong edge. This
  // is the stage that makes this Canny rather than a plain Sobel threshold.
  while (queueHead < queueTail) {
    const index = queue[queueHead];
    queueHead += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const neighborY = y + offsetY;
      if (neighborY <= minY || neighborY >= maxY - 1) continue;

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const neighborX = x + offsetX;
        if (neighborX <= minX || neighborX >= maxX - 1) continue;

        const neighborIndex = neighborY * width + neighborX;
        if (classified[neighborIndex] !== 96) continue;

        classified[neighborIndex] = 255;
        queue[queueTail] = neighborIndex;
        queueTail += 1;
      }
    }
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (classified[index] !== 255) continue;

    // Preserve a little gradient strength in alpha so major structural edges
    // remain brighter than tiny texture edges without adding extra Skia nodes.
    const strength = suppressed[index];
    output[index] = Math.max(150, Math.min(255, 118 + strength * 0.58));
  }

  return output;
}

function makeEdgeImage(edgeFrame) {
  if (edgeFrame == null) return null;

  const { height, mask, width } = edgeFrame;
  if (width <= 0 || height <= 0 || mask.length !== width * height) return null;

  const pixels = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < mask.length; source += 1) {
    const alpha = mask[source];
    pixels[target] = EDGE_COLOR.red;
    pixels[target + 1] = EDGE_COLOR.green;
    pixels[target + 2] = EDGE_COLOR.blue;
    pixels[target + 3] = alpha;
    target += 4;
  }

  return Skia.Image.MakeImage(
    {
      width,
      height,
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    },
    Skia.Data.fromBytes(pixels),
    width * 4,
  );
}

export default function ObjectOutlinerV5() {
  const mountedRef = useRef(true);
  const hasReceivedEdgesRef = useRef(false);
  const lastStatusUpdateRef = useRef(0);
  const frameSequence = useSharedValue(0);
  const frameErrorCount = useSharedValue(0);
  const isFocused = useIsFocused();
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [edgeFrame, setEdgeFrame] = useState(null);
  const [status, setStatus] = useState('Starting live Canny edge trace…');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasPermission) return;
    void requestPermission().catch(() => {
      if (mountedRef.current) setStatus('Camera permission is required.');
    });
  }, [hasPermission, requestPermission]);

  const commitEdgeFrame = useCallback((mask, width, height, processingMs) => {
    if (!mountedRef.current || !(mask instanceof Uint8Array)) return;
    if (mask.length !== width * height) return;

    setEdgeFrame({ height, mask, processingMs, width });

    const now = Date.now();
    if (!hasReceivedEdgesRef.current || now - lastStatusUpdateRef.current >= 1000) {
      hasReceivedEdgesRef.current = true;
      lastStatusUpdateRef.current = now;
      setStatus(`Tracing visible edges • ${Math.round(processingMs)} ms`);
    }
  }, []);

  const reportFrameError = useCallback((message) => {
    if (!mountedRef.current) return;
    setStatus(message || 'Live edge tracing skipped an unsupported frame.');
  }, []);

  const frameOutput = useFrameOutput({
    targetResolution: EDGE_OUTPUT_TARGET,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: true,
    onFrame(frame) {
      'worklet';

      frameSequence.value += 1;
      const shouldProcess =
        frameSequence.value === 1 ||
        frameSequence.value % PROCESS_EVERY_NTH_FRAME === 0;

      if (!shouldProcess) {
        frame.dispose();
        return;
      }

      const startedAt = Date.now();

      try {
        if (!frame.isPlanar) {
          frameErrorCount.value += 1;
          if (frameErrorCount.value <= 2) {
            scheduleOnRN(
              reportFrameError,
              `Expected a YUV frame but received ${frame.pixelFormat}.`,
            );
          }
          return;
        }

        const planes = frame.getPlanes();
        if (planes.length === 0) {
          frameErrorCount.value += 1;
          if (frameErrorCount.value <= 2) {
            scheduleOnRN(reportFrameError, 'The camera returned no Y plane.');
          }
          return;
        }

        const yPlane = planes[0];
        const width = yPlane.width;
        const height = yPlane.height;
        const bytesPerRow = yPlane.bytesPerRow;
        const luminance = new Uint8Array(yPlane.getPixelBuffer());

        if (
          width < 8 ||
          height < 8 ||
          bytesPerRow < width ||
          luminance.length < bytesPerRow * height
        ) {
          frameErrorCount.value += 1;
          if (frameErrorCount.value <= 2) {
            scheduleOnRN(reportFrameError, 'The camera returned an invalid Y plane.');
          }
          return;
        }

        const edgeMask = detectCannyEdges(
          luminance,
          width,
          height,
          bytesPerRow,
          LOW_THRESHOLD,
          HIGH_THRESHOLD,
        );

        frameErrorCount.value = 0;
        scheduleOnRN(
          commitEdgeFrame,
          edgeMask,
          width,
          height,
          Date.now() - startedAt,
        );
      } catch (error) {
        frameErrorCount.value += 1;
        if (frameErrorCount.value <= 2) {
          const message =
            error != null && typeof error === 'object' && 'message' in error
              ? error.message
              : 'Live Canny processing failed.';
          scheduleOnRN(reportFrameError, message);
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const cameraOutputs = useMemo(() => [frameOutput], [frameOutput]);
  const edgeImage = useMemo(() => makeEdgeImage(edgeFrame), [edgeFrame]);

  useEffect(
    () => () => {
      edgeImage?.dispose();
    },
    [edgeImage],
  );

  if (!hasPermission) {
    return <Text style={styles.fallback}>Waiting for camera permission…</Text>;
  }

  if (device == null) {
    return <Text style={styles.fallback}>No back camera found.</Text>;
  }

  return (
    <View style={styles.screen}>
      <Camera
        device={device}
        implementationMode="compatible"
        isActive={isFocused}
        onPreviewStarted={() => {
          setIsPreviewReady(true);
          setStatus('Center the item and hold the camera steady.');
        }}
        onPreviewStopped={() => {
          setIsPreviewReady(false);
          setEdgeFrame(null);
          hasReceivedEdgesRef.current = false;
          setStatus('Camera paused.');
        }}
        outputs={cameraOutputs}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />

      {isPreviewReady && edgeImage != null ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={edgeImage}
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fit="cover"
            opacity={0.42}
          >
            <Blur blur={2.2} mode="clamp" />
          </SkiaImage>
          <SkiaImage
            image={edgeImage}
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fit="cover"
            opacity={0.96}
          />
        </Canvas>
      ) : null}

      <View pointerEvents="none" style={styles.scanWindow}>
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
        <View style={styles.centerDot} />
      </View>

      <View pointerEvents="none" style={styles.statusPill}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallback: {
    flex: 1,
    color: '#fff',
    backgroundColor: '#000',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  scanWindow: {
    position: 'absolute',
    left: '9%',
    right: '9%',
    top: '17%',
    bottom: '21%',
  },
  corner: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderColor: '#00FFD2',
  },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: 2,
    borderTopWidth: 2,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: 2,
    borderTopWidth: 2,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  centerDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
    borderRadius: 3,
    backgroundColor: '#00FFD2',
    shadowColor: '#00FFD2',
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  statusPill: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 40,
    alignItems: 'center',
  },
  statusText: {
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 18,
    fontSize: 13,
  },
});
