import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  centsFromReviewAmount,
  confirmFocusedBookkeepingReview,
  getFocusedBookkeepingReview,
  postFocusedBookkeepingReview,
  reviewAmountFromCents,
  type FocusedBookkeepingReviewItem,
  type ReviewPostingEventType,
} from '@/services/bookkeeping-review-service';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import { getBookkeepingReviewQueue } from '@/services/reseller-bookkeeping-service';

type ReviewPostingOption = {
  value: ReviewPostingEventType;
  label: string;
};

const REVIEW_POSTING_OPTIONS: readonly ReviewPostingOption[] = [
  { value: 'sale', label: 'Sale' },
  { value: 'marketplace_credit', label: 'eBay credit' },
  { value: 'payout', label: 'Payout' },
  { value: 'inventory_purchase', label: 'Inventory buy' },
  { value: 'marketplace_fee', label: 'Marketplace fee' },
  { value: 'shipping_label', label: 'Shipping label' },
  { value: 'refund', label: 'Refund' },
  { value: 'repair_parts', label: 'Repairs' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'software', label: 'Software' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'storage', label: 'Storage' },
  { value: 'mileage', label: 'Mileage' },
  { value: 'other_expense', label: 'Other expense' },
];

function postingTypeForReview(review: FocusedBookkeepingReviewItem): ReviewPostingEventType {
  const sourceType = review.sourceType.toLowerCase();
  const transactionType = (review.rawTransactionType || '').toLowerCase();
  if (sourceType.startsWith('sale') || transactionType === 'sale') return 'sale';
  if (sourceType.startsWith('shipping_label') || transactionType === 'shipping_label') {
    return 'shipping_label';
  }
  if (sourceType.startsWith('refund') || transactionType === 'refund') return 'refund';
  if (sourceType.startsWith('credit') || transactionType === 'credit') {
    return 'marketplace_credit';
  }
  if (sourceType.startsWith('non_sale_charge') || transactionType === 'non_sale_charge') {
    return 'marketplace_fee';
  }
  if (sourceType.startsWith('payout') || transactionType === 'payout') return 'payout';
  return 'other_expense';
}

function defaultBookingEntry(eventType: ReviewPostingEventType) {
  return eventType === 'sale' || eventType === 'marketplace_credit' || eventType === 'payout'
    ? 'CREDIT'
    : 'DEBIT';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(cents: number | null, currency: string | null) {
  if (cents == null || !currency) return 'Amount unavailable';
  try {
    return new Intl.NumberFormat('en-US', {
      currency,
      style: 'currency',
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function sourceTypeLabel(value: string) {
  return value
    .replace(/_foreign_currency$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reviewLabel(review: FocusedBookkeepingReviewItem) {
  if (review.status === 'needs_item_cost') return 'COST OF GOODS SOLD';
  if (review.status === 'needs_item_match') return 'INVENTORY MATCH';
  return 'SOURCE TRANSACTION';
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { fontSize: responsiveFont(7) }]}>{label}</Text>
      <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(10) }]}>
        {value}
      </Text>
    </View>
  );
}

export function BooksReviewScreen({ reviewId }: { reviewId: string }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont,
    contentMaxWidth,
    contentWidth,
    pageGutter
  } = useResponsiveLayout();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const [review, setReview] = useState<FocusedBookkeepingReviewItem | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [memo, setMemo] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [eventType, setEventType] = useState<ReviewPostingEventType>('other_expense');
  const [occurredAt, setOccurredAt] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [bookingEntry, setBookingEntry] = useState('');
  const [orderId, setOrderId] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [fee, setFee] = useState('');
  const [tax, setTax] = useState('');
  const [inventoryQuery, setInventoryQuery] = useState('');

  const loadReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFocusedBookkeepingReview(reviewId);
      setReview(result);
      setAmount(
        reviewAmountFromCents(result.amountCents) ||
        (result.rawAmountValue && /^\d+(?:\.\d{1,2})?$/.test(result.rawAmountValue)
          ? result.rawAmountValue
          : ''),
      );
      setCurrency(result.currency || result.rawCurrency || 'USD');
      setMemo(result.transactionMemo || '');
      setItemCost(reviewAmountFromCents(result.item?.acquisitionCostCents ?? null));
      const suggestedEventType = postingTypeForReview(result);
      setEventType(suggestedEventType);
      setOccurredAt(result.occurredAt);
      setTransactionType(result.rawTransactionType || result.sourceType.toUpperCase());
      setBookingEntry(result.bookingEntry || defaultBookingEntry(suggestedEventType));
      setOrderId(result.orderId || '');
      setPayoutId(result.payoutId || '');
      setItemId(result.itemId);
      setQuantity('1');
      setFee('');
      setTax('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'KeepFlip could not load this transaction review.',
      );
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  useEffect(() => {
    if (!user?.$id) {
      setInventory([]);
      setInventoryError(null);
      return;
    }

    let cancelled = false;
    setInventoryError(null);
    void listInventoryItems(user.$id)
      .then((items) => {
        if (!cancelled) setInventory(items);
      })
      .catch((caught) => {
        if (cancelled) return;
        setInventory([]);
        setInventoryError(
          caught instanceof Error
            ? caught.message
            : 'KeepFlip could not load inventory for this transaction.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  const rawSourceAmount = useMemo(() => {
    if (!review) return null;
    if (!review.rawAmountValue && !review.rawCurrency) return null;
    return [review.rawCurrency, review.rawAmountValue].filter(Boolean).join(' ');
  }, [review]);

  const selectedItem = useMemo(
    () => inventory.find((item) => item.id === itemId) ?? null,
    [inventory, itemId],
  );

  const matchingInventory = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    return inventory
      .filter((item) =>
        eventType === 'sale'
          ? item.quantityOnHand > 0 || item.id === itemId
          : true,
      )
      .filter((item) => {
        if (!query) return true;
        return [item.title, item.brand, item.model, item.sku]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 40);
  }, [eventType, inventory, inventoryQuery, itemId]);

  const routeAfterReviewConfirmation = async () => {
    let hasRemainingReviews = false;
    try {
      const queue = await getBookkeepingReviewQueue();
      hasRemainingReviews = queue.total > 0 || queue.items.length > 0;
    } catch {
      // Command Center will retry the queue load. Opening it keeps an unresolved
      // transaction visible instead of silently leaving the seller at home.
      hasRemainingReviews = true;
    }

    router.replace(
      (hasRemainingReviews
        ? '/command-center?openReviewQueue=1'
        : '/command-center') as Href,
    );
  };
  const finishReview = async () => {
    if (!review || saving) return;

    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (review.status === 'needs_item_cost') {
        const itemCostCents = centsFromReviewAmount(itemCost);
        if (itemCostCents == null) {
          setError(
            'Enter the actual cost paid for the item or sold units. Use 0.00 only if the inventory was genuinely acquired for free.',
          );
          return;
        }
        await confirmFocusedBookkeepingReview({
          itemCostCents,
          reviewId: review.id,
        });
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        await routeAfterReviewConfirmation();
        return;
      } else {
        const amountCents = centsFromReviewAmount(amount);
        const normalizedCurrency = currency.trim().toUpperCase();
        const normalizedBookingEntry = bookingEntry.trim().toUpperCase();
        const normalizedTransactionType = transactionType.trim().toUpperCase();
        const optionalFeeCents = fee.trim() ? centsFromReviewAmount(fee) : 0;
        const optionalTaxCents = tax.trim() ? centsFromReviewAmount(tax) : 0;
        const parsedQuantity = Number(quantity);
        const needsItem = eventType === 'sale' || eventType === 'inventory_purchase';

        if (amountCents == null || amountCents <= 0) {
          setError('Enter a transaction amount greater than 0.00 to create a Books record.');
          return;
        }
        if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
          setError('Currency must be a three-letter code such as USD or GBP.');
          return;
        }
        if (!Number.isFinite(Date.parse(occurredAt))) {
          setError('Enter a real transaction date and time.');
          return;
        }
        if (!normalizedTransactionType) {
          setError('Enter the transaction type before creating the Books record.');
          return;
        }
        if (normalizedBookingEntry && !/^(DEBIT|CREDIT)$/.test(normalizedBookingEntry)) {
          setError('Booking entry must be DEBIT, CREDIT, or left blank.');
          return;
        }
        const reviewedBookingEntry: 'DEBIT' | 'CREDIT' | null =
          normalizedBookingEntry === 'DEBIT' || normalizedBookingEntry === 'CREDIT'
            ? normalizedBookingEntry
            : null;
        if (optionalFeeCents == null || optionalTaxCents == null) {
          setError('Marketplace fees and tax must be valid non-negative amounts.');
          return;
        }
        if (needsItem && !itemId) {
          setError(
            eventType === 'sale'
              ? 'Choose the KeepFlip inventory item that actually sold.'
              : 'Choose the KeepFlip inventory item for this purchase.',
          );
          return;
        }
        if (
          eventType === 'sale' &&
          (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100_000)
        ) {
          setError('Quantity sold must be a whole number from 1 through 100,000.');
          return;
        }

        const result = await postFocusedBookkeepingReview({
          amountCents,
          bookingEntry: reviewedBookingEntry,
          currency: normalizedCurrency,
          eventType,
          feeCents: optionalFeeCents,
          itemId,
          marketplaceCollectedTaxCents: optionalTaxCents,
          occurredAt,
          orderId: orderId.trim() || null,
          payoutId: payoutId.trim() || null,
          quantity: eventType === 'sale' ? parsedQuantity : undefined,
          reviewId: review.id,
          transactionType: normalizedTransactionType,
          transactionMemo: memo.trim() || null,
        });
        setSuccess(
          result.status === 'needs_item_cost'
            ? 'Books record created and linked to this eBay transaction. The item’s original cost still needs review.'
            : `Books record created and linked to eBay transaction ${review.externalKey}.`,
        );
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        await loadReview();
        return;
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'KeepFlip could not create the Books record from this transaction review.',
      );
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <KeepFlipBackground>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.goldBright} size="large" />
          <Text style={[styles.centerText, { fontSize: responsiveFont(11) }]}>Loading the exact Books transaction…</Text>
        </View>
      </KeepFlipBackground>
    );
  }

  if (!review) {
    return (
      <KeepFlipBackground>
        <View style={[styles.centerState, { paddingTop: insets.top + 20 }]}>
          <Text style={[styles.errorTitle, { fontSize: responsiveFont(11) }]}>TRANSACTION UNAVAILABLE</Text>
          <Text selectable style={[styles.centerText, { fontSize: responsiveFont(11) }]}>{error}</Text>
          <Pressable
            onPress={() => router.replace('/command-center')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { fontSize: responsiveFont(9) }]}>BACK TO COMMAND CENTER</Text>
          </Pressable>
        </View>
      </KeepFlipBackground>
    );
  }

  const hasDurableBookRecord = Boolean(review.bookTransactionId);
  const needsCostReview = review.status === 'needs_item_cost';
  const sourceClaimsPostedWithoutRecord =
    review.status === 'posted' && !hasDurableBookRecord;
  const needsInventoryLink =
    eventType === 'sale' || eventType === 'inventory_purchase';

  return (
    <KeepFlipBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { marginBottom: Math.max(insets.bottom, 12) }]}>
        <ScrollView
          contentContainerStyle={[styles.content,
          {
            paddingBottom: insets.bottom + 30,
            paddingTop: insets.top + 15,
          }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
          style={{ marginTop: insets.top }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>BOOKS / TRANSACTION REVIEW</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(26), maxWidth: '85%' }]}>Review the imported eBay record</Text>
            <Text style={[styles.subtitle, { fontSize: responsiveFont(12), fontFamily: theme.fonts.body }]}>
              The eBay transaction ID is locked. Correct the bookkeeping details below, then create one durable KeepFlip Books record linked to that ID.
            </Text>
          </View>

          <View style={styles.attentionCard}>
            <Text style={[styles.attentionEyebrow, { fontSize: responsiveFont(8) }]}>{reviewLabel(review)}</Text>
            <Text style={[styles.attentionTitle, { fontSize: responsiveFont(17) }]}>What needs review</Text>
            <Text selectable style={[styles.attentionBody, { fontSize: responsiveFont(11) }]}>{review.reason}</Text>
          </View>

          <View style={styles.sourceCard}>
            <View style={styles.sourceTopline}>
              <View style={styles.sourceHeading}>
                <Text style={[styles.cardEyebrow, { fontSize: responsiveFont(8) }]}>IMPORTED EBAY SOURCE</Text>
                <Text style={[styles.cardTitle, { fontSize: responsiveFont(16) }]}>{sourceTypeLabel(review.sourceType)}</Text>
              </View>
              <Text selectable style={styles.sourceAmount}>
                {formatMoney(review.amountCents, review.currency)}
              </Text>
            </View>
            <DetailRow label="Imported transaction type" value={review.rawTransactionType} />
            <DetailRow label="Imported booking entry" value={review.bookingEntry} />
            <DetailRow label="Imported eBay amount" value={rawSourceAmount} />
            <DetailRow label="eBay transaction ID — locked" value={review.externalKey} />
            <DetailRow label="Order ID" value={review.orderId} />
            <DetailRow label="Payout ID" value={review.payoutId} />
            <DetailRow label="Transaction date" value={formatDate(review.occurredAt)} />
            <DetailRow label="eBay memo" value={review.transactionMemo} />
          </View>

          {needsCostReview ? (
            <View style={styles.editorCard}>
              <Text style={[styles.cardEyebrow, { fontSize: responsiveFont(8) }]}>EDITABLE REVIEW VALUE</Text>
              <Text style={[styles.editorTitle, { fontSize: responsiveFont(17) }]}>Actual item cost</Text>
              <Text style={[styles.editorBody, { fontSize: responsiveFont(11) }]}>
                The sale is already recorded. Enter the historical cost attributable to the sold item or sold units. Confirming this reconciles inventory and cost of goods sold without creating on-hand inventory after the sale.
              </Text>
              {review.item ? (
                <View style={styles.itemChip}>
                  <Text style={[styles.itemChipLabel, { fontSize: responsiveFont(7) }]}>LINKED INVENTORY</Text>
                  <Text style={[styles.itemChipTitle, { fontSize: responsiveFont(11) }]}>{review.item.title}</Text>
                </View>
              ) : null}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>COST OF GOODS SOLD</Text>
                <View style={styles.moneyInputRow}>
                  <Text style={styles.currencyPrefix}>$</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={setItemCost}
                    placeholder="0.00"
                    placeholderTextColor="rgba(247, 242, 232, 0.30)"
                    selectTextOnFocus
                    style={styles.moneyInput}
                    value={itemCost}
                  />
                </View>
                <Text style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>Use 0.00 only if this inventory was actually acquired at no cost.</Text>
              </View>
            </View>
          ) : hasDurableBookRecord ? (
            <View style={styles.confirmedCard}>
              <Text style={[styles.confirmedTitle, { fontSize: responsiveFont(9) }]}>BOOKS RECORD CREATED</Text>
              <Text style={[styles.confirmedBody, { fontSize: responsiveFont(11) }]}>
                This durable Books record is tied to the locked eBay transaction ID above. Posted accounting lines are preserved; future corrections should create a reversing record rather than silently rewrite it.
              </Text>
              <DetailRow label="KeepFlip Books record ID" value={review.bookTransactionId} />
            </View>
          ) : sourceClaimsPostedWithoutRecord ? (
            <View style={styles.errorCard}>
              <Text style={[styles.errorTitle, { fontSize: responsiveFont(10) }]}>RECORD LINK NEEDS ATTENTION</Text>
              <Text selectable style={[styles.errorText, { fontSize: responsiveFont(10) }]}>
                This source import is marked posted, but KeepFlip could not find its durable Books record. Leave the source unchanged and contact support with the locked transaction ID above.
              </Text>
            </View>
          ) : (
            <View style={styles.editorCard}>
              <Text style={[styles.cardEyebrow, { fontSize: responsiveFont(8) }]}>CORRECT & CREATE BOOKS RECORD</Text>
              <Text style={[styles.editorTitle, { fontSize: responsiveFont(17) }]}>Record this eBay activity accurately</Text>
              <Text style={[styles.editorBody, { fontSize: responsiveFont(11) }]}>
                You can correct every bookkeeping detail here. The eBay transaction ID remains locked and becomes the permanent link between the import and the Books record KeepFlip creates.
              </Text>
              <View style={styles.lockedIdCard}>
                <Text style={[styles.itemChipLabel, { fontSize: responsiveFont(7) }]}>LOCKED EBAY TRANSACTION ID</Text>
                <Text selectable style={[styles.lockedIdValue, { fontSize: responsiveFont(10) }]}>{review.externalKey}</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>RECORD AS</Text>
                <ScrollView
                  contentContainerStyle={styles.postingTypeList}
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}>
                  {REVIEW_POSTING_OPTIONS.map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => setEventType(option.value)}
                      style={({ pressed }) => [
                        styles.postingTypeChip,
                        eventType === option.value && styles.postingTypeChipActive,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[
                        styles.postingTypeChipText,
                        { fontSize: responsiveFont(9) },
                        eventType === option.value && styles.postingTypeChipTextActive,
                      ]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>This choice determines the balanced Books entry; it never changes the eBay ID.</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>AMOUNT</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  selectTextOnFocus
                  style={styles.textField}
                  value={amount}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>CURRENCY</Text>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={3}
                  onChangeText={setCurrency}
                  placeholder="USD"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={currency}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>TRANSACTION TYPE</Text>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={80}
                  onChangeText={setTransactionType}
                  placeholder="SALE, CREDIT, NON_SALE_CHARGE…"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={transactionType}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>BOOKING ENTRY</Text>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  onChangeText={setBookingEntry}
                  placeholder="DEBIT or CREDIT"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={bookingEntry}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>TRANSACTION DATE & TIME</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setOccurredAt}
                  placeholder="2026-09-10T18:30:00.000Z"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={occurredAt}
                />
                <Text style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>Use an ISO date/time, for example 2026-09-10T18:30:00.000Z.</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>ORDER ID</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={180}
                  onChangeText={setOrderId}
                  placeholder="Optional marketplace order reference"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={orderId}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>PAYOUT ID</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={180}
                  onChangeText={setPayoutId}
                  placeholder="Optional eBay payout reference"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={styles.textField}
                  value={payoutId}
                />
              </View>
              {eventType === 'sale' ? (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>QUANTITY SOLD</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={6}
                      onChangeText={setQuantity}
                      placeholder="1"
                      placeholderTextColor="rgba(247, 242, 232, 0.30)"
                      style={styles.textField}
                      value={quantity}
                    />
                  </View>
                  <View style={styles.twoColumnFields}>
                    <View style={styles.halfField}>
                      <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>EBAY FEES</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={setFee}
                        placeholder="0.00"
                        placeholderTextColor="rgba(247, 242, 232, 0.30)"
                        style={styles.textField}
                        value={fee}
                      />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>EBAY TAX HELD</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={setTax}
                        placeholder="0.00"
                        placeholderTextColor="rgba(247, 242, 232, 0.30)"
                        style={styles.textField}
                        value={tax}
                      />
                    </View>
                  </View>
                </>
              ) : null}
              {needsInventoryLink ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>
                    {eventType === 'sale' ? 'KEEPFLIP ITEM THAT SOLD' : 'KEEPFLIP ITEM PURCHASED'}
                  </Text>
                  {selectedItem ? (
                    <View style={styles.itemChip}>
                      <Text style={[styles.itemChipLabel, { fontSize: responsiveFont(7) }]}>LINKED INVENTORY</Text>
                      <Text style={[styles.itemChipTitle, { fontSize: responsiveFont(11) }]}>{selectedItem.title}</Text>
                      <Text style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>{selectedItem.quantityOnHand.toLocaleString()} on hand{selectedItem.sku ? ` · SKU ${selectedItem.sku}` : ''}</Text>
                    </View>
                  ) : null}
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setInventoryQuery}
                    placeholder="Search saved inventory"
                    placeholderTextColor="rgba(247, 242, 232, 0.30)"
                    style={styles.textField}
                    value={inventoryQuery}
                  />
                  {inventoryError ? (
                    <Text selectable style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>{inventoryError}</Text>
                  ) : matchingInventory.length ? (
                    <ScrollView
                      contentContainerStyle={styles.inventoryOptionsContent}
                      nestedScrollEnabled
                      style={styles.inventoryOptions}>
                      {matchingInventory.map((item) => (
                        <Pressable
                          accessibilityRole="button"
                          key={item.id}
                          onPress={() => setItemId(item.id)}
                          style={({ pressed }) => [
                            styles.inventoryOption,
                            item.id === itemId && styles.inventoryOptionActive,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.inventoryOptionTitle, { fontSize: responsiveFont(10) }]}>{item.title}</Text>
                          <Text style={[styles.inventoryOptionMeta, { fontSize: responsiveFont(8) }]}>
                            {item.quantityOnHand.toLocaleString()} on hand{item.sku ? ` · ${item.sku}` : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={[styles.fieldHint, { fontSize: responsiveFont(9) }]}>No matching inventory items are available to link yet.</Text>
                  )}
                </View>
              ) : null}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { fontSize: responsiveFont(8) }]}>MEMO</Text>
                <TextInput
                  multiline
                  onChangeText={setMemo}
                  placeholder="Optional note about this corrected Books record"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={[styles.textField, styles.memoField]}
                  value={memo}
                />
              </View>
            </View>
          )}

          {success ? (
            <View style={styles.confirmedCard}>
              <Text style={[styles.confirmedTitle, { fontSize: responsiveFont(9) }]}>SAVED</Text>
              <Text selectable style={[styles.confirmedBody, { fontSize: responsiveFont(10) }]}>{success}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text selectable style={[styles.errorText, { fontSize: responsiveFont(10) }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {(!hasDurableBookRecord || needsCostReview) && !sourceClaimsPostedWithoutRecord ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void finishReview()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
                ]}>
                {saving ? (
                  <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
                ) : null}
                <Text style={[styles.primaryButtonText, { fontSize: responsiveFont(10) }]}>
                  {saving
                    ? 'SAVING…'
                    : review.status === 'needs_item_cost'
                      ? 'CONFIRM ITEM COST'
                      : 'CREATE LINKED BOOKS RECORD'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => router.replace('/command-center')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={[styles.secondaryButtonText, { fontSize: responsiveFont(9) }]}>BACK TO COMMAND CENTER</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    flex: { flex: 1 },
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      gap: 14,
      paddingHorizontal: 18,
    },
    header: { gap: 4 },
    eyebrow: {
      color: theme.colors.goldBright,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    title: {
      color: theme.colors.cream,
      fontSize: 27,
      lineHeight: 32,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    attentionCard: {
      gap: 5,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.35)',
      backgroundColor: 'rgba(242, 211, 138, 0.07)',
    },
    attentionEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    attentionTitle: {
      color: theme.colors.cream,
      fontSize: 17,
      fontWeight: '900',
    },
    attentionBody: {
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 17,
    },
    sourceCard: {
      gap: 8,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.25)',
      backgroundColor: 'rgba(88, 223, 232, 0.035)',
    },
    sourceTopline: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      paddingBottom: 3,
    },
    sourceHeading: { flex: 1, gap: 2 },
    cardEyebrow: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1,
    },
    cardTitle: {
      color: theme.colors.cream,
      fontSize: 16,
      fontWeight: '900',
    },
    sourceAmount: {
      color: theme.colors.goldBright,
      fontSize: 17,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    detailRow: {
      gap: 2,
      paddingTop: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(247, 242, 232, 0.10)',
    },
    detailLabel: {
      color: 'rgba(247, 242, 232, 0.42)',
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    detailValue: {
      color: theme.colors.text,
      fontSize: 10,
      lineHeight: 15,
    },
    editorCard: {
      gap: 11,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(247, 242, 232, 0.16)',
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    editorTitle: {
      color: theme.colors.cream,
      fontSize: 17,
      fontWeight: '900',
    },
    editorBody: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
    },
    lockedIdCard: {
      gap: 3,
      padding: 10,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.22)',
      backgroundColor: 'rgba(88, 223, 232, 0.055)',
    },
    lockedIdValue: {
      color: theme.colors.text,
      fontSize: 10,
      lineHeight: 15,
      fontVariant: ['tabular-nums'],
    },
    fieldGroup: { gap: 5 },
    fieldLabel: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    fieldHint: {
      color: theme.colors.textMuted,
      fontSize: 9,
      lineHeight: 13,
    },
    postingTypeList: {
      gap: 7,
      paddingRight: 8,
    },
    postingTypeChip: {
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 11,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: 'rgba(247, 242, 232, 0.17)',
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    postingTypeChipActive: {
      borderColor: 'rgba(242, 211, 138, 0.66)',
      backgroundColor: 'rgba(242, 211, 138, 0.13)',
    },
    postingTypeChipText: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
    },
    postingTypeChipTextActive: {
      color: theme.colors.goldBright,
    },
    textField: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.22)',
      color: theme.colors.cream,
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      fontSize: 14,
    },
    memoField: {
      minHeight: 92,
      paddingTop: 11,
      textAlignVertical: 'top',
    },
    moneyInputRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.30)',
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
    },
    currencyPrefix: {
      paddingLeft: 12,
      color: theme.colors.goldBright,
      fontSize: 17,
      fontWeight: '900',
    },
    moneyInput: {
      flex: 1,
      minHeight: 46,
      paddingHorizontal: 8,
      color: theme.colors.cream,
      fontSize: 17,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    itemChip: {
      gap: 2,
      padding: 10,
      borderRadius: 9,
      backgroundColor: 'rgba(88, 223, 232, 0.07)',
    },
    itemChipLabel: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    itemChipTitle: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: '800',
    },
    twoColumnFields: {
      flexDirection: 'row',
      gap: 9,
    },
    halfField: {
      flex: 1,
      gap: 5,
    },
    inventoryOptions: {
      maxHeight: 280,
    },
    inventoryOptionsContent: {
      gap: 6,
      paddingRight: 2,
    },
    inventoryOption: {
      gap: 2,
      padding: 10,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(247, 242, 232, 0.12)',
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
    },
    inventoryOptionActive: {
      borderColor: 'rgba(88, 223, 232, 0.65)',
      backgroundColor: 'rgba(88, 223, 232, 0.09)',
    },
    inventoryOptionTitle: {
      color: theme.colors.text,
      fontSize: 10,
      fontWeight: '800',
    },
    inventoryOptionMeta: {
      color: theme.colors.textMuted,
      fontSize: 8,
    },
    confirmedCard: {
      gap: 5,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(70, 245, 162, 0.28)',
      backgroundColor: 'rgba(70, 245, 162, 0.05)',
    },
    confirmedTitle: {
      color: '#46F5A2',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    confirmedBody: {
      color: theme.colors.text,
      fontSize: 11,
      lineHeight: 16,
    },
    errorCard: {
      padding: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(255, 120, 110, 0.28)',
      backgroundColor: 'rgba(255, 120, 110, 0.055)',
    },
    errorText: {
      color: '#FFB8B1',
      fontSize: 10,
      lineHeight: 15,
    },
    errorTitle: {
      color: '#FFB8B1',
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    actions: { gap: 8 },
    primaryButton: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.goldBright,
    },
    primaryButtonText: {
      color: theme.colors.backgroundDeep,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    secondaryButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.30)',
      backgroundColor: 'rgba(88, 223, 232, 0.045)',
    },
    secondaryButtonText: {
      color: theme.colors.scannerCyan,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.48 },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 24,
    },
    centerText: {
      maxWidth: 480,
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(27),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    attentionEyebrow: [
      staticStyles.attentionEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    attentionTitle: [
      staticStyles.attentionTitle,
      {
        fontSize: responsiveFont(17),
      },
    ],
    attentionBody: [
      staticStyles.attentionBody,
      {
        fontSize: responsiveFont(11),
      },
    ],
    cardEyebrow: [
      staticStyles.cardEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    cardTitle: [
      staticStyles.cardTitle,
      {
        fontSize: responsiveFont(16),
      },
    ],
    sourceAmount: [
      staticStyles.sourceAmount,
      {
        fontSize: responsiveFont(17),
      },
    ],
    detailLabel: [
      staticStyles.detailLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    detailValue: [
      staticStyles.detailValue,
      {
        fontSize: responsiveFont(10),
      },
    ],
    editorTitle: [
      staticStyles.editorTitle,
      {
        fontSize: responsiveFont(17),
      },
    ],
    editorBody: [
      staticStyles.editorBody,
      {
        fontSize: responsiveFont(11),
      },
    ],
    fieldLabel: [
      staticStyles.fieldLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    fieldHint: [
      staticStyles.fieldHint,
      {
        fontSize: responsiveFont(9),
      },
    ],
    textField: [
      staticStyles.textField,
      {
        fontSize: responsiveFont(14),
      },
    ],
    currencyPrefix: [
      staticStyles.currencyPrefix,
      {
        fontSize: responsiveFont(17),
      },
    ],
    moneyInput: [
      staticStyles.moneyInput,
      {
        fontSize: responsiveFont(17),
      },
    ],
    itemChipLabel: [
      staticStyles.itemChipLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    itemChipTitle: [
      staticStyles.itemChipTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    confirmedTitle: [
      staticStyles.confirmedTitle,
      {
        fontSize: responsiveFont(9),
      },
    ],
    confirmedBody: [
      staticStyles.confirmedBody,
      {
        fontSize: responsiveFont(11),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    errorTitle: [
      staticStyles.errorTitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    primaryButtonText: [
      staticStyles.primaryButtonText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    secondaryButtonText: [
      staticStyles.secondaryButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    centerText: [
      staticStyles.centerText,
      {
        fontSize: responsiveFont(11),
      },
    ],
  };
}
