import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  STORE_REPLACEMENT_MODE,
  type CustomerInfo,
  type PurchasesEntitlementInfo,
  type PurchasesPackage,
  type StoreProductChangeInfo,
} from 'react-native-purchases';

import {
  APPWRITE,
  ExecutionMethod,
  Query,
  functions,
  tablesDB,
} from '@/lib/appwrite';

export type KeepFlipPlanId = 'hobbyist' | 'serious' | 'power';
export type KeepFlipBillingCadence = 'monthly' | 'annual';

export type KeepFlipSubscriptionFeature =
  | 'basic_books'
  | 'automated_books'
  | 'schedule_c_export'
  | 'advanced_bookkeeping_analytics'
  | 'multi_user';

export type KeepFlipPlanLimits = {
  activeListingsPerMonth: number | null;
  aiValuationScansPerMonth: number | null;
  features: ReadonlySet<KeepFlipSubscriptionFeature>;
};

export const KEEPFLIP_PLAN_LIMITS: Record<
  KeepFlipPlanId,
  KeepFlipPlanLimits
> = {
  hobbyist: {
    activeListingsPerMonth: 50,
    aiValuationScansPerMonth: 100,
    features: new Set<KeepFlipSubscriptionFeature>(['basic_books']),
  },
  serious: {
    activeListingsPerMonth: 250,
    aiValuationScansPerMonth: null,
    features: new Set<KeepFlipSubscriptionFeature>([
      'basic_books',
      'automated_books',
      'schedule_c_export',
    ]),
  },
  power: {
    activeListingsPerMonth: null,
    aiValuationScansPerMonth: null,
    features: new Set<KeepFlipSubscriptionFeature>([
      'basic_books',
      'automated_books',
      'schedule_c_export',
      'advanced_bookkeeping_analytics',
      'multi_user',
    ]),
  },
};

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

export type KeepFlipServerSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'grace_period'
  | 'billing_issue'
  | 'cancelled'
  | 'expired'
  | 'revoked'
  | 'unknown';

export type KeepFlipServerSubscriptionRecord = {
  id: string;
  ownerId: string;
  provider: string;
  revenueCatCustomerId: string;
  plan: KeepFlipPlanId | null;
  entitlement: string | null;
  status: KeepFlipServerSubscriptionStatus;
  isTrial: boolean;
  startedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  willRenew: boolean;
  productId: string | null;
  store: string | null;
  lastEventId: string | null;
  updatedAt: string | null;
  isSandbox: boolean;
};

export type KeepFlipSubscriptionSnapshot = {
  access: KeepFlipSubscriptionAccess;
  catalog: KeepFlipSubscriptionCatalog;
  configured: boolean;
  serverRecord: KeepFlipServerSubscriptionRecord | null;
  serverRecordAvailable: boolean;
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
    monthlyPriceFallback: '$25',
    annualPriceFallback: '$250',
    description:
      'The essentials for casual and part-time resellers who want one place to value, organize, and track their flips.',
    limits: ['Up to 50 active listings / month', '100 AI valuation scans / month'],
    features: ['Basic bookkeeping reports', 'Inventory and item profit tracking'],
  },
  {
    id: 'serious',
    name: 'Serious Reseller',
    eyebrow: 'TIER 2 / SWEET SPOT',
    monthlyPriceFallback: '$45',
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
    monthlyPriceFallback: '$100',
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

export function keepFlipPlanAllows(
  plan: KeepFlipPlanId | null,
  feature: KeepFlipSubscriptionFeature,
) {
  return plan ? KEEPFLIP_PLAN_LIMITS[plan].features.has(feature) : false;
}

export function keepFlipPlanLimit(
  plan: KeepFlipPlanId | null,
  limit: 'activeListingsPerMonth' | 'aiValuationScansPerMonth',
) {
  return plan ? KEEPFLIP_PLAN_LIMITS[plan][limit] : 0;
}

export function isKeepFlipSubscriptionTableConfigured() {
  return Boolean(APPWRITE.databaseId && APPWRITE.userSubscriptionsTableId);
}

function appwriteText(value: unknown, maximum = 255) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : '';
}

function nullableAppwriteText(value: unknown, maximum = 255) {
  return appwriteText(value, maximum) || null;
}

function serverSubscriptionStatus(
  value: unknown,
): KeepFlipServerSubscriptionStatus {
  return value === 'trialing' ||
    value === 'active' ||
    value === 'grace_period' ||
    value === 'billing_issue' ||
    value === 'cancelled' ||
    value === 'expired' ||
    value === 'revoked'
    ? value
    : 'unknown';
}

function serverSubscriptionPlan(value: unknown): KeepFlipPlanId | null {
  return value === 'hobbyist' || value === 'serious' || value === 'power'
    ? value
    : null;
}

function parseServerSubscriptionRecord(
  value: unknown,
): KeepFlipServerSubscriptionRecord | null {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!row) return null;

  const id = appwriteText(row.$id ?? row.id, 64);
  const ownerId = appwriteText(row.ownerId, 64);
  if (!id || !ownerId) return null;

  const entitlement = nullableAppwriteText(row.entitlement, 64);
  const plan =
    serverSubscriptionPlan(row.plan) ||
    (entitlement ? entitlementPlan(entitlement) : null);

  return {
    id,
    ownerId,
    provider: appwriteText(row.provider, 32) || 'revenuecat',
    revenueCatCustomerId:
      appwriteText(row.revenueCatCustomerId, 255) || ownerId,
    plan,
    entitlement,
    status: serverSubscriptionStatus(row.status),
    isTrial: row.isTrial === true,
    startedAt: nullableAppwriteText(row.startedAt, 80),
    trialEndsAt: nullableAppwriteText(row.trialEndsAt, 80),
    currentPeriodEndsAt: nullableAppwriteText(row.currentPeriodEndsAt, 80),
    willRenew: row.willRenew === true,
    productId: nullableAppwriteText(row.productId, 128),
    store: nullableAppwriteText(row.store, 32),
    lastEventId: nullableAppwriteText(row.lastEventId, 255),
    updatedAt: nullableAppwriteText(row.updatedAt, 80),
    isSandbox: row.isSandbox === true,
  };
}

function isAppwriteNotFound(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      Number((error as { code?: unknown }).code) === 404,
  );
}

type SubscriptionFunctionPayload = Record<string, unknown>;

function parseSubscriptionFunctionPayload(value: string) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SubscriptionFunctionPayload)
      : {};
  } catch {
    return {};
  }
}

async function loadKeepFlipServerSubscriptionViaFunction(refresh = false) {
  const functionId = APPWRITE.subscriptionFunctionId;
  if (!functionId) return { available: false as const, record: null };

  const execution = await functions.createExecution({
    async: false,
    body: JSON.stringify({ refresh }),
    functionId,
    headers: { 'content-type': 'application/json' },
    method: ExecutionMethod.POST,
    xpath: '/status',
  });

  const payload = parseSubscriptionFunctionPayload(execution.responseBody);
  if (execution.responseStatusCode !== 200 || payload.ok !== true) {
    const message = appwriteText(payload.error, 1_000);
    throw new Error(
      message || 'KeepFlip could not verify server subscription access.',
    );
  }

  return {
    available: true as const,
    record: parseServerSubscriptionRecord(payload.subscription),
  };
}

async function loadKeepFlipServerSubscriptionRecordDirect(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId || !isKeepFlipSubscriptionTableConfigured()) return null;

  try {
    const row = await tablesDB.getRow({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.userSubscriptionsTableId,
      rowId: cleanUserId,
    });
    const record = parseServerSubscriptionRecord(row);
    return record?.ownerId === cleanUserId ? record : null;
  } catch (error) {
    if (!isAppwriteNotFound(error)) throw error;
  }

  const result = await tablesDB.listRows({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.userSubscriptionsTableId,
    queries: [Query.equal('ownerId', [cleanUserId]), Query.limit(2)],
    total: false,
  });

  const matches = result.rows
    .map(parseServerSubscriptionRecord)
    .filter(
      (record): record is KeepFlipServerSubscriptionRecord =>
        Boolean(record && record.ownerId === cleanUserId),
    );

  if (matches.length > 1) {
    throw new Error(
      'KeepFlip found more than one subscription record for this account.',
    );
  }

  return matches[0] ?? null;
}

export async function loadKeepFlipServerSubscriptionRecord(
  userId: string,
  refresh = false,
) {
  const cleanUserId = userId.trim();
  if (!cleanUserId) return null;

  if (APPWRITE.subscriptionFunctionId) {
    try {
      const result = await loadKeepFlipServerSubscriptionViaFunction(refresh);
      if (result.available) return result.record;
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[KeepFlip][Subscription] Subscription Police status failed; falling back to the read-only mirror.',
          error,
        );
      }
    }
  }

  return loadKeepFlipServerSubscriptionRecordDirect(cleanUserId);
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
    const serverRecord = await loadKeepFlipServerSubscriptionRecord(userId).catch(
      () => null,
    );
    return {
      access: EMPTY_ACCESS,
      catalog: EMPTY_CATALOG,
      configured: false,
      serverRecord,
      serverRecordAvailable: isKeepFlipSubscriptionTableConfigured(),
    };
  }

  const [customerInfo, offerings, serverRecord] = await Promise.all([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
    loadKeepFlipServerSubscriptionRecord(userId).catch(() => null),
  ]);
  const offering = configuredOffering(offerings);

  return {
    access: subscriptionAccessFromCustomerInfo(customerInfo),
    catalog: offering
      ? catalogFromPackages(offering.identifier, offering.availablePackages)
      : EMPTY_CATALOG,
    configured: true,
    serverRecord,
    serverRecordAvailable: isKeepFlipSubscriptionTableConfigured(),
  };
}

export async function subscribeToKeepFlipSubscriptionUpdates(
  userId: string,
  listener: (access: KeepFlipSubscriptionAccess) => void,
) {
  if (!(await ensureRevenueCatUser(userId))) return () => undefined;

  const customerInfoListener = (customerInfo: CustomerInfo) => {
    listener(subscriptionAccessFromCustomerInfo(customerInfo));
  };
  Purchases.addCustomerInfoUpdateListener(customerInfoListener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
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
    if (currentAccess.active && currentAccess.productId) {
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
