import { createElement, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicSiteFooter } from '@/components/web/public-site-footer';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type PublicInfoPageProps = {
  eyebrow: string;
  paragraphs: string[];
  title: string;
  children?: ReactNode;
};

export function PublicInfoPage({
  children,
  eyebrow,
  paragraphs,
  title,
}: PublicInfoPageProps) {
  const insets = useSafeAreaInsets();
  const colors = getKeepFlipThemeColors('dark');
  const titleStyle = StyleSheet.flatten([styles.title, { color: colors.cream }]);

  return (
    <KeepFlipBackground colorScheme="dark" variant="public-site">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 36,
            paddingBottom: insets.bottom + 36,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>
          <Text style={[styles.eyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
          {Platform.OS === 'web' ? (
            createElement('h1', { style: titleStyle }, title)
          ) : (
            <Text style={titleStyle}>{title}</Text>
          )}
          {paragraphs.map((paragraph) => (
            <Text key={paragraph} style={[styles.paragraph, { color: colors.text }]}>
              {paragraph}
            </Text>
          ))}
          {children}
        </View>
        <PublicSiteFooter />
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    gap: 18,
    maxWidth: 720,
    width: '100%',
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1.7,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 42,
    lineHeight: 50,
    marginBottom: 0,
    marginTop: 0,
  },
  paragraph: {
    fontFamily: theme.fonts.body,
    fontSize: 17,
    lineHeight: 27,
  },
});
