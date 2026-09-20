import { analytics } from '@heycatch/sdk';

export type KeepFlipAnalyticsProperties = Record<
  string,
  string | number | boolean | null
>;

export const KEEPFLIP_ANALYTICS_EVENTS = {
  activationReached: 'activation_reached',
  itemAnalysisCompleted: 'item_analysis_completed',
  itemAnalysisStarted: 'item_analysis_started',
  onboardingStarted: 'onboarding_started',
  onboardingStepCompleted: 'onboarding_step_completed',
  signupCompleted: 'signup_completed',
  subscriptionPurchaseStarted: 'subscription_purchase_started',
  subscriptionPurchaseCompleted: 'subscription_purchase_completed',
  subscriptionRenewed: 'subscription_renewed',
  subscriptionRestored: 'subscription_restored',
  sourcingTripStarted: 'sourcing_trip_started',
  sourcingTripEnded: 'sourcing_trip_ended',
  ebayAccountConnected: 'ebay_account_connected',
  ebayAccountDisconnected: 'ebay_account_disconnected',
  addedInventoryItem: 'added_inventory_item',
  deletedInventoryItem: 'deleted_inventory_item',
  exportedScheduleC: 'exported_schedule_c',
} as const;

export function trackKeepFlipEvent(
  event: string,
  properties?: KeepFlipAnalyticsProperties,
) {
  try {
    void Promise.resolve(analytics.trackEvent(event, properties)).catch(
      () => undefined,
    );
  } catch {
    // Analytics must never block or change the outcome of a feature action.
  }
}
