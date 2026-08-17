import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { HudImageFrame } from "@/components/scanner/hud-image-frame.native";
import { inventoryItemToAnalysisState } from "@/components/scanner/inventory-analysis-view-model";
import { toItemAnalysisState } from "@/components/scanner/item-analysis-view-model";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { ValuationResultStage } from "@/components/scanner/valuation-result-stage";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { APPWRITE, storage } from "@/lib/appwrite";
import {
  applyProfitabilityGuidanceToAnalysis,
  type SerpApiProfitabilityGuidance,
} from "@/services/ebaySoldCompsService";
import { saveDealShelfItem } from "@/services/deal-shelf-service";
import { refineItemAnalysis } from "@/services/item-analysis-service";
import {
  getInventoryItem,
  saveAnalyzedItemToInventory,
  updateInventoryAnalysisSnapshot,
} from "@/services/inventory-service";
import { getItemPhotos } from "@/services/itemPhotoService";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";
import {
  saveScannerRefinementPhoto,
  type SavedScanPhoto,
} from "@/services/scan-photo-service";
import type { ItemAnalysisSuccess } from "@/types/item-analysis";

type InventoryResultPayload = {
  analysis: ItemAnalysisSuccess | null;
  photoUri: string | null;
  state: ReturnType<typeof inventoryItemToAnalysisState>;
};

type JsonRecord = Record<string, unknown>;

type SnapshotImageReference = {
  bucketId: string | null;
  fileId: string | null;
  imageUrl: string | null;
};

const SNAPSHOT_IMAGE_SKIP_KEYS = new Set([
  "comps",
  "comparables",
  "matches",
  "signals",
  "references",
  "search_parameters",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function asHttpUrl(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned && /^https?:\/\//i.test(cleaned) ? cleaned : null;
}

function findSnapshotFileReference(
  value: unknown,
  depth = 0,
): SnapshotImageReference | null {
  if (depth > 10 || value == null) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSnapshotFileReference(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const bucketId =
    cleanString(value.bucketId) ??
    cleanString(value.imageBucketId);
  const fileId =
    cleanString(value.fileId) ??
    cleanString(value.imageFileId);

  if (bucketId && fileId) {
    return {
      bucketId,
      fileId,
      imageUrl:
        asHttpUrl(value.imageUrl) ??
        asHttpUrl(value.viewUrl),
    };
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SNAPSHOT_IMAGE_SKIP_KEYS.has(key)) continue;
    const found = findSnapshotFileReference(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

function findSnapshotImageUrl(
  value: unknown,
  depth = 0,
): string | null {
  if (depth > 10 || value == null) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSnapshotImageUrl(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const direct =
    asHttpUrl(value.imageUrl) ??
    asHttpUrl(value.viewUrl) ??
    asHttpUrl(value.photoUrl) ??
    asHttpUrl(value.sourceImageUrl);

  if (direct && !/[?&]token=/i.test(direct)) {
    return direct;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SNAPSHOT_IMAGE_SKIP_KEYS.has(key)) continue;
    const found = findSnapshotImageUrl(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

function imageExtension(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return "jpg";
}

function safeCacheName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

async function appwriteImageFileUri(
  bucketId: string,
  fileId: string,
): Promise<string> {
  const response = await storage.getFileView({
    bucketId,
    fileId,
  });
  const bytes =
    response instanceof Uint8Array
      ? response
      : new Uint8Array(response);
  const extension = imageExtension(bytes);
  const cacheFile = new File(
    Paths.cache,
    `keepflip-analysis-${safeCacheName(fileId)}.${extension}`,
  );

  cacheFile.create({
    intermediates: true,
    overwrite: true,
  });
  cacheFile.write(bytes);

  return cacheFile.uri;
}

async function resolveSavedItemImageUri(
  item: Awaited<ReturnType<typeof getInventoryItem>>,
  ownerId: string,
): Promise<string | null> {
  const snapshotReference = findSnapshotFileReference(
    item.analysisSnapshot,
  );

  if (snapshotReference?.bucketId && snapshotReference.fileId) {
    try {
      return await appwriteImageFileUri(
        snapshotReference.bucketId,
        snapshotReference.fileId,
      );
    } catch {
      // Continue through the durable inventory-photo fallbacks.
    }
  }

  if (item.coverPhotoId && APPWRITE.itemImagesBucketId) {
    try {
      return await appwriteImageFileUri(
        APPWRITE.itemImagesBucketId,
        item.coverPhotoId,
      );
    } catch {
      // The cover pointer may belong to an older inventory record.
    }
  }

  try {
    const photos = await getItemPhotos({
      itemId: item.id,
      ownerId,
    });
    const primaryPhoto =
      photos.find((photo) => photo.isPrimary) ??
      photos[0] ??
      null;

    if (primaryPhoto && APPWRITE.itemImagesBucketId) {
      return await appwriteImageFileUri(
        APPWRITE.itemImagesBucketId,
        primaryPhoto.fileId,
      );
    }
  } catch {
    // A saved snapshot URL is still a valid final fallback.
  }

  return (
    snapshotReference?.imageUrl ??
    findSnapshotImageUrl(item.analysisSnapshot)
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadInventoryResult(
  ownerId: string,
  itemId: string,
): Promise<InventoryResultPayload> {
  const item = await getInventoryItem(ownerId, itemId);

  return {
    analysis: item.analysisSnapshot ?? null,
    photoUri: await resolveSavedItemImageUri(item, ownerId),
    state: inventoryItemToAnalysisState(item),
  };
}

export function ItemAnalysisResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    itemId?: string | string[];
    sessionId?: string | string[];
  }>();
  const itemId = firstParam(params.itemId);
  const sessionId = firstParam(params.sessionId);
  const { user } = useKeepFlipAuth();
  const userId = user?.$id;
  const {
    clearScannerResult,
    scannerResult,
    updateScannerResult,
  } = useItemAnalysisResult();
  const scannerSession =
    sessionId && scannerResult?.id === sessionId
      ? scannerResult
      : null;
  const [inventoryResult, setInventoryResult] =
    useState<InventoryResultPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [error, setError] = useState<string | null>(null);
  const [projectionError, setProjectionError] =
    useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [refining, setRefining] = useState(false);
  const [scanningMorePhotos, setScanningMorePhotos] = useState(false);
  const [refinementPhoto, setRefinementPhoto] =
    useState<{ photo: SavedScanPhoto; sessionId: string } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const finalizedRef = useRef(false);
  const activeSessionId = scannerSession?.id;
  const activeSessionReset = scannerSession?.onReset;
  const activeRefinementPhoto =
    refinementPhoto && refinementPhoto.sessionId === activeSessionId
      ? refinementPhoto.photo
      : null;

  useEffect(() => {
    if (!itemId) return;

    let active = true;
    void (async () => {
      await Promise.resolve();
      try {
        if (!userId) {
          throw new Error(
            "Sign in before opening an inventory analysis.",
          );
        }
        const loaded = await loadInventoryResult(userId, itemId);
        if (!active) return;
        setInventoryResult(loaded);
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error
            ? neutralizeMarketplaceBrand(caught.message)
            : "KeepFlip could not open this saved analysis.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [itemId, loadAttempt, userId]);

  useEffect(() => {
    finalizedRef.current = false;

    return () => {
      if (
        !finalizedRef.current &&
        activeSessionId &&
        activeSessionId === sessionId
      ) {
        activeSessionReset?.();
        clearScannerResult(activeSessionId);
      }
    };
  }, [
    activeSessionId,
    activeSessionReset,
    clearScannerResult,
    sessionId,
  ]);

  const finishScannerSession = useCallback(() => {
    if (!scannerSession) return;
    finalizedRef.current = true;
    scannerSession.onReset();
    clearScannerResult(scannerSession.id);
  }, [clearScannerResult, scannerSession]);

  const handleSave = useCallback(async () => {
    if (!scannerSession || saving || savingDeal) return;
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in before saving an item to inventory.",
      );
      return;
    }

    setSaving(true);
    try {
      await scannerSession.ensurePhotosSaved?.();
      const saved = await saveAnalyzedItemToInventory({
        analysis: scannerSession.analysis,
        modelFile: scannerSession.modelUrl,
        ownerId: userId,
        scanId: scannerSession.scanId,
      });
      finishScannerSession();
      router.replace("/inventory");
      if (saved.photoWarning) {
        Alert.alert("Item saved", saved.photoWarning);
      }
    } catch (caught) {
      Alert.alert(
        "Could not save item",
        caught instanceof Error
          ? neutralizeMarketplaceBrand(caught.message)
          : "KeepFlip could not save this item.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    finishScannerSession,
    router,
    saving,
    savingDeal,
    scannerSession,
    userId,
  ]);

  const handleSaveToDealShelf = useCallback(async () => {
    if (!scannerSession || saving || savingDeal) return;
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in before parking a deal.",
      );
      return;
    }

    setSavingDeal(true);
    try {
      await scannerSession.ensurePhotosSaved?.();
      await saveDealShelfItem({
        analysis: scannerSession.analysis,
        modelFile: scannerSession.modelUrl,
        ownerId: userId,
        scanId: scannerSession.scanId,
      });
      finishScannerSession();
      router.replace("/deal-shelf" as Href);
    } catch (caught) {
      Alert.alert(
        "Could not park deal",
        caught instanceof Error
          ? neutralizeMarketplaceBrand(caught.message)
          : "KeepFlip could not save this deal.",
      );
    } finally {
      setSavingDeal(false);
    }
  }, [
    finishScannerSession,
    router,
    saving,
    savingDeal,
    scannerSession,
    userId,
  ]);

  const handleScanMorePhotos = useCallback(async () => {
    if (!scannerSession || !userId || refining || scanningMorePhotos) return;

    setScanningMorePhotos(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera access needed",
          "Allow camera access to add a close-up for this valuation.",
        );
        return;
      }

      const capture = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (capture.canceled) return;

      const imageUri = capture.assets[0]?.uri;
      if (!imageUri) {
        throw new Error("The camera did not return a usable photo.");
      }

      await scannerSession.ensurePhotosSaved?.();
      const saved = await saveScannerRefinementPhoto({
        imageUri,
        ownerId: userId,
        scanId: scannerSession.scanId,
      });
      setRefinementPhoto({ photo: saved, sessionId: scannerSession.id });
      Alert.alert(
        "Detail photo ready",
        "Add any verified answer, then refine the valuation. You can also refine using this photo alone.",
      );
    } catch (caught) {
      Alert.alert(
        "Could not save detail photo",
        caught instanceof Error
          ? neutralizeMarketplaceBrand(caught.message)
          : "KeepFlip could not save this photo for valuation.",
      );
    } finally {
      setScanningMorePhotos(false);
    }
  }, [refining, scannerSession, scanningMorePhotos, userId]);

  const handleRefine = useCallback(
    async (answersByQuestion: Record<string, string>) => {
      if (!scannerSession || !userId || refining) return;

      const answers = (scannerSession.state.data.refinementQuestions ?? [])
        .map((question) => ({
          answer: answersByQuestion[question.id]?.trim() ?? "",
          question: question.prompt,
        }))
        .filter((entry) => Boolean(entry.answer));

      if (answers.length === 0 && !activeRefinementPhoto) return;

      setRefining(true);
      try {
        await scannerSession.ensurePhotosSaved?.();
        const analysis = await refineItemAnalysis({
          answers,
          ownerId: userId,
          photoFileId: activeRefinementPhoto?.fileId,
          scanId: scannerSession.scanId,
          subsequentRequestToken:
            scannerSession.analysis.marketResearch?.aiModeConversation
              ?.subsequentRequestToken,
        });
        const nextState = toItemAnalysisState(analysis);
        if (nextState.status !== "result") {
          throw new Error("KeepFlip needs another clear identifying detail.");
        }

        updateScannerResult(scannerSession.id, {
          analysis,
          state: nextState,
        });
        setRefinementPhoto(null);
      } catch (caught) {
        Alert.alert(
          "Could not refine valuation",
          caught instanceof Error
            ? neutralizeMarketplaceBrand(caught.message)
            : "KeepFlip could not apply those valuation details.",
        );
      } finally {
        setRefining(false);
      }
    },
    [
      activeRefinementPhoto,
      refining,
      scannerSession,
      updateScannerResult,
      userId,
    ],
  );

  const handleProfitabilityGuidance = useCallback(
    async (guidance: SerpApiProfitabilityGuidance) => {
      if (scannerSession) {
        const analysis = applyProfitabilityGuidanceToAnalysis(
          scannerSession.analysis,
          guidance,
        );
        const nextState = toItemAnalysisState(analysis);
        if (nextState.status === "result") {
          updateScannerResult(scannerSession.id, {
            analysis,
            state: nextState,
          });
        }
        return;
      }

      if (!inventoryResult?.analysis || !itemId || !userId) {
        return;
      }

      const analysis = applyProfitabilityGuidanceToAnalysis(
        inventoryResult.analysis,
        guidance,
      );
      const nextState = toItemAnalysisState(analysis);
      if (nextState.status !== "result") return;

      await updateInventoryAnalysisSnapshot({
        analysis,
        itemId,
        ownerId: userId,
      });
      setInventoryResult((current) =>
        current
          ? {
            ...current,
            analysis,
            state: nextState,
          }
          : current,
      );
    },
    [
      inventoryResult,
      itemId,
      scannerSession,
      updateScannerResult,
      userId,
    ],
  );

  const resultState =
    scannerSession?.state ?? inventoryResult?.state ?? null;
  const photoUri =
    scannerSession?.backdropUri ??
    inventoryResult?.photoUri ??
    undefined;

  const missingSession = Boolean(sessionId && !scannerSession);
  const resolvedError =
    error ??
    (missingSession
      ? "That live analysis session has ended. Run a new scan to open it again."
      : !itemId && !scannerSession
        ? "No analysis result was supplied to this screen."
        : null);

  if (loading || resolvedError || !resultState) {
    return (
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.ambientGradient} />
        <View pointerEvents="none" style={styles.projectionLayer}>
          <HudImageFrame
            onError={setProjectionError}
            photoUri={photoUri}
            statusText={
              scannerSession
                ? "CAPTURED EVIDENCE"
                : "SAVED ANALYSIS IMAGE"
            }
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.resultScrim, styles.resultScrimWithProjection]}
        />
        <View style={styles.centerState}>
          <Text style={styles.centerEyebrow}>
            KEEPFLIP ANALYSIS ARCHIVE
          </Text>
          {loading ? (
            <>
              <ActivityIndicator color={theme.colors.scannerCyan} />
              <Text style={styles.centerTitle}>
                Reconstructing item intelligence
              </Text>
              <Text style={styles.centerBody}>
                Loading the cover evidence and analysis snapshot.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.centerTitle}>
                Analysis unavailable
              </Text>
              <Text selectable style={styles.centerBody}>
                {resolvedError}
              </Text>
              {itemId ? (
                <Pressable
                  onPress={() => {
                    setLoading(true);
                    setError(null);
                    setProjectionError(null);
                    setLoadAttempt((attempt) => attempt + 1);
                  }}
                  style={({ pressed }) => [
                    styles.stateButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.stateButtonText}>RETRY LOAD</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.stateButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.stateButtonText}>GO BACK</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const projectionLabel = projectionError
    ? "PROJECTION SIGNAL DEGRADED / HUD FIELD ACTIVE"
    : "KEEPFLIP ITEM PROJECTION / VALUATION FIELD";

  return (
    <KeepFlipBackground>
        <View pointerEvents="none" style={styles.projectionLayer}>
          <HudImageFrame
            onError={setProjectionError}
            photoUri={photoUri}
            statusText={
              scannerSession
                ? "CAPTURED EVIDENCE"
                : "SAVED ANALYSIS IMAGE"
            }
          />
        </View>

        <View
          pointerEvents="none"
          style={[styles.resultScrim, styles.resultScrimWithProjection]}
        />

        <ValuationResultStage
          bottomInset={insets.bottom}
          key={
            scannerSession
              ? `${scannerSession.id}:${
                scannerSession.analysis.marketResearch?.searchedAt ??
                scannerSession.analysis.version
              }`
              : itemId ?? "saved-analysis"
          }
          onProfitabilityGuidance={handleProfitabilityGuidance}
          onRefine={
            scannerSession
              ? (answers) => {
                void handleRefine(answers);
              }
              : undefined
          }
          onScanMorePhotos={
            scannerSession
              ? () => {
                void handleScanMorePhotos();
              }
              : undefined
          }
          onSaveToDealShelf={
            scannerSession
              ? () => {
                void handleSaveToDealShelf();
              }
              : undefined
          }
          onSave={
            scannerSession
              ? () => {
                void handleSave();
              }
              : undefined
          }
          projectionLabel={projectionLabel}
          refining={refining}
          refinementPhotoReady={Boolean(activeRefinementPhoto)}
          saveLabel="Save to inventory"
          savingDeal={savingDeal}
          saving={saving}
          scanningMorePhotos={scanningMorePhotos}
          showMarketDecisionStamp={Boolean(scannerSession)}
          state={resultState}
          topInset={insets.top}
        />
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    experimental_backgroundImage: `
      radial-gradient(circle at 84% 8%, rgba(224, 172, 75, 0.10) 0%, transparent 20%),
      radial-gradient(circle at 5% 68%, rgba(88, 223, 232, 0.075) 0%, transparent 15%),
      radial-gradient(circle at 92% 90%, rgba(171, 61, 255, 0.30) 0%, transparent 28%),
      linear-gradient(160deg, #050506 0%, #020204 25%, #06040A 50%)
    `,
  },
  projectionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 80,
    left: 8,
    right: 8,
  },
  resultScrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    experimental_backgroundImage: `
      radial-gradient(circle at 72% 44%, rgba(88, 223, 232, 0.09) 0%, transparent 34%),
      radial-gradient(circle at 24% 62%, rgba(141, 114, 255, 0.10) 0%, transparent 38%),
      linear-gradient(to bottom, rgba(2, 2, 4, 0.94) 0%, rgba(3, 3, 7, 0.12) 44%, rgba(6, 4, 10, 0.90) 100%)
    `,
  },
  resultScrimWithProjection: {
    opacity: 0.22,
  },
  centerState: {
    flex: 1,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
    paddingHorizontal: 30,
  },
  centerEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  centerTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.radar,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    textAlign: "center",
  },
  centerBody: {
    maxWidth: 420,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  stateButton: {
    minWidth: 150,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(88, 223, 232, 0.08)",
  },
  stateButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
