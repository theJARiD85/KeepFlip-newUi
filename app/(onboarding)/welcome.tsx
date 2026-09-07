import { type Href, useRouter } from 'expo-router';

import { KeepFlipLaunchChoiceScreen } from '@/components/intro/keepflip-launch-choice-screen.native';
import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';

export default function WelcomeScreen() {
  const router = useRouter();
  const { clearDraft } = useKeepFlipOnboardingDraft();

  return (
    <KeepFlipLaunchChoiceScreen
      onExistingLogin={() => router.push('/sign-in' as Href)}
      onNewUser={() => {
        clearDraft();
        router.push('/meet-flip' as Href);
      }}
    />
  );
}
