import { type Href, useRouter } from 'expo-router';

import { KeepFlipLaunchAuthScreen } from '@/components/intro/keepflip-launch-auth-screen.native';

export default function SignInScreen() {
  const router = useRouter();

  return (
    <KeepFlipLaunchAuthScreen
      initialMode="sign-in"
      onAuthenticated={() => router.replace('/(app)' as Href)}
    />
  );
}
