import { type Href, Stack, usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { EbayConnectionProvider } from '@/components/ebay/ebay-connection-context';
import { KeepFlipMenuProvider } from '@/components/navigation/keepflip-menu-context';
import { KeepFlipSlideDownMenu } from '@/components/navigation/keepflip-slide-down-menu';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { SourcingTripProvider } from '@/components/sourcing/sourcing-trip-context';
import { keepFlipTheme } from '@/constants/keepflip-theme';
import { notificationRouteFromData } from '@/services/keepflip-notification-service';
import { hasCompletedScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

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

function WalkthroughAutoLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useKeepFlipAuth();
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      checkedUserIdRef.current = null;
      return;
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

    void hasCompletedScanInventoryWalkthrough(user.$id, user.name)
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
  }, [pathname, router, user]);

  return null;
}

export default function AppShellLayout() {
  return (
    <KeepFlipMenuProvider>
      <EbayConnectionProvider>
        <ItemAnalysisResultProvider>
          <SourcingTripProvider>
            <NotificationNavigationObserver />
            <WalkthroughAutoLauncher />
            <KeepFlipSlideDownMenu />
            <View style={styles.root}>
              <Stack
                screenOptions={{
                  animation: 'fade',
                  contentStyle: { backgroundColor: keepFlipTheme.colors.backgroundDeep },
                  headerShown: false,
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="scanner" />
                <Stack.Screen name="deal-shelf" />
                <Stack.Screen name="inventory" />
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
              </Stack>
            </View>
          </SourcingTripProvider>
        </ItemAnalysisResultProvider>
      </EbayConnectionProvider>
    </KeepFlipMenuProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
