import { StyleSheet, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import responsiveFont from '@/lib/responsiveFont';

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
    const staticStyles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
  return {
    ...staticStyles,
  default: [
    staticStyles.default,
    {
        fontSize: responsiveLayout.responsiveFont(16),
    },
  ],
  defaultSemiBold: [
    staticStyles.defaultSemiBold,
    {
        fontSize: responsiveLayout.responsiveFont(16),
    },
  ],
  title: [
    staticStyles.title,
    {
        fontSize: responsiveLayout.responsiveFont(32),
    },
  ],
  subtitle: [
    staticStyles.subtitle,
    {
        fontSize: responsiveLayout.responsiveFont(20),
    },
  ],
  link: [
    staticStyles.link,
    {
        fontSize: responsiveLayout.responsiveFont(16),
    },
  ],
  };
}
