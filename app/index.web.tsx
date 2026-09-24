import { type Href, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';
import { SiteMetadata } from '@/components/web/site-metadata';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';

export default function WebHomeScreen() {
  const router = useRouter();
  const { status, user } = useKeepFlipAuth();
  const { snapshot, state } = useKeepFlipSubscription();
  const subscriptionsEnforced = areKeepFlipSubscriptionsEnforced();
  const isCheckingSubscription =
    status === 'signed-in' && subscriptionsEnforced && state === 'loading';
  const hasActiveSubscription =
    !subscriptionsEnforced ||
    (status === 'signed-in' &&
      state === 'ready' &&
      snapshot?.serverRecordAvailable === true &&
      snapshot.serverRecord?.ownerId === user?.$id &&
      snapshot.access.active === true);

  useEffect(() => {
    if (status !== 'signed-in' || isCheckingSubscription) {
      return;
    }

    router.replace((hasActiveSubscription ? '/(app)' : '/subscription-required') as Href);
  }, [hasActiveSubscription, isCheckingSubscription, router, status]);

  return (
    <>
      <SiteMetadata
        description="KeepFlip helps independent sellers and small shops research items, check a buy against their rules, track inventory, and prepare marketplace listings."
        path="/"
        title="KeepFlip | Resale research and inventory app"
      />
      <WebOnboardingScreen />
    </>
  );
}
