import type { InventoryItem } from '@/services/inventory-service';
import {
  buildRealizedItemMargins,
  type RealizedItemMargin,
} from '@/lib/seller-performance';
import {
  resolvedInventoryCostCents,
  type ResellerLedgerDirection,
  type ResellerLedgerEntry,
  type ResellerLedgerEntryType,
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

export type BusinessExpenseBreakdown = BusinessCostBreakdown & {
  isWorkingCapital: boolean;
  sharePercent: number;
};

export type BusinessProfitAndLossMonth = {
  key: string;
  label: string;
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  operatingExpensesCents: number;
  netProfitCents: number;
  grossMarginPercent: number | null;
};

export type BusinessGrossMarginBreakdown = {
  key: string;
  label: string;
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  grossMarginPercent: number | null;
  itemCount: number;
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
  profitAndLoss: BusinessProfitAndLossMonth[];
  grossMarginByCategory: BusinessGrossMarginBreakdown[];
  expenseBreakdownThisMonth: BusinessExpenseBreakdown[];
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

function percentage(value: number, denominator: number) {
  return denominator > 0 ? (value / denominator) * 100 : null;
}

export function moneyFlowRangeOptions(
  granularity: BusinessMoneyFlowGranularity,
) {
  return MONEY_FLOW_RANGE_OPTIONS[granularity];
}

function maximumMoneyFlowBucketCount(
  granularity: BusinessMoneyFlowGranularity,
) {
  return granularity === 'days' ? 30 : granularity === 'weeks' ? 26 : 24;
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
  const rangeOptions = MONEY_FLOW_RANGE_OPTIONS[granularity];
  const firstTransaction = firstTransactionAt
    ? new Date(firstTransactionAt)
    : null;

  if (
    !firstTransaction ||
    !Number.isFinite(firstTransaction.getTime()) ||
    !Number.isFinite(now.getTime())
  ) {
    return rangeOptions[0].count;
  }

  const maximumBuckets = maximumMoneyFlowBucketCount(granularity);
  const currentPeriodStart = flowPeriodStart(now, granularity);
  let firstPeriodStart = flowPeriodStart(firstTransaction, granularity);
  let requiredBucketCount = 1;

  while (
    firstPeriodStart < currentPeriodStart &&
    requiredBucketCount < maximumBuckets
  ) {
    firstPeriodStart = addFlowPeriods(firstPeriodStart, granularity, 1);
    requiredBucketCount += 1;
  }

  return (
    rangeOptions.find((option) => option.count >= requiredBucketCount) ??
    rangeOptions[rangeOptions.length - 1]
  ).count;
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
  const maximumBuckets = maximumMoneyFlowBucketCount(granularity);
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
 * Removes only the empty periods before the first recorded money event. Empty
 * periods after that event remain so gaps in a user's activity are visible.
 */
export function trimLeadingEmptyMoneyFlowBuckets(
  buckets: BusinessMoneyFlowBucket[],
) {
  const firstDataIndex = buckets.findIndex(
    (bucket) => bucket.moneyInCents > 0 || bucket.moneyOutCents > 0,
  );

  return firstDataIndex > 0 ? buckets.slice(firstDataIndex) : buckets;
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
  const realizedMargins = buildRealizedItemMargins({ inventory, entries });
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));
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
  const profitAndLossByMonth = new Map(
    months.map((month) => [
      month.key,
      {
        ...month,
        revenueCents: 0,
        cogsCents: 0,
        grossProfitCents: 0,
        operatingExpensesCents: 0,
        netProfitCents: 0,
        grossMarginPercent: null as number | null,
      },
    ]),
  );
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

    const monthlyProfitAndLoss = profitAndLossByMonth.get(occurredMonthKey);
    if (monthlyProfitAndLoss) {
      if (entry.direction === 'income') {
        monthlyProfitAndLoss.revenueCents += entry.amountCents;
      } else if (entry.entryType !== 'inventory_purchase') {
        monthlyProfitAndLoss.operatingExpensesCents += entry.amountCents;
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

  const grossMarginByCategory = new Map<string, BusinessGrossMarginBreakdown>();
  realizedMargins.forEach((margin: RealizedItemMargin) => {
    if (!margin.latestSaleAt) return;
    const item = inventoryById.get(margin.itemId);
    if (!item) return;

    const acquisitionCostCents = resolvedInventoryCostCents(
      item,
      purchaseCentsByItem.get(item.id) ?? 0,
    );
    if (acquisitionCostCents <= 0 || margin.soldProceedsCents <= 0) return;

    const category = margin.category.trim() || 'Uncategorized';
    const current = grossMarginByCategory.get(category) ?? {
      key: category,
      label: category,
      revenueCents: 0,
      cogsCents: 0,
      grossProfitCents: 0,
      grossMarginPercent: null,
      itemCount: 0,
    };
    current.revenueCents += margin.soldProceedsCents;
    current.cogsCents += acquisitionCostCents;
    current.grossProfitCents += margin.soldProceedsCents - acquisitionCostCents;
    current.itemCount += 1;
    current.grossMarginPercent = percentage(
      current.grossProfitCents,
      current.revenueCents,
    );
    grossMarginByCategory.set(category, current);

    const saleMonth = monthKey(new Date(margin.latestSaleAt));
    const monthlyProfitAndLoss = profitAndLossByMonth.get(saleMonth);
    if (monthlyProfitAndLoss) {
      monthlyProfitAndLoss.cogsCents += acquisitionCostCents;
    }
  });

  const profitAndLoss = months.map((month) => {
    const current = profitAndLossByMonth.get(month.key)!;
    current.grossProfitCents = current.revenueCents - current.cogsCents;
    current.netProfitCents =
      current.grossProfitCents - current.operatingExpensesCents;
    current.grossMarginPercent = percentage(
      current.grossProfitCents,
      current.revenueCents,
    );
    return current;
  });

  const totalCurrentMonthExpenses = [...costsByType.values()].reduce(
    (total, amountCents) => total + amountCents,
    0,
  );
  const expenseBreakdownThisMonth = [...costsByType.entries()]
    .map(([entryType, amountCents]) => ({
      entryType,
      label: expenseLabel(entryType),
      amountCents,
      isWorkingCapital: entryType === 'inventory_purchase',
      sharePercent: percentage(amountCents, totalCurrentMonthExpenses) ?? 0,
    }))
    .sort((left, right) => right.amountCents - left.amountCents)
    .slice(0, 8);

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
    const recordedPurchaseCents = purchaseCentsByItem.get(item.id) ?? 0;
    const costCents = resolvedInventoryCostCents(item, recordedPurchaseCents);

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
    profitAndLoss,
    grossMarginByCategory: [...grossMarginByCategory.values()]
      .sort((left, right) => right.revenueCents - left.revenueCents)
      .slice(0, 8),
    expenseBreakdownThisMonth,
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
