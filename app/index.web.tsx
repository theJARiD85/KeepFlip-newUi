import { type Href, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';
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
    if (status === 'checking') return;
    if (status !== 'signed-in') {
      router.replace('/welcome' as Href);
      return;
    }
    if (isCheckingSubscription) return;

    router.replace((hasActiveSubscription ? '/(app)' : '/subscription-required') as Href);
  }, [hasActiveSubscription, isCheckingSubscription, router, status]);

  return <WebOnboardingScreen />;
}
