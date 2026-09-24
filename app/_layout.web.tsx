import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, usePathname } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { View } from 'react-native';

import {
  KeepFlipAuthProvider,
  useKeepFlipAuth,
} from '@/components/auth/keepflip-auth-context';
import { FlipCompanionProvider } from '@/components/flip';
import { KeepFlipAppearanceProvider, useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import {
  KeepFlipSubscriptionProvider,
  useKeepFlipSubscription,
} from '@/components/subscription/keepflip-subscription-context';
import { KeepFlipFeedbackNudgeProvider } from '@/components/feedback/keepflip-feedback-nudge';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';
import { pingAppwriteWebClientOnce } from '@/lib/appwrite-web-client';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';

function ProtectedRootStack() {
  const { status, user } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { snapshot, state: subscriptionState } = useKeepFlipSubscription();
  const pathname = usePathname();
  const subscriptionsEnforced = areKeepFlipSubscriptionsEnforced();
  const isChecking = status === 'checking';
  const isSignedIn = status === 'signed-in';
  const isCheckingSubscription =
    isSignedIn && subscriptionsEnforced && subscriptionState === 'loading';
  const hasActiveSubscription =
    !subscriptionsEnforced ||
    (isSignedIn &&
      subscriptionState === 'ready' &&
      snapshot?.serverRecordAvailable === true &&
      snapshot.serverRecord?.ownerId === user?.$id &&
      snapshot.access.active === true);
  const subscriptionRequired =
    isSignedIn &&
    subscriptionsEnforced &&
    !isCheckingSubscription &&
    !hasActiveSubscription;
  const subscriptionSetupOpen = pathname === '/subscription-setup';
  const canShowOnboarding =
    !isChecking &&
    (!isSignedIn || subscriptionSetupOpen) &&
    (!isSignedIn || hasActiveSubscription);

  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: colors.backgroundDeep },
        headerShown: false,
      }}>
      <Stack.Protected guard={isChecking}>
        <Stack.Screen name="auth-check" />
      </Stack.Protected>
      <Stack.Protected guard={isCheckingSubscription}>
        <Stack.Screen name="subscription-check" />
      </Stack.Protected>
      <Stack.Protected guard={canShowOnboarding}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!isChecking && !isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={subscriptionRequired}>
        <Stack.Screen name="subscription-required" />
      </Stack.Protected>
      <Stack.Protected guard={false}>
        <Stack.Screen name="free" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && hasActiveSubscription}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}

function WebRootContent() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('@/assets/fonts/Inter.ttf'),
    PlusJakartaSansBold: require('@/assets/fonts/PlusJakartaSansBold.otf'),
    PlusJakartaSansMedium: require('@/assets/fonts/PlusJakartaSansMedium.otf'),
    PlusJakartaSansSemiBold: require('@/assets/fonts/PlusJakartaSansSemiBold.otf'),
  });

  useEffect(() => {
    if (fontError && __DEV__) {
      console.warn('[KeepFlip][Web] Custom fonts could not be loaded.', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    pingAppwriteWebClientOnce();
  }, []);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.backgroundDeep }} />;
  }

  const navigationTheme = {
    ...(effectiveColorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(effectiveColorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.backgroundRaised,
      border: colors.surfaceSoft,
      primary: colors.gold,
      text: colors.text,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <KeepFlipAuthProvider>
        <FlipCompanionProvider>
          <KeepFlipSubscriptionProvider>
            <KeepFlipFeedbackNudgeProvider>
              <ProtectedRootStack />
            </KeepFlipFeedbackNudgeProvider>
          </KeepFlipSubscriptionProvider>
        </FlipCompanionProvider>
      </KeepFlipAuthProvider>
    </ThemeProvider>
  );
}

export default function WebRootLayout() {
  return (
    <KeepFlipAppearanceProvider>
      <WebRootContent />
    </KeepFlipAppearanceProvider>
  );
}
