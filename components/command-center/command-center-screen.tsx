import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { AiPreferencesPanel } from '@/components/command-center/ai-preferences-panel';
import { BusinessPulse } from '@/components/command-center/business-pulse';
import { SellerOperationsPanel } from '@/components/command-center/seller-operations-panel';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipControlRow,
  type KeepFlipStatusBadgeProps,
} from '@/components/ui/keepflip-control-row';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { openKeepFlipSupportEmail } from '@/lib/keepflip-feedback';
import { responsiveWidth } from '@/lib/responsiveFont';
import { withAlpha } from '@/lib/withAlpha';
import {
  connectEbayAccount,
  getEbayConnectionStatus,
} from '@/services/ebayConnectionService';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import {
  getBookkeepingOverview,
  getBookkeepingReviewQueue,
  isResellerBookkeepingConfigured,
  resolveBookkeepingReview,
  syncEbayBookkeeping,
  type BookkeepingMoneyEvent,
  type BookkeepingReviewItem,
} from '@/services/reseller-bookkeeping-service';
import {
  buildResellerBusinessOverview,
  type ResellerBusinessOverview,
} from '@/services/reseller-business-overview';
import {
  isResellerBooksConfigured,
  listResellerLedgerEntries,
  type ResellerLedgerEntry,
} from '@/services/reseller-ledger-service';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { InstancedMesh } from 'three';
import { isNativePlatformSupported } from 'react-native-screens/lib/typescript/core';
type EbayConnectionViewState =
  | 'checking'
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

type CommandCenterTab = 'pulse' | 'operations' | 'ai-preferences';

function bookkeepingEventsForBusinessPulse(
  ownerId: string,
  events: BookkeepingMoneyEvent[],
): ResellerLedgerEntry[] {
  return events.map((event) => ({
    amountCents: event.amountCents,
    channel: 'KeepFlip Books',
    createdAt: event.occurredAt,
    currency: 'USD',
    direction: event.direction,
    entryType: event.entryType,
    externalId: null,
    id: `books-v2-${event.id}`,
    itemId: event.itemId,
    notes: null,
    occurredAt: event.occurredAt,
    ownerId,
    receiptFileId: null,
    saleGroupId: null,
    source: 'migration',
    updatedAt: event.occurredAt,
    voidedAt: null,
  }));
}

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

function formatReviewMoney(item: BookkeepingReviewItem) {
  if (!item.amountKnown || item.amountCents == null || !item.currency) {
    return 'AMOUNT UNAVAILABLE';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      currency: item.currency,
      style: 'currency',
    }).format(item.amountCents / 100);
  } catch {
    return `${item.currency} ${(item.amountCents / 100).toFixed(2)}`;
  }
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function reviewStatusLabel(item: BookkeepingReviewItem) {
  if (item.status === 'needs_item_match') return 'MATCH ITEM';
  if (item.status === 'needs_item_cost') return 'COST REVIEW';
  return 'CHECK DETAILS';
}

function reviewTypeLabel(sourceType: string) {
  const normalized = sourceType.toLowerCase().replace(/_foreign_currency$/, '');
  const labels: Record<string, string> = {
    adjustment: 'Account adjustment',
    credit: 'Marketplace credit',
    credit_booking_unknown: 'Marketplace credit',
    credit_debit: 'Marketplace credit debit',
    dispute: 'Payment dispute',
    loan_repayment: 'Loan repayment',
    marketplace_credit: 'Marketplace credit',
    non_sale_charge: 'eBay account charge',
    non_sale_charge_booking_unknown: 'eBay account charge',
    non_sale_charge_credit: 'eBay fee credit',
    payout: 'Payout',
    purchase: 'eBay purchase',
    refund: 'Refund',
    refund_booking_unknown: 'Refund',
    refund_credit: 'Refund credit',
    sale: 'Sale',
    sale_booking_unknown: 'Sale',
    sale_debit: 'Sale debit',
    sale_multi_item: 'Multi-item sale',
    sale_zero_amount: 'Zero-value sale',
    shipping_label: 'Shipping label',
    shipping_label_booking_unknown: 'Shipping label',
    shipping_label_credit: 'Shipping label credit',
    transfer: 'eBay transfer',
    unclassified: 'Unclassified eBay record',
    unknown: 'Legacy review record',
    withdrawal: 'Withdrawal',
  };

  return (
    labels[normalized] ??
    normalized
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function reviewAmountNote(item: BookkeepingReviewItem) {
  if (!item.amountKnown || item.amountCents == null || !item.currency) {
    return item.legacyFallback
      ? 'LEGACY REVIEW · SYNC MONEY AGAIN TO REFRESH SOURCE DETAILS'
      : 'AMOUNT / CURRENCY UNAVAILABLE FROM SAVED SOURCE DATA';
  }
  if (item.amountCents === 0) {
    return `EBAY REPORTED 0.00 ${item.currency}`;
  }
  if (item.currency !== 'USD') {
    return `EBAY REPORTED ${item.currency} · NOT CONVERTED TO USD`;
  }
  return null;
}

function eBayStateDetails(
  state: EbayConnectionViewState,
  errorMessage: string | null,
): { description: string; status: KeepFlipStatusBadgeProps } {
  switch (state) {
    case 'connected':
      return {
        description: 'Your eBay connection is active and ready for seller features.',
        status: { label: 'CONNECTED', tone: 'active' },
      };
    case 'connecting':
      return {
        description: 'Finish the secure connection in eBay. KeepFlip will confirm it here.',
        status: { label: 'CONNECTING', tone: 'warning' },
      };
    case 'disconnected':
      return {
        description: 'Connect eBay to bring marketplace tools into your command center.',
        status: { label: 'NOT CONNECTED', tone: 'muted' },
      };
    case 'error':
      return {
        description:
          errorMessage ??
          'We could not check the eBay connection. Try again when you are ready.',
        status: { label: 'ATTENTION', tone: 'danger' },
      };
    default:
      return {
        description: 'Checking the secure connection linked to this KeepFlip account.',
        status: { label: 'CHECKING', tone: 'violet' },
      };
  }
}

export function CommandCenterScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const router = useRouter();
  const {
    openReviewQueue: openReviewQueueParam,
    openSellerOperations: openSellerOperationsParam,
    openAiPreferences: openAiPreferencesParam,
  } = useLocalSearchParams<{
    openReviewQueue?: string | string[];
    openSellerOperations?: string | string[];
    openAiPreferences?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const { canUse } = useKeepFlipSubscription();
  const bookkeepingFunctionConfigured = isResellerBookkeepingConfigured();
  const advancedBooksAllowed = canUse('automated_books');
  const advancedBookkeepingConfigured =
    bookkeepingFunctionConfigured && advancedBooksAllowed;
  const [supportError, setSupportError] = useState<string | null>(null);
  const [eBayState, setEbayState] =
    useState<EbayConnectionViewState>('checking');
  const [eBayErrorMessage, setEbayErrorMessage] = useState<string | null>(null);
  const eBayRequestId = useRef(0);
  const businessRequestId = useRef(0);
  const reviewRequestId = useRef(0);
  const [businessOverview, setBusinessOverview] =
    useState<ResellerBusinessOverview | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [eBayBooksSyncing, setEbayBooksSyncing] = useState(false);
  const [eBayBooksSyncMessage, setEbayBooksSyncMessage] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<BookkeepingReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeReview, setActiveReview] = useState<BookkeepingReviewItem | null>(null);
  const [reviewItemSearch, setReviewItemSearch] = useState('');
  const [selectedReviewItemId, setSelectedReviewItemId] = useState('');
  const [reviewQuantity, setReviewQuantity] = useState('1');
  const [reviewResolving, setReviewResolving] = useState(false);
  const [reviewActionMessage, setReviewActionMessage] = useState<string | null>(null);
  const [commandCenterTab, setCommandCenterTab] =
    useState<CommandCenterTab>('pulse');
  const shouldOpenReviewQueue = Array.isArray(openReviewQueueParam)
    ? openReviewQueueParam[0] === '1'
    : openReviewQueueParam === '1';
  const shouldOpenSellerOperations = Array.isArray(openSellerOperationsParam)
    ? openSellerOperationsParam[0] === '1'
    : openSellerOperationsParam === '1';
  const shouldOpenAiPreferences = Array.isArray(openAiPreferencesParam)
    ? openAiPreferencesParam[0] === '1'
    : openAiPreferencesParam === '1';
  const {
    contentWidth,
    controlDockWidth,
    height: screenHeight,
    isCompactHeight,
    moderateScale,
    pageGutter,
    responsiveFont,
    responsiveHeight,
    scannerHeight,
    scannerWidth,
    verticalScale,
    width: screenWidth,
    contentMaxWidth
  } = useResponsiveLayout();
  const reviewModalBottomReserve = Math.max(
    insets.bottom,
    Platform.OS === 'android' ? responsiveHeight(56) : responsiveHeight(12),
  );

  const resolveEbayStatus = useCallback(async () => {
    try {
      const result = await getEbayConnectionStatus();
      return {
        state: result.connected
          ? ('connected' as const)
          : ('disconnected' as const),
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'We could not check eBay right now. Tap retry to try again.';

      console.warn('[KeepFlip eBay OAuth] Status check failed', {
        message: errorMessage,
      });

      return {
        state: 'error' as const,
        errorMessage,
      };
    }
  }, []);

  const refreshEbayStatus = useCallback(async (): Promise<EbayConnectionViewState> => {
    const requestId = ++eBayRequestId.current;
    setEbayState('checking');
    setEbayErrorMessage(null);

    const result = await resolveEbayStatus();
    if (requestId === eBayRequestId.current) {
      setEbayState(result.state);
      setEbayErrorMessage(result.errorMessage);
    }

    return result.state;
  }, [resolveEbayStatus]);

  const refreshReviewQueue = useCallback(async () => {
    if (!user?.$id || !advancedBookkeepingConfigured) {
      setReviewItems([]);
      setReviewLoading(false);
      setReviewError(null);
      return;
    }

    const requestId = ++reviewRequestId.current;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const result = await getBookkeepingReviewQueue();
      if (requestId !== reviewRequestId.current) return;
      setReviewItems(result.items);
    } catch (error) {
      if (requestId !== reviewRequestId.current) return;
      setReviewError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not load the money review queue.',
      );
    } finally {
      if (requestId === reviewRequestId.current) setReviewLoading(false);
    }
  }, [advancedBookkeepingConfigured, user]);

  const refreshBusinessOverview = useCallback(async () => {
    if (!user?.$id) {
      setBusinessOverview(null);
      setInventoryItems([]);
      setBusinessLoading(false);
      return;
    }

    const ownerId = user.$id;
    const requestId = ++businessRequestId.current;
    setBusinessLoading(true);
    setBusinessError(null);

    const [inventoryResult, legacyResult, advancedResult] = await Promise.allSettled([
      listInventoryItems(ownerId),
      isResellerBooksConfigured()
        ? listResellerLedgerEntries(ownerId)
        : Promise.resolve([]),
      advancedBookkeepingConfigured
        ? getBookkeepingOverview()
        : Promise.resolve(null),
    ]);

    if (requestId !== businessRequestId.current) return;

    if (inventoryResult.status !== 'fulfilled') {
      setBusinessOverview(null);
      setInventoryItems([]);
      setBusinessError(
        inventoryResult.reason instanceof Error
          ? inventoryResult.reason.message
          : 'KeepFlip could not load the current business picture.',
      );
      setBusinessLoading(false);
      return;
    }

    setInventoryItems(inventoryResult.value);
    const entries: ResellerLedgerEntry[] = [];
    const notes: string[] = [];
    if (legacyResult.status === 'fulfilled') {
      entries.push(...legacyResult.value);
    } else {
      notes.push('Some saved money records could not be loaded right now.');
    }
    if (advancedResult.status === 'fulfilled' && advancedResult.value) {
      entries.push(
        ...bookkeepingEventsForBusinessPulse(
          ownerId,
          advancedResult.value.moneyEvents,
        ),
      );
      if (advancedResult.value.truncated) {
        notes.push('This view is showing the latest 1,000 Books lines.');
      }
    } else if (advancedBookkeepingConfigured) {
      notes.push('Advanced Books is set up, but its latest records are unavailable right now.');
    }

    setBusinessOverview(
      buildResellerBusinessOverview({
        entries,
        inventory: inventoryResult.value,
      }),
    );
    setBusinessError(notes.join(' ') || null);
    setBusinessLoading(false);
  }, [advancedBookkeepingConfigured, user]);

  const handleEbayBooksSync = async () => {
    if (eBayBooksSyncing) return;
    if (!advancedBooksAllowed) {
      setEbayBooksSyncMessage(
        'eBay money sync is included with the Serious Reseller plan.',
      );
      router.push('/account?tab=subscription' as Href);
      return;
    }
    if (!bookkeepingFunctionConfigured) {
      setEbayBooksSyncMessage(
        'Money sync is not configured in this build yet. Finish the Books Function setup, then rebuild KeepFlip.',
      );
      return;
    }
    if (eBayState !== 'connected') {
      setEbayBooksSyncMessage('Connect eBay first, then sync its sales, fees, labels, refunds, and payouts.');
      return;
    }

    hapticSelection();
    setEbayBooksSyncing(true);
    setEbayBooksSyncMessage(null);
    try {
      const result = await syncEbayBookkeeping();
      const attention = result.needsItemMatch + result.needsItemCost + result.needsReview;
      setEbayBooksSyncMessage(
        `${result.posted} record${result.posted === 1 ? '' : 's'} added from eBay. ` +
        (attention > 0
          ? `${attention} item${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} a quick review.`
          : 'Everything matched cleanly.'),
      );
      hapticSuccess();
      await Promise.all([refreshBusinessOverview(), refreshReviewQueue()]);
    } catch (error) {
      setEbayBooksSyncMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not sync eBay financial activity right now.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    } finally {
      setEbayBooksSyncing(false);
    }
  };

  const openReviewQueue = useCallback(() => {
    hapticSelection();
    setReviewActionMessage(null);
    setActiveReview(null);
    setReviewOpen(true);
    void refreshReviewQueue();
  }, [refreshReviewQueue]);

  useEffect(() => {
    if (!shouldOpenReviewQueue || !user?.$id || !advancedBookkeepingConfigured) return;
    const timer = setTimeout(() => openReviewQueue(), 0);
    return () => clearTimeout(timer);
  }, [
    advancedBookkeepingConfigured,
    openReviewQueue,
    shouldOpenReviewQueue,
    user?.$id,
  ]);

  useEffect(() => {
    if (!shouldOpenSellerOperations || !user?.$id) return;
    const timer = setTimeout(() => setCommandCenterTab('operations'), 0);
    return () => clearTimeout(timer);
  }, [shouldOpenSellerOperations, user?.$id]);

  useEffect(() => {
    if (!shouldOpenAiPreferences || !user?.$id) return;
    const timer = setTimeout(() => setCommandCenterTab('ai-preferences'), 0);
    return () => clearTimeout(timer);
  }, [shouldOpenAiPreferences, user?.$id]);

  const chooseReview = (review: BookkeepingReviewItem) => {
    hapticSelection();
    setActiveReview(review);
    setSelectedReviewItemId(review.itemId ?? '');
    setReviewQuantity('1');
    setReviewItemSearch('');
    setReviewActionMessage(null);
  };

  const openReviewInBooks = (review: BookkeepingReviewItem) => {
    hapticSelection();
    setReviewOpen(false);
    setActiveReview(null);
    router.push(`/books?reviewId=${encodeURIComponent(review.id)}` as Href);
  };

  const resolveActiveReview = async () => {
    if (!activeReview || reviewResolving) return;
    const quantity = Number(reviewQuantity);
    if (!selectedReviewItemId) {
      setReviewActionMessage('Choose the KeepFlip inventory item that sold.');
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
      setReviewActionMessage('Quantity sold must be a whole number from 1 through 100,000.');
      return;
    }

    setReviewResolving(true);
    setReviewActionMessage(null);
    try {
      const result = await resolveBookkeepingReview({
        itemId: selectedReviewItemId,
        quantity,
        reviewId: activeReview.id,
      });
      hapticSuccess();
      setReviewActionMessage(
        result.needsItemCost
          ? 'Sale matched and posted. The item still needs its original cost reconciled in Books.'
          : 'Review complete. The sale is posted and the inventory quantity is updated.',
      );
      setActiveReview(null);
      await Promise.all([refreshReviewQueue(), refreshBusinessOverview()]);
    } catch (error) {
      setReviewActionMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not finish that money review.',
      );
    } finally {
      setReviewResolving(false);
    }
  };

  const filteredReviewInventory = useMemo(() => {
    const query = reviewItemSearch.trim().toLowerCase();
    return inventoryItems
      .filter((item) => item.quantityOnHand > 0 || item.id === activeReview?.itemId)
      .filter((item) => {
        if (!query) return true;
        return [item.title, item.brand, item.model, item.sku]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 40);
  }, [activeReview?.itemId, inventoryItems, reviewItemSearch]);

  useEffect(() => {
    const message =
      supportError ??
      (eBayState === 'error' ? eBayErrorMessage : null);

    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [eBayErrorMessage, eBayState, supportError]);

  useEffect(() => {
    if (!user?.$id) return;

    const requestId = ++eBayRequestId.current;
    void resolveEbayStatus().then((result) => {
      if (requestId === eBayRequestId.current) {
        setEbayState(result.state);
        setEbayErrorMessage(result.errorMessage);
      }
    });

    return () => {
      eBayRequestId.current += 1;
    };
  }, [resolveEbayStatus, user?.$id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshBusinessOverview();
    }, 0);

    return () => {
      clearTimeout(timer);
      businessRequestId.current += 1;
    };
  }, [refreshBusinessOverview]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshReviewQueue();
    }, 0);

    return () => {
      clearTimeout(timer);
      reviewRequestId.current += 1;
    };
  }, [refreshReviewQueue]);

  if (!user) return null;

  const eBayDetails = eBayStateDetails(eBayState, eBayErrorMessage);
  const eBayIsBusy = eBayState === 'checking' || eBayState === 'connecting';
  const eBayActionLabel =
    eBayState === 'connected'
      ? 'REFRESH'
      : eBayState === 'disconnected'
        ? 'CONNECT'
        : eBayState === 'error'
          ? 'RETRY'
          : undefined;

  const handleEbayConnection = async () => {
    if (eBayIsBusy) return;

    hapticSelection();
    setEbayErrorMessage(null);

    if (eBayState === 'connected') {
      await refreshEbayStatus();
      return;
    }

    const connectionAttempt = ++eBayRequestId.current;
    setEbayState('connecting');

    try {
      const result = await connectEbayAccount();
      if (connectionAttempt !== eBayRequestId.current) return;

      if (result.status !== 'connected') {
        setEbayState('disconnected');
        setEbayErrorMessage(
          result.status === 'declined'
            ? 'You declined the eBay connection. Nothing was linked.'
            : result.status === 'dismissed'
              ? 'The eBay sign-in window was closed before it finished.'
              : 'eBay could not complete the connection. Please try again.',
        );
        return;
      }

      const nextState = await refreshEbayStatus();
      if (nextState === 'disconnected') {
        setEbayState('error');
        setEbayErrorMessage(
          'eBay returned to KeepFlip, but the connection is not ready yet. Try again in a moment.',
        );
      }
    } catch (error) {
      if (connectionAttempt !== eBayRequestId.current) return;

      setEbayState('error');
      setEbayErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'The eBay connection could not start. Tap retry to try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    }
  };

  const handleOpenSupport = async () => {
    hapticSelection();
    setSupportError(null);

    try {
      await openKeepFlipSupportEmail();
    } catch {
      setSupportError(
        'Your device could not open email. Contact support@keep-flip.com for help.',
      );
    }
  };

  return (
    <KeepFlipBackground>
      <View style={{marginBottom: insets.bottom, marginTop: insets.top}}>
      <ScrollView
        contentContainerStyle={[styles.content,
        { paddingHorizontal: pageGutter, paddingTop: insets.top + 15, paddingBottom: insets.bottom + 30 }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>KEEPFLIP / COMMAND CENTER</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(26) }]}>Run the business</Text>
          <Text style={[styles.subtitle, { maxWidth: '90%', fontSize: responsiveFont(12), fontFamily: theme.fonts.display }]}>
            Marketplace access, inventory, books, and workspace controls in one place.
          </Text>
        </Animated.View>

        <View style={styles.commandTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: commandCenterTab === 'pulse' }}
            onPress={() => {
              hapticSelection();
              setCommandCenterTab('pulse');
            }}
            style={({ pressed }) => [
              styles.commandTab,
              commandCenterTab === 'pulse' && styles.commandTabActive,
              pressed && styles.commandTabPressed,
            ]}>
            <Text style={[styles.commandTabLabel, commandCenterTab === 'pulse' && styles.commandTabLabelActive, { fontSize: responsiveFont(9) }]}>BUSINESS PULSE</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: commandCenterTab === 'operations' }}
            onPress={() => {
              hapticSelection();
              setCommandCenterTab('operations');
            }}
            style={({ pressed }) => [
              styles.commandTab,
              commandCenterTab === 'operations' && styles.commandTabActive,
              pressed && styles.commandTabPressed,
            ]}>
            <Text style={[styles.commandTabLabel, commandCenterTab === 'operations' && styles.commandTabLabelActive, { fontSize: responsiveFont(9) }]}>SELLER OPERATIONS</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: commandCenterTab === 'ai-preferences' }}
            onPress={() => {
              hapticSelection();
              setCommandCenterTab('ai-preferences');
            }}
            style={({ pressed }) => [
              styles.commandTab,
              commandCenterTab === 'ai-preferences' && styles.commandTabActive,
              pressed && styles.commandTabPressed,
            ]}>
            <Text style={[styles.commandTabLabel, commandCenterTab === 'ai-preferences' && styles.commandTabLabelActive, { fontSize: responsiveFont(9) }]}>AI PREFERENCES</Text>
          </Pressable>
        </View>

        {commandCenterTab === 'operations' ? (
          <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.operationsTab}>
            <SellerOperationsPanel key={user.$id} embedded ownerId={user.$id} />
          </Animated.View>
        ) : commandCenterTab === 'ai-preferences' ? (
          <AiPreferencesPanel key={user.$id} ownerId={user.$id} />
        ) : (
          <>
        <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.section}>
          <BusinessPulse
            errorMessage={businessError}
            loading={businessLoading}
            onOpenBooks={() => {
              hapticSelection();
              router.push('/books' as Href);
            }}
            onOpenFlipPlan={() => {
              hapticSelection();
              router.push('/flip-plan' as Href);
            }}
            onOpenInventory={() => {
              hapticSelection();
              router.push('/inventory' as Href);
            }}
            overview={businessOverview}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(75)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>MARKETPLACE</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>Connected services</Text>
          </View>
          <View style={styles.eBaySurface}>
            <KeepFlipControlRow
              accent="cyan"
              actionBusy={eBayIsBusy}
              actionLabel={eBayActionLabel}
              accessibilityHint={
                eBayState === 'connected'
                  ? 'Refreshes the eBay connection status.'
                  : 'Starts the secure eBay connection.'
              }
              description={eBayDetails.description}
              label="eBay"
              leading={
                <Image
                  accessible={false}
                  resizeMode="contain"
                  source={require('@/assets/images/ebay-seeklogo.png')}
                  style={styles.eBayLogo}
                />
              }
              onPress={eBayIsBusy ? undefined : () => void handleEbayConnection()}
              status={eBayDetails.status}
            />
          </View>
          <View style={styles.eBaySurface}>
            <KeepFlipControlRow
              accent="gold"
              actionBusy={eBayBooksSyncing}
              actionLabel={
                !advancedBooksAllowed
                  ? 'SERIOUS'
                  : eBayState === 'connected'
                    ? 'SYNC'
                    : undefined
              }
              accessibilityHint={
                !advancedBooksAllowed
                  ? 'Opens Plan and Billing so you can choose the Serious Reseller plan.'
                  : 'Brings in eBay sales, fees, labels, refunds, and payouts using the connected seller account.'
              }
              description={
                eBayBooksSyncMessage ??
                (!advancedBooksAllowed
                  ? 'Included with the Serious Reseller plan. Choose Serious to unlock eBay sales, fees, labels, refunds, and payout reconciliation.'
                  : !bookkeepingFunctionConfigured
                    ? 'Money sync is waiting for the Books Function to be configured in this build.'
                    : 'Bring in eBay sales, fees, shipping labels, refunds, and payouts. Payouts are matched without counting them as a second sale.')
              }
              icon="chart.bar.fill"
              label="eBay money sync"
              onPress={eBayBooksSyncing ? undefined : () => void handleEbayBooksSync()}
              status={{
                label: !advancedBooksAllowed
                  ? 'LOCKED'
                  : !bookkeepingFunctionConfigured
                    ? 'SETUP'
                    : eBayBooksSyncing
                      ? 'SYNCING'
                      : eBayState === 'connected'
                        ? 'READY'
                        : 'CONNECT FIRST',
                tone: !advancedBooksAllowed
                  ? 'warning'
                  : !bookkeepingFunctionConfigured
                    ? 'muted'
                    : eBayBooksSyncing
                      ? 'violet'
                      : eBayState === 'connected'
                        ? 'active'
                        : 'muted',
              }}
            />
          </View>

          {advancedBookkeepingConfigured ? (
            <>
              {reviewItems.length > 0 || reviewError ? (
                <View style={[styles.reviewSurface, { borderColor: theme.colors.danger, backgroundColor: withAlpha(theme.colors.danger, 0.15) }]}>
                  <KeepFlipControlRow
                    accent="danger"
                    actionBusy={reviewLoading}
                    actionLabel={reviewItems.length > 0 ? 'REVIEW' : 'RETRY'}
                    accessibilityHint="Opens the synced money records that still need attention."
                    description={
                      reviewError ??
                      `${reviewItems.length} synced eBay record${reviewItems.length === 1 ? '' : 's'} still need${reviewItems.length === 1 ? 's' : ''} attention. Open the queue to see the exact records and finish supported sale reviews here.`
                    }
                    icon="exclamationmark.triangle.fill"
                    label="Money review"
                    onPress={reviewLoading ? undefined : openReviewQueue}
                    status={{
                      label: reviewError ? 'CHECK' : `${reviewItems.length} OPEN`,
                      tone: reviewError ? 'danger' : 'warning',
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(90)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS TOOLS</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>Seller workspace</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="gold"
              accessibilityHint="Opens the reseller ledger, reports, and export."
              description="Record actual sales, fees, expenses, and inventory cost."
              icon="chart.bar.fill"
              label="Books & reports"
              onPress={() => {
                hapticSelection();
                router.push('/books' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens your saved inventory."
              description="Review saved finds, market analysis, and item records."
              icon="shippingbox.fill"
              label="Inventory & data"
              onPress={() => {
                hapticSelection();
                router.push('/inventory' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="violet"
              accessibilityHint="Opens detailed, selectable charts for your inventory and sales metrics."
              description="Compare ROI, listing time, net profit, and units sold by category, source, or condition."
              icon="chart.bar.fill"
              label="Inventory analytics"
              onPress={() => {
                hapticSelection();
                router.push('/analytics' as Href);
              }}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(135)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>WORKSPACE</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>KeepFlip controls</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="violet"
              accessibilityHint="Opens editable memories and response guidance for Flip."
              description="Edit what Flip remembers and the specifics it should consider in responses and suggestions."
              icon="bolt.fill"
              label="AI preferences"
              onPress={() => {
                hapticSelection();
                setCommandCenterTab('ai-preferences');
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              description="Seller alerts and scan updates are being prepared."
              icon="envelope.fill"
              label="Notifications"
              staticLabel="COMING SOON"
            />
            <KeepFlipControlRow
              description="KeepFlip follows your device’s dark appearance."
              icon="eye.fill"
              label="Appearance"
              staticLabel="SYSTEM"
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(180)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>ACCOUNT & HELP</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>Your KeepFlip access</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="violet"
              accessibilityHint="Opens your identity, security, privacy, and session controls."
              description="Profile, security, legal controls, and this device session."
              icon="person.crop.circle.fill"
              label="Account & access"
              onPress={() => {
                hapticSelection();
                router.push('/account' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Replays the scan, analysis, and inventory walkthrough."
              description="Revisit the first-item walkthrough with the real scanner."
              icon="viewfinder"
              label="Scanner walkthrough"
              onPress={() => {
                hapticSelection();
                router.push('/walkthrough' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens an email to KeepFlip support."
              description="Contact KeepFlip support for your account or the app."
              icon="envelope.fill"
              label="Get help"
              onPress={() => void handleOpenSupport()}
            />
          </View>
        </Animated.View>

        {supportError ? (
          <Text accessibilityLiveRegion="polite" selectable style={[styles.errorText, { fontSize: responsiveFont(11) }]}>
            {supportError}
          </Text>
        ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (reviewResolving) return;
          setReviewOpen(false);
          setActiveReview(null);
        }}
        transparent
        visible={reviewOpen}>
        <View style={[styles.reviewModalBackdrop, { paddingBottom: reviewModalBottomReserve }]}>
              <Pressable
                accessibilityLabel="Close money review"
                disabled={reviewResolving}
                onPress={() => {
                  setReviewOpen(false);
                  setActiveReview(null);
                }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.reviewModal}>
            <View style={styles.reviewModalHeader}>
              <View style={styles.reviewModalHeading}>
                <Text style={[styles.reviewModalEyebrow, { fontSize: responsiveFont(8) }]}>BOOKS / MONEY REVIEW</Text>
                <Text style={[styles.reviewModalTitle, { fontSize: responsiveFont(20) }]}>
                  {activeReview ? 'Finish this record' : 'Quick review queue'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={reviewResolving}
                onPress={() => {
                  if (activeReview) {
                    setActiveReview(null);
                    setReviewActionMessage(null);
                  } else {
                    setReviewOpen(false);
                  }
                }}
                style={({ pressed }) => [
                  styles.reviewCloseButton,
                  pressed && styles.reviewPressed,
                ]}>
                <Text style={[styles.reviewCloseText, { fontSize: responsiveFont(8) }]}>{activeReview ? 'BACK' : 'DONE'}</Text>
              </Pressable>
            </View>

            {reviewActionMessage ? (
              <Text selectable style={[styles.reviewActionMessage, { fontSize: responsiveFont(10) }]}>
                {reviewActionMessage}
              </Text>
            ) : null}

            {activeReview ? (
              <ScrollView
                contentContainerStyle={styles.reviewDetailContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.reviewDetailCard}>
                  <View style={styles.reviewCardTopline}>
                    <Text style={[styles.reviewCardStatus, { fontSize: responsiveFont(7) }]}>{reviewStatusLabel(activeReview)}</Text>
                    <Text selectable style={styles.reviewCardAmount}>
                      {formatReviewMoney(activeReview)}
                    </Text>
                  </View>
                  <Text style={[styles.reviewCardTitle, { fontSize: responsiveFont(12) }]}>
                    {reviewTypeLabel(activeReview.sourceType)} · {formatReviewDate(activeReview.occurredAt)}
                  </Text>
                  <Text selectable style={styles.reviewCardReason}>{activeReview.reason}</Text>
                  {reviewAmountNote(activeReview) ? (
                    <Text selectable style={styles.reviewCardMeta}>
                      {reviewAmountNote(activeReview)}
                    </Text>
                  ) : null}
                  <Text selectable style={styles.reviewCardMeta}>
                    EBAY TYPE {activeReview.sourceType.toUpperCase()}
                  </Text>
                  <Text selectable style={styles.reviewCardMeta}>
                    TRANSACTION {activeReview.externalKey}
                  </Text>
                  {activeReview.orderId ? (
                    <Text selectable style={styles.reviewCardMeta}>ORDER {activeReview.orderId}</Text>
                  ) : null}
                </View>

                {activeReview.status === 'needs_item_cost' ? (
                  <View style={styles.reviewResolutionSection}>
                    <Text style={[styles.reviewResolutionTitle, { fontSize: responsiveFont(8) }]}>COST RECONCILIATION NEEDED</Text>
                    <Text style={[styles.reviewResolutionBody, { fontSize: responsiveFont(10) }]}>
                      The sale itself is already posted. KeepFlip is keeping this review open because the original inventory cost was missing when that sale posted. It will not guess the cost or create a second purchase from this screen.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openReviewInBooks(activeReview)}
                      style={({ pressed }) => [
                        styles.reviewSecondaryButton,
                        pressed && styles.reviewPressed,
                      ]}>
                      <Text style={[styles.reviewSecondaryButtonText, { fontSize: responsiveFont(9) }]}>OPEN BOOKS · REVIEW COST</Text>
                    </Pressable>
                  </View>
                ) : activeReview.sourceType === 'sale' &&
                  activeReview.amountKnown &&
                  activeReview.currency === 'USD' ? (
                  <View style={styles.reviewResolutionSection}>
                    <Text style={[styles.reviewResolutionTitle, { fontSize: responsiveFont(8) }]}>MATCH THE SALE</Text>
                    <Text style={[styles.reviewResolutionBody, { fontSize: responsiveFont(10) }]}>
                      Choose the exact KeepFlip item, confirm how many units sold, then KeepFlip will post the sale and move the right inventory quantity and cost.
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={setReviewItemSearch}
                      placeholder="Search inventory by item, brand, model, or SKU"
                      placeholderTextColor="rgba(247, 242, 232, 0.34)"
                      style={styles.reviewSearchInput}
                      value={reviewItemSearch}
                    />
                    <ScrollView
                      contentContainerStyle={styles.reviewInventoryListContent}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      style={styles.reviewInventoryList}>
                      {filteredReviewInventory.map((item) => {
                        const selected = item.id === selectedReviewItemId;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            key={item.id}
                            onPress={() => {
                              hapticSelection();
                              setSelectedReviewItemId(item.id);
                            }}
                            style={({ pressed }) => [
                              styles.reviewInventoryRow,
                              selected && styles.reviewInventoryRowSelected,
                              pressed && styles.reviewPressed,
                            ]}>
                            <View style={styles.reviewInventoryCopy}>
                              <Text numberOfLines={1} style={[styles.reviewInventoryTitle, { fontSize: responsiveFont(11) }]}>{item.title}</Text>
                              <Text numberOfLines={1} style={styles.reviewInventoryMeta}>
                                {[
                                  item.brand,
                                  item.model,
                                  item.sku ? `SKU ${item.sku}` : null,
                                ].filter(Boolean).join(' · ') || 'Saved inventory item'}
                              </Text>
                            </View>
                            <Text style={styles.reviewInventoryQty}>{item.quantityOnHand} ON HAND</Text>
                          </Pressable>
                        );
                      })}
                      {filteredReviewInventory.length === 0 ? (
                        <Text style={[styles.reviewEmptyText, { fontSize: responsiveFont(10) }]}>No matching in-stock inventory items.</Text>
                      ) : null}
                    </ScrollView>
                    <View style={styles.reviewQuantityRow}>
                      <View style={styles.reviewQuantityCopy}>
                        <Text style={[styles.reviewResolutionTitle, { fontSize: responsiveFont(8) }]}>QUANTITY SOLD</Text>
                        <Text style={[styles.reviewResolutionBody, { fontSize: responsiveFont(10) }]}>Usually 1. Change it for a multi-unit order.</Text>
                      </View>
                      <TextInput
                        keyboardType="number-pad"
                        onChangeText={setReviewQuantity}
                        selectTextOnFocus
                        style={styles.reviewQuantityInput}
                        value={reviewQuantity}
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={reviewResolving || !selectedReviewItemId}
                      onPress={() => void resolveActiveReview()}
                      style={({ pressed }) => [
                        styles.reviewPrimaryButton,
                        pressed && styles.reviewPressed,
                        (reviewResolving || !selectedReviewItemId) && styles.reviewDisabled,
                      ]}>
                      {reviewResolving ? (
                        <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
                      ) : null}
                      <Text style={[styles.reviewPrimaryButtonText, { fontSize: responsiveFont(9) }]}>
                        {reviewResolving ? 'POSTING REVIEW...' : 'CONFIRM & POST SALE'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.reviewResolutionSection}>
                    <Text style={[styles.reviewResolutionTitle, { fontSize: responsiveFont(8) }]}>MANUAL BOOKS CHECK</Text>
                    <Text style={[styles.reviewResolutionBody, { fontSize: responsiveFont(10) }]}>
                      KeepFlip preserved the eBay transaction type, transaction ID, and the original amount and currency when eBay supplied them. There is not yet a safe automatic accounting rule for this record, so it stays held instead of being guessed.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openReviewInBooks(activeReview)}
                      style={({ pressed }) => [
                        styles.reviewSecondaryButton,
                        pressed && styles.reviewPressed,
                      ]}>
                      <Text style={[styles.reviewSecondaryButtonText, { fontSize: responsiveFont(9) }]}>OPEN BOOKS</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            ) : reviewLoading && reviewItems.length === 0 ? (
              <View style={styles.reviewLoadingState}>
                <ActivityIndicator color={theme.colors.goldBright} />
                <Text style={[styles.reviewEmptyText, { fontSize: responsiveFont(10) }]}>Checking synced money records…</Text>
              </View>
            ) : reviewItems.length === 0 ? (
              <View style={styles.reviewLoadingState}>
                <Text style={[styles.reviewClearTitle, { fontSize: responsiveFont(11) }]}>ALL CLEAR</Text>
                <Text style={[styles.reviewEmptyText, { fontSize: responsiveFont(10) }]}>No synced money records need review right now.</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.reviewQueueContent}
                showsVerticalScrollIndicator={false}>
                <Text style={styles.reviewQueueIntro}>
                  These records were held instead of guessed. Amounts and currencies shown are the values eBay reported. Older fallback rows show AMOUNT UNAVAILABLE until the next money sync refreshes them.
                </Text>
                {reviewItems.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() => chooseReview(item)}
                    style={({ pressed }) => [
                      styles.reviewQueueCard,
                      pressed && styles.reviewPressed,
                    ]}>
                    <View style={styles.reviewCardTopline}>
                      <Text style={[styles.reviewCardStatus, { fontSize: responsiveFont(7) }]}>{reviewStatusLabel(item)}</Text>
                      <Text selectable style={styles.reviewCardAmount}>{formatReviewMoney(item)}</Text>
                    </View>
                    <Text style={[styles.reviewCardTitle, { fontSize: responsiveFont(12) }]}>
                      {reviewTypeLabel(item.sourceType)} · {formatReviewDate(item.occurredAt)}
                    </Text>
                    <Text numberOfLines={2} style={styles.reviewCardReason}>{item.reason}</Text>
                    {reviewAmountNote(item) ? (
                      <Text numberOfLines={1} style={styles.reviewCardMeta}>
                        {reviewAmountNote(item)}
                      </Text>
                    ) : null}
                    <Text numberOfLines={1} style={styles.reviewCardMeta}>
                      TXN {item.externalKey}
                    </Text>
                    <Text style={styles.reviewCardAction}>REVIEW →</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
              </View>
        </View>
      </Modal>
      </View>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      gap: 16,
    },
    header: { gap: 4 },
    eyebrow: {
      color: theme.colors.gold,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.7,
    },
    title: {
      color: theme.colors.cream,
      lineHeight: 33,
      fontWeight: '900',
      letterSpacing: -0.35,
    },
    subtitle: {
      maxWidth: 520,
      fontFamily: theme.fonts.body,
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 19,
    },
    section: { gap: 7 },
    sectionHeading: { gap: 2 },
    commandTabs: {
      flexDirection: 'row',
      gap: 6,
      padding: 4,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.20)',
      borderRadius: 12,
      backgroundColor: 'rgba(6, 11, 14, 0.72)',
    },
    commandTab: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    commandTabActive: {
      backgroundColor: 'rgba(88, 223, 232, 0.12)',
    },
    commandTabPressed: {
      opacity: 0.72,
    },
    commandTabLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.85,
      textAlign: 'center',
    },
    commandTabLabelActive: {
      color: theme.colors.scannerCyan,
    },
    operationsTab: {
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.18)',
      borderRadius: 14,
      backgroundColor: 'rgba(11, 10, 14, 0.84)',
    },
    sectionEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.4,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
    },
    eBaySurface: {
      overflow: 'hidden',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.23)',
      backgroundColor: 'rgba(6, 11, 14, 0.76)',
    },
    reviewSurface: {
      overflow: 'hidden',
      borderRadius: 10,
      borderWidth: 1,
      backgroundColor: 'rgba(19, 14, 5, 0.76)',
    },
    eBayLogo: {
      width: 25,
      height: 27,
    },
    settingsList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(242, 211, 138, 0.20)',
    },
    errorText: {
      color: '#FFB8B1',
      fontSize: 11,
      lineHeight: 16,
      textAlign: 'center',
    },
    reviewModalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
    },
    reviewModal: {
      width: '100%',
      maxWidth: 760,
      maxHeight: '88%',
      alignSelf: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 20,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: 'rgba(242, 211, 138, 0.28)',
      backgroundColor: 'rgba(6, 5, 8, 0.99)',
    },
    reviewModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    reviewModalHeading: { flex: 1, gap: 2 },
    reviewModalEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.25,
    },
    reviewModalTitle: {
      color: theme.colors.cream,
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '900',
    },
    reviewCloseButton: {
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(247, 242, 232, 0.22)',
      borderRadius: 8,
    },
    reviewCloseText: {
      color: theme.colors.textMuted,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    reviewQueueContent: { gap: 9, paddingBottom: 8 },
    reviewQueueIntro: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      paddingBottom: 2,
    },
    reviewQueueCard: {
      gap: 5,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.18)',
      borderRadius: 10,
      backgroundColor: 'rgba(242, 211, 138, 0.045)',
    },
    reviewDetailContent: { gap: 12, paddingBottom: 8 },
    reviewDetailCard: {
      gap: 5,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.18)',
      borderRadius: 10,
      backgroundColor: 'rgba(88, 223, 232, 0.04)',
    },
    reviewCardTopline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    reviewCardStatus: {
      color: theme.colors.goldBright,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1,
    },
    reviewCardAmount: {
      color: theme.colors.cream,
      fontSize: 15,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    reviewCardTitle: {
      color: theme.colors.text,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
    },
    reviewCardReason: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
    },
    reviewCardMeta: {
      color: 'rgba(247, 242, 232, 0.48)',
      fontSize: 7,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    reviewCardAction: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
      textAlign: 'right',
    },
    reviewResolutionSection: {
      gap: 9,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(247, 242, 232, 0.15)',
      borderRadius: 10,
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    reviewResolutionTitle: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    reviewResolutionBody: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
    },
    reviewSearchInput: {
      minHeight: 40,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.20)',
      borderRadius: 8,
      color: theme.colors.cream,
      backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    reviewInventoryList: {
      maxHeight: 240,
    },
    reviewInventoryListContent: {
      gap: 5,
    },
    reviewInventoryRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(247, 242, 232, 0.12)',
      borderRadius: 8,
    },
    reviewInventoryRowSelected: {
      borderColor: 'rgba(88, 223, 232, 0.62)',
      backgroundColor: 'rgba(88, 223, 232, 0.08)',
    },
    reviewInventoryCopy: { flex: 1, minWidth: 0, gap: 2 },
    reviewInventoryTitle: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: '800',
    },
    reviewInventoryMeta: {
      color: theme.colors.textMuted,
      fontSize: 8,
      lineHeight: 11,
    },
    reviewInventoryQty: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    reviewQuantityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    reviewQuantityCopy: { flex: 1, gap: 2 },
    reviewQuantityInput: {
      width: 72,
      minHeight: 40,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.28)',
      borderRadius: 8,
      color: theme.colors.cream,
      fontSize: 15,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
      backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    reviewPrimaryButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: 9,
      backgroundColor: theme.colors.goldBright,
    },
    reviewPrimaryButtonText: {
      color: theme.colors.backgroundDeep,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.85,
    },
    reviewSecondaryButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.34)',
      borderRadius: 9,
      backgroundColor: 'rgba(88, 223, 232, 0.06)',
    },
    reviewSecondaryButtonText: {
      color: theme.colors.scannerCyan,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.85,
    },
    reviewActionMessage: {
      color: theme.colors.goldBright,
      fontSize: 10,
      lineHeight: 15,
      paddingHorizontal: 2,
    },
    reviewLoadingState: {
      minHeight: 150,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    reviewClearTitle: {
      color: '#46F5A2',
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.3,
    },
    reviewEmptyText: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: 'center',
    },
    reviewPressed: { opacity: 0.72 },
    reviewDisabled: { opacity: 0.45 },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    sectionEyebrow: [
      staticStyles.sectionEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    sectionTitle: [
      staticStyles.sectionTitle,
      {
        fontSize: responsiveFont(16),
      },
    ],
    eBayLogo: [
      staticStyles.eBayLogo,
      {
        width: responsiveWidth(25),
        height: responsiveHeight(27),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    reviewModalEyebrow: [
      staticStyles.reviewModalEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    reviewModalTitle: [
      staticStyles.reviewModalTitle,
      {
        fontSize: responsiveFont(20),
      },
    ],
    reviewCloseText: [
      staticStyles.reviewCloseText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    reviewQueueIntro: [
      staticStyles.reviewQueueIntro,
      {
        fontSize: responsiveFont(11),
      },
    ],
    reviewCardStatus: [
      staticStyles.reviewCardStatus,
      {
        fontSize: responsiveFont(7),
      },
    ],
    reviewCardAmount: [
      staticStyles.reviewCardAmount,
      {
        fontSize: responsiveFont(15),
      },
    ],
    reviewCardTitle: [
      staticStyles.reviewCardTitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    reviewCardReason: [
      staticStyles.reviewCardReason,
      {
        fontSize: responsiveFont(10),
      },
    ],
    reviewCardMeta: [
      staticStyles.reviewCardMeta,
      {
        fontSize: responsiveFont(7),
      },
    ],
    reviewCardAction: [
      staticStyles.reviewCardAction,
      {
        fontSize: responsiveFont(8),
      },
    ],
    reviewResolutionTitle: [
      staticStyles.reviewResolutionTitle,
      {
        fontSize: responsiveFont(8),
      },
    ],
    reviewResolutionBody: [
      staticStyles.reviewResolutionBody,
      {
        fontSize: responsiveFont(10),
      },
    ],
    reviewInventoryTitle: [
      staticStyles.reviewInventoryTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    reviewInventoryMeta: [
      staticStyles.reviewInventoryMeta,
      {
        fontSize: responsiveFont(8),
      },
    ],
    reviewInventoryQty: [
      staticStyles.reviewInventoryQty,
      {
        fontSize: responsiveFont(7),
      },
    ],
    reviewQuantityInput: [
      staticStyles.reviewQuantityInput,
      {
        width: responsiveWidth(72),
        fontSize: responsiveFont(15),
      },
    ],
    reviewPrimaryButtonText: [
      staticStyles.reviewPrimaryButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    reviewSecondaryButtonText: [
      staticStyles.reviewSecondaryButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    reviewActionMessage: [
      staticStyles.reviewActionMessage,
      {
        fontSize: responsiveFont(10),
      },
    ],
    reviewClearTitle: [
      staticStyles.reviewClearTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    reviewEmptyText: [
      staticStyles.reviewEmptyText,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}
