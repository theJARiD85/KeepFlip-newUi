import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import {
  ScannerAtmosphere,
  type ScannerAtmospherePhase,
} from '@/components/scanner/scanner-atmosphere';
import {
  ScannerToolCarousel,
  scannerTools,
  type ScannerToolId,
} from '@/components/scanner/scanner-tool-carousel';
import {
  MultiScanPhotoReview,
  MultiScanPhotoStack,
  toDisplayUri,
  type MultiScanPhoto,
} from '@/components/scanner/multi-scan-photo-review';
import {
  type AnalysisStep,
  type ItemAnalysisState,
} from '@/components/scanner/item-analysis-overlay';
import { ItemAnalysisBubbles } from '@/components/scanner/item-analysis-bubbles';
import { toItemAnalysisState } from '@/components/scanner/item-analysis-view-model';
import { useKeepFlipMenu } from '@/components/navigation/keepflip-menu-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  analyzeItemPhotos,
  AppwriteSetupError,
  ItemAnalysisError,
  MAX_ANALYSIS_PHOTOS,
  type ItemAnalysisStage,
} from '@/services/item-analysis-service';

const ANALYSIS_STAGES: Record<
  ItemAnalysisStage,
  { detail: string; progress: number; stage: string }
> = {
  authenticating: {
    detail: 'Verifying your signed-in Appwrite session for this scan.',
    progress: 0.12,
    stage: 'Securing your session',
  },
  uploading: {
    detail: 'Sending up to four item views through private temporary storage.',
    progress: 0.36,
    stage: 'Uploading photo evidence',
  },
  analyzing: {
    detail: 'Cross-checking visual details, text, condition, and identity signals.',
    progress: 0.7,
    stage: 'Reading item evidence',
  },
  cleaning: {
    detail: 'Removing the temporary cloud copies while preserving your local scan.',
    progress: 0.82,
    stage: 'Protecting your photos',
  },
  researching_comps: {
    detail: 'Searching completed eBay sales that match the identified item.',
    progress: 0.94,
    stage: 'Researching sold comps',
  },
};

const ANALYSIS_STEP_LABELS = [
  'Verify your signed-in session',
  'Upload private photo evidence',
  'Identify and evaluate the item',
  'Remove temporary cloud copies',
  'Research completed eBay sales',
] as const;

function analysisProgressState(stage: ItemAnalysisStage): ItemAnalysisState {
  const stageIndex: Record<ItemAnalysisStage, number> = {
    authenticating: 0,
    uploading: 1,
    analyzing: 2,
    cleaning: 3,
    researching_comps: 4,
  };
  const activeIndex = stageIndex[stage];
  const steps: AnalysisStep[] = ANALYSIS_STEP_LABELS.map((label, index) => ({
    label,
    status: index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending',
  }));

  return { ...ANALYSIS_STAGES[stage], status: 'analyzing', steps };
}

function selectMultiScanEvidence(photos: MultiScanPhoto[]) {
  if (photos.length <= MAX_ANALYSIS_PHOTOS) return photos.map((photo) => photo.path);

  // Preserve the establishing shot and favor the latest detail/label views.
  return [
    photos[0].path,
    ...photos.slice(-(MAX_ANALYSIS_PHOTOS - 1)).map((photo) => photo.path),
  ];
}

function scannerToolHeaderCopy({
  batchCount,
  hasSinglePhoto,
  multiCount,
  tool,
  uploadedCount,
}: {
  batchCount: number;
  hasSinglePhoto: boolean;
  multiCount: number;
  tool: ScannerToolId;
  uploadedCount: number;
}) {
  if (tool === 'single') {
    return {
      title: 'Scan an item',
      hint: hasSinglePhoto
        ? 'Photo ready. Tap the scan tool to replace it.'
        : 'One item, one photo.',
    };
  }

  if (tool === 'multi') {
    return {
      title: 'Scan multiple angles',
      hint:
        multiCount > 0
          ? `${multiCount} view${multiCount === 1 ? '' : 's'} ready. Tap the photo stack to review.`
          : 'Capture several angles of the same item.',
    };
  }

  if (tool === 'batch') {
    return {
      title: 'Scan multiple items',
      hint:
        batchCount > 0
          ? `${batchCount} item${batchCount === 1 ? '' : 's'} captured. Keep scanning to add more.`
          : 'Capture one photo per item.',
    };
  }

  return {
    title: 'Upload item photos',
    hint:
      uploadedCount > 0
        ? `${uploadedCount} of ${MAX_ANALYSIS_PHOTOS} photos ready. Tap the photo stack to review.`
        : `Choose up to ${MAX_ANALYSIS_PHOTOS} images of the same item.`,
  };
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { closeMenu, isMenuPresented } = useKeepFlipMenu();
  const cameraRef = useRef<Camera>(null);
  const captureLockRef = useRef(false);
  const multiScanSequenceRef = useRef(0);
  const uploadSequenceRef = useRef(0);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const atmosphereTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [permissionStatus, setPermissionStatus] = useState(() =>
    Camera.getCameraPermissionStatus(),
  );
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [message, setMessage] = useState('Center one item inside the frame');
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [atmospherePhase, setAtmospherePhase] = useState<ScannerAtmospherePhase>('idle');
  const [selectedTool, setSelectedTool] = useState<ScannerToolId>('single');
  const [singlePhotoUri, setSinglePhotoUri] = useState<string | null>(null);
  const [multiScanPhotos, setMultiScanPhotos] = useState<MultiScanPhoto[]>([]);
  const [isMultiReviewOpen, setIsMultiReviewOpen] = useState(false);
  const [batchScanPhotos, setBatchScanPhotos] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<MultiScanPhoto[]>([]);
  const [isUploadReviewOpen, setIsUploadReviewOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState<ItemAnalysisState | null>(null);
  const [analysisBackdropUri, setAnalysisBackdropUri] = useState<string | null>(null);
  const renderedAtmospherePhase: ScannerAtmospherePhase =
    analysisState?.status === 'analyzing' ? 'analyzing' : atmospherePhase;
  const canRequestPermission = permissionStatus === 'not-determined';
  const canUseTorch = device?.hasTorch === true;
  const analysisPhotoUris =
    selectedTool === 'single' && singlePhotoUri
      ? [singlePhotoUri]
      : selectedTool === 'multi'
        ? selectMultiScanEvidence(multiScanPhotos)
        : selectedTool === 'upload'
          ? uploadedPhotos.map((photo) => photo.path)
          : [];
  const canAnalyzeCurrentTool = analysisPhotoUris.length > 0;
  const selectedToolAppearance =
    scannerTools.find((tool) => tool.id === selectedTool) ?? scannerTools[0];
  const selectedToolHeader = scannerToolHeaderCopy({
    batchCount: batchScanPhotos.length,
    hasSinglePhoto: singlePhotoUri != null,
    multiCount: multiScanPhotos.length,
    tool: selectedTool,
    uploadedCount: uploadedPhotos.length,
  });
  const isPhotoReviewOpen = isMultiReviewOpen || isUploadReviewOpen;
  const isScannerOverlayOpen = isPhotoReviewOpen || analysisState != null;
  const isScannerUiHidden = isScannerOverlayOpen;
  const isCameraActive =
    hasPermission &&
    device != null &&
    isFocused &&
    appState === 'active' &&
    !isMenuPresented &&
    !isPickingPhoto &&
    !isScannerOverlayOpen;
  const toolbarAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isScannerOverlayOpen ? 0 : 1, { duration: 170 }),
      transform: [
        { translateY: withTiming(isScannerOverlayOpen ? 20 : 0, { duration: 190 }) },
        { scale: withTiming(isScannerOverlayOpen ? 0.94 : 1, { duration: 190 }) },
      ],
    }),
    [isScannerOverlayOpen],
  );
  const scannerChromeAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isScannerUiHidden ? 0 : 1, { duration: 170 }),
      transform: [
        { scale: withTiming(isScannerUiHidden ? 0.97 : 1, { duration: 190 }) },
      ],
    }),
    [isScannerUiHidden],
  );

  const clearAtmosphereTimer = useCallback(() => {
    if (atmosphereTimerRef.current == null) return;
    clearTimeout(atmosphereTimerRef.current);
    atmosphereTimerRef.current = null;
  }, []);

  const scheduleAtmosphereReset = useCallback(() => {
    clearAtmosphereTimer();
    atmosphereTimerRef.current = setTimeout(() => {
      atmosphereTimerRef.current = null;
      setAtmospherePhase('idle');
    }, 1800);
  }, [clearAtmosphereTimer]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      setPermissionStatus(Camera.getCameraPermissionStatus());
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      analysisAbortControllerRef.current?.abort();
      clearAtmosphereTimer();
    },
    [clearAtmosphereTimer],
  );

  useEffect(() => {
    setIsCameraReady(false);
  }, [device?.id]);

  useEffect(() => {
    if (!canUseTorch) setTorchEnabled(false);
  }, [canUseTorch]);

  useEffect(() => {
    if (!isCameraActive) setTorchEnabled(false);
  }, [isCameraActive]);

  useEffect(() => {
    if (!isMenuPresented) return;
    if (isMultiReviewOpen) setIsMultiReviewOpen(false);
    if (isUploadReviewOpen) setIsUploadReviewOpen(false);
  }, [isMenuPresented, isMultiReviewOpen, isUploadReviewOpen]);

  useEffect(() => {
    if (!isMenuPresented || analysisState == null) return;
    if (analysisState.status === 'analyzing') {
      closeMenu();
      return;
    }
    analysisAbortControllerRef.current?.abort();
    analysisAbortControllerRef.current = null;
    setAnalysisState(null);
    setAnalysisBackdropUri(null);
  }, [analysisState, closeMenu, isMenuPresented]);

  useEffect(() => {
    if (isMultiReviewOpen && multiScanPhotos.length === 0) {
      setIsMultiReviewOpen(false);
    }
  }, [isMultiReviewOpen, multiScanPhotos.length]);

  useEffect(() => {
    if (isUploadReviewOpen && uploadedPhotos.length === 0) {
      setIsUploadReviewOpen(false);
    }
  }, [isUploadReviewOpen, uploadedPhotos.length]);

  useEffect(() => {
    if (!isPhotoReviewOpen || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsMultiReviewOpen(false);
      setIsUploadReviewOpen(false);
      return true;
    });

    return () => subscription.remove();
  }, [isPhotoReviewOpen]);

  useEffect(() => {
    if (analysisState == null || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (analysisState.status === 'analyzing') return true;
      analysisAbortControllerRef.current?.abort();
      analysisAbortControllerRef.current = null;
      setAnalysisState(null);
      setAnalysisBackdropUri(null);
      return true;
    });

    return () => subscription.remove();
  }, [analysisState]);

  const acceptPickedPhotos = useCallback(
    (assets: readonly ImagePicker.ImagePickerAsset[]) => {
      const selectedUris = assets
        .map((asset) => asset.uri?.trim())
        .filter((uri): uri is string => Boolean(uri));
      if (selectedUris.length === 0) return;

      setUploadedPhotos((currentPhotos) => {
        const knownUris = new Set(currentPhotos.map((photo) => photo.path));
        const additions = selectedUris
          .filter((uri) => {
            if (knownUris.has(uri)) return false;
            knownUris.add(uri);
            return true;
          })
          .map((uri) => {
            uploadSequenceRef.current += 1;
            return {
              createdAt: Date.now(),
              id: `upload-${Date.now()}-${uploadSequenceRef.current}`,
              path: uri,
              uri: toDisplayUri(uri),
            } satisfies MultiScanPhoto;
          });
        const nextPhotos = [...currentPhotos, ...additions].slice(0, MAX_ANALYSIS_PHOTOS);
        setMessage(
          `${nextPhotos.length} of ${MAX_ANALYSIS_PHOTOS} uploaded photo${nextPhotos.length === 1 ? '' : 's'} ready for AI analysis.`,
        );
        return nextPhotos;
      });
      setSelectedTool('upload');
      setAtmospherePhase('captured');
      scheduleAtmosphereReset();
    },
    [scheduleAtmosphereReset],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let isMounted = true;
    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || pendingResult == null) return;

        if ('code' in pendingResult) {
          setMessage(pendingResult.message || 'Could not restore the selected photo.');
          return;
        }

        if (!pendingResult.canceled && pendingResult.assets.length > 0) {
          acceptPickedPhotos(pendingResult.assets);
        }
      } catch {
        if (isMounted) setMessage('Could not restore the selected photo. Please choose it again.');
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [acceptPickedPhotos]);

  const handlePermissionAction = async () => {
    if (canRequestPermission) {
      await requestPermission();
      setPermissionStatus(Camera.getCameraPermissionStatus());
      return;
    }

    await Linking.openSettings();
  };

  const handleUploadPhoto = useCallback(async () => {
    if (isPickingPhoto) return;
    const remainingSlots = MAX_ANALYSIS_PHOTOS - uploadedPhotos.length;
    if (remainingSlots <= 0) {
      setMessage(
        `The ${MAX_ANALYSIS_PHOTOS}-photo analysis set is full. Remove a photo before adding another.`,
      );
      setIsUploadReviewOpen(true);
      return;
    }

    clearAtmosphereTimer();
    setIsPickingPhoto(true);
    setAtmospherePhase('scanning');
    setMessage('Opening your photo library...');

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 0.85,
        selectionLimit: remainingSlots,
      });

      if (result.canceled) {
        setAtmospherePhase('idle');
        setMessage('Upload canceled. Tap the photo tool when you are ready.');
        return;
      }

      if (result.assets.length === 0) {
        setAtmospherePhase('idle');
        setMessage('No photos were selected. Please try again.');
        return;
      }

      acceptPickedPhotos(result.assets);
    } catch {
      setAtmospherePhase('idle');
      setMessage('Could not open your photos. Please try again.');
    } finally {
      setIsPickingPhoto(false);
    }
  }, [acceptPickedPhotos, clearAtmosphereTimer, isPickingPhoto, uploadedPhotos.length]);

  const capturePhoto = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current || !isCameraActive || !isCameraReady) {
      const feedback = 'Camera is getting ready. Try again in a moment.';
      setMessage(feedback);
      setCaptureFeedback(feedback);
      return null;
    }

    if (captureLockRef.current) return null;
    captureLockRef.current = true;
    clearAtmosphereTimer();
    setIsCapturing(true);
    setAtmospherePhase('scanning');
    setMessage('Capturing item...');
    setCaptureFeedback('Capturing item...');

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      if (!photo.path) throw new Error('VisionCamera returned an empty photo path.');

      setAtmospherePhase('captured');
      setCaptureFeedback(null);
      scheduleAtmosphereReset();
      return photo.path;
    } catch {
      const feedback = 'Could not capture. Hold steady and try again.';
      setAtmospherePhase('idle');
      setMessage(feedback);
      setCaptureFeedback(feedback);
      return null;
    } finally {
      captureLockRef.current = false;
      setIsCapturing(false);
    }
  }, [clearAtmosphereTimer, isCameraActive, isCameraReady, scheduleAtmosphereReset]);

  const openMultiReview = useCallback(() => {
    if (
      multiScanPhotos.length === 0 ||
      captureLockRef.current ||
      isCapturing ||
      isPickingPhoto ||
      isMenuPresented
    ) {
      return;
    }

    setIsMultiReviewOpen(true);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [
    isCapturing,
    isMenuPresented,
    isPickingPhoto,
    multiScanPhotos.length,
  ]);

  const closeMultiReview = useCallback(() => {
    setIsMultiReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const deleteMultiPhoto = useCallback((photoId: string) => {
    setMultiScanPhotos((currentPhotos) =>
      currentPhotos.filter((photo) => photo.id !== photoId),
    );
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openUploadReview = useCallback(() => {
    if (
      uploadedPhotos.length === 0 ||
      captureLockRef.current ||
      isCapturing ||
      isPickingPhoto ||
      isMenuPresented
    ) {
      return;
    }

    setIsUploadReviewOpen(true);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [isCapturing, isMenuPresented, isPickingPhoto, uploadedPhotos.length]);

  const closeUploadReview = useCallback(() => {
    setIsUploadReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const deleteUploadedPhoto = useCallback((photoId: string) => {
    setUploadedPhotos((currentPhotos) =>
      currentPhotos.filter((photo) => photo.id !== photoId),
    );
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const handleToolSelect = (tool: ScannerToolId) => {
    if (isCapturing || isPickingPhoto || isMenuPresented) return;

    setCaptureFeedback(null);
    setSelectedTool(tool);
  };

  const handleToolActivate = async (tool: ScannerToolId) => {
    if (tool === 'upload') {
      await handleUploadPhoto();
      return;
    }

    const photoPath = await capturePhoto();
    if (!photoPath) return;

    if (tool === 'single') {
      setSinglePhotoUri(photoPath);
      setMessage('Photo captured. Starting analysis...');
      await runAnalysis([photoPath]);
      return;
    }

    if (tool === 'multi') {
      setMultiScanPhotos((photos) => {
        multiScanSequenceRef.current += 1;
        const photo: MultiScanPhoto = {
          createdAt: Date.now(),
          id: `${Date.now()}-${multiScanSequenceRef.current}`,
          path: photoPath,
          uri: toDisplayUri(photoPath),
        };
        const nextPhotos = [...photos, photo];
        setMessage(
          `${nextPhotos.length} view${nextPhotos.length === 1 ? '' : 's'} added. Keep scanning or tap the photo stack to analyze.`,
        );
        return nextPhotos;
      });
      return;
    }

    setBatchScanPhotos((photos) => {
      const nextPhotos = [...photos, photoPath];
      setMessage(
        `Batch-scan - ${nextPhotos.length} item${nextPhotos.length === 1 ? '' : 's'} captured`,
      );
      return nextPhotos;
    });
  };

  const closeAnalysis = () => {
    analysisAbortControllerRef.current?.abort();
    analysisAbortControllerRef.current = null;
    setAnalysisState(null);
    setAnalysisBackdropUri(null);
  };

  async function runAnalysis(photoUris: string[]) {
    if (
      photoUris.length === 0 ||
      analysisAbortControllerRef.current != null ||
      isPickingPhoto ||
      isMenuPresented
    ) {
      return;
    }

    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;
    setAnalysisBackdropUri(toDisplayUri(photoUris[0]));
    setAnalysisState(analysisProgressState('authenticating'));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    try {
      const result = await analyzeItemPhotos(
        { photoUris },
        {
          onStage: (stage) => {
            if (!controller.signal.aborted) setAnalysisState(analysisProgressState(stage));
          },
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted) return;
      setAnalysisState(toItemAnalysisState(result));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      if (controller.signal.aborted) return;

      if (error instanceof AppwriteSetupError) {
        setAnalysisState({
          message: error.message,
          requirements: [
            'Add the public Appwrite endpoint and project ID to .env.local.',
            'Create a private scan-photo bucket and add its ID.',
            'Deploy the analyze-item Function and add its Function ID.',
            ...error.missingKeys.map((key) => `Missing: ${key}`),
          ],
          status: 'setup',
          title: 'Connect secure item analysis',
        });
        return;
      }

      setAnalysisState({
        code: error instanceof ItemAnalysisError ? error.code : 'ANALYSIS_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'KeepFlip could not complete this analysis. Please try again.',
        status: 'error',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    } finally {
      if (analysisAbortControllerRef.current === controller) {
        analysisAbortControllerRef.current = null;
      }
    }
  }

  const handleAnalyzeItem = () => runAnalysis(analysisPhotoUris);

  const analysisButton =
    canAnalyzeCurrentTool && analysisState == null && !isPhotoReviewOpen ? (
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(130)}
        style={styles.analyzeButtonShell}>
        <Pressable
          accessibilityHint={`Uses ${analysisPhotoUris.length} selected photo${analysisPhotoUris.length === 1 ? '' : 's'} to identify and value this item`}
          accessibilityLabel="Analyze item with KeepFlip AI"
          accessibilityRole="button"
          disabled={isCapturing || isPickingPhoto || isMenuPresented}
          onPress={() => void handleAnalyzeItem()}
          style={({ pressed }) => [
            styles.analyzeButton,
            pressed && styles.analyzeButtonPressed,
            (isCapturing || isPickingPhoto || isMenuPresented) && styles.buttonDisabled,
          ]}>
          <View style={styles.analyzeReticle}>
            <View style={styles.analyzeReticleDot} />
          </View>
          <View style={styles.analyzeButtonCopy}>
            <Text style={styles.analyzeButtonEyebrow}>KEEPFLIP INTELLIGENCE</Text>
            <Text style={styles.analyzeButtonText}>
              {selectedTool === 'multi'
                ? `Analyze ${analysisPhotoUris.length} views`
                : selectedTool === 'upload'
                  ? `Analyze ${analysisPhotoUris.length} photo${analysisPhotoUris.length === 1 ? '' : 's'}`
                  : 'Analyze item'}
            </Text>
          </View>
          <Text style={styles.analyzeButtonArrow}>›</Text>
        </Pressable>
      </Animated.View>
    ) : null;

  const analysisOverlay = analysisState ? (
    <ItemAnalysisBubbles
      bottomInset={insets.bottom}
      doneLabel="Done"
      onDone={closeAnalysis}
      onRetry={() => {
        if (analysisState.status === 'insufficient-evidence') {
          closeAnalysis();
          return;
        }
        void handleAnalyzeItem();
      }}
      retryLabel={
        analysisState.status === 'insufficient-evidence' ? 'Add another photo' : undefined
      }
      state={analysisState}
      topInset={insets.top}
    />
  ) : null;

  const photoReviewOverlay = isMultiReviewOpen ? (
    <MultiScanPhotoReview
      bottomInset={insets.bottom}
      onClose={closeMultiReview}
      onDelete={deleteMultiPhoto}
      photos={multiScanPhotos}
      topInset={insets.top}
    />
  ) : isUploadReviewOpen ? (
    <MultiScanPhotoReview
      accentColor={theme.colors.cream}
      accessibilityContext="uploaded"
      bottomInset={insets.bottom}
      eyebrow="UPLOADED PHOTO SET"
      onClose={closeUploadReview}
      onDelete={deleteUploadedPhoto}
      photos={uploadedPhotos}
      topInset={insets.top}
    />
  ) : null;

  if (!hasPermission) {
    return (
      <KeepFlipBackground contentStyle={styles.centeredState}>
        <View style={styles.permissionAtmosphere}>
          <ScannerAtmosphere phase={renderedAtmospherePhase} />
        </View>
        {analysisState == null ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <IconSymbol name="camera.fill" size={30} color={theme.colors.goldBright} />
          </View>
          <Text style={styles.permissionTitle}>Camera access</Text>
          <Text style={styles.permissionBody}>
            {canRequestPermission
              ? 'KeepFlip uses your camera to identify an item and estimate its resale value.'
              : 'Camera access is disabled. Open system settings to allow KeepFlip to scan items.'}
          </Text>
          <Pressable onPress={handlePermissionAction} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>
              {canRequestPermission ? 'Enable camera' : 'Open settings'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Upload item photos instead"
            disabled={isPickingPhoto}
            onPress={() => void handleUploadPhoto()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              isPickingPhoto && styles.buttonDisabled,
            ]}>
            <IconSymbol
              name="photo.on.rectangle.angled"
              size={20}
              color={theme.colors.cream}
            />
            <Text style={styles.secondaryButtonText}>
              {isPickingPhoto
                ? 'Opening photos...'
                : uploadedPhotos.length > 0
                  ? `Add photos (${uploadedPhotos.length}/${MAX_ANALYSIS_PHOTOS})`
                  : 'Upload photos instead'}
            </Text>
          </Pressable>
          {uploadedPhotos.length > 0 && !isUploadReviewOpen ? (
            <MultiScanPhotoStack
              accentColor={theme.colors.cream}
              accessibilityContext="uploaded"
              disabled={isPickingPhoto || isMenuPresented}
              onOpen={openUploadReview}
              photos={uploadedPhotos}
            />
          ) : null}
          {analysisButton}
          {uploadedPhotos.length > 0 ? (
            <Text style={styles.permissionStatus}>{message}</Text>
          ) : null}
          </Animated.View>
        ) : null}
        {photoReviewOverlay}
        {analysisOverlay}
      </KeepFlipBackground>
    );
  }

  if (device == null) {
    return (
      <KeepFlipBackground contentStyle={styles.centeredState}>
        <View style={styles.permissionAtmosphere}>
          <ScannerAtmosphere phase={renderedAtmospherePhase} />
        </View>
        {analysisState == null ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.permissionCard}>
          <ActivityIndicator color={theme.colors.scannerCyan} />
          <Text style={styles.permissionTitle}>Starting camera</Text>
          <Text style={styles.deviceStateText}>Looking for a back camera...</Text>
          <Pressable
            accessibilityLabel="Upload item photos instead"
            disabled={isPickingPhoto}
            onPress={() => void handleUploadPhoto()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              isPickingPhoto && styles.buttonDisabled,
            ]}>
            <IconSymbol
              name="photo.on.rectangle.angled"
              size={20}
              color={theme.colors.cream}
            />
            <Text style={styles.secondaryButtonText}>
              {isPickingPhoto
                ? 'Opening photos...'
                : uploadedPhotos.length > 0
                  ? `Add photos (${uploadedPhotos.length}/${MAX_ANALYSIS_PHOTOS})`
                  : 'Upload photos instead'}
            </Text>
          </Pressable>
          {uploadedPhotos.length > 0 && !isUploadReviewOpen ? (
            <MultiScanPhotoStack
              accentColor={theme.colors.cream}
              accessibilityContext="uploaded"
              disabled={isPickingPhoto || isMenuPresented}
              onOpen={openUploadReview}
              photos={uploadedPhotos}
            />
          ) : null}
          {analysisButton}
          {uploadedPhotos.length > 0 ? (
            <Text style={styles.permissionStatus}>{message}</Text>
          ) : null}
          </Animated.View>
        ) : null}
        {photoReviewOverlay}
        {analysisOverlay}
      </KeepFlipBackground>
    );
  }

  return (
    <View style={styles.screen}>
      <Camera
        ref={cameraRef}
        device={device}
        enableZoomGesture
        isActive={isCameraActive}
        onInitialized={() => {
          setIsCameraReady(true);
          setCaptureFeedback(null);
        }}
        onStarted={() => {
          setIsCameraReady(true);
          setCaptureFeedback(null);
        }}
        onStopped={() => setIsCameraReady(false)}
        onError={(error) => {
          const feedback = error.message || 'Camera unavailable. Try reopening the scanner.';
          setIsCameraReady(false);
          setTorchEnabled(false);
          setMessage(feedback);
          setCaptureFeedback(feedback);
        }}
        photo
        style={StyleSheet.absoluteFill}
        torch={torchEnabled && canUseTorch ? 'on' : 'off'}
      />
      {analysisBackdropUri ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}>
          <Image
            cachePolicy="memory-disk"
            contentFit="cover"
            source={{ uri: analysisBackdropUri }}
            style={StyleSheet.absoluteFill}
            transition={120}
          />
        </Animated.View>
      ) : null}
      <View pointerEvents="none" style={styles.cameraScrim} />
      {analysisState?.status === 'analyzing' ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(180)}
          pointerEvents="none"
          style={styles.analysisAtmosphereHost}>
          <ScannerAtmosphere phase="analyzing" />
        </Animated.View>
      ) : null}
      {photoReviewOverlay}
      <Animated.View
        accessibilityElementsHidden={isScannerUiHidden}
        importantForAccessibility={isScannerUiHidden ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isScannerUiHidden ? 'none' : 'auto'}
        style={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 10 },
          scannerChromeAnimatedStyle,
        ]}>
        <View style={styles.topBar}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>KEEPFLIP AI</Text>
            <Animated.View
              accessibilityLiveRegion="polite"
              entering={FadeIn.duration(180)}
              key={selectedTool}
              style={styles.toolHeaderContent}>
              <Text style={styles.title}>{selectedToolHeader.title}</Text>
              <View style={styles.headerHintRow}>
                <IconSymbol
                  color={selectedToolAppearance.accent}
                  name={selectedToolAppearance.icon}
                  size={14}
                />
                <Text
                  style={[
                    styles.headerHint,
                    { color: captureFeedback ? selectedToolAppearance.accent : theme.colors.text },
                  ]}>
                  {captureFeedback ?? selectedToolHeader.hint}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>

        <View style={styles.scannerArea}>
          <View style={styles.scanFrame}>
            <View pointerEvents="none" style={styles.frameColorWash} />
            <ScannerAtmosphere phase={renderedAtmospherePhase} />
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            <Pressable
            accessibilityLabel="Toggle flashlight"
            accessibilityState={{ disabled: !canUseTorch }}
            disabled={!canUseTorch}
            onPress={() => setTorchEnabled((current) => !current)}
            style={[
              styles.iconButton,
              torchEnabled && styles.iconButtonActive,
              !canUseTorch && styles.iconButtonDisabled,
            ]}>
            <IconSymbol
              name={torchEnabled ? 'bolt.fill' : 'bolt.slash.fill'}
              size={22}
              color={torchEnabled ? theme.colors.background : theme.colors.goldBright}
            />
          </Pressable>
            <View style={styles.scanLine} />

          </View>
          {selectedTool === 'multi' && multiScanPhotos.length > 0 && !isMultiReviewOpen ? (
            <View style={styles.multiStackAnchor}>
              <MultiScanPhotoStack
                disabled={isCapturing || isPickingPhoto || isMenuPresented}
                onOpen={openMultiReview}
                photos={multiScanPhotos}
              />
            </View>
          ) : null}
          {selectedTool === 'upload' && uploadedPhotos.length > 0 && !isUploadReviewOpen ? (
            <View style={styles.multiStackAnchor}>
              <MultiScanPhotoStack
                accentColor={theme.colors.cream}
                accessibilityContext="uploaded"
                disabled={isCapturing || isPickingPhoto || isMenuPresented}
                onOpen={openUploadReview}
                photos={uploadedPhotos}
              />
            </View>
          ) : null}
          {analysisButton ? (
            <View
              style={[
                styles.analysisActionAnchor,
                (selectedTool === 'multi' || selectedTool === 'upload') &&
                  styles.analysisActionAnchorWithStack,
              ]}>
              {analysisButton}
            </View>
          ) : null}
        </View>

        <Animated.View
          accessibilityElementsHidden={isScannerOverlayOpen}
          importantForAccessibility={isScannerOverlayOpen ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isScannerOverlayOpen ? 'none' : 'auto'}
          style={[styles.bottomPanel, toolbarAnimatedStyle]}>
          <ScannerToolCarousel
            badges={{
              single: singlePhotoUri ? 1 : 0,
              batch: batchScanPhotos.length,
              upload: uploadedPhotos.length,
            }}
            disabled={isCapturing || isPickingPhoto || isMenuPresented}
            onActivate={(tool) => void handleToolActivate(tool)}
            onSelect={handleToolSelect}
            selectedTool={selectedTool}
          />
        </Animated.View>
      </Animated.View>
      {analysisOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, paddingHorizontal: 22 },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cameraScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    experimental_backgroundImage: `
      radial-gradient(circle at 72% 44%, rgba(88, 223, 232, 0.09) 0%, transparent 34%),
      radial-gradient(circle at 24% 62%, rgba(141, 114, 255, 0.10) 0%, transparent 38%),
      linear-gradient(to bottom, rgba(2, 2, 4, 0.94) 0%, rgba(3, 3, 7, 0.12) 44%, rgba(6, 4, 10, 0.90) 100%)
    `,
  },
  analysisAtmosphereHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    opacity: 0.88,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 14,
    padding: 28,
    borderRadius: theme.radii.large,
    borderWidth: 0.5,
    borderColor: 'rgba(215, 168, 74, 0.38)',
    backgroundColor: theme.colors.surface,
    experimental_backgroundImage: `
      radial-gradient(circle at 88% 4%, rgba(88, 223, 232, 0.08) 0%, transparent 34%),
      linear-gradient(145deg, rgba(18, 15, 22, 0.98) 0%, rgba(5, 5, 8, 0.98) 72%)
    `,
    boxShadow: '0 0 44px rgba(0, 0, 0, 0.62), 0 0 26px rgba(215, 168, 74, 0.10)',
  },
  permissionAtmosphere: {
    position: 'absolute',
    width: '200%',
    aspectRatio: 1,
    opacity: 0.9,
  },
  permissionIcon: {
    width: 62,
    height: 62,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(215,168,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244,213,139,0.55)',
  },
  permissionTitle: { color: theme.colors.text, fontSize: 25, fontWeight: '800' },
  permissionBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.gold,
  },
  permissionButtonText: { color: theme.colors.background, fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.34)',
    backgroundColor: 'rgba(242, 211, 138, 0.08)',
  },
  secondaryButtonPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  secondaryButtonText: { color: theme.colors.cream, fontSize: 15, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
  permissionStatus: {
    color: theme.colors.scannerCyan,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  deviceStateText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingRight: 60,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2.4 },
  toolHeaderContent: { gap: 3 },
  title: { color: theme.colors.cream, fontSize: 25, fontWeight: '800', letterSpacing: -0.6 },
  headerHintRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingTop: 1,
  },
  headerHint: {
    flex: 1,
    maxWidth: 340,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 35,
    height: 35,
    marginLeft: 20,
    marginTop: 20,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(9, 9, 13, 0.78)',
    zIndex: 3,
  },
  iconButtonActive: { backgroundColor: theme.colors.goldBright },
  iconButtonDisabled: { opacity: 0.42 },
  scannerArea: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  multiStackAnchor: {
    position: 'absolute',
    right: -10,
    bottom: 18,
    zIndex: 14,
  },
  analysisActionAnchor: {
    position: 'absolute',
    right: 12,
    bottom: 18,
    left: 12,
    zIndex: 15,
    alignItems: 'center',
  },
  analysisActionAnchorWithStack: {
    right: 82,
    alignItems: 'flex-start',
  },
  scanFrame: {
    width: '100%',
    aspectRatio: 0.9,
    maxHeight: 325,
    borderRadius: theme.radii.large,
    backgroundColor: 'rgba(3, 3, 6, 0.33)',
    alignSelf: 'center',
    justifyContent: 'flex-start',
    bottom: 40
  },
  frameColorWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 1,
    experimental_backgroundImage: `
      radial-gradient(circle at 62% 42%, rgba(88, 223, 232, 0.11) 0%, transparent 34%),
      radial-gradient(circle at 34% 66%, rgba(141, 114, 255, 0.11) 0%, transparent 38%),
      radial-gradient(circle at 50% 52%, rgba(224, 172, 75, 0.06) 0%, transparent 52%)
    `,
  },
  corner: { position: 'absolute', width: 54, height: 54, borderColor: theme.colors.goldBright },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 24, zIndex: 2 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 24, zIndex: 2 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 24, zIndex: 2 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 24, zIndex: 2 },
  scanLine: {
    position: 'absolute',
    top: '48%',
    left: 18,
    right: 18,
    height: 2,
    experimental_backgroundImage:
      'linear-gradient(to right, transparent 0%, rgba(88, 223, 232, 0.82) 34%, rgba(242, 211, 138, 0.96) 52%, rgba(141, 114, 255, 0.82) 70%, transparent 100%)',
    boxShadow: '0 0 16px rgba(88, 223, 232, 0.70), 0 0 28px rgba(141, 114, 255, 0.24)',
  },
  liveBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.32)',
    backgroundColor: 'rgba(5, 5, 9, 0.72)',
  },
  liveBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: '0 0 9px rgba(88, 223, 232, 0.92)',
  },
  liveBadgeText: { color: theme.colors.scannerCyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  analyzeButtonShell: {
    width: '100%',
    maxWidth: 330,
  },
  analyzeButton: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.46)',
    backgroundColor: 'rgba(16, 12, 8, 0.92)',
    experimental_backgroundImage: `
      radial-gradient(circle at 8% 50%, rgba(88, 223, 232, 0.12) 0%, transparent 34%),
      linear-gradient(115deg, rgba(33, 23, 10, 0.98) 0%, rgba(8, 7, 10, 0.98) 72%)
    `,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.42), 0 0 20px rgba(215, 168, 74, 0.12)',
  },
  analyzeButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  analyzeReticle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    backgroundColor: 'rgba(88, 223, 232, 0.08)',
    boxShadow: '0 0 14px rgba(88, 223, 232, 0.28)',
  },
  analyzeReticleDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.goldBright,
    boxShadow: '0 0 10px rgba(242, 211, 138, 0.92)',
  },
  analyzeButtonCopy: { flex: 1, gap: 2 },
  analyzeButtonEyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  analyzeButtonText: { color: theme.colors.cream, fontSize: 15, fontWeight: '900' },
  analyzeButtonArrow: {
    color: theme.colors.goldBright,
    fontSize: 27,
    fontWeight: '400',
    lineHeight: 30,
  },
  bottomPanel: { alignItems: 'center' },
});
