import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  STORE_REPLACEMENT_MODE,
  type CustomerInfo,
  type PurchasesEntitlementInfo,
  type PurchasesPackage,
  type StoreProductChangeInfo,
} from 'react-native-purchases';

export type KeepFlipPlanId = 'hobbyist' | 'serious' | 'power';
export type KeepFlipBillingCadence = 'monthly' | 'annual';

export type KeepFlipPlanDefinition = {
  id: KeepFlipPlanId;
  name: string;
  eyebrow: string;
  monthlyPriceFallback: string;
  annualPriceFallback: string | null;
  recommended?: boolean;
  description: string;
  limits: string[];
  features: string[];
};

export type KeepFlipSubscriptionAccess = {
  active: boolean;
  billingIssue: boolean;
  entitlementId: string | null;
  expiresAt: string | null;
  isTrial: boolean;
  managementUrl: string | null;
  periodType: string | null;
  plan: KeepFlipPlanId | null;
  productId: string | null;
  store: string | null;
  willRenew: boolean;
};

export type KeepFlipSubscriptionCatalog = {
  offeringId: string | null;
  prices: Record<
    KeepFlipPlanId,
    {
      annual: string | null;
      monthly: string | null;
    }
  >;
};

export type KeepFlipSubscriptionSnapshot = {
  access: KeepFlipSubscriptionAccess;
  catalog: KeepFlipSubscriptionCatalog;
  configured: boolean;
};

export const KEEPFLIP_SUBSCRIPTION_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID?.trim() || 'keepflip_default';

export const KEEPFLIP_ENTITLEMENTS: Record<KeepFlipPlanId, string> = {
  hobbyist: 'keepflip_hobbyist',
  serious: 'keepflip_serious',
  power: 'keepflip_power',
};

export const KEEPFLIP_PLAN_DEFINITIONS: KeepFlipPlanDefinition[] = [
  {
    id: 'hobbyist',
    name: 'Part-Time Hobbyist',
    eyebrow: 'TIER 1',
    monthlyPriceFallback: '$24.99',
    annualPriceFallback: '$239.88',
    description:
      'The essentials for casual and part-time resellers who want one place to value, organize, and track their flips.',
    limits: ['Up to 50 active listings / month', '100 AI valuation scans / month'],
    features: ['Basic bookkeeping reports', 'Inventory and item profit tracking'],
  },
  {
    id: 'serious',
    name: 'Serious Reseller',
    eyebrow: 'TIER 2 / SWEET SPOT',
    monthlyPriceFallback: '$44.99',
    annualPriceFallback: null,
    recommended: true,
    description:
      'The full automated resale workflow for sellers who want to save hours of comp research and expense matching.',
    limits: ['Up to 250 active listings / month', 'Unlimited AI valuation scans'],
    features: [
      'Full automated bookkeeping',
      'Schedule C export',
      'eBay money reconciliation',
    ],
  },
  {
    id: 'power',
    name: 'Power Seller',
    eyebrow: 'TIER 3',
    monthlyPriceFallback: '$89.99',
    annualPriceFallback: null,
    description:
      'Built for high-volume sourcing, liquidation inventory, and resale operations with more than one person involved.',
    limits: ['Unlimited active listings', 'Unlimited AI valuation scans'],
    features: [
      'Multi-user / employee access',
      'Advanced bookkeeping analytics',
      'Granular marketplace fee analysis',
    ],
  },
];

const PACKAGE_IDS: Record<
  KeepFlipPlanId,
  Partial<Record<KeepFlipBillingCadence, string>>
> = {
  hobbyist: {
    monthly: 'hobbyist_monthly',
    annual: 'hobbyist_annual',
  },
  serious: {
    monthly: 'serious_monthly',
  },
  power: {
    monthly: 'power_monthly',
  },
};

const EMPTY_ACCESS: KeepFlipSubscriptionAccess = {
  active: false,
  billingIssue: false,
  entitlementId: null,
  expiresAt: null,
  isTrial: false,
  managementUrl: null,
  periodType: null,
  plan: null,
  productId: null,
  store: null,
  willRenew: false,
};

const EMPTY_CATALOG: KeepFlipSubscriptionCatalog = {
  offeringId: null,
  prices: {
    hobbyist: { annual: null, monthly: null },
    serious: { annual: null, monthly: null },
    power: { annual: null, monthly: null },
  },
};

let configuredForUserId: string | null = null;

function platformApiKey() {
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || '';
  }
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || '';
  }
  return '';
}

export function areKeepFlipSubscriptionsConfigured() {
  return Boolean(platformApiKey());
}

export function areKeepFlipSubscriptionsEnforced() {
  return process.env.EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED === 'true';
}

function entitlementPlan(identifier: string): KeepFlipPlanId | null {
  const match = (Object.entries(KEEPFLIP_ENTITLEMENTS) as [
    KeepFlipPlanId,
    string,
  ][]).find(([, entitlement]) => entitlement === identifier);
  return match?.[0] ?? null;
}

function strongestEntitlement(
  customerInfo: CustomerInfo,
): { plan: KeepFlipPlanId; info: PurchasesEntitlementInfo } | null {
  const priority: KeepFlipPlanId[] = ['power', 'serious', 'hobbyist'];

  for (const plan of priority) {
    const entitlementId = KEEPFLIP_ENTITLEMENTS[plan];
    const info = customerInfo.entitlements.active[entitlementId];
    if (info?.isActive) return { plan, info };
  }

  let fallback:
    | { plan: KeepFlipPlanId; info: PurchasesEntitlementInfo }
    | null = null;
  for (const [identifier, info] of Object.entries(customerInfo.entitlements.all)) {
    const plan = entitlementPlan(identifier);
    if (!plan) continue;
    if (
      !fallback ||
      info.latestPurchaseDateMillis > fallback.info.latestPurchaseDateMillis
    ) {
      fallback = { plan, info };
    }
  }
  return fallback;
}

export function subscriptionAccessFromCustomerInfo(
  customerInfo: CustomerInfo,
): KeepFlipSubscriptionAccess {
  const matched = strongestEntitlement(customerInfo);
  if (!matched) {
    return {
      ...EMPTY_ACCESS,
      managementUrl: customerInfo.managementURL ?? null,
    };
  }

  const { info, plan } = matched;
  return {
    active: info.isActive,
    billingIssue: Boolean(info.billingIssueDetectedAt),
    entitlementId: info.identifier,
    expiresAt: info.expirationDate,
    isTrial: info.periodType.toUpperCase() === 'TRIAL',
    managementUrl: customerInfo.managementURL ?? null,
    periodType: info.periodType || null,
    plan,
    productId: info.productIdentifier || null,
    store: info.store || null,
    willRenew: info.willRenew,
  };
}

async function ensureRevenueCatUser(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('Sign in before loading a KeepFlip plan.');

  const apiKey = platformApiKey();
  if (!apiKey) return false;

  const alreadyConfigured = await Purchases.isConfigured();
  if (!alreadyConfigured) {
    Purchases.configure({
      apiKey,
      appUserID: cleanUserId,
    });
    configuredForUserId = cleanUserId;
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    return true;
  }

  if (configuredForUserId !== cleanUserId) {
    const currentUserId = await Purchases.getAppUserID();
    if (currentUserId !== cleanUserId) {
      await Purchases.logIn(cleanUserId);
    }
    configuredForUserId = cleanUserId;
  }

  return true;
}

function configuredOffering(offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>) {
  return (
    offerings.all[KEEPFLIP_SUBSCRIPTION_OFFERING_ID] ??
    offerings.current ??
    null
  );
}

function packageForSelection(
  packages: PurchasesPackage[],
  plan: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
) {
  const expectedPackageId = PACKAGE_IDS[plan][cadence];
  if (!expectedPackageId) return null;

  const normalizedExpected = expectedPackageId.toLowerCase();
  const byPackage = packages.find(
    (candidate) => candidate.identifier.toLowerCase() === normalizedExpected,
  );
  if (byPackage) return byPackage;

  const planToken = plan.toLowerCase();
  const cadenceToken = cadence.toLowerCase();
  return (
    packages.find((candidate) => {
      const packageId = candidate.identifier.toLowerCase();
      const productId = candidate.product.identifier.toLowerCase();
      return (
        (packageId.includes(planToken) || productId.includes(planToken)) &&
        (packageId.includes(cadenceToken) ||
          productId.includes(cadenceToken) ||
          (cadence === 'monthly' && candidate.product.subscriptionPeriod === 'P1M') ||
          (cadence === 'annual' && candidate.product.subscriptionPeriod === 'P1Y'))
      );
    }) ?? null
  );
}

function catalogFromPackages(
  offeringId: string | null,
  packages: PurchasesPackage[],
): KeepFlipSubscriptionCatalog {
  const prices: KeepFlipSubscriptionCatalog['prices'] = {
    hobbyist: { annual: null, monthly: null },
    serious: { annual: null, monthly: null },
    power: { annual: null, monthly: null },
  };

  for (const plan of ['hobbyist', 'serious', 'power'] as KeepFlipPlanId[]) {
    for (const cadence of ['monthly', 'annual'] as KeepFlipBillingCadence[]) {
      const selected = packageForSelection(packages, plan, cadence);
      if (selected) prices[plan][cadence] = selected.product.priceString;
    }
  }

  return { offeringId, prices };
}

export async function loadKeepFlipSubscription(
  userId: string,
): Promise<KeepFlipSubscriptionSnapshot> {
  if (!(await ensureRevenueCatUser(userId))) {
    return {
      access: EMPTY_ACCESS,
      catalog: EMPTY_CATALOG,
      configured: false,
    };
  }

  const [customerInfo, offerings] = await Promise.all([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
  ]);
  const offering = configuredOffering(offerings);

  return {
    access: subscriptionAccessFromCustomerInfo(customerInfo),
    catalog: offering
      ? catalogFromPackages(offering.identifier, offering.availablePackages)
      : EMPTY_CATALOG,
    configured: true,
  };
}

export async function purchaseKeepFlipPlan(
  userId: string,
  plan: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
) {
  if (!(await ensureRevenueCatUser(userId))) {
    throw new Error(
      'KeepFlip subscriptions are not configured in this build yet.',
    );
  }

  const offerings = await Purchases.getOfferings();
  const offering = configuredOffering(offerings);
  if (!offering) {
    throw new Error(
      'KeepFlip could not load the subscription offering. Check the RevenueCat offering configuration.',
    );
  }

  const selectedPackage = packageForSelection(
    offering.availablePackages,
    plan,
    cadence,
  );
  if (!selectedPackage) {
    throw new Error(
      `The ${plan} ${cadence} plan is not available from the store yet.`,
    );
  }

  let productChangeInfo: StoreProductChangeInfo | null = null;
  if (Platform.OS === 'android') {
    const currentInfo = await Purchases.getCustomerInfo();
    const currentAccess = subscriptionAccessFromCustomerInfo(currentInfo);
    if (
      currentAccess.active &&
      currentAccess.productId &&
      currentAccess.productId !== selectedPackage.product.identifier
    ) {
      const rank: Record<KeepFlipPlanId, number> = {
        hobbyist: 1,
        serious: 2,
        power: 3,
      };
      const isDowngrade =
        currentAccess.plan != null &&
        rank[plan] < rank[currentAccess.plan];

      productChangeInfo = {
        oldProductIdentifier: currentAccess.productId,
        replacementMode: isDowngrade
          ? STORE_REPLACEMENT_MODE.DEFERRED
          : STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION,
      };
    }
  }

  const result = await Purchases.purchasePackage(
    selectedPackage,
    null,
    productChangeInfo,
  );
  return subscriptionAccessFromCustomerInfo(result.customerInfo);
}

export async function restoreKeepFlipPurchases(userId: string) {
  if (!(await ensureRevenueCatUser(userId))) {
    throw new Error(
      'KeepFlip subscriptions are not configured in this build yet.',
    );
  }

  const customerInfo = await Purchases.restorePurchases();
  return subscriptionAccessFromCustomerInfo(customerInfo);
}

export async function openKeepFlipSubscriptionManagement(
  userId: string,
  managementUrl?: string | null,
) {
  if (!(await ensureRevenueCatUser(userId))) {
    throw new Error(
      'KeepFlip subscriptions are not configured in this build yet.',
    );
  }

  const customerInfo = managementUrl
    ? null
    : await Purchases.getCustomerInfo();
  const url = managementUrl || customerInfo?.managementURL || '';

  if (!url) {
    throw new Error(
      'The store has not provided a subscription-management link for this account yet.',
    );
  }

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('KeepFlip could not open the store subscription settings.');
  }

  await Linking.openURL(url);
}
