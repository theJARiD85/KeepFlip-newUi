import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';

import type { InventoryItem } from '@/services/inventory-service';

export const RESELLER_LEDGER_ENTRY_TYPES = [
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
] as const;

export type ResellerLedgerEntryType =
  (typeof RESELLER_LEDGER_ENTRY_TYPES)[number];
export type ResellerLedgerDirection = 'income' | 'expense';
export type ResellerLedgerSource = 'manual' | 'ebay_import' | 'migration';

export type ResellerLedgerEntry = {
  id: string;
  ownerId: string;
  itemId: string | null;
  saleGroupId: string | null;
  entryType: ResellerLedgerEntryType;
  direction: ResellerLedgerDirection;
  amountCents: number;
  currency: string;
  occurredAt: string;
  channel: string | null;
  source: ResellerLedgerSource;
  externalId: string | null;
  notes: string | null;
  receiptFileId: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
};

export type CreateManualLedgerEntryInput = {
  amountCents: number;
  channel?: string | null;
  currency?: string;
  entryType: ResellerLedgerEntryType;
  itemId?: string | null;
  notes?: string | null;
  occurredAt: string;
  ownerId: string;
};

export type ResellerBooksSummary = {
  currentMonthExpensesCents: number;
  currentMonthIncomeCents: number;
  currentMonthNetCashCents: number;
  inventoryBasisCents: number;
  missingCostItemCount: number;
  realizedItemProfitCents: number;
  recordedEntryCount: number;
  unlinkedInventoryPurchaseCents: number;
  unlinkedSalesCount: number;
};

type LedgerRow = {
  $id: string;
  $createdAt?: string;
  ownerId: string;
  itemId?: string | null;
  saleGroupId?: string | null;
  entryType: string;
  direction: string;
  amountCents: number | null;
  currency?: string | null;
  occurredAt: string;
  channel?: string | null;
  source?: string | null;
  externalId?: string | null;
  notes?: string | null;
  receiptFileId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  voidedAt?: string | null;
};

const MAX_LEDGER_AMOUNT_CENTS = 1_000_000_000;
const LEDGER_PAGE_SIZE = 100;
const MAX_LEDGER_ROWS = 5_000;

const ENTRY_DETAILS: Record<
  ResellerLedgerEntryType,
  { direction: ResellerLedgerDirection; label: string; shortLabel: string }
> = {
  inventory_purchase: {
    direction: 'expense',
    label: 'Inventory purchase',
    shortLabel: 'Inventory cost',
  },
  sale_proceeds: {
    direction: 'income',
    label: 'Sale proceeds',
    shortLabel: 'Sale',
  },
  marketplace_fee: {
    direction: 'expense',
    label: 'Marketplace fee',
    shortLabel: 'Marketplace fee',
  },
  shipping_label: {
    direction: 'expense',
    label: 'Shipping label',
    shortLabel: 'Shipping',
  },
  refund: {
    direction: 'expense',
    label: 'Refund or return',
    shortLabel: 'Refund',
  },
  repair_parts: {
    direction: 'expense',
    label: 'Repair parts',
    shortLabel: 'Repair',
  },
  supplies: {
    direction: 'expense',
    label: 'Supplies',
    shortLabel: 'Supplies',
  },
  software: {
    direction: 'expense',
    label: 'Software or subscription',
    shortLabel: 'Software',
  },
  advertising: {
    direction: 'expense',
    label: 'Advertising or promotion',
    shortLabel: 'Advertising',
  },
  storage: {
    direction: 'expense',
    label: 'Storage',
    shortLabel: 'Storage',
  },
  mileage: {
    direction: 'expense',
    label: 'Mileage or travel',
    shortLabel: 'Mileage',
  },
  other_income: {
    direction: 'income',
    label: 'Other income',
    shortLabel: 'Other income',
  },
  other_expense: {
    direction: 'expense',
    label: 'Other business expense',
    shortLabel: 'Other expense',
  },
};

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function cleanText(value: string | null | undefined, maximumLength: number) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function normalizedCurrency(value: string | null | undefined) {
  const cleaned = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(cleaned ?? '') ? cleaned! : 'USD';
}

function isLedgerEntryType(value: string): value is ResellerLedgerEntryType {
  return (RESELLER_LEDGER_ENTRY_TYPES as readonly string[]).includes(value);
}

function isLedgerDirection(value: string): value is ResellerLedgerDirection {
  return value === 'income' || value === 'expense';
}

function isLedgerSource(value: string): value is ResellerLedgerSource {
  return value === 'manual' || value === 'ebay_import' || value === 'migration';
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function rowToLedgerEntry(row: LedgerRow): ResellerLedgerEntry {
  const entryType = isLedgerEntryType(row.entryType)
    ? row.entryType
    : 'other_expense';
  const amountCents = Number(row.amountCents);
  const source = row.source ?? '';

  return {
    id: row.$id,
    ownerId: row.ownerId,
    itemId: cleanText(row.itemId, 36),
    saleGroupId: cleanText(row.saleGroupId, 36),
    entryType,
    direction: isLedgerDirection(row.direction)
      ? row.direction
      : ENTRY_DETAILS[entryType].direction,
    amountCents:
      Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : 0,
    currency: normalizedCurrency(row.currency),
    occurredAt: validDate(row.occurredAt) ?? row.$createdAt ?? new Date(0).toISOString(),
    channel: cleanText(row.channel, 64),
    source: isLedgerSource(source) ? source : 'manual',
    externalId: cleanText(row.externalId, 160),
    notes: cleanText(row.notes, 2_000),
    receiptFileId: cleanText(row.receiptFileId, 36),
    createdAt: validDate(row.createdAt ?? '') ?? row.$createdAt ?? new Date(0).toISOString(),
    updatedAt: validDate(row.updatedAt ?? '') ?? row.$createdAt ?? new Date(0).toISOString(),
    voidedAt: validDate(row.voidedAt ?? ''),
  };
}

function assertLedgerConfigured() {
  if (!APPWRITE.databaseId || !APPWRITE.ledgerEntriesTableId) {
    throw new ResellerBooksSetupError();
  }
}

function entryIsActive(entry: ResellerLedgerEntry) {
  return !entry.voidedAt && entry.currency === 'USD' && entry.amountCents > 0;
}

function inCurrentMonth(value: string, now: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  );
}

function centsForEntryType(
  entries: ResellerLedgerEntry[],
  entryType: ResellerLedgerEntryType,
  itemId: string,
) {
  return entries.reduce(
    (total, entry) =>
      entryIsActive(entry) && entry.entryType === entryType && entry.itemId === itemId
        ? total + entry.amountCents
        : total,
    0,
  );
}

function itemRelatedExpenseCents(entries: ResellerLedgerEntry[], itemId: string) {
  return entries.reduce((total, entry) => {
    if (!entryIsActive(entry) || entry.itemId !== itemId || entry.direction !== 'expense') {
      return total;
    }

    return entry.entryType === 'inventory_purchase'
      ? total
      : total + entry.amountCents;
  }, 0);
}

export class ResellerBooksSetupError extends Error {
  constructor() {
    super(
      'Books needs its private Appwrite ledger table before transactions can be recorded.',
    );
    this.name = 'ResellerBooksSetupError';
  }
}

export function isResellerBooksSetupError(error: unknown) {
  return error instanceof ResellerBooksSetupError;
}

export function isResellerBooksConfigured() {
  return Boolean(APPWRITE.databaseId && APPWRITE.ledgerEntriesTableId);
}

export function ledgerEntryDetails(entryType: ResellerLedgerEntryType) {
  return ENTRY_DETAILS[entryType];
}

export function todayBusinessDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLedgerDate(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const date = new Date(`${normalized}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== normalized) return null;
  return date.toISOString();
}

export function centsFromLedgerAmount(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const dollars = Number(whole);
  const cents = Number(`${fraction}00`.slice(0, 2));
  const amountCents = dollars * 100 + cents;

  return Number.isSafeInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= MAX_LEDGER_AMOUNT_CENTS
    ? amountCents
    : null;
}

export async function listResellerLedgerEntries(ownerId: string) {
  assertLedgerConfigured();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return [];

  const entries: ResellerLedgerEntry[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let useDatabaseOrdering = true;

  while (entries.length < total && entries.length < MAX_LEDGER_ROWS) {
    const baseQueries = [
      Query.equal('ownerId', [cleanOwnerId]),
      Query.limit(LEDGER_PAGE_SIZE),
      Query.offset(offset),
    ];
    const queries = useDatabaseOrdering
      ? [Query.orderDesc('occurredAt'), ...baseQueries]
      : baseQueries;

    try {
      const response = (await tablesDB.listRows({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.ledgerEntriesTableId,
        queries,
      })) as unknown as { rows: LedgerRow[]; total: number };
      const page = response.rows.map(rowToLedgerEntry);
      entries.push(...page);
      total = Math.min(response.total, MAX_LEDGER_ROWS);

      if (page.length < LEDGER_PAGE_SIZE) break;
      offset += page.length;
    } catch (error) {
      if (useDatabaseOrdering) {
        useDatabaseOrdering = false;
        continue;
      }
      throw error;
    }
  }

  return entries.sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
}

export async function createManualLedgerEntry({
  amountCents,
  channel,
  currency = 'USD',
  entryType,
  itemId,
  notes,
  occurredAt,
  ownerId,
}: CreateManualLedgerEntryInput) {
  assertLedgerConfigured();
  const cleanOwnerId = ownerId.trim();
  const cleanDate = validDate(occurredAt);

  if (!cleanOwnerId) throw new Error('Sign in before recording a transaction.');
  if (!isLedgerEntryType(entryType)) throw new Error('Choose a valid transaction type.');
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_LEDGER_AMOUNT_CENTS
  ) {
    throw new Error('Enter an amount between $0.01 and $10,000,000.00.');
  }
  if (!cleanDate) throw new Error('Enter a valid transaction date.');

  const now = new Date().toISOString();
  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.ledgerEntriesTableId,
    rowId: ID.unique(),
    data: {
      ownerId: cleanOwnerId,
      itemId: cleanText(itemId, 36),
      saleGroupId: null,
      entryType,
      direction: ENTRY_DETAILS[entryType].direction,
      amountCents,
      currency: normalizedCurrency(currency),
      occurredAt: cleanDate,
      channel: cleanText(channel, 64),
      source: 'manual',
      externalId: null,
      notes: cleanText(notes, 2_000),
      receiptFileId: null,
      createdAt: now,
      updatedAt: now,
      voidedAt: null,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as LedgerRow;

  return rowToLedgerEntry(created);
}

export function summarizeResellerBooks({
  entries,
  inventory,
  now = new Date(),
}: {
  entries: ResellerLedgerEntry[];
  inventory: InventoryItem[];
  now?: Date;
}): ResellerBooksSummary {
  const activeEntries = entries.filter(entryIsActive);
  const currentMonthEntries = activeEntries.filter((entry) =>
    inCurrentMonth(entry.occurredAt, now),
  );
  const currentMonthIncomeCents = currentMonthEntries.reduce(
    (total, entry) =>
      entry.direction === 'income' ? total + entry.amountCents : total,
    0,
  );
  const currentMonthExpensesCents = currentMonthEntries.reduce(
    (total, entry) =>
      entry.direction === 'expense' ? total + entry.amountCents : total,
    0,
  );
  const saleItemIds = new Set(
    activeEntries
      .filter(
        (entry) => entry.entryType === 'sale_proceeds' && Boolean(entry.itemId),
      )
      .map((entry) => entry.itemId!),
  );
  const purchasesByItem = new Map<string, number>();
  let unlinkedInventoryPurchaseCents = 0;

  activeEntries
    .filter((entry) => entry.entryType === 'inventory_purchase')
    .forEach((entry) => {
      if (!entry.itemId) {
        unlinkedInventoryPurchaseCents += entry.amountCents;
        return;
      }
      purchasesByItem.set(
        entry.itemId,
        (purchasesByItem.get(entry.itemId) ?? 0) + entry.amountCents,
      );
    });

  let inventoryBasisCents = 0;
  let missingCostItemCount = 0;
  inventory.forEach((item) => {
    if (saleItemIds.has(item.id)) return;

    const ledgerPurchaseCents = purchasesByItem.get(item.id) ?? 0;
    if (ledgerPurchaseCents > 0) {
      inventoryBasisCents += ledgerPurchaseCents;
      return;
    }

    if (item.acquisitionCost != null && item.acquisitionCost > 0) {
      inventoryBasisCents += Math.round(item.acquisitionCost * 100);
      return;
    }

    missingCostItemCount += 1;
  });

  let realizedItemProfitCents = 0;
  let unlinkedSalesCount = 0;
  currentMonthEntries
    .filter((entry) => entry.entryType === 'sale_proceeds')
    .forEach((sale) => {
      if (!sale.itemId) {
        unlinkedSalesCount += 1;
        return;
      }

      const inventoryItem = inventory.find((item) => item.id === sale.itemId);
      const recordedPurchaseCents = centsForEntryType(
        activeEntries,
        'inventory_purchase',
        sale.itemId,
      );
      const legacyPurchaseCents =
        recordedPurchaseCents === 0 && inventoryItem?.acquisitionCost != null
          ? Math.round(inventoryItem.acquisitionCost * 100)
          : 0;

      realizedItemProfitCents +=
        sale.amountCents -
        recordedPurchaseCents -
        legacyPurchaseCents -
        itemRelatedExpenseCents(activeEntries, sale.itemId);
    });

  return {
    currentMonthExpensesCents,
    currentMonthIncomeCents,
    currentMonthNetCashCents:
      currentMonthIncomeCents - currentMonthExpensesCents,
    inventoryBasisCents,
    missingCostItemCount,
    realizedItemProfitCents,
    recordedEntryCount: activeEntries.length,
    unlinkedInventoryPurchaseCents,
    unlinkedSalesCount,
  };
}

function csvValue(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : value;
}

export function buildResellerLedgerCsv(
  entries: ResellerLedgerEntry[],
  inventory: InventoryItem[],
) {
  const inventoryNames = new Map(inventory.map((item) => [item.id, item.title]));
  const rows = [
    [
      'Date',
      'Direction',
      'Entry type',
      'Amount',
      'Currency',
      'Channel',
      'Item',
      'Item ID',
      'Source',
      'Notes',
      'Entry ID',
    ],
    ...entries.map((entry) => [
      csvDate(entry.occurredAt),
      entry.direction,
      ledgerEntryDetails(entry.entryType).label,
      (entry.amountCents / 100).toFixed(2),
      entry.currency,
      entry.channel,
      entry.itemId ? inventoryNames.get(entry.itemId) ?? '' : '',
      entry.itemId,
      entry.source,
      entry.notes,
      entry.id,
    ]),
  ];

  return `${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}\r\n`;
}
