import {
  APPWRITE,
  ExecutionMethod,
  ID,
  Permission,
  Query,
  Role,
  functions,
  tablesDB,
} from '@/lib/appwrite';
import {
  recordBookkeepingEvent,
  type BookkeepingRecordResult,
} from '@/services/reseller-bookkeeping-service';
import {
  getEbayOAuthEnvironment,
  type EbayOAuthEnvironment,
} from '@/services/ebayConnectionService';
import type { InventoryItem } from '@/services/inventory-service';

export type SellerOrderChannel = 'manual' | 'ebay';
export type SellerFulfillmentStatus =
  | 'unfulfilled'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'unknown';

export type SellerOrder = {
  id: string;
  ownerId: string;
  sourceItemId: string | null;
  channel: SellerOrderChannel;
  externalOrderId: string | null;
  externalOrderKey: string | null;
  externalListingId: string | null;
  sellerSku: string | null;
  title: string;
  quantity: number;
  soldPriceCents: number | null;
  listPriceCents: number | null;
  feesCents: number | null;
  shippingExpenseCents: number | null;
  refundCents: number | null;
  payoutCents: number | null;
  shipBy: string | null;
  fulfillmentStatus: SellerFulfillmentStatus;
  paymentStatus: string | null;
  trackingNumber: string | null;
  shippingCarrierCode: string | null;
  packingNotes: string | null;
  soldAt: string | null;
  lastSyncedAt: string | null;
  syncStatus: 'manual' | 'current' | 'needs_review';
  createdAt: string;
  updatedAt: string;
};

export type CreateManualSellerOrderInput = {
  ownerId: string;
  sourceItemId: string;
  title: string;
  quantity?: number;
  soldPriceCents: number;
  listPriceCents?: number | null;
  feesCents?: number | null;
  shippingExpenseCents?: number | null;
  refundCents?: number | null;
  payoutCents?: number | null;
  shipBy?: string | null;
  soldAt: string;
  packingNotes?: string | null;
};

type SellerOrderRow = {
  $id: string;
  $createdAt?: string;
  ownerId: string;
  sourceItemId?: string | null;
  channel?: string | null;
  externalOrderId?: string | null;
  externalOrderKey?: string | null;
  externalListingId?: string | null;
  sellerSku?: string | null;
  title?: string | null;
  quantity?: number | null;
  soldPriceCents?: number | null;
  listPriceCents?: number | null;
  feesCents?: number | null;
  shippingExpenseCents?: number | null;
  refundCents?: number | null;
  payoutCents?: number | null;
  shipBy?: string | null;
  fulfillmentStatus?: string | null;
  paymentStatus?: string | null;
  trackingNumber?: string | null;
  shippingCarrierCode?: string | null;
  packingNotes?: string | null;
  soldAt?: string | null;
  lastSyncedAt?: string | null;
  syncStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type EbaySellerOrderMoney = {
  amountCents: number;
  currency: string;
};

export type EbaySellerOrderLine = {
  externalLineKey: string;
  lineItemId: string;
  listingId: string | null;
  sku: string | null;
  itemId: string | null;
  matchStatus: 'matched' | 'unmatched';
  title: string | null;
  quantity: number | null;
  fulfillmentStatus: string | null;
  sale: EbaySellerOrderMoney | null;
  total: EbaySellerOrderMoney | null;
  shipBy: string | null;
};

export type EbaySellerOrder = {
  channel: 'ebay';
  environment: EbayOAuthEnvironment;
  externalOrderKey: string;
  externalRevision: string | null;
  orderId: string;
  soldAt: string | null;
  shipBy: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  cancelStatus: string | null;
  currency: string | null;
  sale: EbaySellerOrderMoney | null;
  shippingCharged: EbaySellerOrderMoney | null;
  total: EbaySellerOrderMoney | null;
  feesCents: number | null;
  refundsCents: number | null;
  payoutCents: number | null;
  reconciliationStatus: string;
  lineItems: EbaySellerOrderLine[];
};

export type EbayOrderPage = {
  orders: EbaySellerOrder[];
  nextCursor: {
    offset: number;
    limit: number;
    modifiedSince?: string;
    modifiedUntil?: string;
  } | null;
};

function cleanText(value: unknown, maximum = 2_000) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : null;
}

function nonNegativeMoney(value: unknown, required = false) {
  if (value == null && !required) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000_000) {
    throw new Error('Money amounts must be whole cents from $0.00 through $10,000,000.00.');
  }
  return Number(value);
}

function positiveQuantity(value: unknown) {
  const quantity = value == null ? 1 : Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
    throw new Error('Quantity must be a whole number from 1 through 100,000.');
  }
  return quantity;
}

function isoDate(value: unknown, label: string, required = false) {
  const text = cleanText(value, 80);
  if (!text && !required) return null;
  if (!text || !Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} must be a valid date.`);
  }
  return new Date(text).toISOString();
}

function normalizedStatus(value: unknown): SellerFulfillmentStatus {
  const status = String(value || '').toLowerCase();
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('deliver')) return 'delivered';
  if (status.includes('ship') || status.includes('fulfill')) return 'shipped';
  if (status.includes('ready')) return 'ready_to_ship';
  if (status.includes('unfulfill') || status.includes('not_started')) return 'unfulfilled';
  return 'unknown';
}

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function rowToOrder(row: SellerOrderRow): SellerOrder {
  return {
    id: row.$id,
    ownerId: row.ownerId,
    sourceItemId: cleanText(row.sourceItemId, 64),
    channel: row.channel === 'ebay' ? 'ebay' : 'manual',
    externalOrderId: cleanText(row.externalOrderId, 180),
    externalOrderKey: cleanText(row.externalOrderKey, 180),
    externalListingId: cleanText(row.externalListingId, 180),
    sellerSku: cleanText(row.sellerSku, 120),
    title: cleanText(row.title, 500) || 'Sold item',
    quantity: positiveQuantity(row.quantity),
    soldPriceCents: nonNegativeMoney(row.soldPriceCents),
    listPriceCents: nonNegativeMoney(row.listPriceCents),
    feesCents: nonNegativeMoney(row.feesCents),
    shippingExpenseCents: nonNegativeMoney(row.shippingExpenseCents),
    refundCents: nonNegativeMoney(row.refundCents),
    payoutCents: nonNegativeMoney(row.payoutCents),
    shipBy: isoDate(row.shipBy, 'Ship-by date'),
    fulfillmentStatus: normalizedStatus(row.fulfillmentStatus),
    paymentStatus: cleanText(row.paymentStatus, 64),
    trackingNumber: cleanText(row.trackingNumber, 120),
    shippingCarrierCode: cleanText(row.shippingCarrierCode, 100),
    packingNotes: cleanText(row.packingNotes, 2_000),
    soldAt: isoDate(row.soldAt, 'Sold date'),
    lastSyncedAt: isoDate(row.lastSyncedAt, 'Last sync'),
    syncStatus:
      row.syncStatus === 'current' || row.syncStatus === 'needs_review'
        ? row.syncStatus
        : 'manual',
    createdAt:
      isoDate(row.createdAt || row.$createdAt, 'Created date') ||
      new Date().toISOString(),
    updatedAt:
      isoDate(row.updatedAt, 'Updated date') ||
      isoDate(row.createdAt || row.$createdAt, 'Created date') ||
      new Date().toISOString(),
  };
}

function assertManualOrdersConfigured() {
  if (!APPWRITE.databaseId || !APPWRITE.sellerOrdersTableId) {
    throw new Error(
      'Manual order tracking needs EXPO_PUBLIC_APPWRITE_SELLER_ORDERS_TABLE_ID in this build.',
    );
  }
}

export async function listManualSellerOrders(ownerId: string) {
  assertManualOrdersConfigured();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return [];

  const response = (await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sellerOrdersTableId,
    queries: [
      Query.equal('ownerId', [cleanOwnerId]),
      Query.orderDesc('soldAt'),
      Query.limit(250),
    ],
  })) as unknown as { rows: SellerOrderRow[] };

  return response.rows.map(rowToOrder);
}

export async function createManualSellerOrder(
  input: CreateManualSellerOrderInput,
): Promise<SellerOrder> {
  assertManualOrdersConfigured();
  const ownerId = input.ownerId.trim();
  const sourceItemId = input.sourceItemId.trim();
  const title = cleanText(input.title, 500);
  if (!ownerId) throw new Error('Sign in before recording a sale.');
  if (!sourceItemId) throw new Error('Choose the exact inventory item that sold.');
  if (!title) throw new Error('The sold item needs a title.');

  const now = new Date().toISOString();
  const data = {
    ownerId,
    sourceItemId,
    channel: 'manual',
    externalOrderId: null,
    externalOrderKey: null,
    externalListingId: null,
    sellerSku: null,
    title,
    quantity: positiveQuantity(input.quantity),
    soldPriceCents: nonNegativeMoney(input.soldPriceCents, true),
    listPriceCents: nonNegativeMoney(input.listPriceCents),
    feesCents: nonNegativeMoney(input.feesCents) ?? 0,
    shippingExpenseCents: nonNegativeMoney(input.shippingExpenseCents) ?? 0,
    refundCents: nonNegativeMoney(input.refundCents) ?? 0,
    payoutCents: nonNegativeMoney(input.payoutCents),
    shipBy: isoDate(input.shipBy, 'Ship-by date'),
    fulfillmentStatus: 'unfulfilled',
    paymentStatus: 'manual',
    trackingNumber: null,
    shippingCarrierCode: null,
    packingNotes: cleanText(input.packingNotes, 2_000),
    soldAt: isoDate(input.soldAt, 'Sold date', true),
    lastSyncedAt: null,
    syncStatus: 'manual',
    createdAt: now,
    updatedAt: now,
  };

  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sellerOrdersTableId,
    rowId: ID.unique(),
    data,
    permissions: ownerPermissions(ownerId),
  })) as unknown as SellerOrderRow;

  return rowToOrder(created);
}

export async function markManualSellerOrderShipped({
  ownerId,
  orderId,
  trackingNumber,
  shippingCarrierCode,
}: {
  ownerId: string;
  orderId: string;
  trackingNumber?: string | null;
  shippingCarrierCode?: string | null;
}) {
  assertManualOrdersConfigured();
  const existing = (await tablesDB.getRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sellerOrdersTableId,
    rowId: orderId,
  })) as unknown as SellerOrderRow;
  if (existing.ownerId !== ownerId) throw new Error('That order is not available to this account.');

  const updated = (await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.sellerOrdersTableId,
    rowId: orderId,
    data: {
      fulfillmentStatus: 'shipped',
      trackingNumber: cleanText(trackingNumber, 120),
      shippingCarrierCode: cleanText(shippingCarrierCode, 100),
      updatedAt: new Date().toISOString(),
    },
  })) as unknown as SellerOrderRow;
  return rowToOrder(updated);
}

function parseExecutionPayload(body: string | undefined) {
  try {
    const value: unknown = JSON.parse(body || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    throw new Error('The eBay order response could not be read.');
  }
}

async function executeEbayOrderRoute(
  xpath: '/orders' | '/orders/ship',
  body: Record<string, unknown>,
) {
  if (!APPWRITE.ebayOauthFunctionId) {
    throw new Error('Connect the eBay seller backend before using order automation.');
  }
  const execution = await functions.createExecution({
    functionId: APPWRITE.ebayOauthFunctionId,
    async: false,
    method: ExecutionMethod.POST,
    xpath,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = parseExecutionPayload(execution.responseBody);
  if (
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300 ||
    payload.ok !== true
  ) {
    const error =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : 'KeepFlip could not complete the eBay order request.';
    throw new Error(error);
  }
  return payload;
}

function parseMoney(value: unknown): EbaySellerOrderMoney | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (
    !record ||
    !Number.isSafeInteger(record.amountCents) ||
    Number(record.amountCents) < 0 ||
    typeof record.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(record.currency)
  ) {
    return null;
  }
  return { amountCents: Number(record.amountCents), currency: record.currency };
}

function parseEbayOrder(value: unknown): EbaySellerOrder | null {
  const order =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!order || order.channel !== 'ebay') return null;
  const orderId = cleanText(order.orderId, 180);
  const externalOrderKey = cleanText(order.externalOrderKey, 180);
  const environment =
    order.environment === 'production' || order.environment === 'sandbox'
      ? order.environment
      : null;
  if (!orderId || !externalOrderKey || !environment || !Array.isArray(order.lineItems)) {
    return null;
  }

  const lineItems = order.lineItems.flatMap((value): EbaySellerOrderLine[] => {
    const line =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const lineItemId = cleanText(line?.lineItemId, 180);
    const externalLineKey = cleanText(line?.externalLineKey, 255);
    if (!line || !lineItemId || !externalLineKey) return [];
    return [{
      externalLineKey,
      lineItemId,
      listingId: cleanText(line.listingId, 180),
      sku: cleanText(line.sku, 120),
      itemId: cleanText(line.itemId, 64),
      matchStatus: line.matchStatus === 'matched' ? 'matched' : 'unmatched',
      title: cleanText(line.title, 500),
      quantity: Number.isSafeInteger(line.quantity) && Number(line.quantity) >= 0
        ? Number(line.quantity)
        : null,
      fulfillmentStatus: cleanText(line.fulfillmentStatus, 80),
      sale: parseMoney(line.sale),
      total: parseMoney(line.total),
      shipBy: isoDate(line.shipBy, 'Ship-by date'),
    }];
  });

  return {
    channel: 'ebay',
    environment,
    externalOrderKey,
    externalRevision: isoDate(order.externalRevision, 'External revision'),
    orderId,
    soldAt: isoDate(order.soldAt, 'Sold date'),
    shipBy: isoDate(order.shipBy, 'Ship-by date'),
    paymentStatus: cleanText(order.paymentStatus, 80),
    fulfillmentStatus: cleanText(order.fulfillmentStatus, 80),
    cancelStatus: cleanText(order.cancelStatus, 80),
    currency: cleanText(order.currency, 3),
    sale: parseMoney(order.sale),
    shippingCharged: parseMoney(order.shippingCharged),
    total: parseMoney(order.total),
    feesCents: nonNegativeMoney(order.feesCents),
    refundsCents: nonNegativeMoney(order.refundsCents),
    payoutCents: nonNegativeMoney(order.payoutCents),
    reconciliationStatus: cleanText(order.reconciliationStatus, 80) || 'unreconciled',
    lineItems,
  };
}

export async function fetchEbaySellerOrders({
  environment = getEbayOAuthEnvironment(),
  limit = 50,
  offset = 0,
  modifiedSince,
  modifiedUntil,
}: {
  environment?: EbayOAuthEnvironment;
  limit?: number;
  offset?: number;
  modifiedSince?: string;
  modifiedUntil?: string;
} = {}): Promise<EbayOrderPage> {
  const payload = await executeEbayOrderRoute('/orders', {
    environment,
    limit,
    offset,
    ...(modifiedSince ? { modifiedSince } : {}),
    ...(modifiedUntil ? { modifiedUntil } : {}),
  });
  if (!Array.isArray(payload.orders)) {
    throw new Error('The eBay order response did not contain an order list.');
  }
  const orders = payload.orders
    .map(parseEbayOrder)
    .filter((order): order is EbaySellerOrder => order !== null);

  const cursor =
    payload.nextCursor &&
    typeof payload.nextCursor === 'object' &&
    !Array.isArray(payload.nextCursor)
      ? (payload.nextCursor as Record<string, unknown>)
      : null;
  const nextCursor =
    cursor &&
    Number.isSafeInteger(cursor.offset) &&
    Number.isSafeInteger(cursor.limit)
      ? {
          offset: Number(cursor.offset),
          limit: Number(cursor.limit),
          ...(typeof cursor.modifiedSince === 'string'
            ? { modifiedSince: cursor.modifiedSince }
            : {}),
          ...(typeof cursor.modifiedUntil === 'string'
            ? { modifiedUntil: cursor.modifiedUntil }
            : {}),
        }
      : null;

  return { orders, nextCursor };
}

export async function markEbaySellerOrderShipped({
  environment = getEbayOAuthEnvironment(),
  orderId,
  trackingNumber,
  shippingCarrierCode,
  lineItems,
}: {
  environment?: EbayOAuthEnvironment;
  orderId: string;
  trackingNumber: string;
  shippingCarrierCode: string;
  lineItems: { lineItemId: string; quantity: number }[];
}) {
  return executeEbayOrderRoute('/orders/ship', {
    environment,
    orderId,
    trackingNumber,
    shippingCarrierCode,
    lineItems,
  });
}

export function matchEbayOrderLinesToInventory(
  orders: EbaySellerOrder[],
  inventory: InventoryItem[],
): EbaySellerOrder[] {
  const bySku = new Map<string, InventoryItem>();
  const byListing = new Map<string, InventoryItem>();
  inventory.forEach((item) => {
    for (const sku of [item.sku, item.ebaySku]) {
      if (sku?.trim()) bySku.set(sku.trim().toLowerCase(), item);
    }
    if (item.externalListingId?.trim()) {
      byListing.set(item.externalListingId.trim(), item);
    }
    if (item.ebayListingId?.trim()) {
      byListing.set(item.ebayListingId.trim(), item);
    }
  });

  return orders.map((order) => ({
    ...order,
    lineItems: order.lineItems.map((line) => {
      const matched =
        (line.sku ? bySku.get(line.sku.toLowerCase()) : null) ||
        (line.listingId ? byListing.get(line.listingId) : null) ||
        null;
      return matched
        ? { ...line, itemId: matched.id, matchStatus: 'matched' as const }
        : { ...line, itemId: null, matchStatus: 'unmatched' as const };
    }),
  }));
}

export async function postSellerOrderToBooks(
  order: SellerOrder,
): Promise<BookkeepingRecordResult[]> {
  if (!order.sourceItemId || order.soldPriceCents === null || !order.soldAt) {
    throw new Error('Link the order to an item and enter its sold amount before reconciling Books.');
  }

  const base = `seller-order:${order.id}`;
  const results: BookkeepingRecordResult[] = [];
  results.push(
    await recordBookkeepingEvent({
      eventType: 'sale',
      idempotencyKey: `${base}:sale`,
      occurredAt: order.soldAt,
      amountCents: order.soldPriceCents,
      grossSaleCents: order.soldPriceCents,
      feeCents: order.feesCents ?? 0,
      itemId: order.sourceItemId,
      quantity: order.quantity,
      orderId: order.externalOrderId || order.id,
      summary: order.title,
    }),
  );

  if ((order.shippingExpenseCents ?? 0) > 0) {
    results.push(
      await recordBookkeepingEvent({
        eventType: 'shipping_label',
        idempotencyKey: `${base}:shipping`,
        occurredAt: order.soldAt,
        amountCents: order.shippingExpenseCents!,
        itemId: order.sourceItemId,
        orderId: order.externalOrderId || order.id,
      }),
    );
  }

  if ((order.refundCents ?? 0) > 0) {
    results.push(
      await recordBookkeepingEvent({
        eventType: 'refund',
        idempotencyKey: `${base}:refund`,
        occurredAt: order.soldAt,
        amountCents: order.refundCents!,
        itemId: order.sourceItemId,
        orderId: order.externalOrderId || order.id,
      }),
    );
  }

  if ((order.payoutCents ?? 0) > 0) {
    results.push(
      await recordBookkeepingEvent({
        eventType: 'payout',
        idempotencyKey: `${base}:payout`,
        occurredAt: order.soldAt,
        amountCents: order.payoutCents!,
        itemId: order.sourceItemId,
        orderId: order.externalOrderId || order.id,
      }),
    );
  }

  return results;
}
