import { Redirect } from 'expo-router';

/**
 * Compatibility route for existing links. Subscription management now lives in
 * the Subscription tab of Account.
 */
export default function SubscriptionRoute() {
  return <Redirect href="/account?tab=subscription" />;
}