/** Seller-entered planning assumptions, in cents. Never a fee quote or tax advice. */
export type NetProceedsInput = {
  salePriceCents: number;
  acquisitionCostCents: number | null;
  buyerShippingCents: number;
  shippingExpenseCents: number | null;
  packagingCents: number;
  marketplaceFeeBps: number | null;
  fixedFeeCents: number;
  promotedFeeBps: number;
  discountCents: number;
  refundAllowanceCents: number;
  marketplaceCollectedTaxCents: number;
  feesIncludeCollectedTax: boolean;
  sellerTaxReserveCents: number;
};

export type NetProceeds = {
  proceedsCents: number | null;
  profitCents: number | null;
  roiPercent: number | null;
  marketplaceFeesCents: number | null;
  promotedFeesCents: number;
  missing: string[];
};

function money(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  }
  return value;
}

function rate(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} must be between 0% and 100%.`);
  }
  return value;
}

export function calculateNetProceeds(input: NetProceedsInput): NetProceeds {
  const price = money(input.salePriceCents, 'Sale price');
  const discount = money(input.discountCents, 'Discount');
  if (discount > price) throw new Error('Discount cannot exceed the sale price.');
  const revenue = price - discount + money(input.buyerShippingCents, 'Buyer shipping');
  const feeBase = revenue + (input.feesIncludeCollectedTax
    ? money(input.marketplaceCollectedTaxCents, 'Marketplace collected tax') : 0);
  money(input.marketplaceCollectedTaxCents, 'Marketplace collected tax');
  const fixed = money(input.fixedFeeCents, 'Fixed fee');
  const packaging = money(input.packagingCents, 'Packaging');
  const refunds = money(input.refundAllowanceCents, 'Refund allowance');
  const taxReserve = money(input.sellerTaxReserveCents, 'Seller tax reserve');
  const promotedFeesCents = Math.round(feeBase * rate(input.promotedFeeBps, 'Promoted fee') / 10_000);
  const missing: string[] = [];
  if (input.acquisitionCostCents === null) missing.push('Acquisition cost');
  else money(input.acquisitionCostCents, 'Acquisition cost');
  if (input.shippingExpenseCents === null) missing.push('Shipping expense');
  else money(input.shippingExpenseCents, 'Shipping expense');
  if (input.marketplaceFeeBps === null) missing.push('Marketplace fee rate');
  const marketplaceFeesCents = input.marketplaceFeeBps === null ? null
    : Math.round(feeBase * rate(input.marketplaceFeeBps, 'Marketplace fee') / 10_000) + fixed;
  // Marketplace-collected tax is never revenue or a second seller expense.
  const proceedsCents = input.shippingExpenseCents === null || marketplaceFeesCents === null
    ? null : revenue - marketplaceFeesCents - promotedFeesCents - input.shippingExpenseCents
      - packaging - refunds - taxReserve;
  const profitCents = proceedsCents === null || input.acquisitionCostCents === null
    ? null : proceedsCents - input.acquisitionCostCents;
  const invested = input.acquisitionCostCents === null || input.shippingExpenseCents === null
    ? null : input.acquisitionCostCents + input.shippingExpenseCents + packaging;
  return {
    proceedsCents, profitCents, marketplaceFeesCents, promotedFeesCents, missing,
    roiPercent: profitCents === null || !invested ? null : profitCents / invested * 100,
  };
}

/** Finds a seller-controlled floor with rounding identical to the displayed estimate. */
export function netProfitFloor(input: NetProceedsInput, minimumProfitCents: number): number | null {
  money(minimumProfitCents, 'Minimum profit');
  const maximum = 1_000_000_000;
  const highResult = calculateNetProceeds({ ...input, salePriceCents: maximum });
  if (highResult.profitCents === null || highResult.profitCents < minimumProfitCents) return null;
  const combinedRate = (input.marketplaceFeeBps! + input.promotedFeeBps) / 10_000;
  if (combinedRate >= 1) return null;
  const retainedRate = 1 - combinedRate;
  const revenueOffset = input.buyerShippingCents - input.discountCents;
  const feeOffset = revenueOffset + (input.feesIncludeCollectedTax ? input.marketplaceCollectedTaxCents : 0);
  const constant = revenueOffset - combinedRate * feeOffset - input.fixedFeeCents
    - input.shippingExpenseCents! - input.packagingCents - input.refundAllowanceCents
    - input.sellerTaxReserveCents - input.acquisitionCostCents!;
  // Separately rounded fees can make profit dip by one cent at a boundary.
  // Search the narrow rounding interval instead of assuming strict monotonicity.
  const first = Math.max(input.discountCents, Math.floor((minimumProfitCents - constant - 1) / retainedRate));
  const last = Math.min(maximum, Math.ceil((minimumProfitCents - constant + 1) / retainedRate));
  for (let price = first; price <= last; price += 1) {
    const result = calculateNetProceeds({ ...input, salePriceCents: price });
    if (result.profitCents !== null && result.profitCents >= minimumProfitCents) return price;
  }
  return null;
}
