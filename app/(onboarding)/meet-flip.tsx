import { type Href, useRouter } from 'expo-router';

import { KeepFlipPreAuthScreen } from '@/components/intro/keepflip-preauth-screen.native';
import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';

export default function MeetFlipScreen() {
  const router = useRouter();
  const { setSellerProfile } = useKeepFlipOnboardingDraft();

  return (
    <KeepFlipPreAuthScreen
      onBack={() => router.back()}
      onComplete={(name, rules) => {
        setSellerProfile(name, rules);
        router.push('/subscription-setup' as Href);
      }}
    />
  );
}
