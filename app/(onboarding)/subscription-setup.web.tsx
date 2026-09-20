import { type Href, useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { WebAuthScreen } from '@/components/web/web-auth-screen';

export default function WebSubscriptionSetupScreen() {
  const router = useRouter();
  const { clearDraft, draft } = useKeepFlipOnboardingDraft();

  useEffect(() => {
    if (draft) return;
    const frame = requestAnimationFrame(() => {
      router.replace('/welcome' as Href);
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, router]);

  if (!draft) return null;

  return (
    <WebAuthScreen
      initialBuyRules={draft.rules}
      initialMode="create-account"
      initialName={draft.name}
      onAuthenticated={({ profileSaved }) => {
        clearDraft();
        router.replace((profileSaved ? '/' : '/walkthrough') as Href);
      }}
      onBack={() => router.back()}
    />
  );
}
