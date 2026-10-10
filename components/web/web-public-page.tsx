import Head from 'expo-router/head';
import { Link, type Href } from 'expo-router';
import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import {
  KEEPFLIP_PUBLIC_COLORS,
  KEEPFLIP_SITE_URL,
} from '@/constants/keepflip-public-site';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';

export type PublicPageMetadata = {
  canonicalPath: string;
  description: string;
  ogType?: 'article' | 'website';
  structuredData?: Record<string, unknown> | readonly Record<string, unknown>[];
  title: string;
};

export function WebPageHead({
  canonicalPath,
  description,
  ogType = 'website',
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
      <meta property="og:type" content={ogType} />
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
  const toCssLength = (value: unknown) =>
    typeof value === 'number' ? `${value}px` : typeof value === 'string' ? value : undefined;
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
    textAlign: nativeStyle.textAlign === 'auto' ? undefined : nativeStyle.textAlign,
  };
  const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';

  return createElement(tag, { 'data-keepflip-heading': level, style: cssStyle }, children);
}

export function WebMarketingPage({
  children,
  eyebrow,
  heroMeta,
  intro,
  metadata,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  heroMeta?: ReactNode;
  intro: string;
  metadata: PublicPageMetadata;
  title: string;
}) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;
  const { width, webPageGutter } = useResponsiveLayout();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [metadata.canonicalPath]);

  const contentSizing =
    Platform.OS === 'web'
      ? {
          alignSelf: 'center' as const,
          maxWidth: 1560,
          minWidth: 0,
          paddingHorizontal: webPageGutter,
          width: '100%' as const,
        }
      : undefined;

  return (
    <>
      <WebPageHead {...metadata} />
      <KeepFlipBackground colorScheme="dark">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[responsiveStyles.scrollContent, contentSizing]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[responsiveStyles.page, width < 480 && responsiveStyles.pagePhone]}>
            <WebSiteHeader colorScheme="dark" label="TOOLS FOR SOLO RESELLERS" showMarketingLinks />
            <View style={responsiveStyles.hero}>
              <Text style={[responsiveStyles.eyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
              <SemanticHeading level={1} style={[responsiveStyles.title, width < 480 && responsiveStyles.titlePhone, { color: colors.text }]}>
                {title}
              </SemanticHeading>
              <Text style={[responsiveStyles.intro, { color: colors.textMuted }]}>{intro}</Text>
              {heroMeta ? <View style={responsiveStyles.heroMeta}>{heroMeta}</View> : null}
            </View>
            {children}
            <WebSiteFooter colorScheme="dark" inFlow showMarketingLinks />
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
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;

  return (
    <View nativeID={id} style={responsiveStyles2.section}>
      {eyebrow ? (
        <Text style={[responsiveStyles2.sectionEyebrow, { color: colors.goldBright }]}>{eyebrow}</Text>
      ) : null}
      <SemanticHeading level={2} style={[responsiveStyles2.sectionTitle, { color: colors.text }]}>
        {title}
      </SemanticHeading>
      {children}
    </View>
  );
}

export function WebCopy({ children }: { children: ReactNode }) {
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;
  return <Text style={[responsiveStyles3.copy, { color: colors.textMuted }]}>{children}</Text>;
}

export function WebBulletList({ items }: { items: readonly string[] }) {
  const responsiveStyles4 = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;

  return (
    <View style={responsiveStyles4.list}>
      {items.map((item) => (
        <View key={item} style={responsiveStyles4.listItem}>
          <View style={[responsiveStyles4.listDot, { backgroundColor: colors.goldBright }]} />
          <Text style={[responsiveStyles4.listText, { color: colors.textMuted }]}>{item}</Text>
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
  const responsiveStyles5 = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;

  return (
    <View style={[responsiveStyles5.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
      <SemanticHeading level={3} style={[responsiveStyles5.cardTitle, { color: colors.text }]}>
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
  const responsiveStyles6 = useResponsiveStyles(createStylesWebResponsive);
  const { width } = useResponsiveLayout();
  const colors = KEEPFLIP_PUBLIC_COLORS;
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
          boxSizing: 'border-box',
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
        responsiveStyles6.action,
        secondary
          ? { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }
          : { backgroundColor: colors.gold, borderColor: colors.gold },
        pressed && responsiveStyles6.pressed,
      ]}
    >
      <Text style={[responsiveStyles6.actionText, { color: secondary ? colors.text : colors.textOnAccent }]}>
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
          responsiveStyles6.action,
          secondary
            ? { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }
            : { backgroundColor: colors.gold, borderColor: colors.gold },
          pressed && responsiveStyles6.pressed,
        ]}
      >
        <Text style={[responsiveStyles6.actionText, { color: secondary ? colors.text : colors.textOnAccent }]}>
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
  const responsiveStyles7 = useResponsiveStyles(createStylesWebResponsive);
  const colors = KEEPFLIP_PUBLIC_COLORS;
  const linkText = <Text style={[responsiveStyles7.inlineLinkText, { color: colors.goldBright }]}>{label}</Text>;

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
    paddingBottom: 40,
    paddingTop: 24,
  },
  page: {
    alignSelf: 'center',
    gap: 50,
    paddingBottom: 8,
    width: '100%',
  },
  pagePhone: {
    gap: 27,
  },
  hero: {
    alignSelf: 'flex-start',
    gap: 14,
    maxWidth: 960,
    paddingBottom: 28,
    paddingTop: 20,
    width: '100%',
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 43,
    letterSpacing: -0.8,
    lineHeight: 52,
  },
  titlePhone: {
    fontSize: 33,
    lineHeight: 41,
  },
  intro: {
    fontFamily: theme.fonts.body,
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 720,
  },
  heroMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scrollContent: {
      ...styles["scrollContent"],
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(40) : 40,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
    },
    page: {
      ...styles["page"],
      gap: layout.isWeb ? layout.webResponsiveWidth(50) : 50,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
    },
    pagePhone: {
      ...styles["pagePhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(27) : 27,
    },
    hero: {
      ...styles["hero"],
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(960) : 960,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(28) : 28,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(20) : 20,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(9) : 9,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(43) : 43,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(52) : 52,
    },
    titlePhone: {
      ...styles["titlePhone"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(33) : 33,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(41) : 41,
    },
    intro: {
      ...styles["intro"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : 17,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(27) : 27,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(720) : 720,
    },
    heroMeta: {
      ...styles["heroMeta"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
    },
    section: {
      ...styles["section"],
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    sectionEyebrow: {
      ...styles["sectionEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(28) : 28,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(36) : 36,
    },
    copy: {
      ...styles["copy"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
    },
    list: {
      ...styles["list"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    listItem: {
      ...styles["listItem"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    listDot: {
      ...styles["listDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    listText: {
      ...styles["listText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
    },
    card: {
      ...styles["card"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      minWidth: layout.isWeb ? layout.webResponsiveWidth(240) : 240,
    },
    cardTitle: {
      ...styles["cardTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(17) : 17,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(24) : 24,
    },
    action: {
      ...styles["action"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(17) : 17,
    },
    actionText: {
      ...styles["actionText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    inlineLinkText: {
      ...styles["inlineLinkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
    },
  });
}
