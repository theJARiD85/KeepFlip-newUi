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

import KeepFlipCannyModule from '@/modules/keepflip-local-vision/src/KeepFlipCannyModule';

const EDGE_OUTPUT_TARGET = Object.freeze({ width: 640, height: 480 });
const PROCESS_EVERY_NTH_FRAME = 12;
const LOW_THRESHOLD = 48;
const HIGH_THRESHOLD = 118;
const EDGE_COLOR = Object.freeze({ red: 0, green: 255, blue: 210 });

function makeEdgeImage(edgeFrame) {
  if (edgeFrame == null) return null;

  const { height, pixels: mask, width } = edgeFrame;
  if (!(mask instanceof Uint8Array)) return null;
  if (width <= 0 || height <= 0 || mask.length !== width * height) return null;

  const rgba = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < mask.length; source += 1) {
    const alpha = mask[source];
    rgba[target] = EDGE_COLOR.red;
    rgba[target + 1] = EDGE_COLOR.green;
    rgba[target + 2] = EDGE_COLOR.blue;
    rgba[target + 3] = alpha;
    target += 4;
  }

  return Skia.Image.MakeImage(
    {
      width,
      height,
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    },
    Skia.Data.fromBytes(rgba),
    width * 4,
  );
}

export default function ObjectOutlinerV5() {
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const requestSequenceRef = useRef(0);
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
  const [status, setStatus] = useState('Preparing centered-item tracing…');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (hasPermission) return;
    void requestPermission().catch(() => {
      if (mountedRef.current) setStatus('Camera permission is required.');
    });
  }, [hasPermission, requestPermission]);

  const processYPlane = useCallback(
    async (yPlane, width, height, rowStride) => {
      if (
        !mountedRef.current ||
        processingRef.current ||
        !(yPlane instanceof Uint8Array) ||
        width < 8 ||
        height < 8 ||
        rowStride < width ||
        yPlane.length < rowStride * height
      ) {
        return;
      }

      processingRef.current = true;
      const requestId = ++requestSequenceRef.current;

      try {
        const result = await KeepFlipCannyModule.detectCenteredSubjectYPlane(
          width,
          height,
          rowStride,
          yPlane,
          LOW_THRESHOLD,
          HIGH_THRESHOLD,
        );

        if (!mountedRef.current || requestId !== requestSequenceRef.current) {
          return;
        }

        if (!result.subjectFound) {
          setEdgeFrame(null);
          setStatus('Center one item on the reticle and keep the background clear.');
          return;
        }

        const pixels =
          result.pixels instanceof Uint8Array
            ? result.pixels
            : new Uint8Array(result.pixels);

        if (pixels.length !== result.width * result.height) {
          throw new Error('Native subject trace returned an invalid edge mask.');
        }

        setEdgeFrame({ ...result, pixels });

        const now = Date.now();
        if (
          !hasReceivedEdgesRef.current ||
          now - lastStatusUpdateRef.current >= 1000
        ) {
          hasReceivedEdgesRef.current = true;
          lastStatusUpdateRef.current = now;
          setStatus(
            `Tracing centered item only • ${Math.round(result.processingMs)} ms`,
          );
        }
      } catch (error) {
        if (!mountedRef.current || requestId !== requestSequenceRef.current) {
          return;
        }

        setEdgeFrame(null);
        setStatus(
          error instanceof Error
            ? error.message
            : 'Centered-item tracing could not process this frame.',
        );
      } finally {
        if (requestId === requestSequenceRef.current) {
          processingRef.current = false;
        }
      }
    },
    [],
  );

  const reportFrameError = useCallback((message) => {
    if (!mountedRef.current) return;
    setStatus(message || 'The camera returned an unsupported frame.');
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

      try {
        if (!frame.isPlanar) {
          frameErrorCount.value += 1;
          if (frameErrorCount.value <= 2) {
            scheduleOnRN(
              reportFrameError,
              `Expected YUV but received ${frame.pixelFormat}.`,
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

        const plane = planes[0];
        const width = plane.width;
        const height = plane.height;
        const rowStride = plane.bytesPerRow;
        const source = new Uint8Array(plane.getPixelBuffer());

        if (
          width < 8 ||
          height < 8 ||
          rowStride < width ||
          source.length < rowStride * height
        ) {
          frameErrorCount.value += 1;
          if (frameErrorCount.value <= 2) {
            scheduleOnRN(reportFrameError, 'The Y plane was incomplete.');
          }
          return;
        }

        const ownedYPlane = new Uint8Array(rowStride * height);
        ownedYPlane.set(source.subarray(0, rowStride * height));

        frameErrorCount.value = 0;
        scheduleOnRN(processYPlane, ownedYPlane, width, height, rowStride);
      } catch {
        frameErrorCount.value += 1;
        if (frameErrorCount.value <= 2) {
          scheduleOnRN(
            reportFrameError,
            'Could not read the camera luminance plane.',
          );
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
          setStatus('Center one item on the reticle and hold steady.');
        }}
        onPreviewStopped={() => {
          requestSequenceRef.current += 1;
          processingRef.current = false;
          hasReceivedEdgesRef.current = false;
          setIsPreviewReady(false);
          setEdgeFrame(null);
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
            opacity={0.42}>
            <Blur blur={2.1} mode="clamp" />
          </SkiaImage>
          <SkiaImage
            image={edgeImage}
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fit="cover"
            opacity={0.98}
          />
        </Canvas>
      ) : null}

      <View pointerEvents="none" style={styles.reticle}>
        <View style={styles.reticleRing} />
        <View style={styles.reticleHorizontal} />
        <View style={styles.reticleVertical} />
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
  reticle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 255, 210, 0.78)',
  },
  reticleHorizontal: {
    position: 'absolute',
    width: 42,
    height: 1,
    backgroundColor: 'rgba(0, 255, 210, 0.66)',
  },
  reticleVertical: {
    position: 'absolute',
    width: 1,
    height: 42,
    backgroundColor: 'rgba(0, 255, 210, 0.66)',
  },
  centerDot: {
    width: 5,
    height: 5,
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
    textAlign: 'center',
  },
});
