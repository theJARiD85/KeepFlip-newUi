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
} as const;

export function trackKeepFlipEvent(
  event: string,
  properties?: KeepFlipAnalyticsProperties,
) {
  analytics.trackEvent(event, properties);
}
