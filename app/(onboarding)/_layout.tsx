import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeepFlipOnboardingDraftProvider } from '@/components/onboarding/keepflip-onboarding-draft-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

export const unstable_settings = {
  anchor: 'welcome',
};

export default function OnboardingLayout() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const appearanceColors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <KeepFlipOnboardingDraftProvider>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            animation: 'fade',
            contentStyle: { backgroundColor: appearanceColors.backgroundDeep },
            headerShown: false,
          }}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="meet-flip" />
          <Stack.Screen name="subscription-setup" />
        </Stack>
      </SafeAreaProvider>
    </KeepFlipOnboardingDraftProvider>
  );
}
