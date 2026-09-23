import {
  Purchases,
  type Package as RevenueCatPackage,
} from '@revenuecat/purchases-js';

import {
  KEEPFLIP_ENTITLEMENTS,
  KEEPFLIP_SUBSCRIPTION_OFFERING_ID,
  type KeepFlipBillingCadence,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';

const WEB_PACKAGE_IDS: Record<
  KeepFlipPlanId,
  Record<KeepFlipBillingCadence, string>
> = {
  hobbyist: {
    monthly: 'hobbyist-monthly',
    annual: 'hobbyist-annual',
  },
  serious: {
    monthly: 'serious-monthly',
    annual: 'serious-annual',
  },
};

const PRE_ACCOUNT_REVENUECAT_USER_ID_STORAGE_KEY =
  'keepflip.revenuecat.pre-account-user-id';

export type KeepFlipWebBillingConfiguration = {
  configured: boolean;
  message: string | null;
};

export type KeepFlipWebBillingPlanOption = {
  cadence: KeepFlipBillingCadence;
  packageId: string;
  plan: KeepFlipPlanId;
  price: string;
  productId: string;
  revenueCatPackage: RevenueCatPackage;
};

export type KeepFlipWebBillingCatalog = {
  managementUrl: string | null;
  offeringId: string;
  options: Record<
    KeepFlipPlanId,
    Record<KeepFlipBillingCadence, KeepFlipWebBillingPlanOption | null>
  >;
};

let configuredApiKey: string | null = null;
let configuredUserId: string | null = null;

function clean(value: string | undefined) {
  return value?.trim() || '';
}

function normalizedId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function revenueCatWebApiKey() {
  return clean(process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY);
}

function storedPreAccountRevenueCatUserId() {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(
      PRE_ACCOUNT_REVENUECAT_USER_ID_STORAGE_KEY,
    );
    return value?.startsWith('$RCAnonymousID:') ? value : null;
  } catch {
    return null;
  }
}

function preAccountRevenueCatUserId() {
  const existing = storedPreAccountRevenueCatUserId();
  if (existing) return existing;

  const generated = Purchases.generateRevenueCatAnonymousAppUserId();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        PRE_ACCOUNT_REVENUECAT_USER_ID_STORAGE_KEY,
        generated,
      );
    } catch {
      // The module-scoped RevenueCat instance still carries the purchase for
      // this tab when browser storage is unavailable.
    }
  }
  return generated;
}

/**
 * This deliberately accepts only RevenueCat's public Web Billing SDK key.
 * Stripe's publishable key is not needed by KeepFlip's client, and a Stripe
 * secret key must never enter a browser build or an EXPO_PUBLIC_ variable.
 */
export function getKeepFlipWebBillingConfiguration(): KeepFlipWebBillingConfiguration {
  const apiKey = revenueCatWebApiKey();
  if (!apiKey) {
    return {
      configured: false,
      message:
        'Add RevenueCat’s public Web Billing SDK key as EXPO_PUBLIC_REVENUECAT_WEB_API_KEY, then restart the web build.',
    };
  }

  if (/^(pk|sk)_/i.test(apiKey)) {
    return {
      configured: false,
      message:
        'This looks like a Stripe key. KeepFlip web checkout requires RevenueCat’s public Web Billing SDK key instead.',
    };
  }

  if (/^(goog|appl)_/i.test(apiKey)) {
    return {
      configured: false,
      message:
        'This looks like a RevenueCat mobile SDK key. Add the public key from the Web Billing app instead.',
    };
  }

  return { configured: true, message: null };
}

async function purchasesForUser(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId) {
    throw new Error('Sign in before opening KeepFlip billing.');
  }

  const configuration = getKeepFlipWebBillingConfiguration();
  if (!configuration.configured) {
    throw new Error(configuration.message || 'KeepFlip web billing is not configured yet.');
  }

  const apiKey = revenueCatWebApiKey();
  if (!Purchases.isConfigured()) {
    configuredApiKey = apiKey;
    configuredUserId = cleanUserId;
    return Purchases.configure({
      apiKey,
      appUserId: cleanUserId,
    });
  }

  if (configuredApiKey && configuredApiKey !== apiKey) {
    throw new Error(
      'KeepFlip web billing changed configuration while this tab was open. Refresh the page before continuing.',
    );
  }

  const purchases = Purchases.getSharedInstance();
  const currentUserId = purchases.getAppUserId();
  if (configuredUserId !== cleanUserId || currentUserId !== cleanUserId) {
    // Appwrite user IDs are the single cross-platform RevenueCat identity.
    // This changes a known user rather than creating an anonymous checkout
    // that could be stranded after account creation.
    await purchases.changeUser(cleanUserId);
    configuredUserId = cleanUserId;
  }

  configuredApiKey ??= apiKey;
  return purchases;
}

async function purchasesForPreAccount() {
  const configuration = getKeepFlipWebBillingConfiguration();
  if (!configuration.configured) {
    throw new Error(
      configuration.message || 'KeepFlip web billing is not configured yet.',
    );
  }

  const apiKey = revenueCatWebApiKey();
  const anonymousUserId = preAccountRevenueCatUserId();

  if (!Purchases.isConfigured()) {
    configuredApiKey = apiKey;
    configuredUserId = anonymousUserId;
    return Purchases.configure({
      apiKey,
      appUserId: anonymousUserId,
    });
  }

  if (configuredApiKey && configuredApiKey !== apiKey) {
    throw new Error(
      'KeepFlip web billing changed configuration while this tab was open. Refresh the page before continuing.',
    );
  }

  const purchases = Purchases.getSharedInstance();
  if (purchases.getAppUserId() !== anonymousUserId) {
    // A previous signed-in customer may still be the SDK identity in this
    // tab. Move to the persisted anonymous onboarding customer before a new
    // purchase so one seller can never inherit another seller's entitlement.
    await purchases.changeUser(anonymousUserId);
  }

  configuredUserId = anonymousUserId;
  configuredApiKey ??= apiKey;
  return purchases;
}

function optionForPackage(
  revenueCatPackage: RevenueCatPackage,
  plan: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
): KeepFlipWebBillingPlanOption {
  return {
    cadence,
    packageId: revenueCatPackage.identifier,
    plan,
    price:
      revenueCatPackage.webBillingProduct.price.formattedPrice ||
      revenueCatPackage.webBillingProduct.price.currency,
    productId: revenueCatPackage.webBillingProduct.identifier,
    revenueCatPackage,
  };
}

function packageForSelection(
  packages: RevenueCatPackage[],
  plan: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
) {
  const expectedId = WEB_PACKAGE_IDS[plan][cadence];
  const normalizedExpectedId = normalizedId(expectedId);

  // Package IDs are the plan-selection slots shared by KeepFlip's native and
  // web offerings. The underlying Web Billing product ID is read separately.
  // Normalize only punctuation so a dashboard separator choice cannot silently
  // put a shopper on a different plan or billing cadence.
  return (
    packages.find(
      (candidate) => normalizedId(candidate.identifier) === normalizedExpectedId,
    ) || null
  );
}

function termsUrl() {
  if (typeof window === 'undefined') return undefined;
  return new URL('/terms', window.location.origin).toString();
}

function cleanEmail(value: string | null | undefined) {
  const email = value?.trim() || '';
  return email.includes('@') ? email : undefined;
}

export async function loadKeepFlipWebBillingCatalog(
  userId: string,
): Promise<KeepFlipWebBillingCatalog> {
  const purchases = await purchasesForUser(userId);
  const [offerings, customerInfo] = await Promise.all([
    purchases.getOfferings(),
    purchases.getCustomerInfo(),
  ]);
  const offering =
    offerings.all[KEEPFLIP_SUBSCRIPTION_OFFERING_ID] ?? offerings.current ?? null;

  if (!offering) {
    throw new Error(
      `RevenueCat could not find the ${KEEPFLIP_SUBSCRIPTION_OFFERING_ID} web offering. Add its Web Billing packages before enabling checkout.`,
    );
  }

  const options: KeepFlipWebBillingCatalog['options'] = {
    hobbyist: {
      monthly: null,
      annual: null,
    },
    serious: {
      monthly: null,
      annual: null,
    },
  };

  for (const plan of ['hobbyist', 'serious'] as const) {
    for (const cadence of ['monthly', 'annual'] as const) {
      const revenueCatPackage = packageForSelection(
        offering.availablePackages,
        plan,
        cadence,
      );
      options[plan][cadence] = revenueCatPackage
        ? optionForPackage(revenueCatPackage, plan, cadence)
        : null;
    }
  }

  return {
    managementUrl: customerInfo.managementURL,
    offeringId: offering.identifier,
    options,
  };
}

async function purchasePackage(
  purchases: Awaited<ReturnType<typeof purchasesForUser>>,
  {
    cadence,
    email,
    plan,
  }: {
    cadence: KeepFlipBillingCadence;
    email?: string | null;
    plan: KeepFlipPlanId;
  },
) {
  const offerings = await purchases.getOfferings();
  const offering =
    offerings.all[KEEPFLIP_SUBSCRIPTION_OFFERING_ID] ?? offerings.current ?? null;
  const revenueCatPackage = offering
    ? packageForSelection(offering.availablePackages, plan, cadence)
    : null;

  if (!revenueCatPackage) {
    throw new Error(
      `The ${plan} ${cadence} Web Billing package is not available. Finish its RevenueCat offering setup before accepting a payment.`,
    );
  }

  // RevenueCat presents its Stripe-backed checkout. A successful client
  // response is payment UI feedback only; KeepFlip continues to wait for the
  // signed RevenueCat webhook / server reconciliation before granting access.
  return purchases.purchase({
    customerEmail: cleanEmail(email),
    rcPackage: revenueCatPackage,
    termsAndConditionsUrl: termsUrl(),
  });
}

export async function purchaseKeepFlipWebBillingPlan({
  cadence,
  email,
  plan,
  userId,
}: {
  cadence: KeepFlipBillingCadence;
  email?: string | null;
  plan: KeepFlipPlanId;
  userId: string;
}) {
  const purchases = await purchasesForUser(userId);
  return purchasePackage(purchases, { cadence, email, plan });
}

/** Present the RevenueCat-configured web paywall for an identified user. */
export async function presentKeepFlipWebBillingPaywall(
  userId: string,
  htmlTarget: HTMLElement,
) {
  const purchases = await purchasesForUser(userId);
  const offerings = await purchases.getOfferings();
  const offering =
    offerings.all[KEEPFLIP_SUBSCRIPTION_OFFERING_ID] ?? offerings.current;
  if (!offering) {
    throw new Error(
      'RevenueCat could not find the KeepFlip paywall offering. Check the offering configuration and try again.',
    );
  }

  return purchases.presentPaywall({ htmlTarget, offering });
}

/**
 * Start web checkout before an Appwrite account exists. RevenueCat supports
 * anonymous Web Billing customers; the purchase is kept under that customer
 * until linkKeepFlipWebBillingAccount identifies it after account creation.
 */
export async function purchaseKeepFlipWebBillingPlanBeforeAccount({
  cadence,
  email,
  plan,
}: {
  cadence: KeepFlipBillingCadence;
  email?: string | null;
  plan: KeepFlipPlanId;
}) {
  const purchases = await purchasesForPreAccount();
  const result = await purchasePackage(purchases, { cadence, email, plan });
  if (!keepFlipWebBillingPurchaseIsActive(result, plan)) {
    throw new Error(
      'KeepFlip could not confirm an active subscription from Web Billing. The account was not created.',
    );
  }
  return result;
}

/** Present RevenueCat's hosted paywall while preserving the anonymous signup customer. */
export async function presentKeepFlipWebBillingPaywallBeforeAccount(
  htmlTarget: HTMLElement,
) {
  const purchases = await purchasesForPreAccount();
  const offerings = await purchases.getOfferings();
  const offering =
    offerings.all[KEEPFLIP_SUBSCRIPTION_OFFERING_ID] ?? offerings.current;
  if (!offering) {
    throw new Error(
      'RevenueCat could not find the KeepFlip paywall offering. Check the offering configuration and try again.',
    );
  }

  return purchases.presentPaywall({ htmlTarget, offering });
}

export function keepFlipWebBillingCustomerHasActiveEntitlement(
  customerInfo: Awaited<ReturnType<typeof presentKeepFlipWebBillingPaywallBeforeAccount>>['customerInfo'],
) {
  return Object.values(KEEPFLIP_ENTITLEMENTS).some(
    (entitlementId) =>
      customerInfo.entitlements.active[entitlementId]?.isActive === true,
  );
}

export function keepFlipWebBillingPurchaseIsActive(
  result: Awaited<ReturnType<typeof purchasePackage>>,
  plan: KeepFlipPlanId,
) {
  const entitlementId = KEEPFLIP_ENTITLEMENTS[plan];
  return result.customerInfo.entitlements.active[entitlementId]?.isActive === true;
}

/**
 * Attach a successful anonymous web purchase to the newly created Appwrite
 * user. The RevenueCat identify operation aliases the anonymous customer; a
 * plain changeUser would risk leaving the purchase on an untracked customer.
 */
export async function linkKeepFlipWebBillingAccount(userId: string) {
  const cleanUserId = userId.trim();
  if (!cleanUserId) throw new Error('A KeepFlip account ID is required.');

  const purchases = await purchasesForPreAccount();
  const result = await purchases.identifyUser(cleanUserId);
  configuredUserId = cleanUserId;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(
        PRE_ACCOUNT_REVENUECAT_USER_ID_STORAGE_KEY,
      );
    } catch {
      // Losing browser storage cleanup does not affect the already-linked
      // RevenueCat customer; the next onboarding flow will rotate its ID.
    }
  }

  return result;
}
