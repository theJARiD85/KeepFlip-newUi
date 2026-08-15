import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  useIsFocused,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  Camera,
  CommonResolutions,
  type CameraRef,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import {
  BarcodeLookupOverlay,
  type BarcodeLookupOverlayState,
} from "@/components/scanner/barcode-lookup-overlay.native";
import {
  ValueRadarOverlay,
  useValueRadar,
  type ValueRadarViewport,
} from "@/components/scanner/value-radar.native";
import {
  ScannerToolCarousel,
  scannerTools,
  type ScannerToolId,
} from "@/components/scanner/scanner-tool-carousel";
import {
  MultiScanPhotoReview,
  MultiScanPhotoStack,
  toDisplayUri,
  type MultiScanPhoto,
} from "@/components/scanner/multi-scan-photo-review";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { useKeepFlipMenu } from "@/components/navigation/keepflip-menu-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { lookupBarcodeWithEbay } from "@/services/ebaySoldCompsService";
import { MAX_ANALYSIS_PHOTOS } from "@/services/item-analysis-service";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";
import {
  createScanId,
  saveScannerPhoto,
  type SavedScanPhoto,
} from "@/services/scan-photo-service";
import {
  buildScanProofAssessment,
  inspectLocalScanProofPhoto,
  mergeLocalScanProofSignals,
  type LocalScanProofSignals,
  type ScanProofAssessment,
} from "@/services/scan-proof-service";

type AnalysisCognitionSeed = {
  localDetection?: {
    label: string;
    score: number;
  };
  scanProof?: ScanProofAssessment;
  tool: ScannerToolId;
};

type ScannerAnalysisActions = {
  openScannerAnalysis: (input: {
    backdropUri: string;
    ensurePhotosSaved?: () => Promise<void>;
    localDetection?: {
      label: string;
      score: number;
    };
    modeLabel: string;
    onCancel: () => void;
    onReset: () => void;
    photoUris: string[];
    scanProof?: ScanProofAssessment;
    scanId: string;
  }) => string;
};

function selectMultiScanEvidence(photos: MultiScanPhoto[]) {
  if (photos.length <= MAX_ANALYSIS_PHOTOS)
    return photos.map((photo) => photo.path);

  // Preserve the establishing shot and favor the latest detail/label views.
  return [
    photos[0].path,
    ...photos.slice(-(MAX_ANALYSIS_PHOTOS - 1)).map((photo) => photo.path),
  ];
}

function productCodeFromSignals(signals: LocalScanProofSignals) {
  return (
    signals.barcodes
      .map((value) => value.replace(/\s+/g, ""))
      .find((value) => /^[A-Za-z0-9-]{6,32}$/.test(value)) ?? null
  );
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
  if (tool === "single") {
    return {
      title: "Scan an item",
      hint: hasSinglePhoto
        ? "Photo ready. Tap the scan tool to replace it."
        : "One item, one photo.",
    };
  }

  if (tool === "barcode") {
    return {
      title: "Scan a product barcode",
      hint: "Center a UPC, EAN, ISBN, or product code to identify the item.",
    };
  }

  if (tool === "multi") {
    return {
      title: "Scan multiple angles",
      hint:
        multiCount > 0
          ? `${multiCount} view${multiCount === 1 ? "" : "s"} ready. Tap the photo stack to review.`
          : "Capture several angles of the same item.",
    };
  }

  if (tool === "batch") {
    return {
      title: "Scan multiple items",
      hint:
        batchCount > 0
          ? `${batchCount} item${batchCount === 1 ? "" : "s"} captured. Keep scanning to add more.`
          : "Capture one photo per item.",
    };
  }

  return {
    title: "Upload item photos",
    hint:
      uploadedCount > 0
        ? `${uploadedCount} of ${MAX_ANALYSIS_PHOTOS} photos ready. Tap the photo stack to review.`
        : `Choose up to ${MAX_ANALYSIS_PHOTOS} images of the same item.`,
  };
}

export default function ScannerScreen() {
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const { openScannerAnalysis } =
    useItemAnalysisResult() as unknown as ScannerAnalysisActions;
  const {
    contentWidth,
    controlDockWidth,
    height: screenHeight,
    insets,
    isCompactHeight,
    moderateScale,
    pageGutter,
    responsiveFont,
    scannerHeight,
    scannerWidth,
    verticalScale,
    width: screenWidth,
  } = useResponsiveLayout();
  const torchButtonSize = moderateScale(35, 0.65);
  const permissionCardWidth = Math.min(contentWidth, 480);
  const analysisButtonWidth = Math.min(controlDockWidth, 360);
  const isFocused = useIsFocused();
  const { isMenuOpen } = useKeepFlipMenu();
  const cameraRef = useRef<CameraRef>(null);
  const scanFrameRef = useRef<View>(null);
  const captureLockRef = useRef(false);
  const uploadSequenceRef = useRef(0);
  const torchRequestSequenceRef = useRef(0);
  const pendingAnalysisSessionIdRef = useRef<string | null>(null);
  const barcodeLookupRequestRef = useRef(0);
  const analysisNavigationTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanIdRef = useRef(createScanId());
  const device = useCameraDevice("back");
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    quality: 0.92,
    qualityPrioritization: "quality",
  });
  const { hasPermission, canRequestPermission, requestPermission } =
    useCameraPermission();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [isTorchUpdating, setIsTorchUpdating] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isInspectingProof, setIsInspectingProof] = useState(false);
  const [readyCameraId, setReadyCameraId] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [radarViewport, setRadarViewport] =
    useState<ValueRadarViewport | null>(null);
  const [selectedTool, setSelectedTool] = useState<ScannerToolId>("single");
  const [singlePhotoUri, setSinglePhotoUri] = useState<string | null>(null);
  const [multiScanPhotos, setMultiScanPhotos] = useState<MultiScanPhoto[]>([]);
  const [isMultiReviewOpen, setIsMultiReviewOpen] = useState(false);
  const [batchScanPhotos, setBatchScanPhotos] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<MultiScanPhoto[]>([]);
  const [isUploadReviewOpen, setIsUploadReviewOpen] = useState(false);
  const [barcodeLookup, setBarcodeLookup] =
    useState<BarcodeLookupOverlayState>({ phase: "idle" });
  const [activeAnalysisSessionId, setActiveAnalysisSessionId] =
    useState<string | null>(null);
  const [proofSignalsByUri, setProofSignalsByUri] = useState<
    Record<string, LocalScanProofSignals>
  >({});
  const canUseTorch = device?.hasTorch === true;
  const isCameraReady = readyCameraId === device?.id;
  const isBarcodeMode = selectedTool === "barcode";
  const analysisPhotoUris =
    selectedTool === "single" && singlePhotoUri
      ? [singlePhotoUri]
      : selectedTool === "multi"
        ? selectMultiScanEvidence(multiScanPhotos)
        : selectedTool === "upload"
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
  const isBarcodeLookupOpen = barcodeLookup.phase !== "idle";
  const isScannerOverlayOpen =
    isPhotoReviewOpen ||
    isBarcodeLookupOpen ||
    activeAnalysisSessionId != null;
  const isCameraActive =
    hasPermission &&
    device != null &&
    isFocused &&
    appState === "active" &&
    !isMenuOpen &&
    !isPickingPhoto &&
    !isInspectingProof &&
    !isScannerOverlayOpen;
  const shouldMountCamera =
    hasPermission &&
    device != null &&
    isFocused &&
    appState === "active" &&
    !isScannerOverlayOpen;
  const {
    frameOutput: radarFrameOutput,
    marker: radarMarker,
    status: radarStatus,
  } = useValueRadar(
    isCameraActive && !isBarcodeMode,
    radarViewport ?? undefined,
  );
  const cameraOutputs = useMemo(
    () => [photoOutput, radarFrameOutput],
    [photoOutput, radarFrameOutput],
  );
  const currentCameraCandidate =
    radarMarker && radarMarker.score >= 0.55
      ? {
          label: radarMarker.label,
          score: radarMarker.score,
        }
      : undefined;
  const localProofSignals = mergeLocalScanProofSignals(
    analysisPhotoUris.map((photoUri) => proofSignalsByUri[photoUri]),
  );
  const scanProof = buildScanProofAssessment({
    localDetection:
      selectedTool === "single" ? currentCameraCandidate : undefined,
    mode: isBarcodeMode ? "single" : selectedTool,
    photoCount: analysisPhotoUris.length,
    signals: localProofSignals,
  });
  const scannerHeaderHint =
    captureFeedback ??
    (scanProof.source === "on_device"
      ? `${scanProof.evidenceDetail}. ${scanProof.processingDetail}`
      : selectedToolHeader.hint);
  const scannerHeaderHasEvidence =
    captureFeedback != null || scanProof.source === "on_device";

  const handleScanFrameLayout = useCallback(() => {
    requestAnimationFrame(() => {
      scanFrameRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;

        setRadarViewport((current) => {
          const next = {
            height,
            previewHeight: screenHeight,
            previewWidth: screenWidth,
            width,
            x,
            y,
          };

          if (
            current &&
            Math.abs(current.x - next.x) < 0.5 &&
            Math.abs(current.y - next.y) < 0.5 &&
            Math.abs(current.width - next.width) < 0.5 &&
            Math.abs(current.height - next.height) < 0.5 &&
            current.previewWidth === next.previewWidth &&
            current.previewHeight === next.previewHeight
          ) {
            return current;
          }

          return next;
        });
      });
    });
  }, [screenHeight, screenWidth]);

  const navigateToPendingAnalysis = useCallback(() => {
    const sessionId = pendingAnalysisSessionIdRef.current;
    if (!sessionId) return;

    pendingAnalysisSessionIdRef.current = null;
    if (analysisNavigationTimerRef.current) {
      clearTimeout(analysisNavigationTimerRef.current);
      analysisNavigationTimerRef.current = null;
    }

    requestAnimationFrame(() => {
      router.push({
        pathname: "/analysis",
        params: { sessionId },
      });
    });
  }, [router]);

  const handleToggleTorch = useCallback(async () => {
    if (
      !canUseTorch ||
      !isCameraActive ||
      !isCameraReady ||
      isTorchUpdating
    ) {
      return;
    }

    const controller = cameraRef.current?.controller;
    if (controller == null) return;

    const requestId = ++torchRequestSequenceRef.current;
    const nextTorchEnabled = !torchEnabled;
    setIsTorchUpdating(true);

    try {
      await controller.setTorchMode(nextTorchEnabled ? "on" : "off");
      if (requestId !== torchRequestSequenceRef.current) return;
      setTorchEnabled(nextTorchEnabled);
    } catch (error) {
      if (requestId !== torchRequestSequenceRef.current) return;

      setTorchEnabled(false);
      const message = error instanceof Error ? error.message : String(error);
      const wasCanceledByCameraReconfiguration =
        message.includes("OperationCanceledException") ||
        message.includes("new enableTorch");

      if (__DEV__ && !wasCanceledByCameraReconfiguration) {
        console.warn("Unable to update the camera torch.", error);
      }
    } finally {
      if (requestId === torchRequestSequenceRef.current) {
        setIsTorchUpdating(false);
      }
    }
  }, [
    canUseTorch,
    isCameraActive,
    isCameraReady,
    isTorchUpdating,
    torchEnabled,
  ]);

  const toolbarAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isScannerOverlayOpen ? 0 : 1, { duration: 170 }),
      transform: [
        {
          translateY: withTiming(isScannerOverlayOpen ? 20 : 0, {
            duration: 190,
          }),
        },
        {
          scale: withTiming(isScannerOverlayOpen ? 0.94 : 1, { duration: 190 }),
        },
      ],
    }),
    [isScannerOverlayOpen],
  );
  const scannerChromeAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isScannerOverlayOpen ? 0 : 1, { duration: 170 }),
      transform: [
        { scale: withTiming(isScannerOverlayOpen ? 0.97 : 1, { duration: 190 }) },
      ],
    }),
    [isScannerOverlayOpen],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (
      !isFocused ||
      appState !== "active" ||
      isMenuOpen ||
      hasPermission ||
      !canRequestPermission
    ) {
      return;
    }

    void requestPermission().catch(() => {
      setCaptureFeedback(
        "Camera permission could not be requested. Open system settings to enable it.",
      );
    });
  }, [
    appState,
    canRequestPermission,
    hasPermission,
    isFocused,
    isMenuOpen,
    requestPermission,
  ]);

  useEffect(
    () => () => {
      if (analysisNavigationTimerRef.current) {
        clearTimeout(analysisNavigationTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeReviewFrame = requestAnimationFrame(() => {
      setIsMultiReviewOpen(false);
      setIsUploadReviewOpen(false);
    });
    return () => cancelAnimationFrame(closeReviewFrame);
  }, [isMenuOpen]);

  useEffect(() => {
    if (
      !isFocused ||
      !isPhotoReviewOpen ||
      Platform.OS !== "android"
    ) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setIsMultiReviewOpen(false);
        setIsUploadReviewOpen(false);
        return true;
      },
    );

    return () => subscription.remove();
  }, [isFocused, isPhotoReviewOpen]);

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
        return [...currentPhotos, ...additions].slice(
          0,
          MAX_ANALYSIS_PHOTOS,
        );
      });
      setSelectedTool("upload");
    },
    [],
  );

  const inspectCapturedPhotoProof = useCallback(async (photoUri: string) => {
    setIsInspectingProof(true);
    setCaptureFeedback("Reading barcode or model label locally...");

    try {
      const signals = await inspectLocalScanProofPhoto(photoUri);
      setProofSignalsByUri((current) => ({
        ...current,
        [photoUri]: signals,
      }));
      return signals;
    } finally {
      setIsInspectingProof(false);
    }
  }, []);

  const inspectCapturedBarcode = useCallback(async (photoUri: string) => {
    setIsInspectingProof(true);
    setCaptureFeedback("Reading barcode locally...");

    try {
      return await inspectLocalScanProofPhoto(photoUri);
    } finally {
      setIsInspectingProof(false);
    }
  }, []);

  const persistPickedPhotos = useCallback(
    async (assets: readonly ImagePicker.ImagePickerAsset[]) => {
      if (!user?.$id) {
        throw new Error("Sign in before saving scanner photos.");
      }

      const knownUris = new Set(uploadedPhotos.map((photo) => photo.path));
      const remainingSlots = MAX_ANALYSIS_PHOTOS - uploadedPhotos.length;
      const selectedAssets = assets
        .filter((asset) => {
          const uri = asset.uri?.trim();
          if (!uri || knownUris.has(uri)) return false;
          knownUris.add(uri);
          return true;
        })
        .slice(0, remainingSlots);

      if (selectedAssets.length === 0) return;

      const firstSortOrder = uploadedPhotos.length;
      for (const [index, asset] of selectedAssets.entries()) {
        await saveScannerPhoto({
          imageUri: asset.uri,
          ownerId: user.$id,
          scanId: scanIdRef.current,
          sortOrder: firstSortOrder + index,
          isPrimary: firstSortOrder + index === 0,
        });
      }

      acceptPickedPhotos(selectedAssets);
      for (const asset of selectedAssets) {
        await inspectCapturedPhotoProof(asset.uri);
      }
      setCaptureFeedback(null);
    },
    [
      acceptPickedPhotos,
      inspectCapturedPhotoProof,
      uploadedPhotos,
      user?.$id,
    ],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    let isMounted = true;
    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || pendingResult == null) return;

        if ("code" in pendingResult) {
          setCaptureFeedback(
            pendingResult.message || "Could not restore the selected photo.",
          );
          return;
        }

        if (!pendingResult.canceled && pendingResult.assets.length > 0) {
          await persistPickedPhotos(pendingResult.assets);
        }
      } catch {
        if (isMounted)
          setCaptureFeedback(
            "Could not restore the selected photo. Please choose it again.",
          );
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [persistPickedPhotos]);

  const handlePermissionAction = async () => {
    if (canRequestPermission) {
      const granted = await requestPermission();

      if (!granted) {
        setCaptureFeedback("Camera permission was not granted.");
      }

      return;
    }

    await Linking.openSettings();
  };

  const handleUploadPhoto = useCallback(async () => {
    if (isPickingPhoto || isInspectingProof) return;
    const remainingSlots = MAX_ANALYSIS_PHOTOS - uploadedPhotos.length;
    if (remainingSlots <= 0) {
      setCaptureFeedback(
        `The ${MAX_ANALYSIS_PHOTOS}-photo analysis set is full. Remove a photo before adding another.`,
      );
      setIsUploadReviewOpen(true);
      return;
    }

    setIsPickingPhoto(true);
    setCaptureFeedback(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 1,
        selectionLimit: remainingSlots,
      });

      if (result.canceled) {
        return;
      }

      if (result.assets.length === 0) {
        setCaptureFeedback("No photos were selected. Please try again.");
        return;
      }

      await persistPickedPhotos(result.assets);
    } catch {
      setCaptureFeedback("Could not open your photos. Please try again.");
    } finally {
      setIsPickingPhoto(false);
    }
  }, [
    isInspectingProof,
    isPickingPhoto,
    persistPickedPhotos,
    uploadedPhotos.length,
  ]);

  const capturePhoto = useCallback(
    async ({
      scanId,
      sortOrder,
      isPrimary,
      persistImmediately,
    }: {
      scanId: string;
      sortOrder: number;
      isPrimary: boolean;
      persistImmediately: boolean;
    }): Promise<{
      path: string;
      saved: SavedScanPhoto | null;
    } | null> => {
      if (!isCameraActive || !isCameraReady) {
        const feedback = "Camera is getting ready. Try again in a moment.";
        setCaptureFeedback(feedback);
        return null;
      }

      if (isInspectingProof) return null;

      if (!user?.$id) {
        const feedback = isBarcodeMode
          ? "Sign in before looking up a barcode."
          : "Sign in before saving scanner photos.";
        setCaptureFeedback(feedback);
        return null;
      }

      if (captureLockRef.current) return null;
      captureLockRef.current = true;
      setIsCapturing(true);
      setCaptureFeedback("Capturing item...");

      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
          () => undefined,
        );
        const photo = await photoOutput.capturePhotoToFile(
          { flashMode: "off" },
          {},
        );
        if (!photo.filePath) {
          throw new Error("VisionCamera returned an empty photo file path.");
        }

        let saved: SavedScanPhoto | null = null;
        if (persistImmediately) {
          setCaptureFeedback("Saving scanner image...");
          saved = await saveScannerPhoto({
            imageUri: photo.filePath,
            ownerId: user.$id,
            scanId,
            sortOrder,
            isPrimary,
          });
        }

        setCaptureFeedback(null);
        return { path: photo.filePath, saved };
      } catch (error) {
        const feedback =
          error instanceof Error
            ? error.message
            : "Could not capture and save this item.";
        setCaptureFeedback(feedback);
        return null;
      } finally {
        captureLockRef.current = false;
        setIsCapturing(false);
      }
    },
    [
      isCameraActive,
      isCameraReady,
      isBarcodeMode,
      isInspectingProof,
      photoOutput,
      user?.$id,
    ],
  );

  const dismissBarcodeLookup = useCallback(() => {
    barcodeLookupRequestRef.current += 1;
    setBarcodeLookup({ phase: "idle" });
    setCaptureFeedback(null);
  }, []);

  const scanAnotherBarcode = useCallback(() => {
    dismissBarcodeLookup();
    setSelectedTool("barcode");
    setCaptureFeedback("Center the full product barcode inside the scan frame.");
  }, [dismissBarcodeLookup]);

  const handleBarcodeToolActivate = useCallback(async () => {
    const captured = await capturePhoto({
      scanId: scanIdRef.current,
      sortOrder: 0,
      isPrimary: false,
      persistImmediately: false,
    });
    if (!captured) return;

    const signals = await inspectCapturedBarcode(captured.path);
    const barcode = productCodeFromSignals(signals);

    if (!barcode) {
      setBarcodeLookup({
        phase: "error",
        barcode: null,
        message:
          "No complete product barcode was read. Move closer, avoid glare, and keep the full code in the frame.",
      });
      return;
    }

    const requestId = barcodeLookupRequestRef.current + 1;
    barcodeLookupRequestRef.current = requestId;
    setBarcodeLookup({ phase: "searching", barcode });

    try {
      // This explicit, code-only action owns the barcode lookup boundary.
      const result = await lookupBarcodeWithEbay(barcode);
      if (requestId !== barcodeLookupRequestRef.current) return;

      setBarcodeLookup({ phase: "result", result });
      void Haptics.notificationAsync(
        result.found
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => undefined);
    } catch (error) {
      if (requestId !== barcodeLookupRequestRef.current) return;

      setBarcodeLookup({
        phase: "error",
        barcode,
        message:
          error instanceof Error
            ? neutralizeMarketplaceBrand(error.message)
            : "KeepFlip could not verify that barcode. Please try again.",
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    }
  }, [capturePhoto, inspectCapturedBarcode]);

  const openMultiReview = useCallback(() => {
    if (
      multiScanPhotos.length === 0 ||
      captureLockRef.current ||
      isCapturing ||
      isInspectingProof ||
      isPickingPhoto ||
      isMenuOpen
    ) {
      return;
    }

    setIsMultiReviewOpen(true);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [
    isCapturing,
    isInspectingProof,
    isMenuOpen,
    isPickingPhoto,
    multiScanPhotos.length,
  ]);

  const closeMultiReview = useCallback(() => {
    setIsMultiReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const deleteMultiPhoto = useCallback((photoId: string) => {
    const deletedPhoto = multiScanPhotos.find((photo) => photo.id === photoId);
    const nextPhotos = multiScanPhotos.filter(
      (photo) => photo.id !== photoId,
    );
    setMultiScanPhotos(nextPhotos);
    if (deletedPhoto) {
      setProofSignalsByUri((current) => {
        const next = { ...current };
        delete next[deletedPhoto.path];
        return next;
      });
    }
    if (nextPhotos.length === 0) setIsMultiReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [multiScanPhotos]);

  const openUploadReview = useCallback(() => {
    if (
      uploadedPhotos.length === 0 ||
      captureLockRef.current ||
      isCapturing ||
      isInspectingProof ||
      isPickingPhoto ||
      isMenuOpen
    ) {
      return;
    }

    setIsUploadReviewOpen(true);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [
    isCapturing,
    isInspectingProof,
    isMenuOpen,
    isPickingPhoto,
    uploadedPhotos.length,
  ]);

  const closeUploadReview = useCallback(() => {
    setIsUploadReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const deleteUploadedPhoto = useCallback((photoId: string) => {
    const deletedPhoto = uploadedPhotos.find((photo) => photo.id === photoId);
    const nextPhotos = uploadedPhotos.filter(
      (photo) => photo.id !== photoId,
    );
    setUploadedPhotos(nextPhotos);
    if (deletedPhoto) {
      setProofSignalsByUri((current) => {
        const next = { ...current };
        delete next[deletedPhoto.path];
        return next;
      });
    }
    if (nextPhotos.length === 0) setIsUploadReviewOpen(false);
    void Haptics.selectionAsync().catch(() => undefined);
  }, [uploadedPhotos]);

  const handleToolSelect = (tool: ScannerToolId) => {
    if (isCapturing || isInspectingProof || isPickingPhoto || isMenuOpen) {
      return;
    }

    setCaptureFeedback(null);
    setSelectedTool(tool);
  };

  const handleToolActivate = async (tool: ScannerToolId) => {
    if (isCapturing || isInspectingProof || isPickingPhoto || isMenuOpen) {
      return;
    }

    if (tool === "upload") {
      await handleUploadPhoto();
      return;
    }

    if (tool === "barcode") {
      await handleBarcodeToolActivate();
      return;
    }

    const cognitionSeed: AnalysisCognitionSeed = {
      tool,
      localDetection: tool === "single" ? currentCameraCandidate : undefined,
    };
    const scanId = tool === "batch" ? createScanId() : scanIdRef.current;
    const sortOrder = tool === "multi" ? multiScanPhotos.length : 0;
    const isPrimary = tool !== "multi" || multiScanPhotos.length === 0;
    const captured = await capturePhoto({
      scanId,
      sortOrder,
      isPrimary,
      persistImmediately: tool !== "single",
    });
    if (!captured) return;

    const photoPath = captured.path;
    if (tool === "single") {
      const ownerId = user?.$id;
      if (!ownerId) {
        setCaptureFeedback("Sign in before saving scanner photos.");
        return;
      }
      let photoPersistence: Promise<void> | null = null;
      const ensurePhotosSaved = () => {
        photoPersistence ??= saveScannerPhoto({
          imageUri: photoPath,
          ownerId,
          scanId,
          sortOrder,
          isPrimary,
        })
          .then(() => undefined)
          .catch((error) => {
            photoPersistence = null;
            throw error;
          });
        return photoPersistence;
      };

      setSinglePhotoUri(photoPath);
      const signals = await inspectCapturedPhotoProof(photoPath);
      beginAnalysis(
        [photoPath],
        {
          ...cognitionSeed,
          scanProof: buildScanProofAssessment({
            localDetection: cognitionSeed.localDetection,
            mode: tool,
            photoCount: 1,
            signals,
          }),
        },
        ensurePhotosSaved,
      );
      return;
    }

    if (tool === "multi") {
      const savedPhoto = captured.saved;
      if (!savedPhoto) {
        setCaptureFeedback("The captured photo could not be saved.");
        return;
      }
      await inspectCapturedPhotoProof(photoPath);
      setMultiScanPhotos((photos) => {
        const photo: MultiScanPhoto = {
          createdAt: Date.now(),
          id: savedPhoto.itemPhotoId,
          path: photoPath,
          uri: toDisplayUri(photoPath),
        };
        return [...photos, photo];
      });
      setCaptureFeedback(null);
      return;
    }

    setBatchScanPhotos((photos) => {
      return [...photos, photoPath];
    });
    setCaptureFeedback(null);
  };

  const resetScannerSession = useCallback(() => {
    captureLockRef.current = false;
    uploadSequenceRef.current = 0;
    scanIdRef.current = createScanId();
    pendingAnalysisSessionIdRef.current = null;
    barcodeLookupRequestRef.current += 1;
    if (analysisNavigationTimerRef.current) {
      clearTimeout(analysisNavigationTimerRef.current);
      analysisNavigationTimerRef.current = null;
    }
    setSinglePhotoUri(null);
    setMultiScanPhotos([]);
    setBatchScanPhotos([]);
    setUploadedPhotos([]);
    setProofSignalsByUri({});
    setIsInspectingProof(false);
    setIsMultiReviewOpen(false);
    setIsUploadReviewOpen(false);
    setBarcodeLookup({ phase: "idle" });
    setActiveAnalysisSessionId(null);
    setSelectedTool("single");
    setCaptureFeedback(null);
    setTorchEnabled(false);
  }, []);

  function beginAnalysis(
    photoUris: string[],
    cognitionSeed: AnalysisCognitionSeed,
    ensurePhotosSaved?: () => Promise<void>,
  ) {
    if (
      photoUris.length === 0 ||
      activeAnalysisSessionId != null ||
      isInspectingProof ||
      isPickingPhoto ||
      isMenuOpen
    ) {
      return;
    }

    const toolAppearance =
      scannerTools.find((tool) => tool.id === cognitionSeed.tool) ??
      scannerTools[0];
    const sessionId = openScannerAnalysis({
      backdropUri: toDisplayUri(photoUris[0]),
      ensurePhotosSaved,
      localDetection: cognitionSeed.localDetection,
      modeLabel: toolAppearance?.label ?? "Item scan",
      onCancel: () => {
        setActiveAnalysisSessionId(null);
      },
      onReset: resetScannerSession,
      photoUris: [...photoUris],
      scanProof: cognitionSeed.scanProof,
      scanId: scanIdRef.current,
    });

    setActiveAnalysisSessionId(sessionId);
    setCaptureFeedback(null);

    pendingAnalysisSessionIdRef.current = sessionId;
    if (!shouldMountCamera || !isCameraReady) {
      navigateToPendingAnalysis();
      return;
    }

    /*
     * onPreviewStopped is the normal route trigger. The timeout only covers
     * device-specific camera implementations that omit that lifecycle event.
     */
    analysisNavigationTimerRef.current = setTimeout(
      navigateToPendingAnalysis,
      600,
    );
  }

  const handleAnalyzeItem = () =>
    beginAnalysis(analysisPhotoUris, {
      localDetection:
        selectedTool === "single" ? currentCameraCandidate : undefined,
      scanProof,
      tool: selectedTool,
    });

  const analysisButton =
    canAnalyzeCurrentTool &&
    activeAnalysisSessionId == null &&
    !isPhotoReviewOpen ? (
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(130)}
        style={[styles.analyzeButtonShell, { maxWidth: analysisButtonWidth }]}
      >
        <Pressable
          accessibilityHint={`Uses ${analysisPhotoUris.length} selected photo${analysisPhotoUris.length === 1 ? "" : "s"} to identify and value this item`}
          accessibilityLabel="Analyze item with KeepFlip AI"
          accessibilityRole="button"
          disabled={
            isCapturing || isInspectingProof || isPickingPhoto || isMenuOpen
          }
          onPress={() => void handleAnalyzeItem()}
          style={({ pressed }) => [
            styles.analyzeButton,
            pressed && styles.analyzeButtonPressed,
            (isCapturing || isInspectingProof || isPickingPhoto || isMenuOpen) &&
              styles.buttonDisabled,
          ]}
        >
          <View
            style={[
              styles.analyzeReticle,
              {
                width: moderateScale(38, 0.7),
                height: moderateScale(38, 0.7),
                borderRadius: moderateScale(19, 0.7),
              },
            ]}
          >
            <View style={styles.analyzeReticleDot} />
          </View>
          <View style={styles.analyzeButtonCopy}>
            <Text
              style={[
                styles.analyzeButtonEyebrow,
                { fontSize: responsiveFont(8) },
              ]}
            >
              KEEPFLIP INTELLIGENCE
            </Text>
            <Text
              style={[
                styles.analyzeButtonText,
                { fontSize: responsiveFont(15) },
              ]}
            >
              {selectedTool === "multi"
                ? `Analyze ${analysisPhotoUris.length} views`
                : selectedTool === "upload"
                  ? `Analyze ${analysisPhotoUris.length} photo${analysisPhotoUris.length === 1 ? "" : "s"}`
                  : "Analyze item"}
            </Text>
          </View>
          <Text
            style={[
              styles.analyzeButtonArrow,
              { fontSize: responsiveFont(27), lineHeight: responsiveFont(30) },
            ]}
          >
            ›
          </Text>
        </Pressable>
      </Animated.View>
    ) : null;

  const scannerOverlay = isMultiReviewOpen ? (
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
  ) : isBarcodeLookupOpen ? (
    <BarcodeLookupOverlay
      bottomInset={insets.bottom}
      onDismiss={dismissBarcodeLookup}
      onScanAgain={scanAnotherBarcode}
      state={barcodeLookup}
      topInset={insets.top}
    />
  ) : null;

  if (!hasPermission) {
    return (
      <KeepFlipBackground
        contentStyle={[styles.centeredState, { paddingHorizontal: pageGutter }]}
      >
        {activeAnalysisSessionId == null ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            style={[
              styles.permissionCard,
              {
                width: permissionCardWidth,
                maxWidth: permissionCardWidth,
                gap: moderateScale(14, 0.55),
                padding: moderateScale(28, 0.55),
              },
            ]}
          >
            <View
              style={[
                styles.permissionIcon,
                {
                  width: moderateScale(62, 0.65),
                  height: moderateScale(62, 0.65),
                  borderRadius: moderateScale(31, 0.65),
                },
              ]}
            >
              <IconSymbol
                name="camera.fill"
                size={Math.round(moderateScale(30, 0.6))}
                color={theme.colors.goldBright}
              />
            </View>
            <Text
              style={[styles.permissionTitle, { fontSize: responsiveFont(25) }]}
            >
              Camera access
            </Text>
            <Text
              style={[
                styles.permissionBody,
                {
                  fontSize: responsiveFont(15),
                  lineHeight: responsiveFont(22),
                },
              ]}
            >
              {canRequestPermission
                ? "KeepFlip uses your camera to identify an item and estimate its resale value."
                : "Camera access is disabled. Open system settings to allow KeepFlip to scan items."}
            </Text>
            <Pressable
              onPress={handlePermissionAction}
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>
                {canRequestPermission ? "Enable camera" : "Open settings"}
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
              ]}
            >
              <IconSymbol
                name="photo.on.rectangle.angled"
                size={20}
                color={theme.colors.cream}
              />
              <Text style={styles.secondaryButtonText}>
                {isPickingPhoto
                  ? "Opening photos..."
                  : uploadedPhotos.length > 0
                    ? `Add photos (${uploadedPhotos.length}/${MAX_ANALYSIS_PHOTOS})`
                    : "Upload photos instead"}
              </Text>
            </Pressable>
            {uploadedPhotos.length > 0 && !isUploadReviewOpen ? (
              <MultiScanPhotoStack
                accentColor={theme.colors.cream}
                accessibilityContext="uploaded"
                disabled={isPickingPhoto || isMenuOpen}
                onOpen={openUploadReview}
                photos={uploadedPhotos}
              />
            ) : null}
            {analysisButton}
            {uploadedPhotos.length > 0 ? (
              <Text style={styles.permissionStatus}>
                {`${uploadedPhotos.length} of ${MAX_ANALYSIS_PHOTOS} photos ready for AI analysis.`}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
        {scannerOverlay}
      </KeepFlipBackground>
    );
  }

  if (device == null) {
    return (
      <KeepFlipBackground
        contentStyle={[styles.centeredState, { paddingHorizontal: pageGutter }]}
      >
        {activeAnalysisSessionId == null ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            style={[
              styles.permissionCard,
              {
                width: permissionCardWidth,
                maxWidth: permissionCardWidth,
                gap: moderateScale(14, 0.55),
                padding: moderateScale(28, 0.55),
              },
            ]}
          >
            <ActivityIndicator color={theme.colors.scannerCyan} />
            <Text
              style={[styles.permissionTitle, { fontSize: responsiveFont(25) }]}
            >
              Starting camera
            </Text>
            <Text style={styles.deviceStateText}>
              Looking for a back camera...
            </Text>
            <Pressable
              accessibilityLabel="Upload item photos instead"
              disabled={isPickingPhoto}
              onPress={() => void handleUploadPhoto()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
                isPickingPhoto && styles.buttonDisabled,
              ]}
            >
              <IconSymbol
                name="photo.on.rectangle.angled"
                size={20}
                color={theme.colors.cream}
              />
              <Text style={styles.secondaryButtonText}>
                {isPickingPhoto
                  ? "Opening photos..."
                  : uploadedPhotos.length > 0
                    ? `Add photos (${uploadedPhotos.length}/${MAX_ANALYSIS_PHOTOS})`
                    : "Upload photos instead"}
              </Text>
            </Pressable>
            {uploadedPhotos.length > 0 && !isUploadReviewOpen ? (
              <MultiScanPhotoStack
                accentColor={theme.colors.cream}
                accessibilityContext="uploaded"
                disabled={isPickingPhoto || isMenuOpen}
                onOpen={openUploadReview}
                photos={uploadedPhotos}
              />
            ) : null}
            {analysisButton}
            {uploadedPhotos.length > 0 ? (
              <Text style={styles.permissionStatus}>
                {`${uploadedPhotos.length} of ${MAX_ANALYSIS_PHOTOS} photos ready for AI analysis.`}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
        {scannerOverlay}
      </KeepFlipBackground>
    );
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.cameraLayer}>
        {shouldMountCamera ? (
          <Camera
            ref={cameraRef}
            device={device}
            implementationMode="compatible"
            isActive={isCameraActive}
            outputs={cameraOutputs}
            resizeMode="cover"
            onPreviewStarted={() => {
              setReadyCameraId(device.id);
              setCaptureFeedback(null);
            }}
            onPreviewStopped={() => {
              torchRequestSequenceRef.current += 1;
              setReadyCameraId(null);
              setIsTorchUpdating(false);
              setTorchEnabled(false);
              navigateToPendingAnalysis();
            }}
            onError={(error) => {
              const feedback =
                error.message ||
                "Camera unavailable. Try reopening the scanner.";

              setReadyCameraId(null);
              setTorchEnabled(false);
              setCaptureFeedback(feedback);
            }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>

      <View
        collapsable={false}
        pointerEvents="box-none"
        style={styles.interfaceLayer}
      >
        <View pointerEvents="none" style={styles.cameraScrim} />
        {!isScannerOverlayOpen ? (
          <View pointerEvents="box-none" style={styles.radarOverlayHost}>
            <ValueRadarOverlay
              avoidBottomAction={analysisButton != null}
              disabled={
                isCapturing ||
                isInspectingProof ||
                isPickingPhoto ||
                isMenuOpen ||
                !isCameraReady ||
                isBarcodeMode
              }
              focusBounds={radarViewport}
              height={screenHeight}
              marker={isBarcodeMode ? null : radarMarker}
              onMarkerPress={() => {
                setSelectedTool("single");
                void Haptics.selectionAsync().catch(() => undefined);
                void handleToolActivate("single");
              }}
              proof={
                selectedTool === "multi" && scanProof.source === "on_device"
                  ? scanProof
                  : undefined
              }
              status={radarStatus}
              width={screenWidth}
            />
          </View>
        ) : null}
        {scannerOverlay ? (
          <View
            collapsable={false}
            pointerEvents="box-none"
            style={styles.photoOverlayHost}
          >
            {scannerOverlay}
          </View>
        ) : null}

        <Animated.View
        accessibilityElementsHidden={isScannerOverlayOpen}
        importantForAccessibility={
          isScannerOverlayOpen ? "no-hide-descendants" : "auto"
        }
        pointerEvents={isScannerOverlayOpen ? "none" : "auto"}
        style={[
          styles.content,
          {
            paddingHorizontal: pageGutter,
            paddingTop: insets.top + verticalScale(14, 0.5),
            paddingBottom:
              insets.bottom + verticalScale(isCompactHeight ? 4 : 10, 0.5),
          },
          scannerChromeAnimatedStyle,
        ]}
      >
        <View
          style={[
            styles.topBar,
            {
              marginBottom: verticalScale(12, 0.55),
              paddingRight: moderateScale(60, 0.35),
            },
          ]}
        >
          <View style={styles.headerCopy}>
            <Text
              style={[
                styles.eyebrow,
                {
                  fontSize: responsiveFont(11),
                  letterSpacing: moderateScale(2.4, 0.28),
                },
              ]}
            >
              KEEPFLIP AI
            </Text>
            <Animated.View
              accessibilityLiveRegion="polite"
              entering={FadeIn.duration(180)}
              key={selectedTool}
              style={styles.toolHeaderContent}
            >
              <Text
                style={[
                  styles.title,
                  {
                    fontSize: responsiveFont(25),
                    lineHeight: responsiveFont(30),
                  },
                ]}
              >
                {selectedToolHeader.title}
              </Text>
              <View style={styles.headerHintRow}>
                <IconSymbol
                  color={selectedToolAppearance.accent}
                  name={selectedToolAppearance.icon}
                  size={14}
                />
                <Text
                  style={[
                    styles.headerHint,
                    {
                      color: scannerHeaderHasEvidence
                        ? selectedToolAppearance.accent
                        : theme.colors.text,
                      fontSize: responsiveFont(12),
                      lineHeight: responsiveFont(16),
                    },
                  ]}
                >
                  {scannerHeaderHint}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
        <View style={styles.scannerArea}>
        <Pressable
                  accessibilityLabel="Toggle flashlight"
                  accessibilityState={{
                    disabled:
                      !canUseTorch ||
                      !isCameraActive ||
                      !isCameraReady ||
                      isTorchUpdating,
                  }}
                  disabled={
                    !canUseTorch ||
                    !isCameraActive ||
                    !isCameraReady ||
                    isTorchUpdating
                  }
                  onPress={() => void handleToggleTorch()}
                  style={[
                    styles.iconButton,
                    {
                      width: torchButtonSize,
                      height: torchButtonSize,
                      borderRadius: torchButtonSize / 2,
                    },
                    torchEnabled && styles.iconButtonActive,
                    (!canUseTorch ||
                      !isCameraActive ||
                      !isCameraReady ||
                      isTorchUpdating) &&
                      styles.iconButtonDisabled,
                  ]}
                >
                  <IconSymbol
                    name={torchEnabled ? "bolt.fill" : "bolt.slash.fill"}
                    size={Math.round(moderateScale(22, 0.6))}
                    color={
                      torchEnabled
                        ? theme.colors.background
                        : theme.colors.goldBright
                    }
                  />
                </Pressable>
          <View
            ref={scanFrameRef}
            onLayout={handleScanFrameLayout}
            style={[
              styles.scanFrame,
              {
                width: scannerWidth,
                height: scannerHeight,
              },
            ]}
          >
            <View pointerEvents="none" style={styles.frameColorWash} />
          </View>
          {selectedTool === "multi" &&
          multiScanPhotos.length > 0 &&
          !isMultiReviewOpen ? (
            <View style={styles.multiStackAnchor}>
              <MultiScanPhotoStack
                disabled={
                  isCapturing ||
                  isInspectingProof ||
                  isPickingPhoto ||
                  isMenuOpen
                }
                onOpen={openMultiReview}
                photos={multiScanPhotos}
              />
            </View>
          ) : null}
          {selectedTool === "upload" &&
          uploadedPhotos.length > 0 &&
          !isUploadReviewOpen ? (
            <View style={styles.multiStackAnchor}>
              <MultiScanPhotoStack
                accentColor={theme.colors.cream}
                accessibilityContext="uploaded"
                disabled={
                  isCapturing ||
                  isInspectingProof ||
                  isPickingPhoto ||
                  isMenuOpen
                }
                onOpen={openUploadReview}
                photos={uploadedPhotos}
              />
            </View>
          ) : null}
          {analysisButton ? (
            <View
              style={[
                styles.analysisActionAnchor,
                (selectedTool === "multi" || selectedTool === "upload") &&
                  styles.analysisActionAnchorWithStack,
              ]}
            >
              {analysisButton}
            </View>
          ) : null}
        </View>

        <Animated.View
          accessibilityElementsHidden={isScannerOverlayOpen}
          importantForAccessibility={
            isScannerOverlayOpen ? "no-hide-descendants" : "auto"
          }
          pointerEvents={isScannerOverlayOpen ? "none" : "auto"}
          style={[
            styles.bottomPanel,
            { width: controlDockWidth },
            toolbarAnimatedStyle,
          ]}
        >
          <ScannerToolCarousel
            badges={{
              single: singlePhotoUri ? 1 : 0,
              batch: batchScanPhotos.length,
              upload: uploadedPhotos.length,
            }}
            disabled={
              isCapturing ||
              isInspectingProof ||
              isPickingPhoto ||
              isMenuOpen
            }
            onActivate={(tool) => void handleToolActivate(tool)}
            onSelect={handleToolSelect}
            selectedTool={selectedTool}
          />
        </Animated.View>
        </Animated.View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  cameraLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  interfaceLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
  photoOverlayHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 80,
  },
  content: { flex: 1 },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cameraScrim: {
    position: "absolute",
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
  radarOverlayHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 14,
    bottom: 60,
  },
  permissionCard: {
    alignItems: "center",
    borderRadius: theme.radii.large,
    borderWidth: 0.5,
    borderColor: "rgba(215, 168, 74, 0.38)",
    backgroundColor: theme.colors.surface,
    experimental_backgroundImage: `
      radial-gradient(circle at 88% 4%, rgba(88, 223, 232, 0.08) 0%, transparent 34%),
      linear-gradient(145deg, rgba(18, 15, 22, 0.98) 0%, rgba(5, 5, 8, 0.98) 72%)
    `,
    boxShadow:
      "0 0 44px rgba(0, 0, 0, 0.62), 0 0 26px rgba(215, 168, 74, 0.10)",
  },
  permissionIcon: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(215,168,74,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,213,139,0.55)",
  },
  permissionTitle: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  permissionBody: {
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  permissionButton: {
    marginTop: 8,
    width: "100%",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.gold,
  },
  permissionButtonText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    width: "100%",
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.34)",
    backgroundColor: "rgba(242, 211, 138, 0.08)",
  },
  secondaryButtonPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  secondaryButtonText: {
    color: theme.colors.cream,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: { opacity: 0.5 },
  permissionStatus: {
    color: theme.colors.scannerCyan,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  deviceStateText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: theme.colors.gold,
    fontWeight: "900",
  },
  toolHeaderContent: { gap: 3 },
  title: {
    color: theme.colors.cream,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  headerHintRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingTop: 1,
  },
  headerHint: {
    flex: 1,
    maxWidth: 340,
    fontWeight: "700",
  },
  iconButton: {
    position: 'absolute',
    top: -30, 
    left: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.42)",
    backgroundColor: "rgba(9, 9, 13, 0.78)",
    zIndex: 3,
  },
  iconButtonActive: { backgroundColor: theme.colors.goldBright },
  iconButtonDisabled: { opacity: 0.42 },
  scannerArea: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 5,
    marginTop: 30,
  },
  multiStackAnchor: {
    position: "absolute",
    right: -10,
    bottom: 18,
    zIndex: 14,
  },
  analysisActionAnchor: {
    position: "absolute",
    right: 12,
    bottom: 18,
    left: 12,
    zIndex: 15,
    alignItems: "center",
  },
  analysisActionAnchorWithStack: {
    right: 82,
    alignItems: "flex-start",
  },
  scanFrame: {
    borderRadius: theme.radii.large,
    alignSelf: "center",
    justifyContent: "flex-start",
  },
  barcodeGuide: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    paddingHorizontal: 30,
  },
  barcodeGuideStrip: {
    width: "100%",
    maxWidth: 250,
    height: 94,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(141, 114, 255, 0.78)",
    backgroundColor: "rgba(4, 3, 9, 0.48)",
    boxShadow: "0 0 28px rgba(141, 114, 255, 0.24)",
  },
  barcodeGuideLine: {
    width: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerMagenta,
  },
  barcodeGuideLineWide: {
    width: 12,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
  },
  barcodeGuideText: {
    color: theme.colors.scannerMagenta,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  frameColorWash: {
    position: "absolute",
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
  analyzeButtonShell: {
    width: "100%",
  },
  analyzeButton: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: theme.radii.medium,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.46)",
    backgroundColor: "rgba(16, 12, 8, 0.92)",
    experimental_backgroundImage: `
      radial-gradient(circle at 8% 50%, rgba(88, 223, 232, 0.12) 0%, transparent 34%),
      linear-gradient(115deg, rgba(33, 23, 10, 0.98) 0%, rgba(8, 7, 10, 0.98) 72%)
    `,
    boxShadow:
      "0 8px 24px rgba(0, 0, 0, 0.42), 0 0 20px rgba(215, 168, 74, 0.12)",
  },
  analyzeButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  analyzeReticle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    backgroundColor: "rgba(88, 223, 232, 0.08)",
    boxShadow: "0 0 14px rgba(88, 223, 232, 0.28)",
  },
  analyzeReticleDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 10px rgba(242, 211, 138, 0.92)",
  },
  analyzeButtonCopy: { flex: 1, gap: 2 },
  analyzeButtonEyebrow: {
    color: theme.colors.scannerCyan,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  analyzeButtonText: {
    color: theme.colors.cream,
    fontWeight: "900",
  },
  analyzeButtonArrow: {
    color: theme.colors.goldBright,
    fontWeight: "400",
  },
  bottomPanel: { alignItems: "center" },
});
