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
  listingGenerated: 'listing_generated',
  listingShared: 'listing_shared',
  loginCompleted: 'login_completed',
  logoutCompleted: 'logout_completed',
  marketResearchCompleted: 'market_research_completed',
  onboardingStarted: 'onboarding_started',
  onboardingStepCompleted: 'onboarding_step_completed',
  signupCompleted: 'signup_completed',
  sourcingTripCompleted: 'sourcing_trip_completed',
  sourcingTripFindLinked: 'sourcing_trip_find_linked',
  sourcingTripStarted: 'sourcing_trip_started',
  subscriptionRenewed: 'subscription_renewed',
  subscriptionRestored: 'subscription_restored',
  subscriptionStarted: 'subscription_started',
  taskCompleted: 'task_completed',
} as const;

export function trackKeepFlipEvent(
  event: string,
  properties?: KeepFlipAnalyticsProperties,
) {
  analytics.trackEvent(event, properties);
}
