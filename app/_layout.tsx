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
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import "react-native-reanimated";
import {
  KeepFlipAuthProvider,
  useKeepFlipAuth,
} from "@/components/auth/keepflip-auth-context";
import {
  getAppwriteCoreServices,
} from '@/lib/appwrite';
import { KeepFlipFeedbackNudgeProvider } from "@/components/feedback/keepflip-feedback-nudge";
import KeepFlipIntro from "@/components/intro/keepflip-intro.native";
import { keepFlipTheme } from "@/constants/keepflip-theme";

void SplashScreen
  .preventAutoHideAsync()
  .catch(() => undefined);

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  

function AppwritePushTargetRegistrar() {
  const { status, user } = useKeepFlipAuth();

  useEffect(() => {
    if (status !== 'signed-in' || !user || !Device.isDevice) return;

    let cancelled = false;

    const register = async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let permissionStatus = existing.status;

        if (permissionStatus !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          permissionStatus = requested.status;
        }

        if (permissionStatus !== 'granted' || cancelled) return;

        const nativeToken = String(
          (await Notifications.getDevicePushTokenAsync()).data,
        );
        if (!nativeToken || cancelled) return;

        const savedToken = await SecureStore.getItemAsync('devicePushToken');
        const savedUserId = await SecureStore.getItemAsync(
          'devicePushTokenUserId',
        );

        if (savedToken === nativeToken && savedUserId === user.$id) {
          return;
        }

        // createPushTarget is an Account endpoint. It must run only after
        // Appwrite has an authenticated user session; otherwise Appwrite sees
        // the caller as role:guests and rejects targets.write.
        const { account } = getAppwriteCoreServices();
        const targetId = `push-${user.$id.slice(0, 24)}`;

        try {
          await account.updatePushTarget({
            targetId,
            identifier: nativeToken,
          });
        } catch (updateError) {
          const code =
            updateError &&
            typeof updateError === 'object' &&
            'code' in updateError
              ? Number((updateError as { code?: unknown }).code)
              : null;

          if (code !== 404) throw updateError;

          await account.createPushTarget({
            targetId,
            identifier: nativeToken,
          });
        }

        if (cancelled) return;

        await Promise.all([
          SecureStore.setItemAsync('devicePushToken', nativeToken),
          SecureStore.setItemAsync('devicePushTokenUserId', user.$id),
          SecureStore.setItemAsync('appwritePushTargetId', targetId),
        ]);

        if (__DEV__) {
          console.log(
            '[KeepFlip][Messaging] Push target registered for signed-in user.',
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            'Error setting up Appwrite Messaging target:',
            error,
          );
        }
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, [status, user]);

  return null;
}

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

  const appodealKey =
  process.env.EXPO_PUBLIC_APPODEAL_APP_KEY ?? "";

  const isAdsTesting =
  __DEV__ ||
  process.env.EXPO_PUBLIC_APPODEAL_TESTING === "true";

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
    const checkPushRegistration = async () => {
      if (!Device.isDevice) {
        return;
      }
  
      try {
        const { status } =
          await Notifications.getPermissionsAsync();
  
        if (status !== 'granted') {
          await registerForPushNotifications();
          return;
        }
  
        const savedToken =
          await SecureStore.getItemAsync('devicePushToken');
  
        const currentToken = String(
          (
            await Notifications.getDevicePushTokenAsync()
          ).data,
        );
  
        if (!savedToken) {
          console.log('No saved push token. Registering...');
          await registerForPushNotifications();
          return;
        }
  
        if (savedToken !== currentToken) {
          console.log(
            'Device push token changed. Re-registering...',
          );
  
          await registerForPushNotifications();
          return;
        }
  
        console.log(
          'Push notifications already registered.',
        );
      } catch (error) {
        console.error(
          'Error checking push registration:',
          error,
        );
      }
    };
  
    void checkPushRegistration();
  }, []);

  useEffect(() => {
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

    const apiKey = process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY ?? '';
    if (!apiKey) {
      console.warn('RevenueCat API key is not set — skipping Purchases.configure');
      return;
    }

    Purchases.configure({ apiKey });
  }, []);

  async function registerForPushNotifications() {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return;
    }
  
    // Request permissions
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
  
    let finalStatus = existingStatus;
  
    if (existingStatus !== 'granted') {
      const { status } =
        await Notifications.requestPermissionsAsync();
  
      finalStatus = status;
    }
  
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
  
    try {
      // Raw FCM token on Android / APNs token on iOS
      const nativeToken = (
        await Notifications.getDevicePushTokenAsync()
      ).data;
  
      console.log(
        'Native Device Token for Appwrite:',
        nativeToken,
      );
  
      const { account } = getAppwriteCoreServices();
  
      await account.createPushTarget({
        targetId: ID.unique(),
        identifier: String(nativeToken),
        providerId: 'FCM',
      });
  
      // Save locally AFTER Appwrite registration succeeds.
      await SecureStore.setItemAsync(
        'devicePushToken',
        String(nativeToken),
      );
  
      console.log(
        'Successfully registered push target to Appwrite!',
      );
    } catch (error) {
      console.error(
        'Error setting up Appwrite Messaging target:',
        error,
      );
    }
  }

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
            <AppwritePushTargetRegistrar />
            <KeepFlipFeedbackNudgeProvider>
              <ProtectedRootStack />
            </KeepFlipFeedbackNudgeProvider>
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
