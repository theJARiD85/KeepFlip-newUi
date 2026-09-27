import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type WebSiteHeaderProps = {
  label?: string;
  onGetStarted?: () => void;
  onHowItWorks?: () => void;
  onSignIn?: () => void;
  showActions?: boolean;
};

export function WebSiteHeader({
  label = 'RESELLER OPERATIONS',
  onGetStarted,
  onHowItWorks,
  onSignIn,
  showActions = true,
}: WebSiteHeaderProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const isCompact = width < 720;
  const isPhone = width < 480;

  const goHome = () => router.push('/welcome' as Href);
  const goToSignIn = onSignIn ?? (() => router.push('/sign-in' as Href));
  const goToGetStarted = onGetStarted ?? (() => router.push('/welcome' as Href));

  return (
    <View style={[styles.header, isPhone && styles.headerPhone, { borderBottomColor: colors.divider }]}>
      <Pressable
        accessibilityLabel="KeepFlip home"
        accessibilityRole="button"
        onPress={goHome}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
      >
        <Image
          accessibilityLabel="KeepFlip"
          contentFit="contain"
          source={require('@/assets/images/icon3.png')}
          style={styles.brandMark}
        />
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, { color: colors.text }]}>KEEPFLIP</Text>
          <Text style={[styles.brandTagline, { color: colors.goldBright }]}>
            SOURCING SMARTER. FLIPPING BETTER.
          </Text>
        </View>
      </Pressable>

      <View style={[styles.headerRight, isCompact && styles.headerRightCompact, isPhone && styles.headerRightPhone]}>
        <Text style={[styles.headerLabel, isPhone && styles.headerLabelPhone, { color: colors.textMuted }]}>{label}</Text>
        {showActions ? (
          <View style={[styles.headerActions, isPhone && styles.headerActionsPhone]}>
            {onHowItWorks ? (
              <Pressable
                accessibilityRole="button"
                onPress={onHowItWorks}
                style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}
              >
                <Text style={[styles.headerLinkText, { color: colors.textMuted }]}>HOW IT WORKS</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={goToSignIn}
              style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}
            >
              <Text style={[styles.headerLinkText, { color: colors.textMuted }]}>SIGN IN</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={goToGetStarted}
              style={({ pressed }) => [
                styles.headerCta,
                { backgroundColor: colors.gold, borderColor: colors.gold },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.headerCtaText, { color: colors.textOnAccent }]}>GET STARTED</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function WebSiteFooter({ suppressAuthLinks = false }: { suppressAuthLinks?: boolean }) {
  const router = useRouter();
  const { isBusy, pendingMfaSignIn, status } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const shouldHideAuthLinks =
    suppressAuthLinks ||
    status === 'signed-in' ||
    status === 'checking' ||
    isBusy ||
    pendingMfaSignIn !== null;
  const { width } = useWindowDimensions();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const isPhone = width < 480;

  const openSupport = (subject: string) => {
    void Linking.openURL(
      `mailto:support@keep-flip.com?subject=${encodeURIComponent(subject)}`,
    );
  };

  return (
    <View style={[styles.footer, isPhone && styles.footerPhone, { backgroundColor: colors.backgroundDeep, borderTopColor: colors.divider }]}>
      <View style={[styles.footerMain, isPhone && styles.footerMainPhone]}>
        <View style={[styles.footerBrand, isPhone && styles.footerBrandPhone]}>
          <Text style={[styles.footerName, { color: colors.text }]}>KEEPFLIP</Text>
          <Text style={[styles.footerDescription, { color: colors.textMuted }]}>
            The reseller command center for sourcing, inventory, listings, and real profit.
          </Text>
        </View>

        <View style={[styles.footerLinks, isPhone && styles.footerLinksPhone]}>
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
          <FooterLink
            colors={colors}
            label="Terms"
            onPress={() => router.push('/terms' as Href)}
          />
          <FooterLink
            colors={colors}
            label="Privacy"
            onPress={() => router.push('/privacy' as Href)}
          />
          {!shouldHideAuthLinks ? (
            <>
              <FooterLink
                colors={colors}
                label="Sign in"
                onPress={() => router.push('/sign-in' as Href)}
              />
              <FooterLink
                colors={colors}
                label="Get started"
                onPress={() => router.push('/welcome' as Href)}
                accent
              />
            </>
          ) : null}
        </View>
      </View>

      <View style={[styles.footerMeta, isPhone && styles.footerMetaPhone, { borderTopColor: colors.divider }]}>
        <Text style={[styles.footerMetaText, { color: colors.textMuted }]}>
          © 2026 KeepFlip. Built for resellers.
        </Text>
        <Text style={[styles.footerMetaText, { color: colors.goldBright }]}>
          SOURCING SMARTER. FLIPPING BETTER.
        </Text>
      </View>
    </View>
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerLink,
        accent && {
          backgroundColor: colors.iconSurfaceGold,
          borderColor: colors.accentGoldBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.footerLinkText, { color: accent ? colors.goldBright : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    alignSelf: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'space-between',
    maxWidth: 1120,
    minWidth: 0,
    paddingBottom: 16,
    width: '100%',
  },
  headerPhone: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 12,
    paddingBottom: 14,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 10,
  },
  brandMark: {
    height: 75,
    width: 65,
  },
  brandCopy: {
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
    fontSize: 10,
    letterSpacing: 0.75,
  },
  headerRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 9,
    minWidth: 0,
  },
  headerRightCompact: {
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
    gap: 17,
    maxWidth: 1120,
    minWidth: 0,
    paddingHorizontal: 24,
    paddingVertical: 23,
    width: '100%',
  },
  footerPhone: {
    gap: 20,
    paddingHorizontal: 0,
    paddingVertical: 20,
  },
  footerMain: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  footerMainPhone: {
    flexDirection: 'column',
    gap: 16,
    width: '100%',
  },
  footerBrand: {
    flex: 1,
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
