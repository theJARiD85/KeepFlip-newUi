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
  Channel,
  type RealtimeSubscription,
} from 'react-native-appwrite';

import {
  APPWRITE,
  ExecutionMethod,
  functions,
  realtime,
} from '@/lib/appwrite';
import { getKeepFlipTrialDeviceIdHash } from '@/services/keepflip-trial-device-service';

export type KeepFlipPlanId = 'hobbyist' | 'serious';
export type KeepFlipBillingCadence = 'monthly' | 'annual';

export type KeepFlipSubscriptionFeature =
  | 'basic_books'
  | 'automated_books'
  | 'schedule_c_export'
  | 'advanced_bookkeeping_analytics'
  | 'net_proceeds_scenarios'
  | 'automatic_order_sync'
  | 'bulk_listings'
  | 'offer_guardrails'
  | 'automated_offers'
  | 'automated_repricing'
  | 'cross_marketplace_sync'
  | 'automatic_delisting'
  | 'seller_analytics'
  | 'multi_user';

export type KeepFlipPlanLimits = {
  concurrentActiveListings: number | null;
  monthlyPublishQuota: number | null;
  /** @deprecated Compatibility alias for concurrentActiveListings. */
  activeListingsPerMonth: number | null;
  aiValuationScansPerMonth: number | null;
  features: Set<KeepFlipSubscriptionFeature>;
};

export const KEEPFLIP_PLAN_LIMITS: Record<
  KeepFlipPlanId,
  KeepFlipPlanLimits
> = {
  hobbyist: {
    concurrentActiveListings: 50,
    monthlyPublishQuota: null,
    activeListingsPerMonth: 50,
    aiValuationScansPerMonth: 100,
    features: new Set<KeepFlipSubscriptionFeature>(['basic_books']),
  },
  serious: {
    concurrentActiveListings: 250,
    monthlyPublishQuota: null,
    activeListingsPerMonth: 250,
    aiValuationScansPerMonth: null,
    features: new Set<KeepFlipSubscriptionFeature>([
      'basic_books',
      'automated_books',
      'schedule_c_export',
      'advanced_bookkeeping_analytics',
      'net_proceeds_scenarios',
      'automatic_order_sync',
      'bulk_listings',
      'offer_guardrails',
      'automated_offers',
      'automated_repricing',
      'cross_marketplace_sync',
      'automatic_delisting',
      'seller_analytics',
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
  trialUsed: boolean;
  managementUrl: string | null;
  periodType: string | null;
  plan: KeepFlipPlanId | null;
  productId: string | null;
  store: string | null;
  trialSource: 'profile' | 'store' | null;
  willRenew: boolean;
};

export type KeepFlipProfileTrial = {
  active: boolean;
  endedByScanLimit: boolean;
  scanLimit: number | null;
  scanUsage: number | null;
  trialEndDate: string | null;
  trialUsed: boolean;
};

export type KeepFlipAiValuationAccess = {
  allowed: boolean;
  limit: number | null;
  profileTrial: KeepFlipProfileTrial | null;
  reason: string;
  usage: number | null;
};

/**
 * Server-verified capability result. This is appropriate for deciding which
 * subscription-only controls to render when a feature screen opens. It is
 * deliberately not the enforcement boundary: the destination Function must
 * make the same check before it performs protected work.
 */
export type KeepFlipCapabilityAccess = {
  allowed: boolean;
  limit: number | null;
  profileTrial: KeepFlipProfileTrial | null;
  reason: string;
  usage: number | null;
};

export type KeepFlipSubscriptionCapability =
  | KeepFlipSubscriptionFeature
  | 'ai_valuation'
  | 'active_listing';

export type KeepFlipCapabilitiesAccess = Partial<
  Record<KeepFlipSubscriptionCapability, KeepFlipCapabilityAccess>
>;

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
  profileTrial: KeepFlipProfileTrial | null;
  serverRecord: KeepFlipServerSubscriptionRecord | null;
  serverRecordAvailable: boolean;
};

export const KEEPFLIP_SUBSCRIPTION_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID?.trim() || 'keepflip_default';

export const KEEPFLIP_ENTITLEMENTS: Record<KeepFlipPlanId, string> = {
  hobbyist: 'keepflip_hobbyist',
  serious: 'keepflip_serious',
};

export const KEEPFLIP_PLAN_DEFINITIONS: KeepFlipPlanDefinition[] = [
  {
    id: 'hobbyist',
    name: 'Part-Time Hobbyist',
    eyebrow: 'PART-TIME / ESSENTIALS',
    monthlyPriceFallback: '$10',
    annualPriceFallback: '$100',
    description:
      'For part-time resellers who want smarter sourcing, organized inventory, reliable valuations, and a clearer view of costs and profit.',
    limits: ['Up to 50 live listings at one time', '100 AI valuation scans / month'],
    features: ['Basic bookkeeping reports', 'Inventory and item profit tracking'],
  },
  {
    id: 'serious',
    name: 'Serious Reseller',
    eyebrow: 'SERIOUS / BEST FOR BUSINESS',
    monthlyPriceFallback: '$25',
    annualPriceFallback: '$250',
    recommended: true,
    description:
      'KeepFlip\'s top tier for active resale businesses. Every KeepFlip feature is unlocked; the only plan limit is up to 250 active listings total.',
    limits: ['Up to 250 active listings total'],
    features: [
      'Every KeepFlip feature unlocked',
      'Unlimited AI valuation scans',
      'Full automated bookkeeping',
      'Schedule C export',
      'eBay money reconciliation',
    ],
  },
];

const PACKAGE_IDS: Record<
  KeepFlipPlanId,
  Partial<Record<KeepFlipBillingCadence, string>>
> = {
  // These are RevenueCat package identifiers from the live offering. The
  // hyphenated values are Google Play base-plan IDs, not package IDs.
  hobbyist: {
    monthly: 'hobbyist_monthly',
    annual: 'hobbyist_annual',
  },
  serious: {
    monthly: 'serious_monthly',
    annual: 'serious_annual',
  },
};

const EMPTY_ACCESS: KeepFlipSubscriptionAccess = {
  active: false,
  billingIssue: false,
  entitlementId: null,
  expiresAt: null,
  isTrial: false,
  trialUsed: false,
  managementUrl: null,
  periodType: null,
  plan: null,
  productId: null,
  store: null,
  trialSource: null,
  willRenew: false,
};

const EMPTY_CATALOG: KeepFlipSubscriptionCatalog = {
  offeringId: null,
  prices: {
    hobbyist: { annual: null, monthly: null },
    serious: { annual: null, monthly: null },
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
  if (!plan) return false;

  // Serious is KeepFlip's top tier. It intentionally unlocks every current
  // and future feature; its only plan-level restriction is the 250 active
  // listing cap enforced through keepFlipPlanLimit().
  if (plan === 'serious') return true;

  return KEEPFLIP_PLAN_LIMITS[plan].features.has(feature);
}

export function keepFlipPlanLimit(
  plan: KeepFlipPlanId | null,
  limit:
    | 'concurrentActiveListings'
    | 'monthlyPublishQuota'
    | 'activeListingsPerMonth'
    | 'aiValuationScansPerMonth',
) {
  return plan ? KEEPFLIP_PLAN_LIMITS[plan][limit] : 0;
}

function appwriteText(value: unknown, maximum = 255) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : '';
}

function nonNegativeSafeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  return value;
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
  return value === 'hobbyist' || value === 'serious'
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

function serverRecordAllowsAccess(
  record: KeepFlipServerSubscriptionRecord,
  now = Date.now(),
) {
  if (!record.plan) return false;
  if (record.status === 'expired' || record.status === 'revoked') return false;

  const periodEnd = record.currentPeriodEndsAt
    ? Date.parse(record.currentPeriodEndsAt)
    : Number.NaN;

  if (
    record.status === 'cancelled' ||
    record.status === 'billing_issue' ||
    record.status === 'grace_period'
  ) {
    return Number.isFinite(periodEnd) && periodEnd > now;
  }

  if (record.status === 'trialing' || record.status === 'active') {
    return !Number.isFinite(periodEnd) || periodEnd > now;
  }

  return false;
}

function subscriptionAccessFromServerRecord(
  record: KeepFlipServerSubscriptionRecord,
): KeepFlipSubscriptionAccess {
  const active = serverRecordAllowsAccess(record);

  return {
    ...EMPTY_ACCESS,
    active,
    billingIssue: record.status === 'billing_issue',
    entitlementId: record.entitlement,
    expiresAt: record.currentPeriodEndsAt,
    isTrial: record.isTrial && active,
    periodType: record.status,
    plan: record.plan,
    productId: record.productId,
    store: record.store,
    trialSource: active && record.isTrial ? 'store' : null,
    trialUsed: record.isTrial || Boolean(record.trialEndsAt),
    willRenew: record.willRenew,
  };
}

type SubscriptionFunctionPayload = Record<string, unknown>;

type KeepFlipServerStatusResponse = {
  access: KeepFlipSubscriptionAccess | null;
  available: boolean;
  profileTrial: KeepFlipProfileTrial | null;
  record: KeepFlipServerSubscriptionRecord | null;
};

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

function parseServerProfileTrial(value: unknown): KeepFlipProfileTrial | null {
  const trial =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!trial) return null;

  const trialEndDate = nullableAppwriteText(trial.trialEndDate, 80);
  return {
    active: trial.active === true && Boolean(trialEndDate),
    endedByScanLimit: trial.endedByScanLimit === true,
    scanLimit: nonNegativeSafeInteger(trial.scanLimit),
    scanUsage: nonNegativeSafeInteger(trial.scanUsage),
    trialEndDate,
    trialUsed: trial.trialUsed === true,
  };
}

function parseServerSubscriptionAccess(
  value: unknown,
): KeepFlipSubscriptionAccess | null {
  const access =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!access) return null;

  const trialSource =
    access.trialSource === 'profile' || access.trialSource === 'store'
      ? access.trialSource
      : null;

  return {
    ...EMPTY_ACCESS,
    active: access.active === true,
    billingIssue:
      access.billingIssue === true || access.status === 'billing_issue',
    entitlementId: nullableAppwriteText(access.entitlementId, 64),
    expiresAt: nullableAppwriteText(access.currentPeriodEndsAt, 80),
    isTrial: access.isTrial === true,
    managementUrl: nullableAppwriteText(access.managementUrl, 2_000),
    periodType: nullableAppwriteText(access.status, 32),
    plan: serverSubscriptionPlan(access.plan),
    productId: nullableAppwriteText(access.productId, 128),
    store: nullableAppwriteText(access.store, 32),
    trialSource,
    trialUsed: access.trialUsed === true,
    willRenew: access.willRenew === true,
  };
}

async function loadKeepFlipServerSubscriptionViaFunction(
  deviceIdHash: string | null,
  refresh = false,
): Promise<KeepFlipServerStatusResponse> {
  const functionId = APPWRITE.subscriptionFunctionId;
  if (!functionId) {
    return {
      access: null,
      available: false,
      profileTrial: null,
      record: null,
    };
  }

  const execution = await functions.createExecution({
    async: false,
    body: JSON.stringify({
      refresh,
      ...(deviceIdHash ? { deviceIdHash } : {}),
    }),
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
    access: parseServerSubscriptionAccess(payload.access),
    available: true,
    profileTrial: parseServerProfileTrial(payload.profileTrial),
    record: parseServerSubscriptionRecord(payload.subscription),
  };
}

function parseKeepFlipCapabilityAccess(
  value: unknown,
): KeepFlipCapabilityAccess {
  const payload =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as SubscriptionFunctionPayload)
      : {};
  return {
    allowed: payload.allowed === true,
    limit: nonNegativeSafeInteger(payload.limit),
    profileTrial: parseServerProfileTrial(payload.profileTrial),
    reason: appwriteText(payload.reason, 80) || 'access_unavailable',
    usage: nonNegativeSafeInteger(payload.usage),
  };
}

async function executeKeepFlipCapabilityCheck(
  body: Record<string, unknown>,
): Promise<SubscriptionFunctionPayload> {
  const functionId = APPWRITE.subscriptionFunctionId;
  if (!functionId) {
    throw new Error('KeepFlip subscription access is not configured in this build.');
  }

  const deviceIdHash = await getKeepFlipTrialDeviceIdHash().catch(() => null);
  const execution = await functions.createExecution({
    async: false,
    body: JSON.stringify({
      ...body,
      ...(deviceIdHash ? { deviceIdHash } : {}),
    }),
    functionId,
    headers: { 'content-type': 'application/json' },
    method: ExecutionMethod.POST,
    xpath: '/access/check',
  });

  const payload = parseSubscriptionFunctionPayload(execution.responseBody);
  if (execution.responseStatusCode !== 200 || payload.ok !== true) {
    throw new Error(
      appwriteText(payload.error, 1_000) ||
        'KeepFlip could not verify subscription access right now.',
    );
  }

  return payload;
}

export async function checkKeepFlipCapabilityAccess(
  capability: KeepFlipSubscriptionCapability,
): Promise<KeepFlipCapabilityAccess> {
  const payload = await executeKeepFlipCapabilityCheck({ capability });
  return parseKeepFlipCapabilityAccess(payload);
}

/**
 * Checks all feature flags a screen needs in one JWT-authenticated request.
 * This is display gating only; each protected Function independently verifies
 * the same user against the durable subscription row before doing work.
 */
export async function checkKeepFlipCapabilitiesAccess(
  capabilities: readonly KeepFlipSubscriptionCapability[],
): Promise<KeepFlipCapabilitiesAccess> {
  const requested = [...new Set(capabilities)];
  if (!requested.length) return {};

  const payload = await executeKeepFlipCapabilityCheck({
    capabilities: requested,
  });
  const checks =
    payload.checks && typeof payload.checks === 'object' && !Array.isArray(payload.checks)
      ? (payload.checks as SubscriptionFunctionPayload)
      : {};

  return requested.reduce<KeepFlipCapabilitiesAccess>((result, capability) => {
    const check = checks[capability];
    if (check && typeof check === 'object' && !Array.isArray(check)) {
      result[capability] = parseKeepFlipCapabilityAccess({
        ...(check as SubscriptionFunctionPayload),
        // The batch response returns trial metadata once at the top level.
        profileTrial: payload.profileTrial,
      });
    }
    return result;
  }, {});
}

export async function checkKeepFlipAiValuationAccess(): Promise<KeepFlipAiValuationAccess> {
  return checkKeepFlipCapabilityAccess('ai_valuation');
}

export async function loadKeepFlipServerSubscriptionRecord(
  userId: string,
  refresh = false,
) {
  const result = await loadKeepFlipServerSubscriptionStatus(
    userId,
    null,
    refresh,
  );
  return result.record;
}

async function loadKeepFlipServerSubscriptionStatus(
  userId: string,
  deviceIdHash: string | null,
  refresh = false,
): Promise<KeepFlipServerStatusResponse> {
  if (!userId.trim()) {
    return {
      access: null,
      available: false,
      profileTrial: null,
      record: null,
    };
  }

  if (APPWRITE.subscriptionFunctionId) {
    try {
      const result = await loadKeepFlipServerSubscriptionViaFunction(
        deviceIdHash,
        refresh,
      );
      if (result.available) return result;
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[KeepFlip][Subscription] Server subscription status check failed; protected features are unavailable until it recovers.',
          error,
        );
      }
    }
  }

  return {
    // Never read the entitlement mirror directly in the mobile client. A
    // Function-authenticated JWT check is the only source used to decide
    // access, so a transient policy outage fails closed rather than quietly
    // making a premium feature available from a readable database row.
    access: null,
    available: false,
    profileTrial: null,
    record: null,
  };
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
  const priority: KeepFlipPlanId[] = ['serious', 'hobbyist'];

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

function customerInfoHasUsedTrial(customerInfo: CustomerInfo) {
  const entitlementTrial = Object.values(
    customerInfo.entitlements.all,
  ).some((info) => info.periodType?.toUpperCase() === 'TRIAL');
  const subscriptionTrial = Object.values(
    customerInfo.subscriptionsByProductIdentifier ?? {},
  ).some((info) => info.periodType?.toUpperCase() === 'TRIAL');

  return entitlementTrial || subscriptionTrial;
}

function accessWithServerTrialHistory(
  access: KeepFlipSubscriptionAccess,
  serverRecord: KeepFlipServerSubscriptionRecord | null,
  profileTrial: KeepFlipProfileTrial | null = null,
) {
  return {
    ...access,
    trialUsed:
      access.trialUsed ||
      serverRecord?.isTrial === true ||
      Boolean(serverRecord?.trialEndsAt) ||
      profileTrial?.trialUsed === true,
  };
}

function effectiveSubscriptionAccess(
  localAccess: KeepFlipSubscriptionAccess,
  serverStatus: KeepFlipServerStatusResponse,
) {
  const serverRecord = serverStatus.record;
  const serverAccess =
    serverStatus.access ||
    (serverRecord ? subscriptionAccessFromServerRecord(serverRecord) : null);

  // RevenueCat is useful for purchase UI metadata, but it is never an
  // authorization source. If the authenticated Function cannot resolve the
  // durable entitlement, client feature gates fail closed.
  if (!serverStatus.available || !serverAccess) {
    return {
      ...EMPTY_ACCESS,
      managementUrl: localAccess.managementUrl,
      trialUsed: localAccess.trialUsed,
    };
  }

  // RevenueCat supplies useful local metadata such as the management URL,
  // while the authenticated server check supplies authoritative access.
  const mergedServerAccess: KeepFlipSubscriptionAccess = {
    ...localAccess,
    ...serverAccess,
    billingIssue:
      serverAccess.billingIssue || serverRecord?.status === 'billing_issue',
    managementUrl: serverAccess.managementUrl || localAccess.managementUrl,
    productId:
      serverAccess.productId ||
      serverRecord?.productId ||
      localAccess.productId,
    store: serverAccess.store || serverRecord?.store || localAccess.store,
  };

  return mergedServerAccess;
}

export function subscriptionAccessFromCustomerInfo(
  customerInfo: CustomerInfo,
): KeepFlipSubscriptionAccess {
  const matched = strongestEntitlement(customerInfo);
  const trialUsed = customerInfoHasUsedTrial(customerInfo);
  if (!matched) {
    return {
      ...EMPTY_ACCESS,
      managementUrl: customerInfo.managementURL ?? null,
      trialUsed,
    };
  }

  const { info, plan } = matched;
  return {
    active: info.isActive,
    billingIssue: Boolean(info.billingIssueDetectedAt),
    entitlementId: info.identifier,
    expiresAt: info.expirationDate,
    isTrial: info.periodType.toUpperCase() === 'TRIAL',
    trialUsed,
    managementUrl: customerInfo.managementURL ?? null,
    periodType: info.periodType || null,
    plan,
    productId: info.productIdentifier || null,
    store: info.store || null,
    trialSource: info.periodType.toUpperCase() === 'TRIAL' ? 'store' : null,
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

  // RevenueCat package IDs are part of KeepFlip's billing contract. Normalize
  // only underscore vs hyphen because those are commonly confused with the
  // Google Play base-plan ID. The exact configured package remains preferred.
  const normalizedExpected = expectedPackageId
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const expectedPeriod = cadence === 'monthly' ? 'P1M' : 'P1Y';

  const exactPackage = packages.find((candidate) => {
    const normalizedCandidate = candidate.identifier
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    if (normalizedCandidate !== normalizedExpected) return false;

    const actualPeriod = candidate.product.subscriptionPeriod;
    return !actualPeriod || actualPeriod === expectedPeriod;
  });
  if (exactPackage) return exactPackage;

  // A package can be mislabeled in the offering while its attached Play base
  // plan is still valid. Recover only within the same tier and only when the
  // SDK reports the requested period, so cadence cannot silently cross over.
  const periodMatchedPackage = packages.find((candidate) => {
    const normalizedCandidate = candidate.identifier
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    return (
      normalizedCandidate.startsWith(`${plan}_`) &&
      candidate.product.subscriptionPeriod === expectedPeriod
    );
  });
  if (periodMatchedPackage && __DEV__) {
    console.warn(
      `[KeepFlip] RevenueCat package ${expectedPackageId} was not available for ${cadence}; using ${periodMatchedPackage.identifier} because its store period is ${expectedPeriod}. Fix the package/base-plan mapping in RevenueCat.`,
    );
  }
  return periodMatchedPackage ?? null;
}

function catalogFromPackages(
  offeringId: string | null,
  packages: PurchasesPackage[],
): KeepFlipSubscriptionCatalog {
  const prices: KeepFlipSubscriptionCatalog['prices'] = {
    hobbyist: { annual: null, monthly: null },
    serious: { annual: null, monthly: null },
  };

  for (const plan of ['hobbyist', 'serious'] as KeepFlipPlanId[]) {
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
  const deviceIdHash = await getKeepFlipTrialDeviceIdHash().catch(() => null);
  const serverStatusPromise = loadKeepFlipServerSubscriptionStatus(
    userId,
    deviceIdHash,
  ).catch(() => ({
    access: null,
    available: false,
    profileTrial: null,
    record: null,
  }));

  if (!(await ensureRevenueCatUser(userId))) {
    const serverStatus = await serverStatusPromise;
    const serverRecord = serverStatus.record;
    return {
      access: accessWithServerTrialHistory(
        effectiveSubscriptionAccess(EMPTY_ACCESS, serverStatus),
        serverRecord,
        serverStatus.profileTrial,
      ),
      catalog: EMPTY_CATALOG,
      configured: false,
      profileTrial: serverStatus.profileTrial,
      serverRecord,
      serverRecordAvailable:
        serverStatus.available,
    };
  }

  const [customerInfo, offerings, serverStatus] = await Promise.all([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
    serverStatusPromise,
  ]);
  const offering = configuredOffering(offerings);
  const localAccess = subscriptionAccessFromCustomerInfo(customerInfo);
  const serverRecord = serverStatus.record;
  const access = accessWithServerTrialHistory(
    effectiveSubscriptionAccess(localAccess, serverStatus),
    serverRecord,
    serverStatus.profileTrial,
  );

  return {
    access,
    catalog: offering
      ? catalogFromPackages(offering.identifier, offering.availablePackages)
      : EMPTY_CATALOG,
    configured: true,
    profileTrial: serverStatus.profileTrial,
    serverRecord,
    serverRecordAvailable:
      serverStatus.available,
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

/**
 * Listen for server-side entitlement changes. RevenueCat webhooks update the
 * user_subscription row, while profile-trial reconciliation may update the
 * current user's user_profiles row. The callback deliberately asks the
 * subscription context to reload the authoritative snapshot instead of
 * trusting an event payload as an authorization decision.
 */
export async function subscribeToKeepFlipEntitlementUpdates(
  userId: string,
  listener: () => void,
): Promise<RealtimeSubscription | null> {
  const cleanUserId = userId.trim();
  if (!cleanUserId || !APPWRITE.databaseId) return null;

  const channels = [
    ...(APPWRITE.userSubscriptionsTableId
      ? [
          Channel.tablesdb(APPWRITE.databaseId)
            .table(APPWRITE.userSubscriptionsTableId)
            .row(cleanUserId),
        ]
      : []),
    ...(APPWRITE.userProfilesTableId
      ? [
          Channel.tablesdb(APPWRITE.databaseId)
            .table(APPWRITE.userProfilesTableId)
            .row(cleanUserId),
        ]
      : []),
  ];

  if (!channels.length) return null;

  return realtime.subscribe(channels, () => listener());
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
