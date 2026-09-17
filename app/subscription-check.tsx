import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme } from '@/constants/keepflip-theme';

export default function SubscriptionCheckScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator
        accessibilityLabel="Verifying subscription access"
        color={keepFlipTheme.colors.scannerCyan}
        size="small"
      />
      <Text style={styles.label}>VERIFYING PLAN ACCESS</Text>
      <Text style={styles.description}>
        KeepFlip is checking your active subscription.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: keepFlipTheme.colors.backgroundDeep,
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  description: {
    color: keepFlipTheme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  label: {
    color: keepFlipTheme.colors.scannerCyan,
    fontFamily: 'SpaceGroteskSemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
