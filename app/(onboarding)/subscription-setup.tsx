import { type Href, useRouter } from 'expo-router';
import { KeepFlipLaunchAuthScreen } from '@/components/intro/keepflip-launch-auth-screen.native';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';

export default function SubscriptionSetupScreen() {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  return (
    <KeepFlipLaunchAuthScreen
      initialMode="create-account"
      onAuthenticated={() => router.replace('/walkthrough' as Href)}
      onBack={() => {
        if (status === 'signed-in') {
          router.replace('/account?tab=subscription' as Href);
          return;
        }
        router.back();
      }}
    />
  );
}
