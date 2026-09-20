import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import {
  getKeepFlipThemeColors,
  keepFlipTheme as theme,
} from '@/constants/keepflip-theme';

export default function ARMeasureWebScreen() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.backgroundRaised,
            borderColor: colors.divider,
          },
        ]}>
        <Text style={[styles.eyebrow, { color: colors.scannerCyan }]}>ANDROID-ONLY TOOL</Text>
        <Text style={[styles.title, { color: colors.text }]}>Measure in the real world from the Android app.</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          KeepFlip AR Measure needs the device camera and native depth capabilities,
          so it stays in the Android app. Your web workspace is ready for the
          inventory, Books, research, and planning work around that measurement.
        </Text>
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.gold },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>Go to web workspace</Text>
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
