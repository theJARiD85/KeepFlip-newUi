import Head from 'expo-router/head';
import { Link, type Href } from 'expo-router';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import {
  KEEPFLIP_SITE_URL,
} from '@/constants/keepflip-public-site';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export type PublicPageMetadata = {
  canonicalPath: string;
  description: string;
  structuredData?: Record<string, unknown> | readonly Record<string, unknown>[];
  title: string;
};

export function WebPageHead({
  canonicalPath,
  description,
  structuredData,
  title,
}: PublicPageMetadata) {
  const canonicalUrl = `${KEEPFLIP_SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const jsonLd = structuredData ? JSON.stringify(structuredData) : null;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="KeepFlip" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={`${KEEPFLIP_SITE_URL}/keepflip-og.png`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${KEEPFLIP_SITE_URL}/keepflip-og.png`} />
      {jsonLd ? <script type="application/ld+json">{jsonLd}</script> : null}
    </Head>
  );
}

export function SemanticHeading({
  children,
  level,
  style,
}: {
  children: ReactNode;
  level: 1 | 2 | 3;
  style?: StyleProp<TextStyle>;
}) {
  if (Platform.OS !== 'web') {
    return (
      <Text accessibilityRole="header" style={style}>
        {children}
      </Text>
    );
  }

  const nativeStyle = StyleSheet.flatten(style) ?? {};
  const toCssLength = (value: number | string | undefined) =>
    typeof value === 'number' ? `${value}px` : value;
  const cssStyle: CSSProperties = {
    color: typeof nativeStyle.color === 'string' ? nativeStyle.color : undefined,
    fontFamily: nativeStyle.fontFamily,
    fontSize: toCssLength(nativeStyle.fontSize),
    fontWeight: nativeStyle.fontWeight,
    letterSpacing: toCssLength(nativeStyle.letterSpacing),
    lineHeight: toCssLength(nativeStyle.lineHeight),
    margin: 0,
    maxWidth: toCssLength(nativeStyle.maxWidth),
    padding: 0,
    textAlign: nativeStyle.textAlign,
  };
  const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';

  return createElement(tag, { 'data-keepflip-heading': level, style: cssStyle }, children);
}

export function WebMarketingPage({
  children,
  eyebrow,
  intro,
  metadata,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  intro: string;
  metadata: PublicPageMetadata;
  title: string;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { width } = useWindowDimensions();
  const { webContentMaxWidth, webContentWidth, webPageGutter } = useResponsiveLayout();
  const contentSizing =
    Platform.OS === 'web'
      ? {
          alignSelf: 'center' as const,
          maxWidth: webContentMaxWidth,
          paddingHorizontal: webPageGutter,
          width: webContentWidth,
        }
      : undefined;

  return (
    <>
      <WebPageHead {...metadata} />
      <KeepFlipBackground>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentSizing]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.page, width < 480 && styles.pagePhone, contentSizing]}>
            <WebSiteHeader label="TOOLS FOR SOLO RESELLERS" showMarketingLinks />
            <View style={styles.hero}>
              <Text style={[styles.eyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
              <SemanticHeading level={1} style={[styles.title, { color: colors.text }]}>
                {title}
              </SemanticHeading>
              <Text style={[styles.intro, { color: colors.textMuted }]}>{intro}</Text>
            </View>
            {children}
            <WebSiteFooter showMarketingLinks />
          </View>
        </ScrollView>
      </KeepFlipBackground>
    </>
  );
}

export function WebContentSection({
  children,
  eyebrow,
  id,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  id?: string;
  title: string;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View nativeID={id} style={styles.section}>
      {eyebrow ? (
        <Text style={[styles.sectionEyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
      ) : null}
      <SemanticHeading level={2} style={[styles.sectionTitle, { color: colors.text }]}>
        {title}
      </SemanticHeading>
      {children}
    </View>
  );
}

export function WebCopy({ children }: { children: ReactNode }) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  return <Text style={[styles.copy, { color: colors.textMuted }]}>{children}</Text>;
}

export function WebBulletList({ items }: { items: readonly string[] }) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item} style={styles.listItem}>
          <View style={[styles.listDot, { backgroundColor: colors.goldBright }]} />
          <Text style={[styles.listText, { color: colors.textMuted }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function WebInfoCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
      <SemanticHeading level={3} style={[styles.cardTitle, { color: colors.text }]}>
        {title}
      </SemanticHeading>
      {children}
    </View>
  );
}

export function WebActionLink({
  href,
  label,
  secondary = false,
}: {
  href: string;
  label: string;
  secondary?: boolean;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const { width } = useWindowDimensions();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  if (Platform.OS === 'web') {
    const external = href.startsWith('http') || href.startsWith('mailto:');
    const isPhone = width < 480;
    return createElement(
      'a',
      {
        href,
        rel: external && href.startsWith('http') ? 'noopener noreferrer' : undefined,
        style: {
          alignItems: 'center',
          alignSelf: isPhone ? 'stretch' : 'flex-start',
          backgroundColor: secondary ? colors.backgroundRaised : colors.gold,
          border: `1px solid ${secondary ? colors.divider : colors.gold}`,
          borderRadius: 14,
          color: secondary ? colors.text : colors.textOnAccent,
          display: 'inline-flex',
          fontFamily: theme.fonts.semibold,
          fontSize: 13,
          justifyContent: 'center',
          minHeight: 48,
          padding: '0 17px',
          textDecoration: 'none',
          width: isPhone ? '100%' : undefined,
        },
      },
      label,
    );
  }

  const content = (
    <Pressable
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.action,
        secondary
          ? { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }
          : { backgroundColor: colors.gold, borderColor: colors.gold },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? colors.text : colors.textOnAccent }]}>
        {label}
      </Text>
    </Pressable>
  );

  if (href.startsWith('http') || href.startsWith('mailto:')) {
    return (
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(href)}
        style={({ pressed }) => [
          styles.action,
          secondary
            ? { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }
            : { backgroundColor: colors.gold, borderColor: colors.gold },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.actionText, { color: secondary ? colors.text : colors.textOnAccent }]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return <Link href={href as Href} asChild>{content}</Link>;
}

export function WebTextLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const linkText = <Text style={[styles.inlineLinkText, { color: colors.goldBright }]}>{label}</Text>;

  if (href.startsWith('http') || href.startsWith('mailto:')) {
    if (Platform.OS === 'web') {
      return createElement(
        'a',
        {
          href,
          rel: href.startsWith('http') ? 'noopener noreferrer' : undefined,
          style: { color: colors.goldBright, textDecoration: 'underline' },
        },
        label,
      );
    }
    return (
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(href)}>
        {linkText}
      </Pressable>
    );
  }

  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link">{linkText}</Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 24,
    paddingTop: 24,
  },
  page: {
    alignSelf: 'center',
    gap: 34,
    maxWidth: 1120,
    paddingBottom: 8,
    width: '100%',
  },
  pagePhone: {
    gap: 27,
  },
  hero: {
    alignSelf: 'center',
    gap: 10,
    maxWidth: 800,
    width: '100%',
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 39,
    letterSpacing: -0.8,
    lineHeight: 48,
  },
  intro: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 720,
  },
  section: {
    gap: 13,
  },
  sectionEyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  sectionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    letterSpacing: -0.45,
    lineHeight: 36,
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  list: {
    gap: 9,
  },
  listItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  listDot: {
    borderRadius: 4,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  listText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    minWidth: 240,
    padding: 18,
  },
  cardTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 24,
  },
  action: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 17,
  },
  actionText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
  },
  inlineLinkText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.76,
  },
});
