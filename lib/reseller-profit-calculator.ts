/**
 * Estimate-only resale math used by the scanner's Smart Profit Calculator.
 *
 * The fee presets intentionally describe common United States selling terms,
 * not a quote. Marketplace fees can vary by category, seller plan, tax, and
 * fulfillment choices, so callers should always leave a path to the Custom
 * preset and label the result as a projection.
 */

export const PROFIT_MARKETPLACE_IDS = [
  "ebay_standard",
  "ebay_books_media",
  "poshmark",
  "mercari",
  "shopify_basic",
  "local_pickup",
  "custom",
] as const;

export type ProfitMarketplaceId = (typeof PROFIT_MARKETPLACE_IDS)[number];

export type ProfitMarketplacePreset = {
  id: ProfitMarketplaceId;
  label: string;
  shortLabel: string;
  feeSummary: string;
  note: string;
};

export type ProfitCalculatorInput = {
  targetSalePrice: number;
  buyerPaidShipping: number;
  costOfGoods: number;
  outboundShipping: number;
  prepAndRepair: number;
  returnReserve: number;
  packageWeightOz: number;
  customFeePercent: number;
  customFixedFee: number;
};

export type ProfitProjection = {
  marketplace: ProfitMarketplacePreset;
  grossRevenue: number;
  platformFee: number;
  operatingCosts: number;
  totalOutlay: number;
  netProfit: number;
  roiPercent: number | null;
  breakEvenPrice: number | null;
  feeBase: number;
  feeSummary: string;
};

type ProjectionCore = Omit<ProfitProjection, "breakEvenPrice">;

const CENTS_PER_DOLLAR = 100;
const MAX_BREAK_EVEN_PRICE = 1_000_000;

export const PROFIT_MARKETPLACES: readonly ProfitMarketplacePreset[] = [
  {
    id: "ebay_standard",
    label: "eBay standard",
    shortLabel: "eBay",
    feeSummary: "Est. 13.6% + $0.30 / $0.40",
    note: "US estimate. eBay final value fees vary by category and seller terms.",
  },
  {
    id: "ebay_books_media",
    label: "eBay books & media",
    shortLabel: "eBay media",
    feeSummary: "Est. 15.3% + $0.30 / $0.40",
    note: "US estimate for books and media. Confirm the category's current eBay fee.",
  },
  {
    id: "poshmark",
    label: "Poshmark",
    shortLabel: "Poshmark",
    feeSummary: "Est. $2.95 ≤ $15, then 20%",
    note: "US estimate based on the item price; shipping is not used for this estimate.",
  },
  {
    id: "mercari",
    label: "Mercari",
    shortLabel: "Mercari",
    feeSummary: "Est. 10% of sale + buyer shipping",
    note: "US estimate. Confirm the seller fee and who pays shipping before listing.",
  },
  {
    id: "shopify_basic",
    label: "Shopify Basic",
    shortLabel: "Shopify",
    feeSummary: "Est. 2.9% + $0.30",
    note: "US online-card estimate. Payment processing and plan terms can differ.",
  },
  {
    id: "local_pickup",
    label: "Local pickup",
    shortLabel: "Local",
    feeSummary: "No marketplace fee",
    note: "No payment processing, delivery, or safety costs are included in this preset.",
  },
  {
    id: "custom",
    label: "Custom marketplace",
    shortLabel: "Custom",
    feeSummary: "Your percentage + fixed fee",
    note: "Enter the fee terms that apply to this marketplace or seller plan.",
  },
] as const;

export const DEFAULT_PROFIT_CALCULATOR_INPUT: ProfitCalculatorInput = {
  targetSalePrice: 0,
  buyerPaidShipping: 0,
  costOfGoods: 0,
  outboundShipping: 0,
  prepAndRepair: 0,
  returnReserve: 0,
  packageWeightOz: 0,
  customFeePercent: 0,
  customFixedFee: 0,
};

function nonNegativeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function toCents(value: number | undefined) {
  return Math.round(nonNegativeNumber(value) * CENTS_PER_DOLLAR);
}

function fromCents(value: number) {
  return Math.round(value) / CENTS_PER_DOLLAR;
}

function marketplaceFor(id: ProfitMarketplaceId) {
  return PROFIT_MARKETPLACES.find((marketplace) => marketplace.id === id)
    ?? PROFIT_MARKETPLACES[0];
}

function feeInCents(
  marketplaceId: ProfitMarketplaceId,
  input: ProfitCalculatorInput,
) {
  const salePrice = toCents(input.targetSalePrice);
  const buyerPaidShipping = toCents(input.buyerPaidShipping);
  const orderTotal = salePrice + buyerPaidShipping;

  if (orderTotal <= 0) {
    return { fee: 0, feeBase: 0 };
  }

  switch (marketplaceId) {
    case "ebay_standard": {
      const fixedFee = orderTotal <= 1_000 ? 30 : 40;
      return {
        fee: Math.round(orderTotal * 0.136) + fixedFee,
        feeBase: orderTotal,
      };
    }
    case "ebay_books_media": {
      const fixedFee = orderTotal <= 1_000 ? 30 : 40;
      return {
        fee: Math.round(orderTotal * 0.153) + fixedFee,
        feeBase: orderTotal,
      };
    }
    case "poshmark":
      return {
        fee: salePrice <= 1_500 ? 295 : Math.round(salePrice * 0.2),
        feeBase: salePrice,
      };
    case "mercari":
      return {
        fee: Math.round(orderTotal * 0.1),
        feeBase: orderTotal,
      };
    case "shopify_basic":
      return {
        fee: Math.round(orderTotal * 0.029) + 30,
        feeBase: orderTotal,
      };
    case "custom": {
      const customPercent = Math.min(nonNegativeNumber(input.customFeePercent), 100);
      return {
        fee: Math.round(orderTotal * (customPercent / 100)) + toCents(input.customFixedFee),
        feeBase: orderTotal,
      };
    }
    case "local_pickup":
    default:
      return { fee: 0, feeBase: 0 };
  }
}

function calculateProjectionCore(
  marketplaceId: ProfitMarketplaceId,
  input: ProfitCalculatorInput,
): ProjectionCore {
  const marketplace = marketplaceFor(marketplaceId);
  const salePrice = toCents(input.targetSalePrice);
  const buyerPaidShipping = toCents(input.buyerPaidShipping);
  const grossRevenue = salePrice + buyerPaidShipping;
  const operatingCosts =
    toCents(input.costOfGoods) +
    toCents(input.outboundShipping) +
    toCents(input.prepAndRepair) +
    toCents(input.returnReserve);
  const fee = feeInCents(marketplaceId, input);
  const totalOutlay = operatingCosts + fee.fee;
  const netProfit = grossRevenue - totalOutlay;

  return {
    marketplace,
    grossRevenue: fromCents(grossRevenue),
    platformFee: fromCents(fee.fee),
    operatingCosts: fromCents(operatingCosts),
    totalOutlay: fromCents(totalOutlay),
    netProfit: fromCents(netProfit),
    roiPercent:
      operatingCosts > 0
        ? Math.round((netProfit / operatingCosts) * 10_000) / 100
        : null,
    feeBase: fromCents(fee.feeBase),
    feeSummary: marketplace.feeSummary,
  };
}

function breakEvenSalePrice(
  marketplaceId: ProfitMarketplaceId,
  input: ProfitCalculatorInput,
) {
  if (calculateProjectionCore(marketplaceId, { ...input, targetSalePrice: 0 }).netProfit >= 0) {
    return 0;
  }

  let lower = 0;
  let upper = Math.max(
    5,
    nonNegativeNumber(input.targetSalePrice),
    nonNegativeNumber(input.costOfGoods) +
      nonNegativeNumber(input.outboundShipping) +
      nonNegativeNumber(input.prepAndRepair) +
      nonNegativeNumber(input.returnReserve),
  );

  while (
    calculateProjectionCore(marketplaceId, { ...input, targetSalePrice: upper }).netProfit < 0 &&
    upper < MAX_BREAK_EVEN_PRICE
  ) {
    lower = upper;
    upper *= 2;
  }

  if (upper >= MAX_BREAK_EVEN_PRICE && calculateProjectionCore(marketplaceId, { ...input, targetSalePrice: upper }).netProfit < 0) {
    return null;
  }

  for (let index = 0; index < 42; index += 1) {
    const midpoint = (lower + upper) / 2;
    if (calculateProjectionCore(marketplaceId, { ...input, targetSalePrice: midpoint }).netProfit >= 0) {
      upper = midpoint;
    } else {
      lower = midpoint;
    }
  }

  return Math.ceil(upper * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR;
}

export function calculateProfitProjection(
  marketplaceId: ProfitMarketplaceId,
  input: ProfitCalculatorInput,
): ProfitProjection {
  const projection = calculateProjectionCore(marketplaceId, input);
  return {
    ...projection,
    breakEvenPrice: breakEvenSalePrice(marketplaceId, input),
  };
}

export function calculateMarketplaceProjections(input: ProfitCalculatorInput) {
  return PROFIT_MARKETPLACES.map((marketplace) =>
    calculateProfitProjection(marketplace.id, input),
  );
}

export function findBestProfitProjection(
  projections: readonly ProfitProjection[],
) {
  const comparable = projections.filter(
    (projection) => projection.marketplace.id !== "custom",
  );
  const pool = comparable.length ? comparable : projections;

  return pool.reduce<ProfitProjection | null>((best, projection) => {
    if (!best || projection.netProfit > best.netProfit) {
      return projection;
    }
    return best;
  }, null);
}

export function findBestRoiProjection(
  projections: readonly ProfitProjection[],
) {
  const comparable = projections.filter(
    (projection) =>
      projection.marketplace.id !== "custom" && projection.roiPercent != null,
  );

  return comparable.reduce<ProfitProjection | null>((best, projection) => {
    if (
      projection.roiPercent == null ||
      !best ||
      best.roiPercent == null ||
      projection.roiPercent > best.roiPercent
    ) {
      return projection;
    }
    return best;
  }, null);
}
