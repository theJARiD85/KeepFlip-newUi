import { type Href, useRouter } from 'expo-router';

import { KeepFlipLaunchChoiceScreen } from '@/components/intro/keepflip-launch-choice-screen.native';
import { KEEPFLIP_ANALYTICS_EVENTS, trackKeepFlipEvent } from '@/services/keepflip-analytics';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <KeepFlipLaunchChoiceScreen
      onExistingLogin={() => router.push('/sign-in' as Href)}
      onNewUser={() => {
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.onboardingStarted, {
          entry_point: 'launch_choice',
        });
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signUpStarted, {
          entry_point: 'launch_choice',
        });
        router.push('/meet-flip' as Href);
      }}
    />
  );
}
