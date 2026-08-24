import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from '@/lib/appwrite';

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

export type MarketResearchComp = {
  title: string;
  soldPrice: number;
  shipping: number;
  totalPrice: number;
  currency: string;
  condition: string | null;
  soldDate: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
};

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

export type MarketResearchResult = {
  query: string;
  comps: MarketResearchComp[];
  summary: {
    count: number;
    activeCount: number | null;
    low: number;
    median: number;
    average: number;
    high: number;
    currency: string;
  };
  searchedAt: string;
  soldLast30Days: number;
  soldLast90Days: number;
  datedCompCount: number;
  trend: PriceTrendPoint[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown) {
  return asString(value) || null;
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function normalizeComp(value: unknown): MarketResearchComp | null {
  const source = asRecord(value);
  if (!source) return null;

  const title = asString(source.title ?? source.name);
  if (!title) return null;

  const soldPrice = safeNumber(asNumber(source.soldPrice ?? source.price ?? source.itemPrice));
  const shipping = safeNumber(asNumber(source.shipping ?? source.shippingPrice ?? source.shippingCost));
  const totalPrice = safeNumber(asNumber(source.totalPrice ?? source.total)) || soldPrice + shipping;
  if (totalPrice <= 0) return null;

  const price = asRecord(source.price);
  return {
    title,
    soldPrice,
    shipping,
    totalPrice,
    currency: asString(source.currency ?? price?.currency) || 'USD',
    condition: nullableString(source.condition ?? source.itemCondition),
    soldDate: nullableString(source.soldDate ?? source.dateSold ?? source.endedAt),
    imageUrl: nullableString(source.imageUrl ?? source.thumbnail ?? source.thumbnailUrl),
    listingUrl: nullableString(source.listingUrl ?? source.itemUrl ?? source.url ?? source.link),
  };
}

function fallbackSummary(comps: MarketResearchComp[]) {
  const values = comps.map((comp) => comp.totalPrice).filter((value) => value > 0);
  return {
    count: comps.length,
    low: values.length ? Math.min(...values) : 0,
    median: median(values),
    average: values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0,
    high: values.length ? Math.max(...values) : 0,
    currency: comps.find((comp) => comp.currency)?.currency ?? 'USD',
  };
}

async function requestMarketResearch(query: string) {
  const functionId = APPWRITE.ebaySoldCompsFunctionId;
  if (!functionId) {
    throw new Error(
      'Add EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID before using Market Research.',
    );
  }

  const execution = await functions.createExecution({
    functionId,
    async: false,
    method: ExecutionMethod.POST,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'start',
      purpose: 'sold_comps',
      query,
      limit: 50,
    }),
  });
  const responseBody = execution.responseBody?.trim() ?? '';

  if (!responseBody) {
    throw new Error(
      typeof execution.errors === 'string' && execution.errors.trim()
        ? execution.errors.trim()
        : 'Market research completed without a response.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new Error('Market research returned an unreadable response.');
  }

  const payload = asRecord(parsed);
  if (!payload) throw new Error('Market research returned an unexpected response.');

  if (execution.responseStatusCode >= 400 || payload.ok === false) {
    throw new Error(
      asString(payload.error ?? payload.message) ||
      'KeepFlip could not complete this market search.',
    );
  }

  return payload;
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

function buildTrend(comps: MarketResearchComp[], now: Date): PriceTrendPoint[] {
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

export async function researchEbayMarket(rawQuery: string): Promise<MarketResearchResult> {
  const query = rawQuery.trim();
  if (query.length < 3) {
    throw new Error('Enter a more specific item name before researching the market.');
  }

  const payload = await requestMarketResearch(query);
  const rawComps =
    (Array.isArray(payload.comps) && payload.comps) ||
    (Array.isArray(payload.matches) && payload.matches) ||
    (Array.isArray(payload.results) && payload.results) ||
    [];
  const comps = rawComps.map(normalizeComp).filter((comp): comp is MarketResearchComp => comp !== null);
  if (!comps.length) {
    throw new Error('Market research completed without usable sold listings.');
  }

  const generatedSummary = fallbackSummary(comps);
  const rawSummary = asRecord(payload.summary);
  const activeValue = rawSummary?.activeCount ?? payload.activeCount;
  const activeCount = activeValue == null ? null : safeNumber(asNumber(activeValue));
  const now = new Date();
  let soldLast30Days = 0;
  let soldLast90Days = 0;
  let datedCompCount = 0;

  for (const comp of comps) {
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
    query: asString(payload.query) || query,
    comps,
    summary: {
      count: safeNumber(asNumber(rawSummary?.count)) || generatedSummary.count,
      activeCount,
      low: safeNumber(asNumber(rawSummary?.low)) || generatedSummary.low,
      median: safeNumber(asNumber(rawSummary?.median)) || generatedSummary.median,
      average: safeNumber(asNumber(rawSummary?.average)) || generatedSummary.average,
      high: safeNumber(asNumber(rawSummary?.high)) || generatedSummary.high,
      currency: asString(rawSummary?.currency) || generatedSummary.currency,
    },
    searchedAt: asString(payload.searchedAt) || now.toISOString(),
    soldLast30Days,
    soldLast90Days,
    datedCompCount,
    trend: buildTrend(comps, now),
  };
}
