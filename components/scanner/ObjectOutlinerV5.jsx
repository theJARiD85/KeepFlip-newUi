import { RNMLKitDefaultObjectDetector } from '@infinitered/react-native-mlkit-object-detection';
import { Canvas, Rect } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

const DETECTION_INTERVAL_MS = 900;
const DETECTION_IMAGE_MAX_EDGE = 640;

const objectDetector = new RNMLKitDefaultObjectDetector({
  detectorMode: 'singleImage',
  shouldEnableClassification: true,
  shouldEnableMultipleObjects: true,
});

export default function ObjectOutlinerV5() {
  const cameraRef = useRef(null);
  const detectionBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const isFocused = useIsFocused();
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [isDetectorReady, setIsDetectorReady] = useState(false);
  const [detections, setDetections] = useState([]);
  const [detectionImageSize, setDetectionImageSize] = useState({
    width: 0,
    height: 0,
  });
  const [status, setStatus] = useState('Loading object detector…');

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

  useEffect(() => {
    let cancelled = false;

    void objectDetector
      .load()
      .then(() => {
        if (cancelled || !mountedRef.current) return;
        setIsDetectorReady(true);
        setStatus('Point the camera at an object.');
      })
      .catch((error) => {
        if (cancelled || !mountedRef.current) return;
        setStatus(`Object detector unavailable: ${error.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const detectCurrentPreview = useCallback(async () => {
    if (
      detectionBusyRef.current ||
      !isDetectorReady ||
      !isPreviewReady ||
      !isFocused ||
      cameraRef.current == null
    ) {
      return;
    }

    detectionBusyRef.current = true;
    let snapshot;
    let detectionImage;
    let temporaryPath;

    try {
      snapshot = await cameraRef.current.takeSnapshot();
      const scale = Math.min(
        1,
        DETECTION_IMAGE_MAX_EDGE / Math.max(snapshot.width, snapshot.height),
      );
      detectionImage =
        scale < 1
          ? await snapshot.resizeAsync(
              Math.round(snapshot.width * scale),
              Math.round(snapshot.height * scale),
            )
          : snapshot;
      temporaryPath = await detectionImage.saveToTemporaryFileAsync('jpg', 72);
      const nextDetections = await objectDetector.detectObjects(temporaryPath);

      if (!mountedRef.current) return;
      setDetections(nextDetections);
      setDetectionImageSize({
        width: detectionImage.width,
        height: detectionImage.height,
      });
      setStatus(
        nextDetections.length === 0
          ? 'No object found yet.'
          : `${nextDetections.length} object${nextDetections.length === 1 ? '' : 's'} found`,
      );
    } catch (error) {
      if (mountedRef.current) {
        setStatus(`Detection skipped: ${error.message}`);
      }
    } finally {
      if (temporaryPath != null) {
        try {
          const temporaryFile = new File(temporaryPath);
          if (temporaryFile.exists) temporaryFile.delete();
        } catch {
          // The native temporary directory can clean up this file later.
        }
      }
      if (detectionImage != null && detectionImage !== snapshot) {
        detectionImage.dispose();
      }
      snapshot?.dispose();
      detectionBusyRef.current = false;
    }
  }, [isDetectorReady, isFocused, isPreviewReady]);

  useEffect(() => {
    if (!isDetectorReady || !isFocused || !isPreviewReady) return;

    void detectCurrentPreview();
    const interval = setInterval(() => {
      void detectCurrentPreview();
    }, DETECTION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [detectCurrentPreview, isDetectorReady, isFocused, isPreviewReady]);

  if (!hasPermission) {
    return <Text style={styles.fallback}>Waiting for camera permission…</Text>;
  }

  if (device == null) {
    return <Text style={styles.fallback}>No back camera found.</Text>;
  }

  const scaleX =
    detectionImageSize.width > 0 ? viewWidth / detectionImageSize.width : 0;
  const scaleY =
    detectionImageSize.height > 0 ? viewHeight / detectionImageSize.height : 0;

  return (
    <View style={styles.screen}>
      <Camera
        ref={cameraRef}
        device={device}
        implementationMode="compatible"
        isActive={isFocused}
        onPreviewStarted={() => setIsPreviewReady(true)}
        onPreviewStopped={() => {
          setIsPreviewReady(false);
          setDetections([]);
        }}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />

      <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
        {detections.map((object, index) => {
          const frame = object.frame;
          if (frame == null) return null;

          return (
            <Rect
              key={`${object.trackingID ?? 'object'}-${index}`}
              x={frame.origin.x * scaleX}
              y={frame.origin.y * scaleY}
              width={frame.size.x * scaleX}
              height={frame.size.y * scaleY}
              color="#27F3FF"
              style="stroke"
              strokeWidth={5}
            />
          );
        })}
      </Canvas>

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
