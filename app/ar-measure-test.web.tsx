import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import {
  getKeepFlipThemeColors,
  keepFlipTheme as theme,
} from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export default function ARMeasureWebScreen() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={[responsiveStyles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View
        style={[
          responsiveStyles.card,
          {
            backgroundColor: colors.backgroundRaised,
            borderColor: colors.divider,
          },
        ]}>
        <Text style={[responsiveStyles.eyebrow, { color: colors.scannerCyan }]}>ANDROID-ONLY TOOL</Text>
        <Text style={[responsiveStyles.title, { color: colors.text }]}>Measure in the real world from the Android app.</Text>
        <Text style={[responsiveStyles.copy, { color: colors.textMuted }]}>
          KeepFlip AR Measure needs the device camera and native depth capabilities,
          so it stays in the Android app. Your web workspace is ready for the
          inventory, Books, research, and planning work around that measurement.
        </Text>
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              responsiveStyles.button,
              { backgroundColor: colors.gold },
              pressed && responsiveStyles.pressed,
            ]}>
            <Text style={[responsiveStyles.buttonText, { color: colors.textOnAccent }]}>Go to web workspace</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: theme.radii.large,
    borderWidth: 1,
    maxWidth: 580,
    padding: 30,
    width: '100%',
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    lineHeight: 37,
    marginTop: 10,
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 13,
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    marginTop: 24,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.82,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    card: {
      ...styles["card"],
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(580) : 580,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(30) : 30,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(37) : 37,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    copy: {
      ...styles["copy"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(23) : 23,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(13) : 13,
    },
    button: {
      ...styles["button"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(50) : 50,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
    },
    buttonText: {
      ...styles["buttonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
  });
}
