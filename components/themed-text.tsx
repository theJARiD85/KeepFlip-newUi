import { StyleSheet, type TextProps } from 'react-native';

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    default: {
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(24) : 24,
    },
    defaultSemiBold: {
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(24) : 24,
      fontWeight: '600',
    },
    title: {
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(32) : 32,
      fontWeight: 'bold',
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(32) : 32,
    },
    subtitle: {
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(20) : 20,
      fontWeight: 'bold',
    },
    link: {
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(30) : 30,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16,
      color: theme.colors.scannerCyan,
    },
  });
  return {
    ...staticStyles,
    default: [
      staticStyles.default,
      {
        fontSize: responsiveFont(16),
      },
    ],
    defaultSemiBold: [
      staticStyles.defaultSemiBold,
      {
        fontSize: responsiveFont(16),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(32),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(20),
      },
    ],
    link: [
      staticStyles.link,
      {
        fontSize: responsiveFont(16),
      },
    ],
  };
}
