import { useEffect } from 'react';
import { useRouter, type Href } from 'expo-router';

import { KeepFlipSubscriptionScreen } from '@/components/subscription/keepflip-subscription-screen';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';

export default function SubscriptionRequiredScreen() {
  const router = useRouter();
  const { snapshot, state } = useKeepFlipSubscription();
  const hasActiveSubscription =
    state === 'ready' &&
    snapshot?.serverRecordAvailable === true &&
    snapshot.access.active === true;

  useEffect(() => {
    if (!hasActiveSubscription) return;
    router.replace('/' as Href);
  }, [hasActiveSubscription, router]);

  return <KeepFlipSubscriptionScreen />;
}
