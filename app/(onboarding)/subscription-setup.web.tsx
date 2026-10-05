import { type Href, useRouter } from 'expo-router';
import { WebAuthScreen } from '@/components/web/web-auth-screen';

export default function WebSubscriptionSetupScreen() {
  const router = useRouter();
  return (
    <WebAuthScreen
      initialMode="create-account"
      onAuthenticated={() => router.replace('/walkthrough' as Href)}
      onBack={() => router.back()}
    />
  );
}
