import type { InventoryItem } from '@/services/inventory-service';
import type {
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

  const onHandItems = inventory.filter((item) => !soldItemIds.has(item.id));
  let cashTiedUpCents = 0;
  let knownCostCount = 0;
  let missingCostCount = 0;
  let estimatedOnHandValueCents = 0;

  onHandItems.forEach((item) => {
    const recordedPurchaseCents = purchaseCentsByItem.get(item.id) ?? 0;
    const savedCostCents = amountToCents(item.acquisitionCost);
    const costCents = recordedPurchaseCents || savedCostCents;

    if (costCents > 0) {
      cashTiedUpCents += costCents;
      knownCostCount += 1;
    } else {
      missingCostCount += 1;
    }

    estimatedOnHandValueCents += amountToCents(item.estimatedValue);
  });

  return {
    currentMonth: {
      moneyInCents: currentMonthMoneyInCents,
      moneyOutCents: currentMonthMoneyOutCents,
      leftAfterCostsCents: currentMonthMoneyInCents - currentMonthMoneyOutCents,
    },
    inventory: {
      onHandCount: onHandItems.length,
      readyToFlipCount: onHandItems.filter((item) => item.status === 'flip').length,
      keepCount: onHandItems.filter((item) => item.status === 'keep').length,
      undecidedCount: onHandItems.filter((item) => item.status === 'undecided').length,
      knownCostCount,
      missingCostCount,
      cashTiedUpCents,
      estimatedOnHandValueCents,
    },
    attention: {
      unlinkedSaleCount,
      unlinkedInventoryCostCents,
    },
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
