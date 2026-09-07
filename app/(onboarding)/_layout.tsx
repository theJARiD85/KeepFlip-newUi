import { Stack } from 'expo-router';

import { KeepFlipOnboardingDraftProvider } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

export const unstable_settings = {
  anchor: 'welcome',
};

export default function OnboardingLayout() {
  return (
    <KeepFlipOnboardingDraftProvider>
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: theme.colors.backgroundDeep },
          headerShown: false,
        }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="meet-flip" />
        <Stack.Screen name="subscription-setup" />
      </Stack>
    </KeepFlipOnboardingDraftProvider>
  );
}
