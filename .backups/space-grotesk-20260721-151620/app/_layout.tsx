import 'react-native-url-polyfill/auto';

import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import {
  KeepFlipAuthProvider,
  useKeepFlipAuth,
} from '@/components/auth/keepflip-auth-context';
import { keepFlipTheme } from '@/constants/keepflip-theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function ProtectedRootStack() {
  const { status } = useKeepFlipAuth();
  const isChecking = status === 'checking';
  const isSignedIn = status === 'signed-in' || __DEV__;

  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: keepFlipTheme.colors.backgroundDeep },
        headerShown: false,
      }}>
      <Stack.Protected guard={isChecking}>
        <Stack.Screen name="auth-check" />
      </Stack.Protected>
      <Stack.Protected guard={!isChecking && !isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    LucidaConsole: require('../assets/fonts/LucidaConsole.ttf'),
    SpaceGroteskSemiBold: require('../assets/fonts/SpaceGroteskSemiBold.ttf'),
    SpaceGroteskBold: require('../assets/fonts/SpaceGroteskBold.ttf'),
    SpaceGroteskRegular: require('../assets/fonts/SpaceGroteskRegular.ttf'),
    SpaceGroteskMedium: require('../assets/fonts/SpaceGroteskMedium.ttf'),

  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: keepFlipTheme.colors.background,
      card: keepFlipTheme.colors.backgroundRaised,
      border: keepFlipTheme.colors.surfaceSoft,
      primary: keepFlipTheme.colors.gold,
      text: keepFlipTheme.colors.text,
    },
  };

  return (
      <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider value={navigationTheme}>
        <KeepFlipAuthProvider>
          <ProtectedRootStack />
        </KeepFlipAuthProvider>
        <StatusBar style="light" />
        </ThemeProvider>
      </GestureHandlerRootView>

  );
}
