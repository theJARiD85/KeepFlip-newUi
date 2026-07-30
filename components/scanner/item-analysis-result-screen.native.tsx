import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { inventoryItemToAnalysisState } from "@/components/scanner/inventory-analysis-view-model";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { ItemAnalysisResultStage } from "@/components/scanner/item-analysis-result-stage";
import ModelProjectionScanner from "@/components/scanner/model-projection-scanner.native";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  getInventoryItem,
  saveAnalyzedItemToInventory,
} from "@/services/inventory-service";
import { getItemPhotos } from "@/services/itemPhotoService";
import {
  getStoredTripo3dModel,
  type StoredTripo3dModelResult,
} from "@/services/tripo3d-model-api";

type InventoryResultPayload = {
  model: StoredTripo3dModelResult | null;
  modelFile: string | null;
  primaryPhotoId: string | null;
  state: ReturnType<typeof inventoryItemToAnalysisState>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadInventoryResult(
  ownerId: string,
  itemId: string,
): Promise<InventoryResultPayload> {
  const item = await getInventoryItem(ownerId, itemId);
  const photos = await getItemPhotos({ itemId, ownerId });
  const primaryPhoto =
    photos.find((photo) => photo.isPrimary) ?? photos[0] ?? null;

  const [modelResult] = await Promise.allSettled([
    primaryPhoto
      ? getStoredTripo3dModel(primaryPhoto.id)
      : Promise.resolve(null),
  ]);

  return {
    model:
      modelResult.status === "fulfilled"
        ? modelResult.value
        : null,
    modelFile: item.modelFile,
    primaryPhotoId: primaryPhoto?.id ?? null,
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const finalizedRef = useRef(false);
  const activeSessionId = scannerSession?.id;
  const activeSessionReset = scannerSession?.onReset;

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
            ? caught.message
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
    const primaryPhotoId = inventoryResult?.primaryPhotoId;
    if (!primaryPhotoId || inventoryResult?.model) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const pollForModel = async () => {
      attempts += 1;
      try {
        const model = await getStoredTripo3dModel(primaryPhotoId);
        if (!active) return;
        if (model) {
          setInventoryResult((current) =>
            current?.primaryPhotoId === primaryPhotoId
              ? { ...current, model }
              : current,
          );
          return;
        }
      } catch {
        return;
      }

      if (active && attempts < 24) {
        timer = setTimeout(() => {
          void pollForModel();
        }, 2_500);
      }
    };

    timer = setTimeout(() => {
      void pollForModel();
    }, 2_500);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [
    inventoryResult?.model,
    inventoryResult?.primaryPhotoId,
  ]);

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

  const handleDone = useCallback(() => {
    finishScannerSession();
    router.back();
  }, [finishScannerSession, router]);

  const handleSave = useCallback(async () => {
    if (!scannerSession || saving) return;
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in before saving an item to inventory.",
      );
      return;
    }

    setSaving(true);
    try {
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
          ? caught.message
          : "KeepFlip could not save this item.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    finishScannerSession,
    router,
    saving,
    scannerSession,
    userId,
  ]);

  const resultState =
    scannerSession?.state ?? inventoryResult?.state ?? null;
  const storedModel = inventoryResult?.model ?? null;
  const modelUrl =
    scannerSession?.modelUrl ??
    inventoryResult?.modelFile ??
    storedModel?.modelUrl ??
    undefined;
  const modelBytes = storedModel?.modelBytes;
  const hasProjection =
    !projectionError && Boolean(modelUrl || modelBytes);

  const missingSession = Boolean(sessionId && !scannerSession);
  const resolvedError =
    error ??
    (missingSession
      ? "That live analysis session has ended. Run a new scan to open it again."
      : !itemId && !scannerSession
        ? "No analysis result was supplied to this screen."
        : null);

  const projectionLabel = hasProjection
    ? "GENERATED MODEL / NATIVE GPU PROJECTION"
    : projectionError
      ? "MODEL SIGNAL DEGRADED / HUD FIELD ACTIVE"
      : "MODEL SIGNAL ACQUIRING / HUD FIELD ACTIVE";

  if (loading || resolvedError || !resultState) {
    return (
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.projectionLayer}>
          <ModelProjectionScanner
            modelBytes={modelBytes}
            modelUrl={modelUrl}
            onError={setProjectionError}
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
                Loading the saved model, cover evidence, and analysis snapshot.
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

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.projectionLayer}>
        <ModelProjectionScanner
          modelBytes={modelBytes}
          modelUrl={modelUrl}
          onError={setProjectionError}
        />
      </View>

      <View
        pointerEvents="none"
        style={[styles.resultScrim, styles.resultScrimWithProjection]}
      />

      <ItemAnalysisResultStage
        bottomInset={insets.bottom}
        doneLabel={
          scannerSession ? "Start new scan" : "Back to inventory"
        }
        onDone={handleDone}
        onSave={
          scannerSession
            ? () => {
                void handleSave();
              }
            : undefined
        }
        projectionLabel={projectionLabel}
        saveLabel="Save to inventory"
        saving={saving}
        state={resultState}
        topInset={insets.top}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
  },
  projectionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
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
    fontFamily: theme.fonts.analysis,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  centerTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.analysis,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    textAlign: "center",
  },
  centerBody: {
    maxWidth: 420,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.analysis,
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
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
