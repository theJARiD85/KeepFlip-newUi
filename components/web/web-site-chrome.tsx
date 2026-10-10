import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebBlogMenu } from '@/components/web/web-blog-menu';
import { getKeepFlipThemeColors, keepFlipTheme as theme, type KeepFlipColorScheme } from '@/constants/keepflip-theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link, useRouter, type Href } from 'expo-router';
import { createElement, type CSSProperties } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { responsiveHeight, responsiveWidth } from '@/lib/responsiveFont';
type WebSiteHeaderProps = {
  colorScheme?: KeepFlipColorScheme;
  label?: string;
  onGetStarted?: () => void;
  onHowItWorks?: () => void;
  onSignIn?: () => void;
  showActions?: boolean;
  showBackButton?: boolean;
  showMarketingLinks?: boolean;
};

export function WebSiteHeader({
  colorScheme,
  onGetStarted,
  onHowItWorks,
  onSignIn,
  showBackButton = false,
  showMarketingLinks = false,
  showActions = true,
}: WebSiteHeaderProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(colorScheme ?? effectiveColorScheme);
  const isCompact = width < 720;
  const isPhone = width < 480;

  const goToSignIn = onSignIn ?? (() => router.push('/sign-in' as Href));
  const goToGetStarted = onGetStarted ?? (() => router.push('/meet-flip' as Href));

  return (
    <View style={[responsiveStyles.header, isCompact && responsiveStyles.headerCompact, isPhone && responsiveStyles.headerPhone, { borderBottomColor: colors.divider }]}>
      <Link href="/welcome" asChild style={responsiveStyles.brand}>
        <Pressable
          accessibilityLabel="KeepFlip home"
          accessibilityRole="link"
          style={({ pressed }) => [pressed && responsiveStyles.pressed]}
        >
          <View style={responsiveStyles.brandCopy}>
            <Image
              accessibilityLabel="KeepFlip"
              contentFit="contain"
              source={require('@/assets/images/icon3.png')}
              style={responsiveStyles.brandMark}
            />
          </View>
          <View style={responsiveStyles.brandCopy}>
            <Text style={[responsiveStyles.brandName, { color: colors.text }]}>KEEPFLIP</Text>
            <Text style={[responsiveStyles.brandTagline, { color: colors.goldBright }]}>
              Know what every flip costs.
            </Text>
          </View>
        </Pressable>
      </Link>

      <View style={[responsiveStyles.headerRight, isCompact && responsiveStyles.headerRightCompact, isPhone && responsiveStyles.headerRightPhone]}>
        {showActions ? (
          <View style={[responsiveStyles.headerActions, isPhone && responsiveStyles.headerActionsPhone]}>
            {showBackButton ? (
              <Pressable
                accessibilityLabel="Go back from legal documents"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/');
                  }
                }}
                style={({ pressed }) => [
                  responsiveStyles.headerBackButton,
                  {
                    backgroundColor: colors.iconSurfaceGold,
                    borderColor: colors.accentGoldBorder,
                  },
                  pressed && responsiveStyles.headerBackButtonPressed,
                ]}
              >
                <Ionicons color={colors.goldBright} name="chevron-back" size={17} />
                <Text style={[responsiveStyles.headerBackButtonText, { color: colors.goldBright }]}>BACK</Text>
              </Pressable>
            ) : null}
            {showMarketingLinks ? (
              <>
                <HeaderRouteLink colors={colors} href="/features" label="HOW IT WORKS" />
                <HeaderRouteLink colors={colors} href="/pricing" label="PRICING" />
                <HeaderRouteLink colors={colors} href="/about" label="ABOUT" />
                <WebBlogMenu colors={colors} isPhone={isPhone} width={width} />
              </>
            ) : onHowItWorks ? (
              <Pressable
                accessibilityRole="button"
                onPress={onHowItWorks}
                style={({ pressed }) => [responsiveStyles.headerLink, pressed && responsiveStyles.pressed]}
              >
                <Text style={[responsiveStyles.headerLinkText, { color: colors.textMuted }]}>HOW IT WORKS</Text>
              </Pressable>
            ) : null}
            {showMarketingLinks ? (
              <>
                <HeaderRouteLink colors={colors} href="/sign-in" label="SIGN IN" />
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={goToSignIn}
                  style={({ pressed }) => [responsiveStyles.headerLink, pressed && responsiveStyles.pressed]}
                >
                  <Text style={[responsiveStyles.headerLinkText, { color: colors.textMuted }]}>SIGN IN</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={goToGetStarted}
                  style={({ pressed }) => [
                    responsiveStyles.headerCta,
                    { backgroundColor: colors.gold, borderColor: colors.gold },
                    pressed && responsiveStyles.pressed,
                  ]}
                >
                  <Text style={[responsiveStyles.headerCtaText, { color: colors.textOnAccent }]}>GET STARTED</Text>
                </Pressable>
              </>
            )}

          </View>
        ) : null}
      </View>
    </View>
  );
}

export function WebSiteFooter({
  colorScheme,
  inFlow = false,
  showMarketingLinks = false,
  suppressAuthLinks = false,
  hideGetStarted = false,
}: {
  colorScheme?: KeepFlipColorScheme;
  inFlow?: boolean;
  showMarketingLinks?: boolean;
  suppressAuthLinks?: boolean;
  hideGetStarted?: boolean;
}) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  const { isBusy, pendingMfaSignIn, status } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(colorScheme ?? effectiveColorScheme);
  const shouldHideAuthLinks =
    suppressAuthLinks ||
    status === 'signed-in' ||
    status === 'checking' ||
    isBusy ||
    pendingMfaSignIn !== null;
  const { width } = useWindowDimensions();
  const isPhone = width < 480;

  const openSupport = (subject: string) => {
    void Linking.openURL(
      `mailto:support@keep-flip.com?subject=${encodeURIComponent(subject)}`,
    );
  };
  const handlePress = async () => {
    const url = 'https://play.google.com/store/apps/details?id=com.keepflip.app';
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      console.error("Don't know how to open URI: " + url);
    }
  };

  return (
    <View style={[responsiveStyles2.footer, isPhone && responsiveStyles2.footerPhone, inFlow ? responsiveStyles2.footerInFlow : responsiveStyles2.footerOverlay, { backgroundColor: colors.backgroundDeep, borderTopColor: colors.divider }]}>
      <View style={[responsiveStyles2.footerMain, isPhone && responsiveStyles2.footerMainPhone]}>
      </View>

      <View style={[responsiveStyles2.footerMeta, isPhone && responsiveStyles2.footerMetaPhone, { borderTopColor: colors.divider }]}>
        <View>

          <Text style={[responsiveStyles2.footerMetaText, { color: colors.textMuted }]}>
            © 2026 KeepFlip. Built for resellers.
          </Text>
        </View>
        <View style={[responsiveStyles2.footerLinks, isPhone && responsiveStyles2.footerLinksPhone]}>
          {showMarketingLinks ? (
            <>
              <FooterRouteLink colors={colors} href="/changelog" label="Changelog" />
              <FooterRouteLink colors={colors} href="/terms" label="Terms" />
              <FooterRouteLink colors={colors} href="/privacy" label="Privacy" />

            </>
          ) : null}
          <FooterLink
            colors={colors}
            label="Help"
            onPress={() => openSupport('KeepFlip help')}
          />
          <FooterLink
            colors={colors}
            label="Contact us"
            onPress={() => openSupport('KeepFlip contact')}
          />
          <Pressable onPress={handlePress} style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Image source={require('@/assets/images/google-play.png')} style={{ height: responsiveHeight(50), width: responsiveWidth(145) }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HeaderRouteLink({
  colors,
  href,
  label,
  primary = false,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  href: string;
  label: string;
  primary?: boolean;
}) {
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  if (Platform.OS === 'web') {
    const anchorStyle: CSSProperties = {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: primary ? colors.gold : 'transparent',
      border: primary ? `1px solid ${colors.gold}` : '1px solid transparent',
      borderRadius: primary ? theme.radii.pill : 0,
      color: primary ? colors.textOnAccent : colors.textMuted,
      display: 'inline-flex',
      fontFamily: theme.fonts.bold,
      fontSize: primary ? 11 : 12,
      justifyContent: 'center',
      letterSpacing: primary ? 0.85 : 0.9,
      minHeight: 38,
      padding: primary ? '0 12px' : '0 6px',
      textDecoration: 'none',
    };
    return createElement('a', { href, style: anchorStyle }, label);
  }

  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [
          primary ? responsiveStyles3.headerCta : responsiveStyles3.headerLink,
          primary
            ? { backgroundColor: colors.gold, borderColor: colors.gold }
            : null,
          pressed && responsiveStyles3.pressed,
        ]}
      >
        <Text
          style={[
            primary ? responsiveStyles3.headerCtaText : responsiveStyles3.headerLinkText,
            { color: primary ? colors.textOnAccent : colors.textMuted },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

function FooterRouteLink({
  accent = false,
  colors,
  href,
  label,
}: {
  accent?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  href: string;
  label: string;
}) {
  const responsiveStyles4 = useResponsiveStyles(createStylesWebResponsive);
  if (Platform.OS === 'web') {
    return createElement(
      'a',
      {
        href,
        style: {
          alignItems: 'center',
          backgroundColor: accent ? colors.gold : 'transparent',
          border: `1px solid ${accent ? colors.gold : 'transparent'}`,
          borderRadius: theme.radii.pill,
          color: accent ? colors.textOnAccent : colors.textMuted,
          display: 'inline-flex',
          fontFamily: theme.fonts.semibold,
          fontSize: 12,
          justifyContent: 'center',
          minHeight: 31,
          padding: '0 10px',
          textDecoration: 'none',
        },
      },
      label,
    );
  }

  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [
          responsiveStyles4.footerLink,
          accent && { backgroundColor: colors.gold, borderColor: colors.gold },
          pressed && responsiveStyles4.pressed,
        ]}
      >
        <Text style={[responsiveStyles4.footerLinkText, { color: accent ? colors.textOnAccent : colors.textMuted }]}>{label}</Text>
      </Pressable>
    </Link>
  );
}

function FooterExternalLink({
  colors,
  href,
  label,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  href: string;
  label: string;
}) {
  const responsiveStyles5 = useResponsiveStyles(createStylesWebResponsive);
  if (Platform.OS === 'web') {
    return createElement(
      'a',
      {
        href,
        rel: 'noopener noreferrer',
        style: {
          alignItems: 'center',
          border: '1px solid transparent',
          borderRadius: theme.radii.pill,
          color: colors.textMuted,
          display: 'inline-flex',
          fontFamily: theme.fonts.semibold,
          fontSize: 12,
          justifyContent: 'center',
          minHeight: 31,
          padding: '0 10px',
          textDecoration: 'none',
        },
      },
      label,
    );
  }

  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link" style={({ pressed }) => [responsiveStyles5.footerLink, pressed && responsiveStyles5.pressed]}>
        <Text style={[responsiveStyles5.footerLinkText, { color: colors.textMuted }]}>{label}</Text>
      </Pressable>
    </Link>
  );
}

function FooterLink({
  accent = false,
  colors,
  label,
  onPress,
}: {
  accent?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  onPress: () => void;
}) {
  const responsiveStyles6 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        responsiveStyles6.footerLink,
        accent && {
          backgroundColor: colors.iconSurfaceGold,
          borderColor: colors.accentGoldBorder,
        },
        pressed && responsiveStyles6.pressed,
      ]}
    >
      <Text style={[responsiveStyles6.footerLinkText, { color: accent ? colors.goldBright : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    alignSelf: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'space-between',
    minWidth: 0,
    paddingBottom: 16,
    width: '100%',
    zIndex: 10,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 8,
  },
  headerPhone: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 12,
    paddingBottom: 14,
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 0,
  },
  brandMark: {
    height: 75,
    width: 75,
  },
  brandCopy: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 0,
    flexShrink: 1,
    gap: 2,
  },
  brandName: {
    fontFamily: theme.fonts.bold,
    fontSize: 35,
    letterSpacing: 1.8,
  },
  brandTagline: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.75,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 'auto',
    flexShrink: 1,
    gap: 9,
    minWidth: 0,
  },
  headerRightCompact: {
    alignItems: 'flex-start',
    marginLeft: 0,
    gap: 7,
  },
  headerRightPhone: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 8,
    width: '100%',
  },
  headerLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    letterSpacing: 1.3,
    textAlign: 'right',
  },
  headerLabelPhone: {
    textAlign: 'left',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
  },
  headerActionsPhone: {
    alignSelf: 'stretch',
    gap: 6,
    justifyContent: 'space-between',
    width: '100%',
  },
  headerBackButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 11,
  },
  headerBackButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.85,
  },
  headerBackButtonPressed: {
    opacity: 0.72,
    transform: [{ translateX: -2 }],
  },
  headerLink: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerLinkText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.9,
  },
  headerCta: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  headerCtaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.85,
  },
  footer: {
    alignSelf: 'center',
    borderTopWidth: 1,
    gap: 0,
    maxWidth: '100%',
    minWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 15,
    width: '100%',
  },
  footerInFlow: {
    marginTop: 12,
  },
  footerOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  footerPhone: {
    gap: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  footerMain: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  footerMainPhone: {
    flexDirection: 'column',
    width: '100%',
  },
  footerBrand: {
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  footerBrandPhone: {
    flex: 0,
    width: '100%',
  },
  footerName: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 2,
  },
  footerDescription: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    lineHeight: 15,
    maxWidth: 320,
  },
  footerLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 2,
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  footerLinksPhone: {
    alignItems: 'flex-start',
    flex: 0,
    justifyContent: 'space-between',
    width: '100%',
  },
  footerLink: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 10,
  },
  footerLinkText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
  },
  footerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 15,
  },
  footerMetaPhone: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 7,
  },
  footerMetaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  pressed: {
    opacity: 0.72,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    header: {
      ...styles["header"],
      gap: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
    },
    headerCompact: {
      ...styles["headerCompact"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    headerPhone: {
      ...styles["headerPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(14) : 14,
    },
    brandMark: {
      ...styles["brandMark"],
      height: layout.isWeb ? layout.webResponsiveHeight(75) : 75,
      width: layout.isWeb ? layout.webResponsiveWidth(75) : 75,
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(35) : 35,
    },
    brandTagline: {
      ...styles["brandTagline"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    headerRight: {
      ...styles["headerRight"],
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    headerRightCompact: {
      ...styles["headerRightCompact"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    headerRightPhone: {
      ...styles["headerRightPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    headerLabel: {
      ...styles["headerLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    headerActions: {
      ...styles["headerActions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    headerActionsPhone: {
      ...styles["headerActionsPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    headerBackButton: {
      ...styles["headerBackButton"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
    },
    headerBackButtonText: {
      ...styles["headerBackButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    headerLink: {
      ...styles["headerLink"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    headerLinkText: {
      ...styles["headerLinkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    headerCta: {
      ...styles["headerCta"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    headerCtaText: {
      ...styles["headerCtaText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    footer: {
      ...styles["footer"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(15) : 15,
    },
    footerInFlow: {
      ...styles["footerInFlow"],
      marginTop: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    footerPhone: {
      ...styles["footerPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    footerBrand: {
      ...styles["footerBrand"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    footerName: {
      ...styles["footerName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    footerDescription: {
      ...styles["footerDescription"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(320) : 320,
    },
    footerLinks: {
      ...styles["footerLinks"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    footerLink: {
      ...styles["footerLink"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(31) : 31,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    footerLinkText: {
      ...styles["footerLinkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    footerMeta: {
      ...styles["footerMeta"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(15) : 15,
    },
    footerMetaPhone: {
      ...styles["footerMetaPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    footerMetaText: {
      ...styles["footerMetaText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
  });
}
