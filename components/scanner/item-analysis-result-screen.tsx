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
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  getInventoryItem,
  saveAnalyzedItemToInventory,
} from "@/services/inventory-service";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
  const { clearScannerResult, scannerResult } =
    useItemAnalysisResult();
  const scannerSession =
    sessionId && scannerResult?.id === sessionId
      ? scannerResult
      : null;
  const [savedState, setSavedState] = useState<ReturnType<
    typeof inventoryItemToAnalysisState
  > | null>(null);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
        const item = await getInventoryItem(userId, itemId);
        if (!active) return;
        setSavedState(inventoryItemToAnalysisState(item));
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
  }, [itemId, userId]);

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
    if (!scannerSession || saving || !userId) return;
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

  const state = scannerSession?.state ?? savedState;
  const resolvedError =
    error ??
    (sessionId && !scannerSession
      ? "That live analysis session has ended."
      : null);

  if (loading || resolvedError || !state) {
    return (
      <View style={styles.centerState}>
        {loading ? (
          <ActivityIndicator color={theme.colors.scannerCyan} />
        ) : (
          <Text selectable style={styles.message}>
            {resolvedError ?? "No analysis result was supplied."}
          </Text>
        )}
        {!loading ? (
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>GO BACK</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ItemAnalysisResultStage
        bottomInset={insets.bottom}
        doneLabel={
          scannerSession ? "Start new scan" : "Back to inventory"
        }
        onDone={() => {
          finishScannerSession();
          router.back();
        }}
        onSave={
          scannerSession
            ? () => {
                void handleSave();
              }
            : undefined
        }
        projectionLabel="SAVED ANALYSIS / MODEL AVAILABLE ON DEVICE"
        saving={saving}
        state={state}
        topInset={insets.top}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
    backgroundColor: theme.colors.backgroundDeep,
  },
  message: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.analysis,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
  },
  backButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.analysis,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
});
