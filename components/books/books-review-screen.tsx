import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
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

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  centsFromReviewAmount,
  confirmFocusedBookkeepingReview,
  getFocusedBookkeepingReview,
  reviewAmountFromCents,
  type FocusedBookkeepingReviewItem,
} from '@/services/bookkeeping-review-service';
import { getBookkeepingReviewQueue } from '@/services/reseller-bookkeeping-service';

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
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

export function BooksReviewScreen({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [review, setReview] = useState<FocusedBookkeepingReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [memo, setMemo] = useState('');
  const [itemCost, setItemCost] = useState('');

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

  const rawSourceAmount = useMemo(() => {
    if (!review) return null;
    if (!review.rawAmountValue && !review.rawCurrency) return null;
    return [review.rawCurrency, review.rawAmountValue].filter(Boolean).join(' ');
  }, [review]);

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
    if (review.status === 'needs_item_match') {
      router.replace('/command-center?openReviewQueue=1' as Href);
      return;
    }

    setError(null);
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
      } else {
        const amountCents = centsFromReviewAmount(amount);
        const normalizedCurrency = currency.trim().toUpperCase();
        if (amountCents == null) {
          setError('Enter the transaction amount shown by the source record.');
          return;
        }
        if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
          setError('Currency must be a three-letter code such as USD or GBP.');
          return;
        }
        await confirmFocusedBookkeepingReview({
          amountCents,
          currency: normalizedCurrency,
          reviewId: review.id,
          transactionMemo: memo.trim() || null,
        });
      }

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      await routeAfterReviewConfirmation();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'KeepFlip could not confirm this transaction review.',
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
          <Text style={styles.centerText}>Loading the exact Books transaction…</Text>
        </View>
      </KeepFlipBackground>
    );
  }

  if (!review) {
    return (
      <KeepFlipBackground>
        <View style={[styles.centerState, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.errorTitle}>TRANSACTION UNAVAILABLE</Text>
          <Text selectable style={styles.centerText}>{error}</Text>
          <Pressable
            onPress={() => router.replace('/command-center')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>BACK TO COMMAND CENTER</Text>
          </Pressable>
        </View>
      </KeepFlipBackground>
    );
  }

  const alreadyFinished =
    review.status === 'review_confirmed' || review.status === 'posted';

  return (
    <KeepFlipBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: insets.bottom + 28,
              paddingTop: insets.top / 2,
            },
          ]}
          style={{marginBottom: insets.bottom, marginTop: insets.top}}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>BOOKS / TRANSACTION REVIEW</Text>
            <Text style={styles.title}>Review the actual record</Text>
            <Text style={styles.subtitle}>
              KeepFlip is showing the source record that triggered the review. Correct the editable value only when necessary; if it is already right, leave it alone and press Confirm.
            </Text>
          </View>

          <View style={styles.attentionCard}>
            <Text style={styles.attentionEyebrow}>{reviewLabel(review)}</Text>
            <Text style={styles.attentionTitle}>What needs review</Text>
            <Text selectable style={styles.attentionBody}>{review.reason}</Text>
          </View>

          <View style={styles.sourceCard}>
            <View style={styles.sourceTopline}>
              <View style={styles.sourceHeading}>
                <Text style={styles.cardEyebrow}>EBAY SOURCE RECORD</Text>
                <Text style={styles.cardTitle}>{sourceTypeLabel(review.sourceType)}</Text>
              </View>
              <Text selectable style={styles.sourceAmount}>
                {formatMoney(review.amountCents, review.currency)}
              </Text>
            </View>
            <DetailRow label="Raw transaction type" value={review.rawTransactionType} />
            <DetailRow label="Booking entry" value={review.bookingEntry} />
            <DetailRow label="eBay reported amount" value={rawSourceAmount} />
            <DetailRow label="Transaction ID" value={review.externalKey} />
            <DetailRow label="Order ID" value={review.orderId} />
            <DetailRow label="Payout ID" value={review.payoutId} />
            <DetailRow label="Transaction date" value={formatDate(review.occurredAt)} />
            <DetailRow label="eBay memo" value={review.transactionMemo} />
          </View>

          {alreadyFinished ? (
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedTitle}>REVIEW COMPLETE</Text>
              <Text style={styles.confirmedBody}>
                This source record has already been confirmed and no longer needs action.
              </Text>
            </View>
          ) : review.status === 'needs_item_match' ? (
            <View style={styles.editorCard}>
              <Text style={styles.cardEyebrow}>INVENTORY MATCH REQUIRED</Text>
              <Text style={styles.editorTitle}>Choose the item from Money Review</Text>
              <Text style={styles.editorBody}>
                This sale cannot be confirmed from Books until it is matched to the KeepFlip inventory item that actually sold. Return to Command Center and use the sale matching controls.
              </Text>
            </View>
          ) : review.status === 'needs_item_cost' ? (
            <View style={styles.editorCard}>
              <Text style={styles.cardEyebrow}>EDITABLE REVIEW VALUE</Text>
              <Text style={styles.editorTitle}>Actual item cost</Text>
              <Text style={styles.editorBody}>
                The sale is already recorded. Enter the historical cost attributable to the sold item or sold units. Confirming this reconciles inventory and cost of goods sold without creating on-hand inventory after the sale.
              </Text>
              {review.item ? (
                <View style={styles.itemChip}>
                  <Text style={styles.itemChipLabel}>LINKED INVENTORY</Text>
                  <Text style={styles.itemChipTitle}>{review.item.title}</Text>
                </View>
              ) : null}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>COST OF GOODS SOLD</Text>
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
                <Text style={styles.fieldHint}>
                  Use 0.00 only if this inventory was actually acquired at no cost.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.editorCard}>
              <Text style={styles.cardEyebrow}>EDITABLE REVIEW VALUES</Text>
              <Text style={styles.editorTitle}>Confirm the source transaction</Text>
              <Text style={styles.editorBody}>
                These are KeepFlip's review values. Editing them does not overwrite the immutable raw eBay fields shown above. If the values are already correct, do not change anything.
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>AMOUNT</Text>
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
                <Text style={styles.fieldLabel}>CURRENCY</Text>
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
                <Text style={styles.fieldLabel}>MEMO / REVIEW NOTE</Text>
                <TextInput
                  multiline
                  onChangeText={setMemo}
                  placeholder="Optional note about the confirmed transaction"
                  placeholderTextColor="rgba(247, 242, 232, 0.30)"
                  style={[styles.textField, styles.memoField]}
                  value={memo}
                />
              </View>
            </View>
          )}

          {error ? (
            <View style={styles.errorCard}>
              <Text selectable style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {!alreadyFinished ? (
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
                <Text style={styles.primaryButtonText}>
                  {saving
                    ? 'CONFIRMING…'
                    : review.status === 'needs_item_match'
                      ? 'RETURN TO MONEY REVIEW'
                      : 'CONFIRM'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => router.replace('/command-center')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>BACK TO COMMAND CENTER</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
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
