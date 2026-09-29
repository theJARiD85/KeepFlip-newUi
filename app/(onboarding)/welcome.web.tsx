import { KeepFlipHomeStructuredData } from '@/components/web/keepflip-home-structured-data';
import { WebOnboardingScreen } from '@/components/web/web-onboarding-screen';

export default function WebWelcomeScreen() {
  return (
    <>
      <KeepFlipHomeStructuredData />
      <WebOnboardingScreen />
    </>
  );
}
