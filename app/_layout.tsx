import "react-native-url-polyfill/auto";
import {
  DarkTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
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
import {
  KeepFlipSubscriptionProvider,
  useKeepFlipSubscription,
} from '@/components/subscription/keepflip-subscription-context';
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  FlipCompanionProvider,
} from '@/components/flip';
import { KeepFlipFeedbackNudgeProvider } from "@/components/feedback/keepflip-feedback-nudge";
import { KeepFlipPushRegistration } from '@/components/notifications/keepflip-push-registration';
import KeepFlipLaunchExperience from "@/components/intro/keepflip-launch-experience.native";
import { KeepFlipMinimumVersionGate } from '@/components/update/keepflip-minimum-version-gate';
import { keepFlipTheme } from "@/constants/keepflip-theme";
import { configureKeepFlipNotificationHandler } from '@/services/keepflip-notification-service';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';
import { initializeTenjinAtLaunch } from '@/services/tenjin-attribution-service';

void SplashScreen
  .preventAutoHideAsync()
  .catch(() => undefined);

configureKeepFlipNotificationHandler();
  

function ProtectedRootStack() {
  const {
    status,
    user,
  } = useKeepFlipAuth();
  const isChecking =
    status === "checking";

  const isSignedIn =
    status === "signed-in";

  const {
    snapshot: subscriptionSnapshot,
    state: subscriptionState,
  } = useKeepFlipSubscription();
  const subscriptionsEnforced = areKeepFlipSubscriptionsEnforced();
  const isCheckingSubscription =
    isSignedIn &&
    subscriptionsEnforced &&
    subscriptionState === 'loading';
  const hasActiveSubscription =
    !subscriptionsEnforced ||
    (isSignedIn &&
      subscriptionState === 'ready' &&
      subscriptionSnapshot?.serverRecordAvailable === true &&
      subscriptionSnapshot.serverRecord?.ownerId === user?.$id &&
      subscriptionSnapshot.access.active === true);
  const subscriptionRequired =
    isSignedIn &&
    subscriptionsEnforced &&
    !isCheckingSubscription &&
    !hasActiveSubscription;

  const pathname = usePathname();
  const keepSubscriptionSignupOpen =
    pathname === "/subscription-setup";
  const canShowOnboarding =
    !isChecking &&
    (!isSignedIn || keepSubscriptionSignupOpen) &&
    (!isSignedIn || hasActiveSubscription);

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

      <Stack.Protected guard={isCheckingSubscription}>
        <Stack.Screen name="subscription-check" />
      </Stack.Protected>

      <Stack.Protected
        guard={
          !isChecking &&
          !isSignedIn
        }
      >
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={canShowOnboarding}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={subscriptionRequired}>
        <Stack.Screen name="subscription-required" />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && hasActiveSubscription}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}

export default function RootLayout() {
  const [
    launchVisible,
    setLaunchVisible,
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void initializeTenjinAtLaunch();
    }
  }, [fontError, fontsLoaded]);


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
      <SafeAreaProvider>
        <GestureHandlerRootView
          style={{ flex: 1 }}
        >
          <FlipCompanionProvider>
            <ThemeProvider
              value={navigationTheme}
            >
              <KeepFlipMinimumVersionGate>
                <KeepFlipAuthProvider>
                  <KeepFlipSubscriptionProvider>
                    <KeepFlipPushRegistration />
                    <KeepFlipFeedbackNudgeProvider>
                      <ProtectedRootStack />
                    </KeepFlipFeedbackNudgeProvider>
                  </KeepFlipSubscriptionProvider>
                  <View
                    pointerEvents={launchVisible ? "auto" : "none"}
                    style={{
                      bottom: 0,
                      left: 0,
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }}
                  >
                    <KeepFlipLaunchExperience onVisibilityChange={setLaunchVisible} />
                  </View>
                </KeepFlipAuthProvider>
              </KeepFlipMinimumVersionGate>

              <StatusBar
                animated
                hidden={launchVisible}
                style="light"
              />
            </ThemeProvider>
          </FlipCompanionProvider>

        </GestureHandlerRootView>
      </SafeAreaProvider>
    </View>
  );
}
