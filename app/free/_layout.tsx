import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EbayConnectionProvider } from '@/components/ebay/ebay-connection-context';
import { KeepFlipMenuProvider } from '@/components/navigation/keepflip-menu-context';
import { KeepFlipSlideDownMenu } from '@/components/navigation/keepflip-slide-down-menu';
import { ItemAnalysisResultProvider } from '@/components/scanner/item-analysis-result-context';
import { SourcingTripProvider } from '@/components/sourcing/sourcing-trip-provider';
import { useFreeTierPaywall } from '@/components/subscription/use-free-tier-paywall';

export const unstable_settings = {
  anchor: 'index',
};

export default function FreeScannerLayout() {
  const presentPaywallForDestination = useFreeTierPaywall();

  return (
    <KeepFlipMenuProvider>
      <EbayConnectionProvider>
        <ItemAnalysisResultProvider>
          <SourcingTripProvider>
            <View style={styles.root}>
              <KeepFlipSlideDownMenu
                freeTier
                onPaidNavigationAttempt={presentPaywallForDestination}
              />
              <Stack
                screenOptions={{
                  animation: 'fade',
                  contentStyle: { backgroundColor: '#050507' },
                  headerShown: false,
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="analysis" />
                <Stack.Screen name="analysis-result" />
                <Stack.Screen name="account" />
                <Stack.Screen name="notifications" />
              </Stack>
            </View>
          </SourcingTripProvider>
        </ItemAnalysisResultProvider>
      </EbayConnectionProvider>
    </KeepFlipMenuProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
