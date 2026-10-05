import { Stack, type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { EbayConnectionProvider } from '@/components/ebay/ebay-connection-context';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { KeepFlipWebShell } from '@/components/web/keepflip-web-shell';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';
import { CROSSLISTING_LAB_ENABLED } from '@/constants/crosslisting-lab';
import { WebAppShellLayoutProvider } from '@/hooks/use-responsive-layout';
import { hasCompletedScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

export const unstable_settings = {
  anchor: 'index',
};

function WebWalkthroughAutoLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useKeepFlipAuth();
  const checkedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      checkedUserId.current = null;
      return;
    }
    if (pathname === '/walkthrough' || checkedUserId.current === user.$id) return;

    let cancelled = false;
    checkedUserId.current = user.$id;
    void hasCompletedScanInventoryWalkthrough(user.$id, user.name)
      .then((completed) => {
        if (!cancelled && !completed) router.replace('/walkthrough' as Href);
      })
      .catch(() => {
        if (!cancelled) checkedUserId.current = null;
      });
    return () => { cancelled = true; };
  }, [pathname, router, user]);

  return null;
}

export default function WebAppShellLayout() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <SafeAreaProvider>
      <EbayConnectionProvider>
        <ItemAnalysisResultProvider>
          <WebAppShellLayoutProvider>
            <KeepFlipWebShell>
              <WebWalkthroughAutoLauncher />
              <Stack
                screenOptions={{
                  animation: 'fade',
                  contentStyle: { backgroundColor: colors.backgroundDeep },
                  headerShown: false,
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="walkthrough" />
                <Stack.Screen name="scanner" />
                <Stack.Screen name="inventory" />
                <Stack.Screen name="analysis" />
                <Stack.Screen name="analysis-result" />
                <Stack.Screen name="listing-guide" />
                <Stack.Screen name="repair-assist" />
                <Stack.Screen name="command-center" />
                <Stack.Screen name="ai-preferences" />
                <Stack.Screen name="flip-plan" />
                <Stack.Screen name="account" />
                <Stack.Screen name="facebook-dashboard" />
                <Stack.Screen name="connections" />
                <Stack.Screen name="ebay-connect" />
                <Stack.Screen name="ebay-account" />
                <Stack.Screen name="books" />
                <Stack.Screen name="books-records" />
                <Stack.Screen name="market-research" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="seller-center" />
                <Stack.Screen name="seller-assistant" />
                {CROSSLISTING_LAB_ENABLED ? <Stack.Screen name="crosslisting" /> : null}
              </Stack>
            </KeepFlipWebShell>
          </WebAppShellLayoutProvider>
        </ItemAnalysisResultProvider>
      </EbayConnectionProvider>
    </SafeAreaProvider>
  );
}
