export type KeepFlipPlanId = 'hobbyist' | 'serious' | 'power';

export type KeepFlipBillingCadence = 'monthly' | 'annual';

export type KeepFlipCapability =
  | 'basic_bookkeeping'
  | 'automated_bookkeeping'
  | 'schedule_c_export'
  | 'advanced_bookkeeping_analytics'
  | 'multi_user';

export type KeepFlipPlanLimits = {
  aiValuationsPerMonth: number | null;
  activeListingsPerMonth: number | null;
};

export type KeepFlipPlanDefinition = {
  id: KeepFlipPlanId;
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  recommended: boolean;
  entitlementId: string;
  packageIds: Partial<Record<KeepFlipBillingCadence, string>>;
  limits: KeepFlipPlanLimits;
  capabilities: readonly KeepFlipCapability[];
  features: readonly string[];
};

export const KEEPFLIP_OFFERING_ID = 'keepflip_default';

export const KEEPFLIP_PLAN_ORDER: readonly KeepFlipPlanId[] = [
  'hobbyist',
  'serious',
  'power',
];

export const KEEPFLIP_PLANS: Record<KeepFlipPlanId, KeepFlipPlanDefinition> = {
  hobbyist: {
    id: 'hobbyist',
    name: 'Part-Time Hobbyist',
    shortName: 'Hobbyist',
    eyebrow: 'TIER 1',
    description:
      'A practical toolkit for part-time resellers who want valuation, inventory, and bookkeeping in one place.',
    monthlyPriceCents: 2499,
    annualPriceCents: 23988,
    recommended: false,
    entitlementId: 'keepflip_hobbyist',
    packageIds: {
      monthly: 'hobbyist_monthly',
      annual: 'hobbyist_annual',
    },
    limits: {
      activeListingsPerMonth: 50,
      aiValuationsPerMonth: 100,
    },
    capabilities: ['basic_bookkeeping'],
    features: [
      'Up to 50 active listings per month',
      '100 AI valuation scans per month',
      'Basic bookkeeping reports',
      'Inventory and profit tracking',
    ],
  },
  serious: {
    id: 'serious',
    name: 'Serious Reseller',
    shortName: 'Serious',
    eyebrow: 'TIER 2 · SWEET SPOT',
    description:
      'Full access to KeepFlip’s automated resale workflow for sellers who run their operation like a business.',
    monthlyPriceCents: 4499,
    annualPriceCents: null,
    recommended: true,
    entitlementId: 'keepflip_serious',
    packageIds: {
      monthly: 'serious_monthly',
    },
    limits: {
      activeListingsPerMonth: 250,
      aiValuationsPerMonth: null,
    },
    capabilities: [
      'basic_bookkeeping',
      'automated_bookkeeping',
      'schedule_c_export',
    ],
    features: [
      'Up to 250 active listings per month',
      'Unlimited AI valuation scans',
      'Automated bookkeeping',
      'Schedule C tax export',
      'Marketplace money reconciliation',
    ],
  },
  power: {
    id: 'power',
    name: 'Power Seller',
    shortName: 'Power',
    eyebrow: 'TIER 3 · STORE',
    description:
      'Built for high-volume sellers, liquidation buyers, and resale operations that need deeper controls and analytics.',
    monthlyPriceCents: 8999,
    annualPriceCents: null,
    recommended: false,
    entitlementId: 'keepflip_power',
    packageIds: {
      monthly: 'power_monthly',
    },
    limits: {
      activeListingsPerMonth: null,
      aiValuationsPerMonth: null,
    },
    capabilities: [
      'basic_bookkeeping',
      'automated_bookkeeping',
      'schedule_c_export',
      'advanced_bookkeeping_analytics',
      'multi_user',
    ],
    features: [
      'Unlimited active listings',
      'Unlimited AI valuation scans',
      'Multi-user and employee access',
      'Advanced bookkeeping analytics',
      'Granular marketplace fee breakdowns',
    ],
  },
};

export const KEEPFLIP_ENTITLEMENT_TO_PLAN = Object.fromEntries(
  KEEPFLIP_PLAN_ORDER.map((planId) => [
    KEEPFLIP_PLANS[planId].entitlementId,
    planId,
  ]),
) as Record<string, KeepFlipPlanId>;

export function keepFlipPlanDefinition(plan: KeepFlipPlanId | null | undefined) {
  return plan ? KEEPFLIP_PLANS[plan] : null;
}

export function keepFlipPlanHasCapability(
  plan: KeepFlipPlanId | null | undefined,
  capability: KeepFlipCapability,
) {
  return Boolean(plan && KEEPFLIP_PLANS[plan].capabilities.includes(capability));
}

export function keepFlipFallbackPrice(
  planId: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
) {
  const plan = KEEPFLIP_PLANS[planId];
  const cents =
    cadence === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
  if (cents == null) return null;

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(cents / 100);
}
