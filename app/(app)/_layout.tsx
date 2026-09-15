import {
  type Href,
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipAssistantOverlay } from '@/components/command-center/flip-assistant-overlay';
import { FlipDailyBriefingLauncher } from '@/components/command-center/flip-daily-briefing';
import {
  FlipGuidanceOverlay,
  FlipGuidanceProvider,
} from '@/components/command-center/flip-guidance-overlay';
import { EbayConnectionProvider } from '@/components/ebay/ebay-connection-context';
import { KeepFlipMenuProvider } from '@/components/navigation/keepflip-menu-context';
import { KeepFlipSlideDownMenu } from '@/components/navigation/keepflip-slide-down-menu';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { SourcingTripProvider } from '@/components/sourcing/sourcing-trip-context';
import {
  KeepFlipSubscriptionProvider,
  useKeepFlipSubscription,
} from '@/components/subscription/keepflip-subscription-context';
import { keepFlipTheme } from '@/constants/keepflip-theme';
import { notificationRouteFromData } from '@/services/keepflip-notification-service';
import { areKeepFlipSubscriptionsEnforced } from '@/services/keepflip-subscription-service';
import { hasCompletedScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';
import { hasCompletedKeepFlipLaunchExperience } from '@/services/keepflip-launch-state-service';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';


export const unstable_settings = {
  anchor: 'index',
};

function NotificationNavigationObserver() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const redirect = (notification: Notifications.Notification) => {
      const route = notificationRouteFromData(notification.request.content.data);
      if (!route) return;
      requestAnimationFrame(() => router.push(route as Href));
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) redirect(lastResponse.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => redirect(response.notification),
    );
    return () => subscription.remove();
  }, [router]);

  return null;
}

function SubscriptionAccessGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { tab } = useGlobalSearchParams<{
    tab?: string | string[];
  }>();
  const selectedTab = Array.isArray(tab) ? tab[0] : tab;
  const isSubscriptionTab =
    pathname === '/account' && selectedTab === 'subscription';
  // Keep the authenticated home visible; other app routes remain gated.
  const isCommandCenterRoute =
    pathname === '/' || pathname === '/command-center';
  const { snapshot, state } = useKeepFlipSubscription();

  useEffect(() => {
    if (!areKeepFlipSubscriptionsEnforced()) return;
    if (state !== 'ready') return;
    if (snapshot?.access.active) return;
    if (isSubscriptionTab || isCommandCenterRoute) return;

    requestAnimationFrame(() => {
      router.replace('/account?tab=subscription' as Href);
    });
  }, [
    isCommandCenterRoute,
    isSubscriptionTab,
    pathname,
    router,
    snapshot?.access.active,
    state,
  ]);

  return null;
}

function WalkthroughAutoLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useKeepFlipAuth();
  const { snapshot, state: subscriptionState } = useKeepFlipSubscription();
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      checkedUserIdRef.current = null;
      return;
    }

    if (areKeepFlipSubscriptionsEnforced()) {
      if (subscriptionState !== 'ready') return;
      if (!snapshot?.access.active) return;
    }

    if (
      pathname === '/walkthrough' ||
      checkedUserIdRef.current === user.$id
    ) {
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    checkedUserIdRef.current = user.$id;

    void hasCompletedKeepFlipLaunchExperience()
      .then((launchCompleted) => {
        if (cancelled || launchCompleted) return true;
        return hasCompletedScanInventoryWalkthrough(user.$id, user.name);
      })
      .then((completed) => {
        if (cancelled || completed) return;
        frame = requestAnimationFrame(() => {
          router.push('/walkthrough' as Href);
        });
      })
      .catch((error) => {
        if (!cancelled && checkedUserIdRef.current === user.$id) {
          checkedUserIdRef.current = null;
        }
        if (__DEV__) {
          console.warn(
            '[KeepFlip][Onboarding] Could not read the user profile:',
            error,
          );
        }
      });

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [
    pathname,
    router,
    snapshot?.access.active,
    subscriptionState,
    user,
  ]);

  return null;
}

export default function AppShellLayout() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaProvider style={{marginTop: insets.top, marginBottom: insets.bottom}}>
    <KeepFlipMenuProvider>
      <EbayConnectionProvider>
        <ItemAnalysisResultProvider>
          <SourcingTripProvider>
            <KeepFlipSubscriptionProvider>
              <FlipGuidanceProvider>
                <NotificationNavigationObserver />
                <SubscriptionAccessGate />
                <WalkthroughAutoLauncher />
                <KeepFlipSlideDownMenu />
                <View style={styles.root}>
                  <Stack
                    screenOptions={{
                      animation: 'fade',
                      contentStyle: {
                        backgroundColor: keepFlipTheme.colors.backgroundDeep,
                      },
                      headerShown: false,
                    }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="scanner" />
                    <Stack.Screen name="inventory" />
                    <Stack.Screen name="analytics" />
                    <Stack.Screen name="analysis" />
                    <Stack.Screen name="analysis-result" />
                    <Stack.Screen name="listing-guide" />
                    <Stack.Screen name="repair-assist" />
                    <Stack.Screen name="command-center" />
                    <Stack.Screen name="flip-plan" />
                    <Stack.Screen name="account" />
                    <Stack.Screen name="ebay-connect" />
                    <Stack.Screen name="ebay-account" />
                    <Stack.Screen name="books" />
                    <Stack.Screen name="market-research" />
                    <Stack.Screen name="notifications" />
                  </Stack>
                  <FlipAssistantOverlay />
                  <FlipDailyBriefingLauncher />
                  <FlipGuidanceOverlay />
                </View>
              </FlipGuidanceProvider>
            </KeepFlipSubscriptionProvider>
          </SourcingTripProvider>
        </ItemAnalysisResultProvider>
      </EbayConnectionProvider>
    </KeepFlipMenuProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
