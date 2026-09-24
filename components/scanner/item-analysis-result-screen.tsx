import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
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
import { AddToInventoryForm, type AddToInventoryFormValues } from "@/components/scanner/add-to-inventory-form";
import { inventoryItemToAnalysisState } from "@/components/scanner/inventory-analysis-view-model";
import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { ValuationResultStage } from "@/components/scanner/valuation-result-stage";
import { useSourcingTrip } from "@/components/sourcing/sourcing-trip-context";
import { useKeepFlipSubscription } from "@/components/subscription/keepflip-subscription-context";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { openKeepFlipIncorrectIdentificationReport } from "@/lib/keepflip-feedback";
import {
  centsFromLedgerAmount,
  createManualLedgerEntry,
  deleteLedgerReceipt,
  isResellerBooksConfigured,
  parseLedgerDate,
  uploadLedgerReceipt,
} from "@/services/reseller-ledger-service";

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';
import { createInventoryMediaFollowUp } from "@/services/inventory-follow-up-service";
import {
  getInventoryItem,
  saveAnalyzedItemToInventory,
  type InventoryItem,
} from "@/services/inventory-service";
import {
  isResellerBookkeepingConfigured,
  recordBookkeepingEvent,
} from "@/services/reseller-bookkeeping-service";
import { applyResellerBuyRulesToAnalysis } from "@/services/reseller-buy-rules-service";
import { getResellerBuyRules } from "@/services/user-profile-onboarding-service";

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function ItemAnalysisResultScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const pathname = usePathname();
  const isFreeTierRoute = pathname.startsWith('/free');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    itemId?: string | string[];
    sessionId?: string | string[];
  }>();
  const itemId = isFreeTierRoute ? undefined : firstParam(params.itemId);
  const sessionId = firstParam(params.sessionId);
  const { user } = useKeepFlipAuth();
  const { recordCompletedAction } = useKeepFlipFeedbackNudge();
  const { canUse } = useKeepFlipSubscription();
  const userId = user?.$id;
  const basicBooksAllowed = canUse("basic_books");
  const advancedBooksAllowed = canUse("automated_books");
  const canSaveInventory =
    !isFreeTierRoute && (basicBooksAllowed || advancedBooksAllowed);
  const legacyLedgerConfigured =
    isResellerBooksConfigured() && basicBooksAllowed;
  const advancedBookkeepingConfigured =
    isResellerBookkeepingConfigured() && advancedBooksAllowed;
  const userName = user?.name;
  const { activeTrip, recordSavedItem } = useSourcingTrip();
  const activeSourcingTrip =
    activeTrip?.trip.status === "active" ? activeTrip : null;
  const { clearScannerResult, scannerResult } =
    useItemAnalysisResult();
  const scannerSession =
    sessionId && scannerResult?.id === sessionId
      ? scannerResult
      : null;
  const [savedState, setSavedState] = useState<ReturnType<
    typeof inventoryItemToAnalysisState
  > | null>(null);
  const [savedItem, setSavedItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inventoryFormOpen, setInventoryFormOpen] = useState(false);
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
        const buyRules = await getResellerBuyRules(userId, userName).catch(
          () => null,
        );
        const analysis =
          item.analysisSnapshot && buyRules
            ? applyResellerBuyRulesToAnalysis(item.analysisSnapshot, buyRules)
            : item.analysisSnapshot ?? null;
        if (!active) return;
        setSavedItem(item);
        setSavedState(inventoryItemToAnalysisState(item, analysis));
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
  }, [itemId, userId, userName]);

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

  const openSavedListingWorkspace = useCallback(() => {
    if (!itemId || scannerSession) return;
    router.push({
      pathname: "/listing-guide",
      params: { itemId },
    });
  }, [itemId, router, scannerSession]);

  const openSavedPhotoManager = useCallback(() => {
    if (!itemId || scannerSession) return;
    router.push({
      pathname: "/listing-guide",
      params: { focus: "photos", itemId },
    });
  }, [itemId, router, scannerSession]);

  const openAddToInventory = useCallback(() => {
    if (!scannerSession || saving) return;
    if (!userId) {
      Alert.alert(
        "Sign in required",
        "Sign in before adding an item to inventory.",
      );
      return;
    }
    if (!basicBooksAllowed && !advancedBooksAllowed) {
      Alert.alert(
        "Books plan needed",
        "Choose a KeepFlip plan before saving a purchase to Books.",
      );
      return;
    }
    if (!legacyLedgerConfigured && !advancedBookkeepingConfigured) {
      Alert.alert(
        "Books setup needed",
        "Finish setting up Books before saving a purchase.",
      );
      return;
    }
    setInventoryFormOpen(true);
  }, [
    advancedBookkeepingConfigured,
    advancedBooksAllowed,
    basicBooksAllowed,
    legacyLedgerConfigured,
    saving,
    scannerSession,
    userId,
  ]);

  const handleAddToInventory = useCallback(async (
    values: AddToInventoryFormValues,
  ) => {
    if (!scannerSession || saving || !userId) return;
    const sourceTrip = activeSourcingTrip;

    const amountCents = centsFromLedgerAmount(values.acquisitionCost);
    if (!amountCents) {
      Alert.alert(
        "Actual cost required",
        "Enter what you actually paid, from $0.01 to $10,000,000.00.",
      );
      return;
    }

    const quantity = Number(values.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
      Alert.alert(
        "Check quantity",
        "Enter a whole number from 1 through 100,000.",
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
    let receiptFileId: string | null = sourceTrip?.trip.receiptFileId ?? null;
    let uploadedReceiptFileId: string | null = null;
    let receiptLinked = false;
    try {
      await scannerSession.ensurePhotosSaved?.();
      if (values.receiptReference.trim()) {
        uploadedReceiptFileId = await uploadLedgerReceipt({
          imageUri: values.receiptReference,
          ownerId: userId,
        });
        receiptFileId = uploadedReceiptFileId;
      }
      const saved = await saveAnalyzedItemToInventory({
        acquiredAt: occurredAt,
        acquisitionCost: amountCents / 100,
        analysis: scannerSession.analysis,
        itemSpecifics: values.itemSpecifics,
        modelFile: scannerSession.modelUrl,
        ownerId: userId,
        purchaseNotes: values.notes,
        purchaseSource: values.source,
        quantity,
        receiptFileId,
        scanId: scannerSession.scanId,
        sku: values.sku,
        storageLocation: values.location,
      });

      savedItemId = saved.item.id;
      receiptLinked = true;

      await createInventoryMediaFollowUp({
        item: saved.item,
        ownerId: userId,
      }).catch(() => undefined);

      const purchaseDetails = [
        `Quantity: ${quantity}`,
        sourceTrip
          ? `Sourcing trip: ${sourceTrip.trip.label || sourceTrip.trip.sourceName}`
          : null,
        values.source.trim() ? `Purchase source: ${values.source.trim()}` : null,
        values.sku.trim() ? `SKU / tag: ${values.sku.trim()}` : null,
        values.location.trim() ? `Storage location: ${values.location.trim()}` : null,
        values.itemSpecifics.trim() ? "Extra item details saved" : null,
        receiptFileId ? "Receipt photo attached" : null,
        values.notes.trim() ? values.notes.trim() : null,
      ].filter((value): value is string => Boolean(value));

      if (advancedBookkeepingConfigured) {
        await recordBookkeepingEvent({
          amountCents,
          eventType: "inventory_purchase",
          idempotencyKey: `inventory-purchase:${saved.item.id}`,
          itemId: saved.item.id,
          notes: purchaseDetails.length > 0 ? purchaseDetails.join(" | ") : null,
          occurredAt,
          summary: "Inventory purchase",
        });
      } else if (legacyLedgerConfigured) {
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
      } else {
        throw new Error(
          "Choose a KeepFlip plan before recording this purchase in Books.",
        );
      }

      let sourceTripWarning: string | null = null;
      if (sourceTrip) {
        const estimatedMedian = scannerSession.analysis.valuation.median;
        const estimatedResaleCents =
          typeof estimatedMedian === "number" &&
            Number.isFinite(estimatedMedian) &&
            estimatedMedian > 0
            ? Math.round(estimatedMedian * 100)
            : null;

        try {
          await recordSavedItem({
            allocatedCostCents: amountCents,
            estimatedResaleCents,
            itemId: saved.item.id,
            itemTitle: saved.item.title,
            occurredAt,
            quantity,
          });
        } catch (error) {
          sourceTripWarning =
            error instanceof Error
              ? error.message
              : "KeepFlip could not link this saved item to the sourcing trip.";
        }
      }

      setInventoryFormOpen(false);
      recordCompletedAction();
      finishScannerSession();
      router.replace(sourceTrip ? "/scanner" : "/inventory");
      const saveWarning = [saved.photoWarning, sourceTripWarning]
        .filter((value): value is string => Boolean(value))
        .join(" ");
      if (saveWarning) {
        Alert.alert(
          sourceTripWarning ? "Item added; source trip needs attention" : "Item added",
          saveWarning,
        );
      }
    } catch (caught) {
      if (uploadedReceiptFileId && !receiptLinked) {
        await deleteLedgerReceipt(uploadedReceiptFileId);
      }
      if (savedItemId) {
        setInventoryFormOpen(false);
        recordCompletedAction();
        finishScannerSession();
        router.replace(sourceTrip ? "/scanner" : "/inventory");
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
    activeSourcingTrip,
    finishScannerSession,
    advancedBookkeepingConfigured,
    legacyLedgerConfigured,
    recordSavedItem,
    recordCompletedAction,
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
          <Text selectable style={[styles.message, { fontSize: responsiveFont(13), lineHeight: 19 }]}>
            {resolvedError ?? "No analysis result was supplied."}
          </Text>
        )}
        {!loading ? (
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={[styles.backButtonText, { fontSize: responsiveFont(9) }]}>GO BACK</Text>
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
          onManagePhotos={
            itemId && !scannerSession ? openSavedPhotoManager : undefined
          }
          onOpenListing={
            itemId && !scannerSession ? openSavedListingWorkspace : undefined
          }
          onReportIncorrectIdentification={handleReportIncorrectIdentification}
          inventoryItem={scannerSession || savedItem?.id !== itemId ? undefined : savedItem ?? undefined}
          onSave={
            scannerSession && canSaveInventory
              ? () => {
                openAddToInventory();
              }
              : undefined
          }
          projectionLabel="SAVED ANALYSIS / MODEL AVAILABLE ON DEVICE"
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
        sourcingTrip={activeSourcingTrip}
        submitting={saving}
        visible={inventoryFormOpen && !isFreeTierRoute}
      />
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
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
  return {
    ...staticStyles,
    message: [
      staticStyles.message,
      {
        fontSize: responsiveFont(13),
      },
    ],
    backButtonText: [
      staticStyles.backButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
  };
}
