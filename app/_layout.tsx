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
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
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
import { ID } from 'react-native-appwrite';
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

  const { account } = getAppwriteCoreServices();

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
    async function checkUser() {
      try {
        const currentUser = await account.get();
        console.log(currentUser);
      } catch (error) {
        console.log('No user signed in');
      }
    }
    
    checkUser();
  }, []);
  

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

    const androidApiKey = 'process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY';
    const iosApiKey = 'process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY';

    if (Platform.OS === 'ios') {
       Purchases.configure({apiKey: iosApiKey});
    } else if (Platform.OS === 'android') {
       Purchases.configure({apiKey: androidApiKey});
    }
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
