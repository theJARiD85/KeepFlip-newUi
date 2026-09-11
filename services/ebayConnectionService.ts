import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ExecutionMethod, functions } from '../lib/appwrite';
import {
  clearEbayOAuthState,
  startEbayLogin,
} from '../lib/start-ebay-login';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type EbayConnectionResult = {
  status: 'connected' | 'declined' | 'error' | 'dismissed';
  environment: EbayOAuthEnvironment;
  connection?: EbayConnectionStatusResult;
};

export type EbayConnectionStatusResult = {
  connected: boolean;
  environment: EbayOAuthEnvironment;
  ebayUsername?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  accessTokenExpired?: boolean;
  needsReconnect?: boolean;
};

export type EbaySellerProfile = {
  username?: string;
  accountType?: string;
  accountStatus?: string;
  registrationMarketplaceId?: string;
  businessName?: string;
  doingBusinessAs?: string;
  businessWebsiteUrl?: string;
  lastSyncedAt?: string;
};

export type EbaySellerListing = {
  listingId?: string;
  offerId?: string;
  sku?: string;
  title?: string;
  status?: string;
  listingUrl?: string;
  currentPriceCents?: number;
  currency?: string;
  quantityAvailable?: number;
  lastSyncedAt?: string;
};

export type EbaySellerBusinessPolicyOption = {
  policyType: 'payment' | 'fulfillment' | 'return';
  policyId: string;
  marketplaceId?: string;
  policyName?: string;
  categoryType?: string;
  returnsAccepted?: boolean;
  returnPeriodDays?: number;
  returnShippingCostPayer?: string;
  refundMethod?: string;
  handlingTimeDays?: number;
  shippingOptionCount?: number;
};

export type EbaySellerInventoryLocationOption = {
  merchantLocationKey: string;
  locationName?: string;
  locationType?: string;
  countryCode?: string;
  locationStatus?: string;
};

export type EbaySellerListingDefaults = {
  defaultMerchantLocationKey: string | null;
  defaultPaymentPolicyId: string | null;
  defaultFulfillmentPolicyId: string | null;
  defaultReturnPolicyId: string | null;
};

export type EbaySellerListingSetup = {
  state: 'ready' | 'needs_setup' | 'failed';
  marketplaceId: string;
  policyCounts: {
    payment: number;
    fulfillment: number;
    return: number;
  };
  locationCount: number;
  defaultSelection: {
    hasMerchantLocation: boolean;
    hasPaymentPolicy: boolean;
    hasFulfillmentPolicy: boolean;
    hasReturnPolicy: boolean;
  };
  defaults: EbaySellerListingDefaults;
  policyOptions: EbaySellerBusinessPolicyOption[];
  locationOptions: EbaySellerInventoryLocationOption[];
  lastCheckedAt?: string;
  issueCode?: string;
  message?: string;
};

export type EbaySellerAccountResult = {
  connected: boolean;
  environment: EbayOAuthEnvironment;
  profile?: EbaySellerProfile;
  profileFreshness?: 'current' | 'stale';
  listingSetup?: EbaySellerListingSetup;
  listingCount: number;
  listings: EbaySellerListing[];
};

export type EbaySellerMetric = {
  metricKey?: string;
  name?: string;
  type?: string;
  level?: string;
  valueDisplay?: string;
  valueNumber?: number;
  ratePercent?: number;
  numerator?: number;
  denominator?: number;
  amountCents?: number;
  currency?: string;
  thresholdLowerBound?: number;
  lookbackStartDate?: string;
  lookbackEndDate?: string;
};

export type EbaySellerStandardsProfile = {
  cycle: 'CURRENT' | 'PROJECTED';
  program: string;
  standardsLevel?: string;
  evaluationDate?: string;
  metrics: EbaySellerMetric[];
};

export type EbaySellerReturnMetrics = {
  available: boolean;
  reason?: 'sandbox' | 'no_profile' | 'unavailable';
  count?: number;
  denominator?: number;
  ratePercent?: number;
  lookbackStartDate?: string;
  lookbackEndDate?: string;
  byReason?: { label: string; count: number }[];
};

export type EbaySellerPerformanceResult = {
  connected: boolean;
  environment: EbayOAuthEnvironment;
  marketplaceId: string;
  program: string;
  current?: EbaySellerStandardsProfile;
  projected?: EbaySellerStandardsProfile;
  returns?: EbaySellerReturnMetrics;
  lastSyncedAt?: string;
};

type FunctionPayload = {
  ok?: unknown;
  state?: unknown;
  expiresAt?: unknown;
  connected?: unknown;
  environment?: unknown;
  ebayUsername?: unknown;
  accessTokenExpiresAt?: unknown;
  refreshTokenExpiresAt?: unknown;
  accessTokenExpired?: unknown;
  needsReconnect?: unknown;
  refreshed?: unknown;
  revoked?: unknown;
  remoteRevocation?: unknown;
  profile?: unknown;
  profileFreshness?: unknown;
  listingCount?: unknown;
  listings?: unknown;
  listingSetup?: unknown;
  marketplaceId?: unknown;
  program?: unknown;
  current?: unknown;
  projected?: unknown;
  returns?: unknown;
  lastSyncedAt?: unknown;
  error?: unknown;
};

WebBrowser.maybeCompleteAuthSession();

function ebayOAuthFunctionId(): string {
  const value = process.env.EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID?.trim();

  if (!value) {
    throw new Error(
      'Missing EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID in the KeepFlip build.',
    );
  }

  return value;
}

function normalizeEnvironment(value: unknown): EbayOAuthEnvironment | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') {
    return normalized;
  }

  return null;
}

export function getEbayOAuthEnvironment(): EbayOAuthEnvironment {
  return (
    normalizeEnvironment(process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT) ??
    (__DEV__ ? 'sandbox' : 'production')
  );
}

function ebayReturnUrl(): string {
  const generated = Linking.createURL('ebay/connected', {
    scheme: 'keepflip',
    isTripleSlashed: false,
  });

  try {
    const parsed = new URL(generated);
    if (
      parsed.protocol === 'keepflip:' &&
      parsed.hostname === 'ebay' &&
      parsed.pathname === '/connected'
    ) {
      return parsed.toString();
    }
  } catch {
    // A production build always has the keepflip scheme; use the configured
    // callback convention if a development runtime cannot construct it.
  }

  return 'keepflip://ebay/connected';
}

function parseFunctionPayload(responseBody: string): FunctionPayload {
  try {
    const parsed = JSON.parse(responseBody || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown, maxLength = 2_048): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function optionalHttpUrl(value: unknown): string | undefined {
  const text = optionalText(value);
  if (!text) return undefined;

  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function parseSellerProfile(value: unknown): EbaySellerProfile | undefined {
  const profile = recordValue(value);
  if (!profile) return undefined;

  const result: EbaySellerProfile = {
    username: optionalText(profile.username, 160),
    accountType: optionalText(profile.accountType, 32),
    accountStatus: optionalText(profile.accountStatus, 32),
    registrationMarketplaceId: optionalText(
      profile.registrationMarketplaceId,
      64,
    ),
    businessName: optionalText(profile.businessName, 160),
    doingBusinessAs: optionalText(profile.doingBusinessAs, 160),
    businessWebsiteUrl: optionalHttpUrl(profile.businessWebsiteUrl),
    lastSyncedAt: optionalText(profile.lastSyncedAt, 64),
  };

  return Object.values(result).some(Boolean) ? result : undefined;
}

function parseSellerListing(value: unknown): EbaySellerListing | undefined {
  const listing = recordValue(value);
  if (!listing) return undefined;

  const result: EbaySellerListing = {
    listingId: optionalText(listing.listingId, 180),
    offerId: optionalText(listing.offerId, 180),
    sku: optionalText(listing.sku, 180),
    title: optionalText(listing.title, 512),
    status: optionalText(listing.status, 64),
    listingUrl: optionalHttpUrl(listing.listingUrl),
    currentPriceCents: optionalNonNegativeInteger(listing.currentPriceCents),
    currency: optionalText(listing.currency, 3),
    quantityAvailable: optionalNonNegativeInteger(listing.quantityAvailable),
    lastSyncedAt: optionalText(listing.lastSyncedAt, 64),
  };

  return Object.values(result).some((entry) => entry !== undefined)
    ? result
    : undefined;
}

function parseSellerListingSetup(
  value: unknown,
): EbaySellerListingSetup | undefined {
  const setup = recordValue(value);
  if (!setup) return undefined;

  const state =
    setup.state === 'ready' ||
    setup.state === 'needs_setup' ||
    setup.state === 'failed'
      ? setup.state
      : undefined;
  const marketplaceId = optionalText(setup.marketplaceId, 64);
  const policyCounts = recordValue(setup.policyCounts);
  const defaultSelection = recordValue(setup.defaultSelection);
  const payment = optionalNonNegativeInteger(policyCounts?.payment);
  const fulfillment = optionalNonNegativeInteger(policyCounts?.fulfillment);
  const returns = optionalNonNegativeInteger(policyCounts?.return);
  const hasMerchantLocation =
    typeof defaultSelection?.hasMerchantLocation === 'boolean'
      ? defaultSelection.hasMerchantLocation
      : undefined;
  const hasPaymentPolicy =
    typeof defaultSelection?.hasPaymentPolicy === 'boolean'
      ? defaultSelection.hasPaymentPolicy
      : undefined;
  const hasFulfillmentPolicy =
    typeof defaultSelection?.hasFulfillmentPolicy === 'boolean'
      ? defaultSelection.hasFulfillmentPolicy
      : undefined;
  const hasReturnPolicy =
    typeof defaultSelection?.hasReturnPolicy === 'boolean'
      ? defaultSelection.hasReturnPolicy
      : undefined;

  const defaults = recordValue(setup.defaults);
  const policyOptions = Array.isArray(
    setup.policyOptions,
  )
    ? setup.policyOptions
        .map((option): EbaySellerBusinessPolicyOption | undefined => {
          const record = recordValue(option);
          const policyType =
            record?.policyType === 'payment' ||
            record?.policyType === 'fulfillment' ||
            record?.policyType === 'return'
              ? record.policyType
              : undefined;
          const policyId = optionalText(record?.policyId, 100);
          if (!policyType || !policyId) return undefined;
          return {
            policyType,
            policyId,
            marketplaceId: optionalText(record?.marketplaceId, 64),
            policyName: optionalText(record?.policyName, 160),
            categoryType: optionalText(record?.categoryType, 64),
            returnsAccepted:
              typeof record?.returnsAccepted === 'boolean'
                ? record.returnsAccepted
                : undefined,
            returnPeriodDays: optionalNonNegativeInteger(record?.returnPeriodDays),
            returnShippingCostPayer: optionalText(record?.returnShippingCostPayer, 32),
            refundMethod: optionalText(record?.refundMethod, 32),
            handlingTimeDays: optionalNonNegativeInteger(record?.handlingTimeDays),
            shippingOptionCount: optionalNonNegativeInteger(record?.shippingOptionCount),
          } satisfies EbaySellerBusinessPolicyOption;
        })
        .filter(
          (option): option is EbaySellerBusinessPolicyOption => Boolean(option),
        )
        .slice(0, 100)
    : [];
  const locationOptions = Array.isArray(
    setup.locationOptions,
  )
    ? setup.locationOptions
        .map((option): EbaySellerInventoryLocationOption | undefined => {
          const record = recordValue(option);
          const merchantLocationKey = optionalText(record?.merchantLocationKey, 100);
          return merchantLocationKey
            ? {
                merchantLocationKey,
                locationName: optionalText(record?.locationName, 160),
                locationType: optionalText(record?.locationType, 64),
                countryCode: optionalText(record?.countryCode, 3),
                locationStatus: optionalText(record?.locationStatus, 32),
              }
            : undefined;
        })
        .filter(
          (option): option is EbaySellerInventoryLocationOption => Boolean(option),
        )
        .slice(0, 100)
    : [];

  if (
    !state ||
    !marketplaceId ||
    payment === undefined ||
    fulfillment === undefined ||
    returns === undefined ||
    hasMerchantLocation === undefined ||
    hasPaymentPolicy === undefined ||
    hasFulfillmentPolicy === undefined ||
    hasReturnPolicy === undefined
  ) {
    return undefined;
  }

  return {
    state,
    marketplaceId,
    policyCounts: {
      payment,
      fulfillment,
      return: returns,
    },
    locationCount: optionalNonNegativeInteger(setup.locationCount) ?? 0,
    defaultSelection: {
      hasMerchantLocation,
      hasPaymentPolicy,
      hasFulfillmentPolicy,
      hasReturnPolicy,
    },
    defaults: {
      defaultMerchantLocationKey:
        optionalText(defaults?.defaultMerchantLocationKey, 100) ?? null,
      defaultPaymentPolicyId:
        optionalText(defaults?.defaultPaymentPolicyId, 100) ?? null,
      defaultFulfillmentPolicyId:
        optionalText(defaults?.defaultFulfillmentPolicyId, 100) ?? null,
      defaultReturnPolicyId:
        optionalText(defaults?.defaultReturnPolicyId, 100) ?? null,
    },
    policyOptions,
    locationOptions,
    lastCheckedAt: optionalText(setup.lastCheckedAt, 64),
    issueCode: optionalText(setup.issueCode, 64),
    message: optionalText(setup.message, 512),
  };
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseSellerMetric(value: unknown): EbaySellerMetric | undefined {
  const metric = recordValue(value);
  if (!metric) return undefined;

  const result: EbaySellerMetric = {
    metricKey: optionalText(metric.metricKey, 80),
    name: optionalText(metric.name, 160),
    type: optionalText(metric.type, 64),
    level: optionalText(metric.level, 64),
    valueDisplay: optionalText(metric.valueDisplay, 160),
    valueNumber: optionalFiniteNumber(metric.valueNumber),
    ratePercent: optionalFiniteNumber(metric.ratePercent),
    numerator: optionalNonNegativeInteger(metric.numerator),
    denominator: optionalNonNegativeInteger(metric.denominator),
    amountCents: optionalNonNegativeInteger(metric.amountCents),
    currency: optionalText(metric.currency, 3),
    thresholdLowerBound: optionalFiniteNumber(metric.thresholdLowerBound),
    lookbackStartDate: optionalText(metric.lookbackStartDate, 64),
    lookbackEndDate: optionalText(metric.lookbackEndDate, 64),
  };

  return Object.values(result).some((entry) => entry !== undefined)
    ? result
    : undefined;
}

function parseSellerStandardsProfile(
  value: unknown,
  fallbackCycle: 'CURRENT' | 'PROJECTED',
): EbaySellerStandardsProfile | undefined {
  const profile = recordValue(value);
  if (!profile) return undefined;

  const cycle = profile.cycle === 'PROJECTED' ? 'PROJECTED' : fallbackCycle;
  const metrics = Array.isArray(profile.metrics)
    ? profile.metrics
        .map(parseSellerMetric)
        .filter((metric): metric is EbaySellerMetric => Boolean(metric))
        .slice(0, 40)
    : [];

  return {
    cycle,
    program: optionalText(profile.program, 64) || 'PROGRAM_US',
    standardsLevel: optionalText(profile.standardsLevel, 64),
    evaluationDate: optionalText(profile.evaluationDate, 64),
    metrics,
  };
}

function parseSellerReturnMetrics(value: unknown): EbaySellerReturnMetrics | undefined {
  const returns = recordValue(value);
  if (!returns || typeof returns.available !== 'boolean') return undefined;

  const byReason = Array.isArray(returns.byReason)
    ? returns.byReason
        .map((entry) => {
          const item = recordValue(entry);
          const label = optionalText(item?.label, 120);
          const count = optionalNonNegativeInteger(item?.count);
          return label && count !== undefined ? { label, count } : undefined;
        })
        .filter((entry): entry is { label: string; count: number } => Boolean(entry))
        .slice(0, 8)
    : undefined;

  return {
    available: returns.available,
    reason:
      returns.reason === 'sandbox' ||
      returns.reason === 'no_profile' ||
      returns.reason === 'unavailable'
        ? returns.reason
        : undefined,
    count: optionalNonNegativeInteger(returns.count),
    denominator: optionalNonNegativeInteger(returns.denominator),
    ratePercent: optionalFiniteNumber(returns.ratePercent),
    lookbackStartDate: optionalText(returns.lookbackStartDate, 64),
    lookbackEndDate: optionalText(returns.lookbackEndDate, 64),
    ...(byReason?.length ? { byReason } : {}),
  };
}
function functionError(responseBody: string, fallback: string): Error {
  const payload = parseFunctionPayload(responseBody);
  const message =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : fallback;

  return new Error(message);
}

async function executeOAuthFunction(
  path:
    | '/connect'
    | '/status'
    | '/refresh'
    | '/revoke'
    | '/seller-account'
    | '/seller-setup'
    | '/seller-performance',
  environment: EbayOAuthEnvironment,
  extra: Record<string, unknown> = {},
) {
  return functions.createExecution({
    // This is the active authenticated eBay backend. The authorization-code
    // callback is a separate function and is never called by mobile.
    functionId: ebayOAuthFunctionId(),
    body: JSON.stringify({ ...extra, environment }),
    async: false,
    xpath: path,
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function isExpectedReturnUrl(parsed: URL): boolean {
  try {
    const expected = new URL(ebayReturnUrl());
    return (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

function parseReturnUrl(
  url: string,
  fallbackEnvironment: EbayOAuthEnvironment,
): EbayConnectionResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'error', environment: fallbackEnvironment };
  }

  if (!isExpectedReturnUrl(parsed)) {
    return { status: 'error', environment: fallbackEnvironment };
  }

  const status = parsed.searchParams.get('status');
  const environment =
    normalizeEnvironment(parsed.searchParams.get('environment')) ??
    fallbackEnvironment;

  if (status === 'connected') {
    return { status: 'connected', environment };
  }

  if (status === 'declined') {
    return { status: 'declined', environment };
  }

  return { status: 'error', environment };
}

/**
 * Starts eBay's authorization-code grant through the active backend. The
 * backend creates and records the opaque state; the app persists that exact
 * state in SecureStore, builds the environment-specific eBay authorize URL,
 * and opens the browser. eBay calls ebay_oauth_callback directly after consent.
 */
export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  let pendingState: string | undefined;

  try {
    const execution = await executeOAuthFunction('/connect', environment);

    if (execution.responseStatusCode !== 200) {
      throw functionError(
        execution.responseBody,
        'KeepFlip could not start the eBay authorization flow.',
      );
    }

    const payload = parseFunctionPayload(execution.responseBody);
    const responseEnvironment = normalizeEnvironment(payload.environment);
    const activeEnvironment = responseEnvironment ?? environment;
    const authorizationState =
      typeof payload.state === 'string' ? payload.state.trim() : '';

    if (!authorizationState) {
      throw new Error(
        'The eBay OAuth backend did not return an OAuth state.',
      );
    }

    const browserSession = await startEbayLogin({
      environment: activeEnvironment,
      authorizationState,
      // Force eBay to show its credential flow when reconnecting. This is
      // especially important after a seller revokes the previous token; an
      // existing eBay browser session otherwise can skip the credential step.
      prompt: 'login',
    });
    pendingState = browserSession.authorizationState || browserSession.clientState;

    const browserResult = browserSession.result;
    if (browserResult.type !== 'success' || !browserResult.url) {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return {
        status: 'dismissed',
        environment: activeEnvironment,
      };
    }

    const callbackResult = parseReturnUrl(browserResult.url, activeEnvironment);
    if (callbackResult.status !== 'connected') {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return callbackResult;
    }

    try {
      // ebay_oauth_callback has already validated/claimed the opaque state and
      // stored the tokens. This status request verifies the result belongs to
      // the signed-in KeepFlip user before the app reports success.
      const status = await getEbayConnectionStatus(callbackResult.environment);
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return status.connected
        ? {
            status: 'connected',
            environment: status.environment,
            connection: status,
          }
        : { status: 'error', environment: callbackResult.environment };
    } catch {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return { status: 'error', environment: callbackResult.environment };
    }
  } catch (error) {
    await clearEbayOAuthState(pendingState).catch(() => undefined);
    throw error;
  }
}

/**
 * Reads server-side connection state. No eBay token is returned to the app.
 */
export async function getEbayConnectionStatus(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeOAuthFunction('/status', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not read the eBay connection status.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error('The eBay OAuth Function returned an invalid connection status.');
  }

  const responseEnvironment =
    normalizeEnvironment(payload.environment) ?? environment;

  return {
    connected: payload.connected,
    environment: responseEnvironment,
    ebayUsername:
      typeof payload.ebayUsername === 'string' && payload.ebayUsername.trim()
        ? payload.ebayUsername.trim()
        : undefined,
    accessTokenExpiresAt:
      typeof payload.accessTokenExpiresAt === 'string'
        ? payload.accessTokenExpiresAt
        : undefined,
    refreshTokenExpiresAt:
      typeof payload.refreshTokenExpiresAt === 'string'
        ? payload.refreshTokenExpiresAt
        : undefined,
    accessTokenExpired:
      typeof payload.accessTokenExpired === 'boolean'
        ? payload.accessTokenExpired
        : undefined,
    needsReconnect:
      typeof payload.needsReconnect === 'boolean'
        ? payload.needsReconnect
        : undefined,
  };
}

/**
 * Reads the safe seller profile plus the small cache of KeepFlip-published
 * listings. The backend retains all OAuth credentials and raw eBay identity
 * data; this result is safe to render on-device.
 */
export async function getEbaySellerAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbaySellerAccountResult> {
  const execution = await executeOAuthFunction('/seller-account', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not read the eBay seller account.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error('The eBay OAuth Function returned an invalid seller account.');
  }

  const listings = Array.isArray(payload.listings)
    ? payload.listings
        .map(parseSellerListing)
        .filter((listing): listing is EbaySellerListing => Boolean(listing))
        .slice(0, 6)
    : [];
  const responseCount = optionalNonNegativeInteger(payload.listingCount);
  const profileFreshness =
    payload.profileFreshness === 'current' || payload.profileFreshness === 'stale'
      ? payload.profileFreshness
      : undefined;

  return {
    connected: payload.connected,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    profile: parseSellerProfile(payload.profile),
    profileFreshness,
    listingSetup: parseSellerListingSetup(payload.listingSetup),
    listingCount: Math.max(responseCount ?? listings.length, listings.length),
    listings,
  };
}

/**
 * Saves the eBay policy and inventory-location IDs KeepFlip should apply to
 * future Inventory API offers. The backend verifies every ID against the
 * connected seller's current eBay account before persisting the defaults.
 */
export async function updateEbaySellerListingDefaults(
  defaults: EbaySellerListingDefaults,
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
  marketplaceId = 'EBAY_US',
): Promise<EbaySellerListingSetup> {
  const execution = await executeOAuthFunction('/seller-setup', environment, {
    marketplaceId,
    ...defaults,
  });

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not save your eBay listing setup.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (payload.connected !== true) {
    throw new Error('Connect eBay before saving listing setup.');
  }

  const listingSetup = parseSellerListingSetup(payload.listingSetup);
  if (!listingSetup) {
    throw new Error(
      'The eBay OAuth Function returned an invalid listing setup result.',
    );
  }

  return listingSetup;
}

/**
 * Reads eBay's current and projected Seller Standards profiles. The backend
 * returns only normalized metric fields; OAuth credentials and provider
 * payloads remain server-side.
 */
export async function getEbaySellerPerformance(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
  marketplaceId?: string,
): Promise<EbaySellerPerformanceResult> {
  const execution = await executeOAuthFunction(
    '/seller-performance',
    environment,
    marketplaceId ? { marketplaceId } : {},
  );

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not read eBay seller performance.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error(
      'The eBay OAuth Function returned an invalid seller performance result.',
    );
  }

  const responseEnvironment = normalizeEnvironment(payload.environment) ?? environment;
  const responseMarketplaceId = optionalText(payload.marketplaceId, 64) || 'EBAY_US';
  const responseProgram = optionalText(payload.program, 64) || 'PROGRAM_US';

  return {
    connected: payload.connected,
    environment: responseEnvironment,
    marketplaceId: responseMarketplaceId,
    program: responseProgram,
    current: parseSellerStandardsProfile(payload.current, 'CURRENT'),
    projected: parseSellerStandardsProfile(payload.projected, 'PROJECTED'),
    returns: parseSellerReturnMetrics(payload.returns),
    lastSyncedAt: optionalText(payload.lastSyncedAt, 64),
  };
}

/**
 * Explicitly asks the backend to use the stored eBay refresh token to mint a
 * fresh access token. The new token remains server-side.
 */
export async function refreshEbayConnection(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeOAuthFunction('/refresh', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not refresh the eBay authorization.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (payload.refreshed !== true || payload.connected !== true) {
    throw new Error('The eBay OAuth Function did not confirm the token refresh.');
  }

  return {
    connected: true,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    accessTokenExpiresAt:
      typeof payload.accessTokenExpiresAt === 'string'
        ? payload.accessTokenExpiresAt
        : undefined,
    accessTokenExpired: false,
    needsReconnect: false,
  };
}

/**
 * Revokes the user grant at eBay and clears the locally stored token material.
 * The app receives only the confirmed disconnected result.
 */
export type EbayConnectionRevocationResult = Pick<
  EbayConnectionStatusResult,
  'connected' | 'environment'
> & {
  remoteRevocation?: boolean;
};

export async function revokeEbayConnection(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionRevocationResult> {
  const execution = await executeOAuthFunction('/revoke', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not revoke eBay access.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (payload.revoked !== true || payload.connected !== false) {
    throw new Error('The eBay OAuth Function did not confirm eBay access was revoked.');
  }

  return {
    connected: false,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    ...(typeof payload.remoteRevocation === 'boolean'
      ? { remoteRevocation: payload.remoteRevocation }
      : {}),
  };
}
