import { useEffect } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { KeepFlipSubscriptionScreen } from '@/components/subscription/keepflip-subscription-screen';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';

export default function SubscriptionRequiredScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { snapshot, state } = useKeepFlipSubscription();
  const hasActiveSubscription =
    state === 'ready' &&
    snapshot?.revenueCatAccess.active === true;

  useEffect(() => {
    if (!hasActiveSubscription) return;
    const destination = Array.isArray(returnTo) ? returnTo[0] : returnTo;
    router.replace(
      (destination?.startsWith('/') && !destination.startsWith('//')
        ? destination
        : '/') as Href,
    );
  }, [hasActiveSubscription, returnTo, router]);

  return <KeepFlipSubscriptionScreen />;
}
