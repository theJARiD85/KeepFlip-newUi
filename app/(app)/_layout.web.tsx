import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EbayConnectionProvider } from '@/components/ebay/ebay-connection-context';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { KeepFlipWebShell } from '@/components/web/keepflip-web-shell';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function WebAppShellLayout() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <SafeAreaProvider>
      <EbayConnectionProvider>
        <ItemAnalysisResultProvider>
          <KeepFlipWebShell>
            <Stack
              screenOptions={{
                animation: 'fade',
                contentStyle: { backgroundColor: colors.backgroundDeep },
                headerShown: false,
              }}>
              <Stack.Screen name="index" />
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
              <Stack.Screen name="connections" />
              <Stack.Screen name="ebay-connect" />
              <Stack.Screen name="ebay-account" />
              <Stack.Screen name="books" />
              <Stack.Screen name="books-records" />
              <Stack.Screen name="market-research" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="seller-center" />
              <Stack.Screen name="seller-assistant" />
            </Stack>
          </KeepFlipWebShell>
        </ItemAnalysisResultProvider>
      </EbayConnectionProvider>
    </SafeAreaProvider>
  );
}
