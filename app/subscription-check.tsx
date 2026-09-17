import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

export default function SubscriptionCheckScreen() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundDeep }]}>
      <ActivityIndicator
        accessibilityLabel="Verifying subscription access"
        color={colors.scannerCyan}
        size="small"
      />
      <Text style={[styles.label, { color: colors.scannerCyan }]}>VERIFYING PLAN ACCESS</Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>
        KeepFlip is checking your active subscription.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
  },
  label: {
    fontFamily: 'SpaceGroteskSemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
