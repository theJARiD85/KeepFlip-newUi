import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";

export function KeepFlipAuthBootstrapScreen() {
  return (
    <KeepFlipBackground contentStyle={styles.content}>
      <View style={styles.lockup}>
        <View style={styles.logoHalo}>
          <Image
            accessibilityLabel="KeepFlip"
            contentFit="contain"
            source={require('@/assets/images/icon3.png')}
            style={styles.logo}
          />
        </View>
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
          <View style={styles.statusCopy}>
            <Text style={styles.eyebrow}>KEEPFLIP / SECURE ACCESS</Text>
            <Text style={styles.status}>Verifying your session</Text>
          </View>
        </View>
      </View>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockup: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 22 },
  logoHalo: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.24)',
    backgroundColor: 'rgba(6, 5, 7, 0.64)',
    boxShadow: '0 0 44px rgba(215, 168, 74, 0.15)',
  },
  logo: { width: 134, height: 134 },
  statusRow: {
    minHeight: 58,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    paddingHorizontal: 18,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.18)',
    backgroundColor: 'rgba(8, 8, 11, 0.76)',
  },
  statusCopy: { gap: 3 },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  status: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
});
