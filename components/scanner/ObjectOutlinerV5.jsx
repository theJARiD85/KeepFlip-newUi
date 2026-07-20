import {
  AlphaType,
  Blur,
  Canvas,
  ColorType,
  Image as SkiaImage,
  Skia,
} from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { Image as ExpoImage } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import KeepFlipImageTraceModule from '@/modules/keepflip-local-vision/src/KeepFlipImageTraceModule';

const LOW_THRESHOLD = 48;
const HIGH_THRESHOLD = 118;
const EDGE_COLOR = Object.freeze({ red: 0, green: 255, blue: 210 });

function toFileUri(source) {
  const trimmed = String(source ?? '').trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `file://${trimmed.replaceAll('\\', '/')}`;
}

function deleteTemporaryFile(path) {
  if (!path) return;

  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    // Expo's cache directory can remove an abandoned capture later.
  }
}

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
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const capturedPathRef = useRef(null);
  const isFocused = useIsFocused();
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [capturedUri, setCapturedUri] = useState(null);
  const [edgeFrame, setEdgeFrame] = useState(null);
  const [status, setStatus] = useState(
    'Center one item on the reticle, then tap TRACE ITEM.',
  );

  const clearCapturedResult = useCallback(() => {
    const previousPath = capturedPathRef.current;
    capturedPathRef.current = null;
    deleteTemporaryFile(previousPath);
    setCapturedUri(null);
    setEdgeFrame(null);
    setStatus('Center one item on the reticle, then tap TRACE ITEM.');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deleteTemporaryFile(capturedPathRef.current);
      capturedPathRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hasPermission) return;
    void requestPermission().catch(() => {
      if (mountedRef.current) setStatus('Camera permission is required.');
    });
  }, [hasPermission, requestPermission]);

  const traceCurrentItem = useCallback(async () => {
    if (
      isTracing ||
      !isPreviewReady ||
      cameraRef.current == null ||
      capturedUri != null
    ) {
      return;
    }

    setIsTracing(true);
    setEdgeFrame(null);
    setStatus('Capturing a full-color image…');

    let snapshot;
    let temporaryPath;

    try {
      snapshot = await cameraRef.current.takeSnapshot();
      temporaryPath = await snapshot.saveToTemporaryFileAsync('jpg', 92);

      if (!mountedRef.current) {
        deleteTemporaryFile(temporaryPath);
        return;
      }

      setStatus('Separating the centered item from the background…');

      const result = await KeepFlipImageTraceModule.traceCenteredSubjectImage(
        temporaryPath,
        LOW_THRESHOLD,
        HIGH_THRESHOLD,
      );

      if (!mountedRef.current) {
        deleteTemporaryFile(temporaryPath);
        return;
      }

      if (!result.subjectFound) {
        deleteTemporaryFile(temporaryPath);
        setStatus(
          'No centered item was isolated. Move the item onto the reticle and use a clearer background.',
        );
        return;
      }

      const pixels =
        result.pixels instanceof Uint8Array
          ? result.pixels
          : new Uint8Array(result.pixels);

      if (pixels.length !== result.width * result.height) {
        throw new Error('The native trace returned an invalid edge mask.');
      }

      capturedPathRef.current = temporaryPath;
      temporaryPath = null;
      setCapturedUri(toFileUri(capturedPathRef.current));
      setEdgeFrame({ ...result, pixels });
      setStatus(
        `Centered item traced • ${Math.round(result.processingMs)} ms`,
      );
    } catch (error) {
      deleteTemporaryFile(temporaryPath);
      if (mountedRef.current) {
        setStatus(
          error instanceof Error
            ? `Trace failed: ${error.message}`
            : 'Trace failed before an item outline could be produced.',
        );
      }
    } finally {
      snapshot?.dispose();
      if (mountedRef.current) setIsTracing(false);
    }
  }, [capturedUri, isPreviewReady, isTracing]);

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
        ref={cameraRef}
        device={device}
        implementationMode="compatible"
        isActive={isFocused && capturedUri == null}
        onPreviewStarted={() => {
          setIsPreviewReady(true);
          setStatus('Center one item on the reticle, then tap TRACE ITEM.');
        }}
        onPreviewStopped={() => setIsPreviewReady(false)}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />

      {capturedUri != null ? (
        <ExpoImage
          contentFit="cover"
          source={{ uri: capturedUri }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {capturedUri != null && edgeImage != null ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={edgeImage}
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fit="cover"
            opacity={0.46}>
            <Blur blur={2.1} mode="clamp" />
          </SkiaImage>
          <SkiaImage
            image={edgeImage}
            x={0}
            y={0}
            width={viewWidth}
            height={viewHeight}
            fit="cover"
            opacity={1}
          />
        </Canvas>
      ) : null}

      {capturedUri == null ? (
        <View pointerEvents="none" style={styles.reticle}>
          <View style={styles.reticleRing} />
          <View style={styles.reticleHorizontal} />
          <View style={styles.reticleVertical} />
          <View style={styles.centerDot} />
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.instructions}>
        <Text style={styles.instructionsTitle}>INSTANT OBJECT TRACE</Text>
        <Text style={styles.instructionsText}>
          Keep the item centered and separated from background objects.
        </Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.statusPill}>
          {isTracing ? <ActivityIndicator size="small" color="#00FFD2" /> : null}
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {capturedUri == null ? (
          <Pressable
            disabled={!isPreviewReady || isTracing}
            onPress={traceCurrentItem}
            style={({ pressed }) => [
              styles.traceButton,
              (!isPreviewReady || isTracing) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={styles.traceButtonText}>
              {isTracing ? 'TRACING…' : 'TRACE ITEM'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={clearCapturedResult}
            style={({ pressed }) => [
              styles.retakeButton,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={styles.retakeButtonText}>RETAKE</Text>
          </Pressable>
        )}
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
  instructions: {
    position: 'absolute',
    top: 42,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  instructionsTitle: {
    color: '#00FFD2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  instructionsText: {
    marginTop: 7,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  reticle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 58,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 210, 0.88)',
  },
  reticleHorizontal: {
    position: 'absolute',
    width: 56,
    height: 1.5,
    backgroundColor: 'rgba(0, 255, 210, 0.72)',
  },
  reticleVertical: {
    position: 'absolute',
    width: 1.5,
    height: 56,
    backgroundColor: 'rgba(0, 255, 210, 0.72)',
  },
  centerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00FFD2',
    shadowColor: '#00FFD2',
    shadowOpacity: 0.95,
    shadowRadius: 9,
  },
  controls: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
    alignItems: 'stretch',
    gap: 14,
  },
  statusPill: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  traceButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#00FFD2',
    backgroundColor: 'rgba(0, 255, 210, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  traceButtonText: {
    color: '#EFFFFB',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  retakeButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.8,
  },
});
