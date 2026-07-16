import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type KeepFlipBackgroundProps = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function KeepFlipBackground({ children, contentStyle }: KeepFlipBackgroundProps) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.ambientGradient} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    experimental_backgroundImage: `
      radial-gradient(circle at 84% 8%, rgba(224, 172, 75, 0.10) 0%, transparent 34%),
      radial-gradient(circle at 5% 68%, rgba(88, 223, 232, 0.075) 0%, transparent 38%),
      radial-gradient(circle at 92% 90%, rgba(141, 114, 255, 0.10) 0%, transparent 40%),
      linear-gradient(160deg, #050506 0%, #020204 48%, #06040A 100%)
    `,
  },
  content: {
    flex: 1,
  },
});
