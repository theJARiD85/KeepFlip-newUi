import { Redirect } from 'expo-router';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';

export default function NativeHomeScreen() {
  const { status } = useKeepFlipAuth();
  const { state: subscriptionState } = useKeepFlipSubscription();

  if (status === 'checking') {
    return <Redirect href="/auth-check" />;
  }

  if (status !== 'signed-in') {
    return <Redirect href="/welcome" />;
  }

  if (areKeepFlipSubscriptionsEnforced() && subscriptionState === 'loading') {
    return <Redirect href="/subscription-check" />;
  }

  return <Redirect href="/(app)" />;
}
