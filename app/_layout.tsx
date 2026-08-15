import "react-native-url-polyfill/auto";
import {
  DarkTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import {
  KeepFlipAuthProvider,
  useKeepFlipAuth,
} from "@/components/auth/keepflip-auth-context";
import KeepFlipIntro from "@/components/intro/keepflip-intro.native";
import { keepFlipTheme } from "@/constants/keepflip-theme";
import {
  AppodealNativeAdsInitializer,
} from "@keepflip/expo-appodeal-native-ads";

export function AdsInitializer() {
  const appodealKey =
  process.env.EXPO_PUBLIC_APPODEAL_APP_KEY ?? "";

  const isAdsTesting =
  __DEV__ ||
  process.env.EXPO_PUBLIC_APPODEAL_TESTING === "true";

  let appodealInitializationStarted = false;


  return (
    <AppodealNativeAdsInitializer
      appKey={appodealKey}
      cacheCount={5}
      testing={isAdsTesting}
      onInitialized={(result) => {
        // result.initialized
        // result.errors
      }}
      onError={(error) => {
        // Send this to your error reporting service.
      }}
    />
  );
}

void SplashScreen
  .preventAutoHideAsync()
  .catch(() => undefined);

function ProtectedRootStack() {
  const {
    status,
  } = useKeepFlipAuth();

  const isChecking =
    status === "checking";

  const isSignedIn =
    status === "signed-in";

  return (
    <Stack
      screenOptions={{
        animation: "fade",
        contentStyle: {
          backgroundColor:
            keepFlipTheme.colors.backgroundDeep,
        },
        headerShown: false,
      }}
    >
      <Stack.Protected guard={isChecking}>
        <Stack.Screen name="auth-check" />
      </Stack.Protected>

      <Stack.Protected
        guard={
          !isChecking &&
          !isSignedIn
        }
      >
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}

export default function RootLayout() {
  const [
    introVisible,
    setIntroVisible,
  ] = useState(true);


  const [
    fontsLoaded,
    fontError,
  ] = useFonts({
    LucidaConsole:
      require("@/assets/fonts/LucidaConsole.ttf"),

    SpaceGroteskSemiBold:
      require("@/assets/fonts/SpaceGroteskSemiBold.otf"),

    SpaceGroteskBold:
      require("@/assets/fonts/SpaceGroteskBold.otf"),

    SpaceGroteskRegular:
      require("@/assets/fonts/SpaceGroteskRegular.otf"),

    SpaceGroteskMedium:
      require("@/assets/fonts/SpaceGroteskMedium.otf"),

    FlexiIBMVGAFalse:
      require("@/assets/fonts/FlexiIBMVGAFalse.ttf"),

    FlexiIBMVGAFalse437:
      require("@/assets/fonts/FlexiIBMVGAFalse437.ttf"),

    Inter:
      require("@/assets/fonts/Inter.ttf"),

    PlusJakartaSansBold:
      require("@/assets/fonts/PlusJakartaSansBold.otf"),

    PlusJakartaSansMedium:
      require("@/assets/fonts/PlusJakartaSansMedium.otf"),

    PlusJakartaSansSemiBold:
      require("@/assets/fonts/PlusJakartaSansSemiBold.otf"),
  });

  useEffect(() => {
    if (
      fontsLoaded ||
      fontError
    ) {
      void SplashScreen.hideAsync();
    }
  }, [
    fontError,
    fontsLoaded,
  ]);

  const handleIntroComplete =
    useCallback(() => {
      setIntroVisible(false);
    }, []);

  if (
    !fontsLoaded &&
    !fontError
  ) {
    return null;
  }

  const navigationTheme = {
    ...DarkTheme,

    colors: {
      ...DarkTheme.colors,

      background:
        keepFlipTheme.colors.background,

      card:
        keepFlipTheme.colors.backgroundRaised,

      border:
        keepFlipTheme.colors.surfaceSoft,

      primary:
        keepFlipTheme.colors.gold,

      text:
        keepFlipTheme.colors.text,
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <GestureHandlerRootView
        style={{ flex: 1 }}
      >
        <ThemeProvider
          value={navigationTheme}
        >
          <KeepFlipAuthProvider>
          {!introVisible ? (
            <AdsInitializer />
          ) : null}
          <ProtectedRootStack />
          </KeepFlipAuthProvider>

          <StatusBar
            animated
            hidden={introVisible}
            style="light"
          />
        </ThemeProvider>
      </GestureHandlerRootView>

      {introVisible ? (
        <KeepFlipIntro
          startupReady
          onComplete={
            handleIntroComplete
          }
        />
      ) : null}
    </View>
  );
}
