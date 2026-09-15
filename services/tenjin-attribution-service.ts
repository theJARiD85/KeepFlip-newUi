import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import Tenjin from 'react-native-tenjin';
import type { PurchasesStoreTransaction } from 'react-native-purchases';

const TENJIN_API_KEY = process.env.EXPO_PUBLIC_TENJIN_API_KEY?.trim() ?? '';

export type KeepFlipTenjinEventName =
  | 'registration_completed'
  | 'inventory_item_saved'
  | 'subscription_paywall_viewed'
  | 'subscription_purchase_started'
  | 'subscription_purchase_completed'
  | 'subscription_renewal_started'
  | 'subscription_renewal_completed'
  | 'subscription_restored'
  | 'subscription_management_opened';

export type KeepFlipTenjinSubscriptionPurchase = {
  productId: string;
  currencyCode: string;
  unitPrice: number;
  transaction?: Pick<
    PurchasesStoreTransaction,
    | 'transactionIdentifier'
    | 'purchaseToken'
    | 'originalJson'
    | 'signature'
  > | null;
};

let initializationPromise: Promise<void> | null = null;
let isInitialized = false;
let customerUserId: string | null = null;
const pendingEvents: KeepFlipTenjinEventName[] = [];
const pendingSubscriptionPurchases: KeepFlipTenjinSubscriptionPurchase[] = [];

function sendEvent(name: KeepFlipTenjinEventName) {
  try {
    Tenjin.eventWithName(name);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[Tenjin] Could not send ${name}.`, error);
    }
  }
}

function sendSubscriptionPurchase({
  productId,
  currencyCode,
  unitPrice,
  transaction,
}: KeepFlipTenjinSubscriptionPurchase) {
  const cleanProductId = productId.trim();
  const cleanCurrencyCode = currencyCode.trim();
  const cleanUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;

  if (!cleanProductId || !cleanCurrencyCode) return;

  try {
    if (Platform.OS === 'ios') {
      // RevenueCat's JS result does not expose an SK2 receipt. The Tenjin
      // wrapper can fetch the latest StoreKit 2 transaction natively.
      Tenjin.subscriptionWithStoreKit(
        cleanProductId,
        cleanCurrencyCode,
        cleanUnitPrice,
        () => undefined,
        (error) => {
          if (__DEV__) {
            console.warn('[Tenjin] Could not send the iOS subscription.', error);
          }
        },
      );
      return;
    }

    const purchaseToken = transaction?.purchaseToken?.trim();
    const purchaseData = transaction?.originalJson?.trim();
    const dataSignature = transaction?.signature?.trim();

    // Tenjin's Android subscription endpoint requires all three Google Play
    // verification values. Do not send a partial or misleading revenue event.
    if (!purchaseToken || !purchaseData || !dataSignature) {
      if (__DEV__) {
        console.warn(
          '[Tenjin] Skipping an Android subscription event because RevenueCat did not return the Google Play purchase payload.',
        );
      }
      return;
    }

    Tenjin.subscription({
      androidDataSignature: dataSignature,
      androidPurchaseData: purchaseData,
      androidPurchaseToken: purchaseToken,
      currencyCode: cleanCurrencyCode,
      productId: cleanProductId,
      unitPrice: cleanUnitPrice,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[Tenjin] Could not send a subscription.', error);
    }
  }
}

export function trackTenjinEvent(name: KeepFlipTenjinEventName) {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) return;

  if (!isInitialized) {
    pendingEvents.push(name);
    return;
  }

  sendEvent(name);
}

export function trackTenjinSubscriptionPurchase(
  purchase: KeepFlipTenjinSubscriptionPurchase,
) {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) return;

  if (!isInitialized) {
    pendingSubscriptionPurchases.push(purchase);
    return;
  }

  sendSubscriptionPurchase(purchase);
}

function flushPendingTracking() {
  for (const eventName of pendingEvents.splice(0)) {
    sendEvent(eventName);
  }

  for (const purchase of pendingSubscriptionPurchases.splice(0)) {
    sendSubscriptionPurchase(purchase);
  }
}

export function initializeTenjinAtLaunch() {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) {
    return Promise.resolve();
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (Platform.OS === 'ios') {
        try {
          await requestTrackingPermissionsAsync();
        } catch (error) {
          if (__DEV__) {
            console.warn('[Tenjin] ATT authorization request failed.', error);
          }
        }
      }

      Tenjin.initialize(TENJIN_API_KEY);

      if (Platform.OS === 'android') {
        Tenjin.setAppStore('googleplay');
        // MainActivity owns Android connect() so the SDK is connected on every
        // onResume. Calling connect here as well would duplicate that lifecycle
        // responsibility and can produce duplicate session diagnostics.
      } else {
        Tenjin.connect();
      }

      isInitialized = true;
      flushPendingTracking();
    })().catch((error) => {
      initializationPromise = null;
      if (__DEV__) {
        console.warn('[Tenjin] SDK initialization failed.', error);
      }
    });
  }

  return initializationPromise;
}

export async function setKeepFlipTenjinCustomerUserId(userId: string) {
  const cleanUserId = userId.trim();
  if (
    Platform.OS === 'web' ||
    !TENJIN_API_KEY ||
    !cleanUserId ||
    customerUserId === cleanUserId
  ) {
    return;
  }

  await initializeTenjinAtLaunch();

  try {
    Tenjin.setCustomerUserId(cleanUserId);
    customerUserId = cleanUserId;
  } catch (error) {
    if (__DEV__) {
      console.warn('[Tenjin] Could not set the KeepFlip customer ID.', error);
    }
  }
}

export async function getTenjinAnalyticsInstallationId(): Promise<
  string | null
> {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) return null;

  await initializeTenjinAtLaunch();

  return new Promise((resolve) => {
    try {
      Tenjin.getAnalyticsInstallationId((id) => {
        const cleanId = id.trim();
        resolve(cleanId || null);
      });
    } catch (error) {
      if (__DEV__) {
        console.warn(
          '[Tenjin] Could not read the analytics installation ID.',
          error,
        );
      }
      resolve(null);
    }
  });
}
