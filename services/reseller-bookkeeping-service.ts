import { APPWRITE, ExecutionMethod, ID, functions } from '@/lib/appwrite';
import {
  getEbayOAuthEnvironment,
  type EbayOAuthEnvironment,
} from '@/services/ebayConnectionService';

export type BookkeepingEventType =
  | 'inventory_purchase'
  | 'sale'
  | 'marketplace_fee'
  | 'shipping_label'
  | 'refund'
  | 'payout'
  | 'repair_parts'
  | 'supplies'
  | 'software'
  | 'advertising'
  | 'storage'
  | 'mileage'
  | 'other_expense';

export type RecordBookkeepingEventInput = {
  eventType: BookkeepingEventType;
  idempotencyKey: string;
  occurredAt: string;
  amountCents?: number;
  feeCents?: number;
  grossSaleCents?: number;
  itemId?: string | null;
  quantity?: number;
  marketplaceCollectedTaxCents?: number;
  notes?: string | null;
  orderId?: string | null;
  payoutId?: string | null;
  summary?: string | null;
};

export type BookkeepingRecordResult = {
  alreadyRecorded: boolean;
  bookTransactionId: string;
  needsItemCost: boolean;
};

export type BookkeepingMoneyEvent = {
  id: string;
  itemId: string | null;
  occurredAt: string;
  amountCents: number;
  direction: 'income' | 'expense';
  entryType:
    | 'inventory_purchase'
    | 'sale_proceeds'
    | 'marketplace_fee'
    | 'shipping_label'
    | 'refund'
    | 'repair_parts'
    | 'supplies'
    | 'software'
    | 'advertising'
    | 'storage'
    | 'mileage'
    | 'other_income'
    | 'other_expense';
};

export type BookkeepingOverviewResult = {
  moneyEvents: BookkeepingMoneyEvent[];
  truncated: boolean;
};

export type EbayBookkeepingSyncResult = {
  alreadyRecorded: number;
  needsItemCost: number;
  needsItemMatch: number;
  needsReview: number;
  posted: number;
  payoutCount: number;
  syncedFrom: string;
  syncedTo: string;
  transactionCount: number;
};

export type BookkeepingReviewStatus =
  | 'needs_item_match'
  | 'needs_item_cost'
  | 'needs_review';

export type BookkeepingReviewItem = {
  id: string;
  status: BookkeepingReviewStatus;
  sourceType: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
  itemId: string | null;
  orderId: string | null;
  payoutId: string | null;
  externalKey: string;
  reason: string;
};

export type BookkeepingReviewQueueResult = {
  items: BookkeepingReviewItem[];
  total: number;
};

export type ResolveBookkeepingReviewInput = {
  reviewId: string;
  itemId: string;
  quantity?: number;
  environment?: EbayOAuthEnvironment;
};

export type ResolveBookkeepingReviewResult = {
  bookTransactionId: string;
  needsItemCost: boolean;
  status: 'posted' | 'needs_item_cost' | 'already_recorded';
};

type FunctionPayload = Record<string, unknown>;

function bookkeepingFunctionId() {
  const functionId = APPWRITE.bookkeepingFunctionId;
  if (!functionId) {
    throw new Error(
      'Advanced Books is not configured in this build yet. Add EXPO_PUBLIC_APPWRITE_BOOKKEEPING_FUNCTION_ID after the Books Function is deployed.',
    );
  }
  return functionId;
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
  const error = typeof payload.error === 'string' ? payload.error.trim() : '';
  return new Error(error || fallback);
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function count(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function text(value: unknown, maximum = 255) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : '';
}

function reviewStatus(value: unknown): BookkeepingReviewStatus | null {
  return value === 'needs_item_match' ||
    value === 'needs_item_cost' ||
    value === 'needs_review'
    ? value
    : null;
}

function reviewItem(value: unknown): BookkeepingReviewItem | null {
  const raw = value && typeof value === 'object'
    ? (value as FunctionPayload)
    : {};
  const id = text(raw.id, 64);
  const status = reviewStatus(raw.status);
  const sourceType = text(raw.sourceType, 60) || 'unknown';
  const amountCents = Number(raw.amountCents);
  const occurredAt = text(raw.occurredAt, 64);
  const externalKey = text(raw.externalKey, 255);

  if (
    !id ||
    !status ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    !occurredAt ||
    !externalKey
  ) {
    return null;
  }

  return {
    amountCents,
    currency: text(raw.currency, 8).toUpperCase() || 'USD',
    externalKey,
    id,
    itemId: text(raw.itemId, 64) || null,
    occurredAt,
    orderId: text(raw.orderId, 180) || null,
    payoutId: text(raw.payoutId, 180) || null,
    reason: text(raw.reason, 500) || 'This synced eBay record needs a quick review before KeepFlip can finish posting it.',
    sourceType,
    status,
  };
}

async function executeBookkeepingFunction(
  xpath:
    | '/record'
    | '/overview'
    | '/ebay/sync'
    | '/review/list'
    | '/review/resolve',
  body: Record<string, unknown> = {},
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

export function isResellerBookkeepingConfigured() {
  return Boolean(APPWRITE.bookkeepingFunctionId);
}

/**
 * Keep the key with a draft/retry so a network retry cannot create a second
 * purchase, sale, fee, or payout.
 */
export function createBookkeepingIdempotencyKey(prefix = 'book') {
  const normalizedPrefix = prefix
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${normalizedPrefix || 'book'}-${ID.unique()}`;
}

export async function recordBookkeepingEvent(
  input: RecordBookkeepingEventInput,
): Promise<BookkeepingRecordResult> {
  const execution = await executeBookkeepingFunction('/record', input);
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not save that Books entry.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  const bookTransactionId = text(payload.bookTransactionId, 64);
  if (payload.ok !== true || !bookTransactionId) {
    throw new Error('The Books service did not confirm this entry.');
  }

  return {
    alreadyRecorded: payload.alreadyRecorded === true,
    bookTransactionId,
    needsItemCost: payload.needsItemCost === true,
  };
}

export async function getBookkeepingOverview(): Promise<BookkeepingOverviewResult> {
  const execution = await executeBookkeepingFunction('/overview');
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not load the Books overview.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  if (payload.ok !== true || !Array.isArray(payload.moneyEvents)) {
    throw new Error('The Books service returned an invalid overview.');
  }

  const moneyEvents = payload.moneyEvents.flatMap((raw): BookkeepingMoneyEvent[] => {
    const event = raw && typeof raw === 'object' ? (raw as FunctionPayload) : {};
    const direction = event.direction;
    const entryType = event.entryType;
    const amountCents = event.amountCents;
    const occurredAt = text(event.occurredAt, 64);
    const id = text(event.id, 64);
    const itemId = text(event.itemId, 64) || null;

    const validDirection = direction === 'income' || direction === 'expense';
    const validEntryType = [
      'inventory_purchase',
      'sale_proceeds',
      'marketplace_fee',
      'shipping_label',
      'refund',
      'repair_parts',
      'supplies',
      'software',
      'advertising',
      'storage',
      'mileage',
      'other_income',
      'other_expense',
    ].includes(String(entryType));

    if (!id || !occurredAt || !positiveInteger(amountCents) || !validDirection || !validEntryType) {
      return [];
    }

    return [
      {
        amountCents: Number(amountCents),
        direction,
        entryType: entryType as BookkeepingMoneyEvent['entryType'],
        id,
        itemId,
        occurredAt,
      },
    ];
  });

  return { moneyEvents, truncated: payload.truncated === true };
}

export async function getBookkeepingReviewQueue(): Promise<BookkeepingReviewQueueResult> {
  const execution = await executeBookkeepingFunction('/review/list');
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not load the money review queue.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  if (payload.ok !== true || !Array.isArray(payload.items)) {
    throw new Error('The Books service returned an invalid review queue.');
  }

  const items = payload.items.flatMap((raw) => {
    const item = reviewItem(raw);
    return item ? [item] : [];
  });

  return {
    items,
    total: count(payload.total) || items.length,
  };
}

export async function resolveBookkeepingReview(
  input: ResolveBookkeepingReviewInput,
): Promise<ResolveBookkeepingReviewResult> {
  const { environment = getEbayOAuthEnvironment(), ...review } = input;
  const execution = await executeBookkeepingFunction('/review/resolve', {
    ...review,
    environment,
  });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not finish that money review.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  const bookTransactionId = text(payload.bookTransactionId, 64);
  const status = text(payload.status, 40);
  if (
    payload.ok !== true ||
    !bookTransactionId ||
    !['posted', 'needs_item_cost', 'already_recorded'].includes(status)
  ) {
    throw new Error('The Books service did not confirm the reviewed sale.');
  }

  return {
    bookTransactionId,
    needsItemCost: payload.needsItemCost === true,
    status: status as ResolveBookkeepingReviewResult['status'],
  };
}

export async function syncEbayBookkeeping({
  environment = getEbayOAuthEnvironment(),
  startedAt,
}: {
  environment?: EbayOAuthEnvironment;
  startedAt?: string;
} = {}): Promise<EbayBookkeepingSyncResult> {
  const execution = await executeBookkeepingFunction('/ebay/sync', {
    environment,
    ...(startedAt ? { startedAt } : {}),
  });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not sync eBay financial activity.',
    );
  }

  const payload = parsePayload(execution.responseBody);
  const syncedFrom = text(payload.syncedFrom, 64);
  const syncedTo = text(payload.syncedTo, 64);
  if (payload.ok !== true || !syncedFrom || !syncedTo) {
    throw new Error('The eBay sync did not return a usable result.');
  }

  return {
    alreadyRecorded: count(payload.alreadyRecorded),
    needsItemCost: count(payload.needsItemCost),
    needsItemMatch: count(payload.needsItemMatch),
    needsReview: count(payload.needsReview),
    payoutCount: count(payload.payoutCount),
    posted: count(payload.posted),
    syncedFrom,
    syncedTo,
    transactionCount: count(payload.transactionCount),
  };
}
