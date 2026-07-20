import { Stack } from 'expo-router';

import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

export const unstable_settings = {
  anchor: 'sign-in',
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: theme.colors.backgroundDeep },
        headerShown: false,
      }}>
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
