import * as Linking from 'expo-linking';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
  trackKeepFlipScreen,
} from '@/services/keepflip-analytics';

type EntryContext = {
  entryPath: string | null;
  referrer: 'deep_link' | 'direct_app_open';
};

function normalizePath(path: string | null | undefined) {
  const value = path?.trim() ?? '';
  if (!value) return '/';

  const withoutExpoGoMarker = value.replace(/^\/?--\//, '');
  const withoutLeadingSlash = withoutExpoGoMarker.replace(/^\/+/, '');
  return `/${withoutLeadingSlash}`;
}

function entryContextFromUrl(url: string | null): EntryContext {
  if (!url) {
    return {
      entryPath: null,
      referrer: 'direct_app_open',
    };
  }

  const parsed = Linking.parse(url);
  return {
    entryPath: parsed.path ? normalizePath(parsed.path) : null,
    referrer: 'deep_link',
  };
}

/**
 * Keeps native pageview data independent of the provider's broken v7 route
 * hook. It also adds the native equivalent of entry/referrer metadata: a
 * deep-link entry is distinguishable from a normal app launch without sending
 * the raw URL or any query-string token to analytics.
 */
export function KeepFlipAnalyticsNavigationTracker() {
  const pathname = usePathname();
  const [entryContext, setEntryContext] = useState<EntryContext | null>(null);
  const lastTrackedPathRef = useRef<string | null>(null);
  const landingTrackedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void Linking.getInitialURL()
      .then((url) => {
        if (!cancelled) setEntryContext(entryContextFromUrl(url));
      })
      .catch(() => {
        if (!cancelled) {
          setEntryContext(entryContextFromUrl(null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!entryContext) return;

    const screenPath = normalizePath(pathname);
    if (lastTrackedPathRef.current === screenPath) return;
    lastTrackedPathRef.current = screenPath;

    const entryPath = entryContext.entryPath ?? screenPath;
    trackKeepFlipScreen(screenPath, {
      entry_path: entryPath,
      platform: Platform.OS,
      referrer: entryContext.referrer,
      url_path: screenPath,
    });

    if (!landingTrackedRef.current && screenPath === '/welcome') {
      landingTrackedRef.current = true;
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.landingViewed, {
        entry_path: entryPath,
        platform: Platform.OS,
        referrer: entryContext.referrer,
      });
    }
  }, [entryContext, pathname]);

  return null;
}
