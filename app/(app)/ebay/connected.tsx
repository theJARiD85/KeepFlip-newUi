import { Redirect } from 'expo-router';

/**
 * Fallback route for OAuth returns that are delivered to Expo Router instead
 * of being consumed directly by expo-web-browser. The active auth session
 * normally handles the result in-place; this keeps cold-start/deep-link
 * returns from landing on an unmatched route.
 */
export default function EbayConnectedCallbackScreen() {
  return <Redirect href="/ebay-connect" />;
}
