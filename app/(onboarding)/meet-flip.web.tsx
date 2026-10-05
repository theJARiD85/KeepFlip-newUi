import { type Href, useRouter } from 'expo-router';

import { MeetFlipIntroduction } from '@/components/onboarding/meet-flip-introduction';

export default function WebMeetFlipScreen() {
  const router = useRouter();

  return (
    <MeetFlipIntroduction
      onBack={() => router.replace('/welcome' as Href)}
      onContinue={() => router.push('/subscription-setup' as Href)}
    />
  );
}
