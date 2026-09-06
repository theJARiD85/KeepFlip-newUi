import type { InventoryItem } from '@/services/inventory-service';
import type {
  ResellerLedgerDirection,
  ResellerLedgerEntry,
  ResellerLedgerEntryType,
} from '@/services/reseller-ledger-service';

const DISPLAY_MONTH_COUNT = 6;

const EXPENSE_LABELS: Partial<Record<ResellerLedgerEntryType, string>> = {
  inventory_purchase: 'New inventory',
  marketplace_fee: 'Marketplace fees',
  shipping_label: 'Shipping',
  refund: 'Refunds',
  repair_parts: 'Repairs',
  supplies: 'Supplies',
  software: 'Software',
  advertising: 'Promotion',
  storage: 'Storage',
  mileage: 'Travel',
  other_expense: 'Other costs',
};

export type BusinessMoneyFlowMonth = {
  key: string;
  label: string;
  moneyInCents: number;
  moneyOutCents: number;
};

export type BusinessMoneyFlowGranularity = 'days' | 'weeks' | 'months';

export type BusinessMoneyFlowEntry = {
  occurredAt: string;
  direction: ResellerLedgerDirection;
  amountCents: number;
};

export type BusinessMoneyFlowBucket = BusinessMoneyFlowMonth;

export type BusinessMoneyFlowRangeOption = {
  count: number;
  label: string;
  shortLabel: string;
};

const MONEY_FLOW_RANGE_OPTIONS: Record<
  BusinessMoneyFlowGranularity,
  BusinessMoneyFlowRangeOption[]
> = {
  days: [
    { count: 7, label: 'Last 7 days', shortLabel: '7D' },
    { count: 14, label: 'Last 14 days', shortLabel: '14D' },
    { count: 30, label: 'Last 30 days', shortLabel: '30D' },
  ],
  weeks: [
    { count: 4, label: 'Last 4 weeks', shortLabel: '4W' },
    { count: 8, label: 'Last 8 weeks', shortLabel: '8W' },
    { count: 12, label: 'Last 12 weeks', shortLabel: '12W' },
    { count: 26, label: 'Last 6 months', shortLabel: '26W' },
  ],
  months: [
    { count: 6, label: 'Last 6 months', shortLabel: '6M' },
    { count: 12, label: 'Last 12 months', shortLabel: '12M' },
    { count: 24, label: 'Last 2 years', shortLabel: '24M' },
  ],
};

export type BusinessCostBreakdown = {
  entryType: ResellerLedgerEntryType;
  label: string;
  amountCents: number;
};

export type ResellerBusinessOverview = {
  currentMonth: {
    moneyInCents: number;
    moneyOutCents: number;
    leftAfterCostsCents: number;
  };
  inventory: {
    onHandCount: number;
    readyToFlipCount: number;
    keepCount: number;
    undecidedCount: number;
    knownCostCount: number;
    missingCostCount: number;
    cashTiedUpCents: number;
    estimatedOnHandValueCents: number;
  };
  attention: {
    unlinkedSaleCount: number;
    unlinkedInventoryCostCents: number;
  };
  firstTransactionAt: string | null;
  moneyFlowEntries: BusinessMoneyFlowEntry[];
  moneyFlow: BusinessMoneyFlowMonth[];
  topCostsThisMonth: BusinessCostBreakdown[];
  recordedMoneyEventCount: number;
};

function amountToCents(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0;

  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

function entryHasUsableMoney(entry: ResellerLedgerEntry) {
  return (
    !entry.voidedAt &&
    entry.currency === 'USD' &&
    Number.isSafeInteger(entry.amountCents) &&
    entry.amountCents > 0 &&
    Number.isFinite(new Date(entry.occurredAt).getTime())
  );
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonths(now: Date) {
  return Array.from({ length: DISPLAY_MONTH_COUNT }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (DISPLAY_MONTH_COUNT - 1 - index), 1);

    return {
      key: monthKey(date),
      label: date.toLocaleDateString(undefined, { month: 'short' }),
    };
  });
}

function expenseLabel(entryType: ResellerLedgerEntryType) {
  return EXPENSE_LABELS[entryType] ?? 'Other costs';
}

export function moneyFlowRangeOptions(
  granularity: BusinessMoneyFlowGranularity,
) {
  return MONEY_FLOW_RANGE_OPTIONS[granularity];
}

export function getDefaultMoneyFlowGranularity(
  firstTransactionAt: string | null,
  now = new Date(),
): BusinessMoneyFlowGranularity {
  if (!firstTransactionAt) return 'days';

  const firstTransaction = new Date(firstTransactionAt);
  if (!Number.isFinite(firstTransaction.getTime())) return 'days';

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  if (firstTransaction <= sixMonthsAgo) return 'months';
  if (firstTransaction <= thirtyDaysAgo) return 'weeks';
  return 'days';
}

export function getDefaultMoneyFlowRange(
  granularity: BusinessMoneyFlowGranularity,
  firstTransactionAt: string | null,
  now = new Date(),
) {
  const firstTransaction = firstTransactionAt
    ? new Date(firstTransactionAt)
    : null;
  const ageDays =
    firstTransaction && Number.isFinite(firstTransaction.getTime())
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - firstTransaction.getTime()) / 86_400_000,
          ),
        )
      : 0;

  if (granularity === 'days') {
    if (ageDays <= 7) return 7;
    if (ageDays <= 14) return 14;
    return 30;
  }

  if (granularity === 'weeks') return ageDays <= 90 ? 12 : 26;
  return ageDays <= 365 ? 6 : 12;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addFlowPeriods(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
  count: number,
) {
  const result = new Date(date);
  if (granularity === 'days') result.setDate(result.getDate() + count);
  else if (granularity === 'weeks') result.setDate(result.getDate() + count * 7);
  else result.setMonth(result.getMonth() + count);
  return result;
}

function flowPeriodStart(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
) {
  if (granularity === 'days') return startOfDay(date);
  if (granularity === 'weeks') return startOfWeek(date);
  return startOfMonth(date);
}

function flowPeriodKey(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
) {
  return granularity === 'months' ? monthKey(date) : dayKey(date);
}

function flowPeriodLabel(
  date: Date,
  granularity: BusinessMoneyFlowGranularity,
  bucketCount: number,
) {
  if (granularity === 'days') {
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'numeric',
    });
  }

  if (granularity === 'weeks') {
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    ...(bucketCount > 12 ? { year: '2-digit' } : {}),
  });
}

export function buildMoneyFlowBuckets({
  entries,
  granularity,
  bucketCount,
  now = new Date(),
}: {
  entries: BusinessMoneyFlowEntry[];
  granularity: BusinessMoneyFlowGranularity;
  bucketCount: number;
  now?: Date;
}): BusinessMoneyFlowBucket[] {
  const maximumBuckets =
    granularity === 'days' ? 30 : granularity === 'weeks' ? 26 : 24;
  const safeBucketCount = Math.max(
    1,
    Math.min(maximumBuckets, Math.round(bucketCount)),
  );
  const currentPeriodStart = flowPeriodStart(now, granularity);
  const firstPeriodStart = addFlowPeriods(
    currentPeriodStart,
    granularity,
    -(safeBucketCount - 1),
  );
  const buckets = Array.from({ length: safeBucketCount }, (_, index) => {
    const date = addFlowPeriods(firstPeriodStart, granularity, index);
    return {
      key: flowPeriodKey(date, granularity),
      label: flowPeriodLabel(date, granularity, safeBucketCount),
      moneyInCents: 0,
      moneyOutCents: 0,
    };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  entries.forEach((entry) => {
    const occurredAt = new Date(entry.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) return;

    const bucket = bucketByKey.get(
      flowPeriodKey(flowPeriodStart(occurredAt, granularity), granularity),
    );
    if (!bucket) return;

    if (entry.direction === 'income') bucket.moneyInCents += entry.amountCents;
    else bucket.moneyOutCents += entry.amountCents;
  });

  return buckets;
}

/**
 * Produces a presentation-ready business snapshot from the records KeepFlip
 * already owns. It deliberately treats estimates as a separate inventory
 * signal, never as money earned.
 */
export function buildResellerBusinessOverview({
  entries,
  inventory,
  now = new Date(),
}: {
  entries: ResellerLedgerEntry[];
  inventory: InventoryItem[];
  now?: Date;
}): ResellerBusinessOverview {
  const months = buildMonths(now);
  const flowByMonth = new Map(
    months.map((month) => [month.key, { ...month, moneyInCents: 0, moneyOutCents: 0 }]),
  );
  const currentMonthKey = monthKey(now);
  const activeEntries = entries.filter(entryHasUsableMoney);
  const firstTransactionAt = activeEntries.reduce<string | null>(
    (earliest, entry) =>
      !earliest || new Date(entry.occurredAt) < new Date(earliest)
        ? entry.occurredAt
        : earliest,
    null,
  );
  const purchaseCentsByItem = new Map<string, number>();
  const soldItemIds = new Set<string>();
  const costsByType = new Map<ResellerLedgerEntryType, number>();
  let currentMonthMoneyInCents = 0;
  let currentMonthMoneyOutCents = 0;
  let unlinkedSaleCount = 0;
  let unlinkedInventoryCostCents = 0;

  activeEntries.forEach((entry) => {
    const occurredAt = new Date(entry.occurredAt);
    const occurredMonthKey = monthKey(occurredAt);
    const monthlyFlow = flowByMonth.get(occurredMonthKey);

    if (monthlyFlow) {
      if (entry.direction === 'income') {
        monthlyFlow.moneyInCents += entry.amountCents;
      } else {
        monthlyFlow.moneyOutCents += entry.amountCents;
      }
    }

    if (entry.entryType === 'inventory_purchase') {
      if (entry.itemId) {
        purchaseCentsByItem.set(
          entry.itemId,
          (purchaseCentsByItem.get(entry.itemId) ?? 0) + entry.amountCents,
        );
      } else {
        unlinkedInventoryCostCents += entry.amountCents;
      }
    }

    if (entry.entryType === 'sale_proceeds') {
      if (entry.itemId) {
        soldItemIds.add(entry.itemId);
      } else {
        unlinkedSaleCount += 1;
      }
    }

    if (occurredMonthKey !== currentMonthKey) return;

    if (entry.direction === 'income') {
      currentMonthMoneyInCents += entry.amountCents;
      return;
    }

    currentMonthMoneyOutCents += entry.amountCents;
    costsByType.set(
      entry.entryType,
      (costsByType.get(entry.entryType) ?? 0) + entry.amountCents,
    );
  });

  const onHandItems = inventory.filter(
    (item) =>
      item.quantityOnHand > 0 &&
      !(soldItemIds.has(item.id) && item.quantityPurchased <= 1),
  );
  let cashTiedUpCents = 0;
  let knownCostCount = 0;
  let missingCostCount = 0;
  let estimatedOnHandValueCents = 0;

  onHandItems.forEach((item) => {
    const savedOnHandCostCents =
      item.inventoryCostOnHand == null
        ? null
        : amountToCents(item.inventoryCostOnHand);
    const recordedPurchaseCents = purchaseCentsByItem.get(item.id) ?? 0;
    const savedCostCents = amountToCents(item.acquisitionCost);
    const costCents =
      savedOnHandCostCents ?? (recordedPurchaseCents || savedCostCents);

    if (costCents > 0) {
      cashTiedUpCents += costCents;
      knownCostCount += 1;
    } else {
      missingCostCount += 1;
    }

    estimatedOnHandValueCents +=
      amountToCents(item.estimatedValue) * item.quantityOnHand;
  });

  return {
    currentMonth: {
      moneyInCents: currentMonthMoneyInCents,
      moneyOutCents: currentMonthMoneyOutCents,
      leftAfterCostsCents: currentMonthMoneyInCents - currentMonthMoneyOutCents,
    },
    inventory: {
      onHandCount: onHandItems.reduce(
        (total, item) => total + item.quantityOnHand,
        0,
      ),
      readyToFlipCount: onHandItems
        .filter((item) => item.status === 'flip')
        .reduce((total, item) => total + item.quantityOnHand, 0),
      keepCount: onHandItems
        .filter((item) => item.status === 'keep')
        .reduce((total, item) => total + item.quantityOnHand, 0),
      undecidedCount: onHandItems
        .filter((item) => item.status === 'undecided')
        .reduce((total, item) => total + item.quantityOnHand, 0),
      knownCostCount,
      missingCostCount,
      cashTiedUpCents,
      estimatedOnHandValueCents,
    },
    attention: {
      unlinkedSaleCount,
      unlinkedInventoryCostCents,
    },
    firstTransactionAt,
    moneyFlowEntries: activeEntries.map((entry) => ({
      amountCents: entry.amountCents,
      direction: entry.direction,
      occurredAt: entry.occurredAt,
    })),
    moneyFlow: months.map((month) => flowByMonth.get(month.key)!),
    topCostsThisMonth: [...costsByType.entries()]
      .map(([entryType, amountCents]) => ({
        entryType,
        label: expenseLabel(entryType),
        amountCents,
      }))
      .sort((left, right) => right.amountCents - left.amountCents)
      .slice(0, 4),
    recordedMoneyEventCount: activeEntries.length,
  };
}
