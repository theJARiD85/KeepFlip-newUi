import { useCallback, useRef } from 'react';
import { type Href, useRouter } from 'expo-router';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';

export function useFreeTierPaywall() {
  const router = useRouter();
  const { refresh } = useKeepFlipSubscription();
  const presentingRef = useRef(false);

  return useCallback(async (destination: Href) => {
    if (presentingRef.current) return;
    presentingRef.current = true;
    try {
      const result = await RevenueCatUI.presentPaywall();
      if (
        result !== PAYWALL_RESULT.PURCHASED &&
        result !== PAYWALL_RESULT.RESTORED
      ) {
        return;
      }

      for (const delay of [0, 500, 1_000, 1_500, 2_500]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const snapshot = await refresh(true);
        if (snapshot?.revenueCatAccess.active === true) {
          router.replace(destination);
          return;
        }
      }
    } finally {
      presentingRef.current = false;
    }
  }, [refresh, router]);
}
