import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';

type KeepFlipBackgroundProps = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function KeepFlipBackground({
  children,
  contentStyle,
}: KeepFlipBackgroundProps) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View
        pointerEvents="none"
        style={[
          styles.ambientGradient,
          effectiveColorScheme === 'dark'
            ? styles.ambientGradientDark
            : styles.ambientGradientLight,
        ]}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  ambientGradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  ambientGradientDark: {
    experimental_backgroundImage: `
      radial-gradient(circle at 84% 8%, rgba(224, 172, 75, 0.10) 0%, transparent 34%),
      radial-gradient(circle at 5% 68%, rgba(88, 223, 232, 0.075) 0%, transparent 38%),
      radial-gradient(circle at 92% 90%, rgba(141, 114, 255, 0.10) 0%, transparent 40%),
      linear-gradient(160deg, #050506 0%, #020204 48%, #06040A 100%)
    `,
  },
  ambientGradientLight: {
    experimental_backgroundImage: `
      radial-gradient(circle at 84% 8%, rgba(215, 168, 74, 0.16) 0%, transparent 34%),
      radial-gradient(circle at 5% 68%, rgba(0, 177, 187, 0.08) 0%, transparent 38%),
      radial-gradient(circle at 92% 90%, rgba(141, 114, 255, 0.09) 0%, transparent 40%),
      linear-gradient(160deg, #FBF8F2 0%, #F6F1E9 48%, #EEE9F2 100%)
    `,
  },
  content: {
    flex: 1,
  },
});
