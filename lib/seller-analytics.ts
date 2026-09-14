import type { InventoryItem } from '@/services/inventory-service';
import type { ResellerLedgerEntry } from '@/services/reseller-ledger-service';
import {
  buildRealizedItemMargins,
  type RealizedItemMargin,
  type SellerOrderPerformanceInput,
} from '@/lib/seller-performance';

export type SellerAnalyticsDimension = 'category' | 'source' | 'condition';
export type SellerAnalyticsMetric = 'roi' | 'profit' | 'listingDays' | 'soldUnits';

export type SellerAnalyticsGroup = {
  key: string;
  label: string;
  itemCount: number;
  metrics: Record<SellerAnalyticsMetric, number | null>;
  samples: Record<SellerAnalyticsMetric, number>;
};

type MutableMetric = {
  total: number;
  samples: number;
};

type MutableGroup = {
  key: string;
  label: string;
  itemIds: Set<string>;
  metrics: Record<SellerAnalyticsMetric, MutableMetric>;
};

const EMPTY_METRIC = (): MutableMetric => ({ total: 0, samples: 0 });

function dimensionValue(item: InventoryItem, dimension: SellerAnalyticsDimension) {
  if (dimension === 'category') return item.category.trim() || 'Uncategorized';
  if (dimension === 'source') return item.purchaseSource?.trim() || 'Unknown source';
  return item.condition.trim() || 'Unknown condition';
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}

function addSample(target: MutableMetric, value: number, count = 1) {
  if (!Number.isFinite(value) || !Number.isSafeInteger(count) || count <= 0) return;
  target.total += value * count;
  target.samples += count;
}

function newGroup(key: string): MutableGroup {
  return {
    key,
    label: key,
    itemIds: new Set(),
    metrics: {
      roi: EMPTY_METRIC(),
      profit: EMPTY_METRIC(),
      listingDays: EMPTY_METRIC(),
      soldUnits: EMPTY_METRIC(),
    },
  };
}

/**
 * Builds item-grouped chart values from saved inventory, linked seller orders,
 * and realized Books margins. Estimated values are intentionally not treated
 * as revenue or profit.
 */
export function buildSellerAnalyticsGroups({
  inventory,
  margins,
  orders,
  dimension,
  categoryFilter = null,
  asOf = Date.now(),
}: {
  inventory: InventoryItem[];
  margins: RealizedItemMargin[];
  orders: SellerOrderPerformanceInput[];
  dimension: SellerAnalyticsDimension;
  categoryFilter?: string | null;
  asOf?: number;
}): SellerAnalyticsGroup[] {
  const marginByItem = new Map(margins.map((margin) => [margin.itemId, margin]));
  const inventoryIds = new Set(inventory.map((item) => item.id));
  const hasLinkedSales = orders.some(
    (order) =>
      Boolean(order.sourceItemId && inventoryIds.has(order.sourceItemId)) &&
      Number.isSafeInteger(order.quantity) &&
      order.quantity > 0,
  );
  const ordersByItem = new Map<string, SellerOrderPerformanceInput[]>();

  orders.forEach((order) => {
    if (!order.sourceItemId || !Number.isSafeInteger(order.quantity) || order.quantity <= 0) return;
    const itemOrders = ordersByItem.get(order.sourceItemId) ?? [];
    itemOrders.push(order);
    ordersByItem.set(order.sourceItemId, itemOrders);
  });

  const groups = new Map<string, MutableGroup>();

  inventory.forEach((item) => {
    const category = item.category.trim() || 'Uncategorized';
    if (categoryFilter && category !== categoryFilter) return;

    const key = dimensionValue(item, dimension);
    const group = groups.get(key) ?? newGroup(key);
    groups.set(key, group);
    group.itemIds.add(item.id);

    const margin = marginByItem.get(item.id);
    if (margin?.roiPercent != null) addSample(group.metrics.roi, margin.roiPercent);
    if (margin?.netProfitCents != null) addSample(group.metrics.profit, margin.netProfitCents);

    const itemOrders = ordersByItem.get(item.id) ?? [];
    const soldUnits = itemOrders.reduce((total, order) => total + order.quantity, 0);
    if (soldUnits > 0) addSample(group.metrics.soldUnits, soldUnits);

    const listedAt = validDate(item.listedAt);
    if (listedAt === null) return;

    const timedSales = itemOrders.flatMap((order) => {
      const soldAt = validDate(order.soldAt);
      if (soldAt === null || soldAt < listedAt) return [];
      return [{ days: (soldAt - listedAt) / 86_400_000, quantity: order.quantity }];
    });

    if (timedSales.length) {
      timedSales.forEach(({ days, quantity }) => addSample(group.metrics.listingDays, days, quantity));
      if (item.isListed && item.quantityOnHand > 0 && asOf >= listedAt) {
        addSample(
          group.metrics.listingDays,
          (asOf - listedAt) / 86_400_000,
          item.quantityOnHand,
        );
      }
    } else if (item.isListed && asOf >= listedAt) {
      addSample(
        group.metrics.listingDays,
        (asOf - listedAt) / 86_400_000,
        Math.max(1, item.quantityOnHand),
      );
    }
  });

  return [...groups.values()]
    .map((group) => {
      const average = (metric: MutableMetric) =>
        metric.samples > 0 ? metric.total / metric.samples : null;
      return {
        key: group.key,
        label: group.label,
        itemCount: group.itemIds.size,
        metrics: {
          roi: average(group.metrics.roi),
          profit: group.metrics.profit.samples > 0 ? group.metrics.profit.total : null,
          listingDays: average(group.metrics.listingDays),
          soldUnits:
            group.metrics.soldUnits.samples > 0 || hasLinkedSales
              ? group.metrics.soldUnits.total
              : null,
        },
        samples: {
          roi: group.metrics.roi.samples,
          profit: group.metrics.profit.samples,
          listingDays: group.metrics.listingDays.samples,
          soldUnits: group.metrics.soldUnits.samples,
        },
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildSellerAnalyticsMargins(
  inventory: InventoryItem[],
  entries: ResellerLedgerEntry[],
) {
  return buildRealizedItemMargins({ inventory, entries });
}
