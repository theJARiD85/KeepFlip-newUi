import { type Href, Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipMenuProvider } from '@/components/navigation/keepflip-menu-context';
import { KeepFlipSlideDownMenu } from '@/components/navigation/keepflip-slide-down-menu';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { keepFlipTheme } from '@/constants/keepflip-theme';
import { hasCompletedScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

export const unstable_settings = {
  anchor: 'index',
};

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
      <ItemAnalysisResultProvider>
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
            <Stack.Screen name="inventory" />
            <Stack.Screen name="analysis" />
            <Stack.Screen name="analysis-result" />
            <Stack.Screen name="repair-assist" />
            <Stack.Screen name="account" />
          </Stack>
        </View>
      </ItemAnalysisResultProvider>
    </KeepFlipMenuProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
});
