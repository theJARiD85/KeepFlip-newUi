import {
  runEbaySoldComps,
  type EbaySoldComp,
  type EbaySoldCompsResult,
} from '@/services/ebaySoldCompsService';

export type MarketplaceFeePreset = {
  id: 'ebay' | 'poshmark' | 'mercari' | 'depop' | 'etsy' | 'facebook';
  label: string;
  percent: number;
  fixed: number;
  note: string;
};

export const MARKETPLACE_FEE_PRESETS: MarketplaceFeePreset[] = [
  { id: 'ebay', label: 'eBay', percent: 13.6, fixed: 0.4, note: 'Typical managed-payment estimate; category rates vary.' },
  { id: 'poshmark', label: 'Poshmark', percent: 20, fixed: 0, note: 'Standard estimate for sales of $15 or more.' },
  { id: 'mercari', label: 'Mercari', percent: 10, fixed: 0, note: 'Default seller-fee estimate; verify current account terms.' },
  { id: 'depop', label: 'Depop', percent: 3.3, fixed: 0.45, note: 'US payment-processing estimate; selling fees vary by region.' },
  { id: 'etsy', label: 'Etsy', percent: 9.5, fixed: 0.45, note: 'Transaction plus typical US payment-processing estimate.' },
  { id: 'facebook', label: 'Facebook', percent: 10, fixed: 0.8, note: 'Marketplace shipping-order estimate; local pickup may be free.' },
];

export type ProfitInputs = {
  salePrice: number;
  shippingCharged: number;
  cogs: number;
  shippingCost: number;
  supplies: number;
  otherExpenses: number;
  feePercent: number;
  promotedPercent: number;
  fixedFee: number;
};

export type ProfitEstimate = {
  revenue: number;
  marketplaceFees: number;
  totalCosts: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  breakEvenPrice: number;
};

export type PriceTrendPoint = {
  label: string;
  average: number | null;
  count: number;
};

export type MarketResearchResult = EbaySoldCompsResult & {
  soldLast30Days: number;
  soldLast90Days: number;
  datedCompCount: number;
  trend: PriceTrendPoint[];
};

function safeNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateProfitEstimate(input: ProfitInputs): ProfitEstimate {
  const salePrice = safeNumber(input.salePrice);
  const shippingCharged = safeNumber(input.shippingCharged);
  const revenue = salePrice + shippingCharged;
  const combinedRate = Math.min(99, safeNumber(input.feePercent) + safeNumber(input.promotedPercent)) / 100;
  const marketplaceFees = revenue * combinedRate + safeNumber(input.fixedFee);
  const operatingCosts =
    safeNumber(input.cogs) +
    safeNumber(input.shippingCost) +
    safeNumber(input.supplies) +
    safeNumber(input.otherExpenses);
  const totalCosts = operatingCosts + marketplaceFees;
  const netProfit = revenue - totalCosts;
  const investedCash =
    safeNumber(input.cogs) + safeNumber(input.supplies) + safeNumber(input.otherExpenses);
  const contributionRate = 1 - combinedRate;
  const breakEvenGross = contributionRate > 0
    ? (operatingCosts + safeNumber(input.fixedFee)) / contributionRate
    : 0;

  return {
    revenue,
    marketplaceFees,
    totalCosts,
    netProfit,
    marginPercent: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    roiPercent: investedCash > 0 ? (netProfit / investedCash) * 100 : 0,
    breakEvenPrice: Math.max(0, breakEvenGross - shippingCharged),
  };
}

function buildTrend(comps: EbaySoldComp[], now: Date): PriceTrendPoint[] {
  const bucketCount = 6;
  const bucketDays = 15;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    sum: 0,
    count: 0,
    startDaysAgo: (bucketCount - index - 1) * bucketDays,
  }));

  for (const comp of comps) {
    if (!comp.soldDate) continue;
    const soldAt = new Date(comp.soldDate);
    if (Number.isNaN(soldAt.getTime())) continue;
    const daysAgo = Math.floor((now.getTime() - soldAt.getTime()) / 86_400_000);
    if (daysAgo < 0 || daysAgo >= bucketCount * bucketDays) continue;
    const bucketIndex = bucketCount - 1 - Math.floor(daysAgo / bucketDays);
    buckets[bucketIndex].sum += comp.totalPrice;
    buckets[bucketIndex].count += 1;
  }

  return buckets.map((bucket) => ({
    label: bucket.startDaysAgo === 0 ? 'Now' : `${bucket.startDaysAgo}d`,
    average: bucket.count > 0 ? bucket.sum / bucket.count : null,
    count: bucket.count,
  }));
}

export async function researchEbayMarket(query: string): Promise<MarketResearchResult> {
  const result = await runEbaySoldComps(query, 50);
  const now = new Date();
  let soldLast30Days = 0;
  let soldLast90Days = 0;
  let datedCompCount = 0;

  for (const comp of result.comps) {
    if (!comp.soldDate) continue;
    const soldAt = new Date(comp.soldDate);
    if (Number.isNaN(soldAt.getTime())) continue;
    const daysAgo = Math.floor((now.getTime() - soldAt.getTime()) / 86_400_000);
    if (daysAgo < 0) continue;
    datedCompCount += 1;
    if (daysAgo <= 30) soldLast30Days += 1;
    if (daysAgo <= 90) soldLast90Days += 1;
  }

  return {
    ...result,
    soldLast30Days,
    soldLast90Days,
    datedCompCount,
    trend: buildTrend(result.comps, now),
  };
}
