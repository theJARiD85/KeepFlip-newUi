import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';

export type FocusedBookkeepingReviewStatus =
  | 'needs_item_match'
  | 'needs_item_cost'
  | 'needs_review'
  | 'review_confirmed'
  | 'posted';

export type FocusedBookkeepingReviewItem = {
  id: string;
  status: FocusedBookkeepingReviewStatus;
  sourceType: string;
  amountCents: number | null;
  amountKnown: boolean;
  currency: string | null;
  occurredAt: string;
  itemId: string | null;
  orderId: string | null;
  payoutId: string | null;
  externalKey: string;
  reason: string;
  bookingEntry: string | null;
  rawAmountValue: string | null;
  rawCurrency: string | null;
  rawTransactionType: string | null;
  reviewUpdatedAt: string | null;
  transactionMemo: string | null;
  mileageMeters: number | null;
  mileageRateCents: number | null;
  /** The durable Books record created from this immutable source event. */
  bookTransactionId: string | null;
  item: {
    id: string;
    title: string;
    quantityOnHand: number | null;
    acquisitionCostCents: number | null;
  } | null;
};

export type ConfirmFocusedBookkeepingReviewInput = {
  reviewId: string;
  amountCents?: number;
  currency?: string;
  transactionMemo?: string | null;
  itemCostCents?: number;
};

export type ReviewPostingEventType =
  | 'advertising'
  | 'inventory_purchase'
  | 'marketplace_credit'
  | 'marketplace_fee'
  | 'mileage'
  | 'other_expense'
  | 'payout'
  | 'refund'
  | 'repair_parts'
  | 'sale'
  | 'shipping_label'
  | 'software'
  | 'storage'
  | 'supplies';

export type PostFocusedBookkeepingReviewInput = {
  reviewId: string;
  /** Only used when the imported row has a synthetic invalid transaction key. */
  replacementExternalKey?: string;
  eventType: ReviewPostingEventType;
  amountCents: number;
  currency: string;
  occurredAt: string;
  transactionType: string;
  bookingEntry?: 'DEBIT' | 'CREDIT' | null;
  orderId?: string | null;
  payoutId?: string | null;
  transactionMemo?: string | null;
  itemId?: string | null;
  quantity?: number;
  feeCents?: number;
  marketplaceCollectedTaxCents?: number;
  /** Whole cents per mile; the server recomputes the mileage expense from the saved trip distance. */
  mileageRateCents?: number;
};

export type QueueSourcingTripMileageReviewResult = {
  reviewId: string;
  sourceTripId: string;
  status: FocusedBookkeepingReviewStatus;
  mileageMeters: number;
  alreadyQueued: boolean;
};

export type PostFocusedBookkeepingReviewResult = {
  status: 'posted' | 'needs_item_cost';
  alreadyRecorded: boolean;
  bookTransactionId: string;
  replacedInvalidReview: boolean;
};

export type ConfirmFocusedBookkeepingReviewResult = {
  status: 'review_confirmed' | 'posted';
  alreadyConfirmed: boolean;
  amountCents?: number;
  currency?: string;
  itemCostCents?: number;
};

type FunctionPayload = Record<string, unknown>;

function text(value: unknown, maximum = 1_000) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : '';
}

function nullableText(value: unknown, maximum = 1_000) {
  return text(value, maximum) || null;
}

function parsePayload(value: string): FunctionPayload {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FunctionPayload)
      : {};
  } catch {
    return {};
  }
}

function functionError(responseBody: string, fallback: string) {
  const payload = parsePayload(responseBody);
  return new Error(text(payload.error, 1_000) || fallback);
}

function bookkeepingFunctionId() {
  const functionId = APPWRITE.bookkeepingFunctionId;
  if (!functionId) {
    throw new Error('Advanced Books is not configured in this build.');
  }
  return functionId;
}

async function executeReviewFunction(
  xpath:
    | '/review/detail'
    | '/review/confirm'
    | '/review/post'
    | '/review/sourcing-trip',
  body: Record<string, unknown>,
) {
  return functions.createExecution({
    async: false,
    body: JSON.stringify(body),
    functionId: bookkeepingFunctionId(),
    headers: { 'content-type': 'application/json' },
    method: ExecutionMethod.POST,
    xpath,
  });
}

function status(value: unknown): FocusedBookkeepingReviewStatus | null {
  return value === 'needs_item_match' ||
    value === 'needs_item_cost' ||
    value === 'needs_review' ||
    value === 'review_confirmed' ||
    value === 'posted'
    ? value
    : null;
}

function finiteNullableInteger(value: unknown) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function parseReviewItem(value: unknown): FocusedBookkeepingReviewItem {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as FunctionPayload)
    : {};
  const id = text(raw.id, 64);
  const reviewStatus = status(raw.status);
  const occurredAt = text(raw.occurredAt, 80);
  const externalKey = text(raw.externalKey, 255);
  if (!id || !reviewStatus || !occurredAt || !externalKey) {
    throw new Error('The Books service returned an incomplete review transaction.');
  }

  const amountCents = finiteNullableInteger(raw.amountCents);
  const amountKnown = raw.amountKnown === true && amountCents != null && amountCents >= 0;
  const rawItem = raw.item && typeof raw.item === 'object' && !Array.isArray(raw.item)
    ? (raw.item as FunctionPayload)
    : null;

  return {
    amountCents: amountKnown ? amountCents : null,
    amountKnown,
    bookingEntry: nullableText(raw.bookingEntry, 32),
    bookTransactionId: nullableText(raw.bookTransactionId, 64),
    currency: amountKnown ? nullableText(raw.currency, 8)?.toUpperCase() ?? null : null,
    externalKey,
    id,
    item: rawItem
      ? {
          acquisitionCostCents: finiteNullableInteger(rawItem.acquisitionCostCents),
          id: text(rawItem.id, 64),
          quantityOnHand: finiteNullableInteger(rawItem.quantityOnHand),
          title: text(rawItem.title, 255) || 'Inventory item',
        }
      : null,
    itemId: nullableText(raw.itemId, 64),
    occurredAt,
    orderId: nullableText(raw.orderId, 180),
    payoutId: nullableText(raw.payoutId, 180),
    rawAmountValue: nullableText(raw.rawAmountValue, 64),
    rawCurrency: nullableText(raw.rawCurrency, 8)?.toUpperCase() ?? null,
    rawTransactionType: nullableText(raw.rawTransactionType, 80)?.toUpperCase() ?? null,
    reason:
      text(raw.reason, 1_000) ||
      'This source transaction needs a final review before KeepFlip can clear it.',
    reviewUpdatedAt: nullableText(raw.reviewUpdatedAt, 80),
    mileageMeters:
      finiteNullableInteger(raw.mileageMeters) != null &&
      Number(raw.mileageMeters) >= 0
        ? Number(raw.mileageMeters)
        : null,
    mileageRateCents:
      finiteNullableInteger(raw.mileageRateCents) != null &&
      Number(raw.mileageRateCents) > 0
        ? Number(raw.mileageRateCents)
        : null,
    sourceType: text(raw.sourceType, 80).toLowerCase() || 'unclassified',
    status: reviewStatus,
    transactionMemo: nullableText(raw.transactionMemo, 1_000),
  };
}

export async function getFocusedBookkeepingReview(
  reviewId: string,
): Promise<FocusedBookkeepingReviewItem> {
  const execution = await executeReviewFunction('/review/detail', { reviewId });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not load that Books review transaction.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  if (payload.ok !== true) {
    throw new Error('The Books service did not return that review transaction.');
  }
  return parseReviewItem(payload.item);
}

export async function confirmFocusedBookkeepingReview(
  input: ConfirmFocusedBookkeepingReviewInput,
): Promise<ConfirmFocusedBookkeepingReviewResult> {
  const execution = await executeReviewFunction('/review/confirm', input);
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not confirm that Books review.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  const reviewStatus = status(payload.status);
  if (
    payload.ok !== true ||
    (reviewStatus !== 'review_confirmed' && reviewStatus !== 'posted')
  ) {
    throw new Error('The Books service did not confirm that transaction review.');
  }
  return {
    alreadyConfirmed: payload.alreadyConfirmed === true,
    amountCents: finiteNullableInteger(payload.amountCents) ?? undefined,
    currency: nullableText(payload.currency, 8)?.toUpperCase() ?? undefined,
    itemCostCents: finiteNullableInteger(payload.itemCostCents) ?? undefined,
    status: reviewStatus,
  };
}

export async function postFocusedBookkeepingReview(
  input: PostFocusedBookkeepingReviewInput,
): Promise<PostFocusedBookkeepingReviewResult> {
  const execution = await executeReviewFunction('/review/post', input);
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not create the Books record from that review.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  const reviewStatus = payload.status === 'posted' || payload.status === 'needs_item_cost'
    ? payload.status
    : null;
  const bookTransactionId = text(payload.bookTransactionId, 64);
  if (payload.ok !== true || !reviewStatus || !bookTransactionId) {
    throw new Error('The Books service did not create that transaction record.');
  }
  return {
    alreadyRecorded: payload.alreadyRecorded === true,
    bookTransactionId,
    replacedInvalidReview: payload.replacedInvalidReview === true,
    status: reviewStatus,
  };
}

export async function queueSourcingTripMileageReview(
  sourceTripId: string,
): Promise<QueueSourcingTripMileageReviewResult> {
  const execution = await executeReviewFunction('/review/sourcing-trip', {
    sourceTripId,
  });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not add the sourcing-trip mileage to Books review.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  const reviewId = text(payload.reviewId, 64);
  const returnedSourceTripId = text(payload.sourceTripId, 64);
  const reviewStatus = status(payload.status);
  const mileageMeters = finiteNullableInteger(payload.mileageMeters);
  if (
    payload.ok !== true ||
    !reviewId ||
    returnedSourceTripId !== sourceTripId ||
    !reviewStatus ||
    mileageMeters == null ||
    mileageMeters <= 0
  ) {
    throw new Error('The Books service did not confirm the sourcing-trip mileage review.');
  }

  return {
    alreadyQueued: payload.alreadyQueued === true,
    mileageMeters,
    reviewId,
    sourceTripId: returnedSourceTripId,
    status: reviewStatus,
  };
}

export function isSyntheticInvalidTransactionExternalKey(value: string) {
  return /^invalid-transaction-[a-f0-9]{24}$/i.test(value.trim());
}

export function centsFromReviewAmount(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function reviewAmountFromCents(cents: number | null) {
  return cents == null ? '' : (cents / 100).toFixed(2);
}
