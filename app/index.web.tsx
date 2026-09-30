import { type Href, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { KeepFlipHomeStructuredData } from '@/components/web/keepflip-home-structured-data';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';

export default function WebHomeScreen() {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  const { state } = useKeepFlipSubscription();
  const subscriptionsEnforced = areKeepFlipSubscriptionsEnforced();
  const isCheckingSubscription =
    status === 'signed-in' && subscriptionsEnforced && state === 'loading';
  useEffect(() => {
    if (status === 'checking') return;
    if (status !== 'signed-in') {
      router.replace('/welcome' as Href);
      return;
    }
    if (isCheckingSubscription) return;

    router.replace('/(app)' as Href);
  }, [isCheckingSubscription, router, status]);

  return (
    <>
      <KeepFlipHomeStructuredData />
      <WebOnboardingScreen />
    </>
  );
}
