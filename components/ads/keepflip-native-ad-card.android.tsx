import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { KeepFlipAppodealNativeView } from '@/modules/keepflip-appodeal-native';
import { isAppodealNativeAdsConfigured } from '@/services/appodeal-native-ads';

type KeepFlipNativeAdCardProps = {
  placement?: string;
  style?: StyleProp<ViewStyle>;
};

export function KeepFlipNativeAdCard({
  placement = 'inventory_feed',
  style,
}: KeepFlipNativeAdCardProps) {
  const [ready, setReady] = useState(false);
  const configured = isAppodealNativeAdsConfigured();

  const handleReady = useCallback(() => setReady(true), []);
  const handleUnavailable = useCallback(() => setReady(false), []);

  if (!configured) return null;

  return (
    <View
      collapsable={false}
      pointerEvents={ready ? 'auto' : 'none'}
      style={[
        styles.shell,
        { height: ready ? 430 : 0, marginBottom: ready ? 14 : 0 },
        style,
      ]}>
      <KeepFlipAppodealNativeView
        onAdExpired={handleUnavailable}
        onAdFailed={handleUnavailable}
        onAdReady={handleReady}
        placement={placement}
        style={styles.nativeView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
  },
  nativeView: {
    width: '100%',
    height: 430,
  },
});
