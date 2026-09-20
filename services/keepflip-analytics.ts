import { analytics } from '@heycatch/sdk';

export type KeepFlipAnalyticsProperties = Record<
  string,
  string | number | boolean | null
>;

export const KEEPFLIP_ANALYTICS_EVENTS = {
  activationReached: 'activation_reached',
  assistantRequestCompleted: 'assistant_request_completed',
  bookkeepingEntryCreated: 'bookkeeping_entry_created',
  bookkeepingReviewResolved: 'bookkeeping_review_resolved',
  ebayAccountConnected: 'ebay_account_connected',
  ebayAccountDisconnected: 'ebay_account_disconnected',
  ebayListingDefaultsSaved: 'ebay_listing_defaults_saved',
  ebayListingImported: 'ebay_listing_imported',
  ebayListingPublished: 'ebay_listing_published',
  ebayListingsDiscovered: 'ebay_listings_discovered',
  inventoryItemAdded: 'inventory_item_added',
  inventoryItemDeleted: 'inventory_item_deleted',
  inventoryUpdated: 'inventory_updated',
  itemAnalysisCompleted: 'item_analysis_completed',
  itemAnalysisStarted: 'item_analysis_started',
  firstActionCompleted: 'first_action_completed',
  firstActionStarted: 'first_action_started',
  landingViewed: 'landing_viewed',
  listingGenerated: 'listing_generated',
  listingShared: 'listing_shared',
  loginCompleted: 'login_completed',
  logoutCompleted: 'logout_completed',
  marketResearchCompleted: 'market_research_completed',
  onboardingStarted: 'onboarding_started',
  onboardingStepCompleted: 'onboarding_step_completed',
  signUpStarted: 'signup_started',
  signupCompleted: 'signup_completed',
  subscriptionPurchaseStarted: 'subscription_purchase_started',
  subscriptionPurchaseCompleted: 'subscription_purchase_completed',
  sourcingTripCompleted: 'sourcing_trip_completed',
  sourcingTripFindLinked: 'sourcing_trip_find_linked',
  sourcingTripStarted: 'sourcing_trip_started',
  subscriptionRenewed: 'subscription_renewed',
  subscriptionRestored: 'subscription_restored',
  subscriptionStarted: 'subscription_started',
  taskCompleted: 'task_completed',
  addedInventoryItem: 'added_inventory_item',
  deletedInventoryItem: 'deleted_inventory_item',
  exportedScheduleC: 'exported_schedule_c',
} as const;

type KeepFlipAnalyticsApi = typeof analytics & {
  trackScreen?: (
    name: string,
    properties?: KeepFlipAnalyticsProperties,
  ) => void;
};

const keepFlipAnalytics = analytics as KeepFlipAnalyticsApi;

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

/**
 * Explicit native route tracking. HeyCatch's native provider still captures
 * touches, but its Expo Router screen hook is not reliable with the current
 * React Navigation v7 stack, so the router calls this when its pathname
 * changes. The optional method keeps the shared service safe for web builds.
 */
export function trackKeepFlipScreen(
  screenName: string,
  properties?: KeepFlipAnalyticsProperties,
) {
  try {
    keepFlipAnalytics.trackScreen?.(screenName, properties);
  } catch {
    // Analytics must never block or change the outcome of navigation.
  }
}

export function identifyKeepFlipUser(
  userId: string,
  properties?: KeepFlipAnalyticsProperties,
  propertiesOnce?: KeepFlipAnalyticsProperties,
) {
  try {
    analytics.setIdentity(userId, properties, propertiesOnce);
  } catch {
    // Analytics identity is best effort and must never block authentication.
  }
}

export function resetKeepFlipAnalyticsIdentity() {
  try {
    analytics.resetIdentity();
  } catch {
    // Analytics identity reset is best effort and must never block sign-out.
  }
}
