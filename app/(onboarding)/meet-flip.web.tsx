import { type Href, useRouter } from 'expo-router';

import { useKeepFlipOnboardingDraft } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { WebPreAuthScreen } from '@/components/web/web-preauth-screen';

export default function WebMeetFlipScreen() {
  const router = useRouter();
  const { setSellerProfile } = useKeepFlipOnboardingDraft();

  return (
    <WebPreAuthScreen
      onBack={() => router.back()}
      onComplete={(name, rules) => {
        setSellerProfile(name, rules);
        router.push('/subscription-setup' as Href);
      }}
    />
  );
}
