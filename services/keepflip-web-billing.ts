import {
  Purchases,
  type Package as RevenueCatPackage,
} from '@revenuecat/purchases-js';

import {
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
