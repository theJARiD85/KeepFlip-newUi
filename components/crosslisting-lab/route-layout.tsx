import { Redirect, Stack } from 'expo-router';

import { CROSSLISTING_LAB_ENABLED } from '@/constants/crosslisting-lab';

export function CrosslistingLabRouteLayout() {
  if (!CROSSLISTING_LAB_ENABLED) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        headerShown: false,
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connections" />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="connect/[platform]" />
    </Stack>
  );
}
