import type { InventoryItem } from '@/services/inventory-service';
import type {
  ResellerLedgerEntry,
  ResellerLedgerEntryType,
} from '@/services/reseller-ledger-service';

const MONEY_TYPES = new Set<ResellerLedgerEntryType>([
  'sale_proceeds',
  'marketplace_fee',
  'shipping_label',
  'refund',
]);

export type RealizedItemMargin = {
  itemId: string;
  title: string;
  purchaseSource: string | null;
  category: string;
  soldProceedsCents: number;
  marketplaceFeesCents: number;
  shippingExpenseCents: number;
  refundCents: number;
  acquisitionCostCents: number | null;
  netProfitCents: number | null;
  roiPercent: number | null;
  reconciliationStatus: 'complete' | 'needs_item_cost' | 'needs_money_match';
  latestSaleAt: string | null;
};

export type SellerOrderPerformanceInput = {
  id: string;
  sourceItemId: string | null;
  quantity: number;
  soldPriceCents: number | null;
  listPriceCents: number | null;
  refundCents: number | null;
  soldAt: string | null;
};

export type SellerPerformanceBreakdown = {
  key: string;
  label: string;
  soldCount: number;
  netProfitCents: number;
};

export type SellerPerformanceSnapshot = {
  soldUnits: number;
  onHandUnits: number;
  sellThroughPercent: number | null;
  averageDaysToSale: number | null;
  realizedProfitCents: number;
  realizedMarginPercent: number | null;
  averageRoiPercent: number | null;
  averageDiscountPercent: number | null;
  returnRatePercent: number | null;
  byCategory: SellerPerformanceBreakdown[];
  bySource: SellerPerformanceBreakdown[];
};

function validMoney(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function centsFromAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function activeMoneyEntries(entries: ResellerLedgerEntry[], itemId: string) {
  return entries.filter(
    (entry) =>
      !entry.voidedAt &&
      entry.itemId === itemId &&
      entry.currency === 'USD' &&
      MONEY_TYPES.has(entry.entryType) &&
      validMoney(entry.amountCents) !== null,
  );
}

/**
 * Uses posted Books entries as the source of truth for realized money.
 * Unresolved eBay events remain outside this result until the existing review
 * queue links them to the exact KeepFlip item.
 */
export function buildRealizedItemMargins({
  inventory,
  entries,
}: {
  inventory: InventoryItem[];
  entries: ResellerLedgerEntry[];
}): RealizedItemMargin[] {
  return inventory
    .map((item): RealizedItemMargin | null => {
      const money = activeMoneyEntries(entries, item.id);
      const sales = money.filter((entry) => entry.entryType === 'sale_proceeds');
      if (!sales.length) return null;

      const sum = (type: ResellerLedgerEntryType) =>
        money
          .filter((entry) => entry.entryType === type)
          .reduce((total, entry) => total + entry.amountCents, 0);

      const soldProceedsCents = sum('sale_proceeds');
      const marketplaceFeesCents = sum('marketplace_fee');
      const shippingExpenseCents = sum('shipping_label');
      const refundCents = sum('refund');
      const acquisitionCostCents = centsFromAmount(item.acquisitionCost);
      const netProfitCents =
        acquisitionCostCents === null
          ? null
          : soldProceedsCents -
            marketplaceFeesCents -
            shippingExpenseCents -
            refundCents -
            acquisitionCostCents;
      const roiPercent =
        netProfitCents === null || !acquisitionCostCents
          ? null
          : (netProfitCents / acquisitionCostCents) * 100;

      const latestSaleAt = sales
        .map((entry) => entry.occurredAt)
        .filter((value) => Number.isFinite(Date.parse(value)))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

      return {
        itemId: item.id,
        title: item.title,
        purchaseSource: item.purchaseSource,
        category: item.category,
        soldProceedsCents,
        marketplaceFeesCents,
        shippingExpenseCents,
        refundCents,
        acquisitionCostCents,
        netProfitCents,
        roiPercent,
        reconciliationStatus:
          acquisitionCostCents === null ? 'needs_item_cost' : 'complete',
        latestSaleAt,
      };
    })
    .filter((value): value is RealizedItemMargin => value !== null)
    .sort(
      (left, right) =>
        Date.parse(right.latestSaleAt || '1970-01-01') -
        Date.parse(left.latestSaleAt || '1970-01-01'),
    );
}

function groupedPerformance(
  margins: RealizedItemMargin[],
  keyFor: (margin: RealizedItemMargin) => string,
) {
  const groups = new Map<string, SellerPerformanceBreakdown>();
  margins.forEach((margin) => {
    if (margin.netProfitCents === null) return;
    const key = keyFor(margin).trim() || 'Unknown';
    const current = groups.get(key) ?? {
      key,
      label: key,
      soldCount: 0,
      netProfitCents: 0,
    };
    current.soldCount += 1;
    current.netProfitCents += margin.netProfitCents;
    groups.set(key, current);
  });
  return [...groups.values()]
    .sort((left, right) => right.netProfitCents - left.netProfitCents)
    .slice(0, 8);
}

export function buildSellerPerformance({
  inventory,
  margins,
  orders,
}: {
  inventory: InventoryItem[];
  margins: RealizedItemMargin[];
  orders: SellerOrderPerformanceInput[];
}): SellerPerformanceSnapshot {
  const itemById = new Map(inventory.map((item) => [item.id, item]));
  const validOrders = orders.filter(
    (order) =>
      Number.isSafeInteger(order.quantity) &&
      order.quantity > 0 &&
      order.sourceItemId &&
      itemById.has(order.sourceItemId),
  );

  const soldUnits = validOrders.reduce((total, order) => total + order.quantity, 0);
  const onHandUnits = inventory.reduce(
    (total, item) => total + Math.max(0, item.quantityOnHand),
    0,
  );
  const sellThroughDenominator = soldUnits + onHandUnits;

  const daysToSale = validOrders.flatMap((order) => {
    const item = order.sourceItemId ? itemById.get(order.sourceItemId) : null;
    const listedAt = item?.listedAt ? Date.parse(item.listedAt) : NaN;
    const soldAt = order.soldAt ? Date.parse(order.soldAt) : NaN;
    if (!Number.isFinite(listedAt) || !Number.isFinite(soldAt) || soldAt < listedAt) {
      return [];
    }
    return [(soldAt - listedAt) / 86_400_000];
  });

  const discountRates = validOrders.flatMap((order) => {
    const sold = validMoney(order.soldPriceCents);
    const list = validMoney(order.listPriceCents);
    if (sold === null || list === null || list <= 0 || sold > list) return [];
    return [((list - sold) / list) * 100];
  });

  const returnEligible = validOrders.filter(
    (order) => validMoney(order.soldPriceCents) !== null,
  );
  const returned = returnEligible.filter(
    (order) => (validMoney(order.refundCents) ?? 0) > 0,
  );

  const completeMargins = margins.filter(
    (margin) => margin.netProfitCents !== null && margin.acquisitionCostCents !== null,
  );
  const realizedProfitCents = completeMargins.reduce(
    (total, margin) => total + (margin.netProfitCents ?? 0),
    0,
  );
  const realizedSalesCents = completeMargins.reduce(
    (total, margin) => total + margin.soldProceedsCents,
    0,
  );
  const roiValues = completeMargins.flatMap((margin) =>
    margin.roiPercent == null ? [] : [margin.roiPercent],
  );

  const average = (values: number[]) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

  return {
    soldUnits,
    onHandUnits,
    sellThroughPercent:
      sellThroughDenominator > 0 ? (soldUnits / sellThroughDenominator) * 100 : null,
    averageDaysToSale: average(daysToSale),
    realizedProfitCents,
    realizedMarginPercent:
      realizedSalesCents > 0 ? (realizedProfitCents / realizedSalesCents) * 100 : null,
    averageRoiPercent: average(roiValues),
    averageDiscountPercent: average(discountRates),
    returnRatePercent:
      returnEligible.length > 0 ? (returned.length / returnEligible.length) * 100 : null,
    byCategory: groupedPerformance(margins, (margin) => margin.category),
    bySource: groupedPerformance(
      margins,
      (margin) => margin.purchaseSource || 'Unknown source',
    ),
  };
}
