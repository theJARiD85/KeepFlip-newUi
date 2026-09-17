import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';

import {
  KeepFlipLaunchAuthScreen,
  type AuthSubscriptionSelection,
} from '@/components/intro/keepflip-launch-auth-screen.native';
import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { markKeepFlipLaunchExperienceCompleted } from '@/services/keepflip-launch-state-service';

export default function SubscriptionSetupScreen() {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  const { clearDraft, draft } = useKeepFlipOnboardingDraft();

  useEffect(() => {
    if (draft) return;
    const frame = requestAnimationFrame(() => {
      router.replace('/welcome' as Href);
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, router]);

  const handleAuthenticated = useCallback(
    (selection: AuthSubscriptionSelection) => {
      if (selection.profileSaved === false) {
        router.replace('/walkthrough' as Href);
        return;
      }

      clearDraft();
      void markKeepFlipLaunchExperienceCompleted();

      router.replace('/' as Href);
    },
    [clearDraft, router],
  );

  if (!draft) return null;

  return (
    <KeepFlipLaunchAuthScreen
      initialBuyRules={draft.rules}
      initialMode="create-account"
      initialName={draft.name}
      onAuthenticated={handleAuthenticated}
      onBack={() => {
        if (status === 'signed-in') {
          router.replace('/account?tab=subscription' as Href);
          return;
        }
        router.back();
      }}
    />
  );
}
