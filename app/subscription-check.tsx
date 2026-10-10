import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import {
  getKeepFlipThemeColors,
  keepFlipTheme as theme,
} from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export default function SubscriptionCheckScreen() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont,
  } = useResponsiveLayout();

  return (
    <KeepFlipBackground
      contentStyle={[
        styles.content,
        {
          width: contentWidth,
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: pageGutter,
        },
      ]}
    >
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
          <ActivityIndicator color={colors.scannerCyan} size="small" />
          <View style={styles.statusCopy}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>KEEPFLIP / SECURE ACCESS</Text>
            <Text style={[styles.status, { fontSize: responsiveFont(14) }]}>Loading your KeepFlip account access.</Text>
              </View>
          </View>
        </View>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    lockup: { width: '100%', maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(360) : 360, alignItems: 'center', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(22) : 22 },
    logoHalo: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(148) : 148,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(148) : 148,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurface,
      boxShadow: '0 0 44px rgba(215, 168, 74, 0.15)',
    },
    logo: { width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(134) : 134, height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(134) : 134 },
    statusRow: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(58) : 58,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(18) : 18,
      borderRadius: theme.radii.medium,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.surfaceOverlay,
    },
    statusCopy: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    eyebrow: {
      color: theme.colors.gold,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    status: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14, fontWeight: '800' },
  });
  return {
    ...staticStyles,
    logoHalo: [
      staticStyles.logoHalo,
      {
        width: responsiveWidth(148),
        height: responsiveHeight(148),
      },
    ],
    logo: [
      staticStyles.logo,
      {
        width: responsiveWidth(134),
        height: responsiveHeight(134),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    status: [
      staticStyles.status,
      {
        fontSize: responsiveFont(14),
      },
    ],
  };
}
