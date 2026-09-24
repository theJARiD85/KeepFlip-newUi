import { type Href, useRouter } from 'expo-router';

import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';
import { SiteMetadata } from '@/components/web/site-metadata';
import { KEEPFLIP_ANALYTICS_EVENTS, trackKeepFlipEvent } from '@/services/keepflip-analytics';

export default function WebWelcomeScreen() {
  const router = useRouter();
  const { clearDraft } = useKeepFlipOnboardingDraft();

  return (
    <>
      <SiteMetadata
        description="Meet Flip and set the buying rules you use to compare resale deals, pace, profit, and risk in KeepFlip before you start using the app."
        path="/welcome"
        title="KeepFlip setup | Meet Flip and set buying rules"
      />
      <WebOnboardingScreen
        onExistingLogin={() => router.push('/sign-in' as Href)}
        onNewUser={() => {
          trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signUpStarted, {
            entry_point: 'web_launch_choice',
          });
          trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.onboardingStarted, {
            entry_point: 'web_launch_choice',
          });
          clearDraft();
          router.push('/meet-flip' as Href);
        }}
      />
    </>
  );
}
