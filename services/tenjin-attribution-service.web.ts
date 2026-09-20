/**
 * Tenjin is an Android/iOS attribution SDK. Keep the web bundle free of its
 * native TurboModule while preserving the service contract used by auth,
 * analytics, and subscription code.
 */

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
  transaction?: {
    transactionIdentifier?: string;
    purchaseToken?: string;
    originalJson?: string;
    signature?: string;
  } | null;
};

export function trackTenjinEvent(_name: KeepFlipTenjinEventName) {
  // Attribution is intentionally Android/iOS-only.
}

export function trackTenjinSubscriptionPurchase(
  _purchase: KeepFlipTenjinSubscriptionPurchase,
) {
  // Store purchase attribution is intentionally Android/iOS-only.
}

export function initializeTenjinAtLaunch() {
  return Promise.resolve();
}

export async function setKeepFlipTenjinCustomerUserId(_userId: string) {
  // No browser SDK is loaded.
}

export async function getTenjinAnalyticsInstallationId(): Promise<
  string | null
> {
  return null;
}
