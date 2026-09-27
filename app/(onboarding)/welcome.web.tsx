import { type Href, useRouter } from 'expo-router';

import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { KeepFlipHomeStructuredData } from '@/components/web/keepflip-home-structured-data';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';
import { KEEPFLIP_ANALYTICS_EVENTS, trackKeepFlipEvent } from '@/services/keepflip-analytics';

export default function WebWelcomeScreen() {
  const router = useRouter();
  const { clearDraft } = useKeepFlipOnboardingDraft();

  return (
    <>
      <KeepFlipHomeStructuredData />
      <WebOnboardingScreen
        onExistingLogin={() => router.push('/sign-in' as Href)}
        onNewUser={() => {
          trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.onboardingStarted, {
            entry_point: 'web_launch_choice',
          });
          trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signUpStarted, {
            entry_point: 'web_launch_choice',
          });
          clearDraft();
          router.push('/meet-flip' as Href);
        }}
      />
    </>
  );
}
