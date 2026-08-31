import { Redirect, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useEbayConnection } from '@/components/ebay/ebay-connection-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Fallback route for OAuth returns delivered to Expo Router instead of being
 * consumed in-place by expo-web-browser. Forward the callback outcome,
 * environment, and an optional short-lived state marker; codes, tokens, and
 * identity values never enter the app.
 */
export default function EbayConnectedCallbackScreen() {
  const { refreshConnection } = useEbayConnection();
  const params = useLocalSearchParams();
  const rawStatus = firstParam(params.status);
  const rawEnvironment = firstParam(params.environment);
  const rawState = firstParam(params.state);
  const status =
    rawStatus === 'connected' || rawStatus === 'declined' || rawStatus === 'error'
      ? rawStatus
      : undefined;
  const environment =
    rawEnvironment === 'sandbox' || rawEnvironment === 'production'
      ? rawEnvironment
      : undefined;
  const state =
    rawState && /^[A-Za-z0-9_-]{32,256}$/.test(rawState) ? rawState : undefined;
  useEffect(() => {
    if (status !== 'connected') return;

    void refreshConnection();
  }, [refreshConnection, status]);

  const query = [
    status ? 'status=' + encodeURIComponent(status) : '',
    environment ? 'environment=' + encodeURIComponent(environment) : '',
    state ? 'state=' + encodeURIComponent(state) : '',
  ].filter(Boolean);
  const href =
    status === 'connected'
      ? ('/ebay-account' as Href)
      : (('/ebay-connect' + (query.length ? '?' + query.join('&') : '')) as Href);

  return <Redirect href={href} />;
}
