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

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { useKeepFlipFeedbackNudge } from "@/components/feedback/keepflip-feedback-nudge";
import { inventoryItemToAnalysisState } from "@/components/scanner/inventory-analysis-view-model";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { AddToInventoryForm, type AddToInventoryFormValues } from "@/components/scanner/add-to-inventory-form";
import { ValuationResultStage } from "@/components/scanner/valuation-result-stage";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { openKeepFlipIncorrectIdentificationReport } from "@/lib/keepflip-feedback";
import { saveDealShelfItem } from "@/services/deal-shelf-service";
import {
  centsFromLedgerAmount,
  createManualLedgerEntry,
  deleteLedgerReceipt,
  isResellerBooksConfigured,
  parseLedgerDate,
  uploadLedgerReceipt,
} from "@/services/reseller-ledger-service";
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
  const { recordCompletedAction } = useKeepFlipFeedbackNudge();
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
  const [inventoryFormOpen, setInventoryFormOpen] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
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

  const openAddToInventory = useCallback(() => {
    if (!scannerSession || saving || savingDeal) return;
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in before adding an item to inventory.",
      );
      return;
    }
    if (!isResellerBooksConfigured()) {
      Alert.alert(
        "Books setup needed",
        "KeepFlip cannot record this purchase until the Books ledger is configured.",
      );
      return;
    }
    setInventoryFormOpen(true);
  }, [saving, savingDeal, scannerSession, userId]);

  const handleAddToInventory = useCallback(async (
    values: AddToInventoryFormValues,
  ) => {
    if (!scannerSession || saving || savingDeal || !userId) return;

    const amountCents = centsFromLedgerAmount(values.acquisitionCost);
    if (!amountCents) {
      Alert.alert(
        "Actual cost required",
        "Enter what you actually paid, from $0.01 to $10,000,000.00.",
      );
      return;
    }

    const occurredAt = parseLedgerDate(values.acquiredAt);
    if (!occurredAt) {
      Alert.alert(
        "Check the date",
        "Use a real acquisition date in YYYY-MM-DD format.",
      );
      return;
    }

    setSaving(true);
    let savedItemId: string | null = null;
    let receiptFileId: string | null = null;
    let receiptLinked = false;
    try {
      await scannerSession.ensurePhotosSaved?.();
      if (values.receiptReference.trim()) {
        receiptFileId = await uploadLedgerReceipt({
          imageUri: values.receiptReference,
          ownerId: userId,
        });
      }
      const saved = await saveAnalyzedItemToInventory({
        acquiredAt: occurredAt,
        acquisitionCost: amountCents / 100,
        analysis: scannerSession.analysis,
        modelFile: scannerSession.modelUrl,
        ownerId: userId,
        scanId: scannerSession.scanId,
      });

      savedItemId = saved.item.id;
      const purchaseDetails = [
        values.source.trim() ? `Purchase source: ${values.source.trim()}` : null,
        values.sku.trim() ? `SKU / tag: ${values.sku.trim()}` : null,
        values.location.trim() ? `Storage location: ${values.location.trim()}` : null,
        receiptFileId ? "Receipt photo attached" : null,
        values.notes.trim() ? values.notes.trim() : null,
      ].filter((value): value is string => Boolean(value));

      await createManualLedgerEntry({
        amountCents,
        channel: values.source.trim() || null,
        entryType: "inventory_purchase",
        itemId: saved.item.id,
        notes: purchaseDetails.length > 0 ? purchaseDetails.join(" | ") : null,
        occurredAt,
        ownerId: userId,
        receiptFileId,
      });

      receiptLinked = true;
      setInventoryFormOpen(false);
      recordCompletedAction();
      finishScannerSession();
      router.replace("/inventory");
      if (saved.photoWarning) {
        Alert.alert("Item added", saved.photoWarning);
      }
    } catch (caught) {
      if (receiptFileId && !receiptLinked) {
        await deleteLedgerReceipt(receiptFileId);
      }
      if (savedItemId) {
        setInventoryFormOpen(false);
        recordCompletedAction();
        finishScannerSession();
        router.replace("/inventory");
        Alert.alert(
          "Item added; Books needs attention",
          "The item was saved to inventory, but its purchase entry could not be recorded. Open Books to add the actual purchase manually." +
            (caught instanceof Error ? " " + caught.message : ""),
        );
      } else {
        Alert.alert(
          "Could not record purchase",
          caught instanceof Error
            ? caught.message
            : "KeepFlip could not save the inventory and Books records.",
        );
      }
    } finally {
      setSaving(false);
    }
  }, [
    finishScannerSession,
    recordCompletedAction,
    router,
    saving,
    savingDeal,
    scannerSession,
    userId,
  ]);

  const handleSaveToDealShelf = useCallback(async () => {
    if (!scannerSession || saving || savingDeal || !userId) return;
    setSavingDeal(true);
    try {
      await scannerSession.ensurePhotosSaved?.();
      await saveDealShelfItem({
        analysis: scannerSession.analysis,
        modelFile: scannerSession.modelUrl,
        ownerId: userId,
        scanId: scannerSession.scanId,
      });
      recordCompletedAction();
      finishScannerSession();
      router.replace("/deal-shelf" as Href);
    } catch (caught) {
      Alert.alert(
        "Could not park deal",
        caught instanceof Error
          ? caught.message
          : "KeepFlip could not save this deal.",
      );
    } finally {
      setSavingDeal(false);
    }
  }, [
    finishScannerSession,
    recordCompletedAction,
    router,
    saving,
    savingDeal,
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

  const handleReportIncorrectIdentification = () => {
    void openKeepFlipIncorrectIdentificationReport({
      identifiedAs: state.data.identity.title || "Unknown item",
      itemId,
      scanId: scannerSession?.scanId,
    }).catch(() => {
      Alert.alert(
        "Could not open report",
        "Your device could not open email. Contact support@keep-flip.com and include this result's details.",
      );
    });
  };

  return (
    <View style={styles.root}>
      {!inventoryFormOpen ? (
        <ValuationResultStage
          bottomInset={insets.bottom}
          onReportIncorrectIdentification={handleReportIncorrectIdentification}
          onSave={
            scannerSession
              ? () => {
                openAddToInventory();
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
          projectionLabel="SAVED ANALYSIS / MODEL AVAILABLE ON DEVICE"
          savingDeal={savingDeal}
          saving={saving}
          showMarketDecisionStamp={Boolean(scannerSession)}
          saveLabel="Add to inventory"
          state={state}
          topInset={insets.top}
        />
      ) : null}

      <AddToInventoryForm
        key={inventoryFormOpen ? "open" : "closed"}
        itemTitle={state.data.identity.title}
        onCancel={() => setInventoryFormOpen(false)}
        onSubmit={handleAddToInventory}
        submitting={saving}
        visible={inventoryFormOpen}
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
    fontFamily: theme.fonts.radar,
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
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
});
