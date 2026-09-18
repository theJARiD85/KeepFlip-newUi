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
    linear-gradient(160deg, #1e161298 0%, #34200534 33%, #1e161271 66%, #3420052e  100%),
      radial-gradient(circle at 84% 8%, rgba(224, 172, 75, 0.25) 0%, transparent 34%),
      radial-gradient(circle at 5% 68%, rgba(88, 222, 232, 0.1) 0%, transparent 38%),
      radial-gradient(circle at 92% 90%, rgba(140, 114, 255, 0.1) 0%, transparent 40%),
      linear-gradient(80deg, #1e161298 0%, #34200534 33%, #1e161271 66%, #3420052e  100%)

    `,
  },
  ambientGradientLight: {
    experimental_backgroundImage: `
    linear-gradient(160deg, #b28c651e 0%, #8C7D6D34 33%, #7A695871 66%, #8C7D6D2E 100%),
      radial-gradient(circle at 84% 8%, rgba(215, 168, 74, 0.12) 0%, transparent 34%),
      radial-gradient(circle at 5% 68%, rgba(0, 177, 187, 0.05) 0%, transparent 38%),
      radial-gradient(circle at 92% 90%, rgba(108, 75, 255, 0.07) 0%, transparent 40%),
      linear-gradient(40deg, #cea17369 0%, #8C7D6D34 33%, #9c846c37 66%, #8C7D6D2E 100%)

    `,
  },
  content: {
    flex: 1,
  },
});
