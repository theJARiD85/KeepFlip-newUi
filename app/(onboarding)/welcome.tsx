import { type Href, useRouter } from 'expo-router';

import { KeepFlipLaunchChoiceScreen } from '@/components/intro/keepflip-launch-choice-screen.native';
import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { KEEPFLIP_ANALYTICS_EVENTS, trackKeepFlipEvent } from '@/services/keepflip-analytics';

export default function WelcomeScreen() {
  const router = useRouter();
  const { clearDraft } = useKeepFlipOnboardingDraft();

  return (
    <KeepFlipLaunchChoiceScreen
      onExistingLogin={() => router.push('/sign-in' as Href)}
      onNewUser={() => {
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signUpStarted, {
          entry_point: 'launch_choice',
        });
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.onboardingStarted, {
          entry_point: 'launch_choice',
        });
        clearDraft();
        router.push('/meet-flip' as Href);
      }}
    />
  );
}
