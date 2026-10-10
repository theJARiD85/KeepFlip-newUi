import { Image } from 'expo-image';
import { type Href, usePathname, useRouter } from 'expo-router';
import { type ComponentProps, type PropsWithChildren } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter } from '@/components/web/web-site-chrome';
import { CROSSLISTING_LAB_ENABLED } from '@/constants/crosslisting-lab';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type IconName = ComponentProps<typeof Ionicons>['name'];

type NavItem = {
  label: string;
  eyebrow: string;
  href: Href;
  icon: IconName;
  androidOnly?: boolean;
};

const primaryNavigation: NavItem[] = [
  {
    eyebrow: 'OVERVIEW',
    href: '/',
    icon: 'speedometer-outline',
    label: 'Command Center',
  },
  {
    eyebrow: 'WORKSPACE',
    href: '/inventory',
    icon: 'cube-outline',
    label: 'Inventory',
  },
  ...(CROSSLISTING_LAB_ENABLED
    ? [{
      eyebrow: 'WORKSPACE',
      href: '/crosslisting' as Href,
      icon: 'list-outline',
      label: 'Listing',
    }]
    : []),
  {
    eyebrow: 'WORKSPACE',
    href: '/books',
    icon: 'bar-chart-outline',
    label: 'Books & Reports',
  },
  {
    eyebrow: 'INTELLIGENCE',
    href: '/market-research',
    icon: 'search-outline',
    label: 'Market Research',
  },
  {
    eyebrow: 'INTELLIGENCE',
    href: '/seller-assistant',
    icon: 'chatbubble-ellipses-outline',
    label: 'Flip Assistant',
  },
];

const utilityNavigation: NavItem[] = [
  {
    eyebrow: 'PLAN',
    href: '/flip-plan',
    icon: 'cash-outline',
    label: 'Plan a flip',
  },
  {
    eyebrow: 'CAPTURE',
    href: '/scanner',
    icon: 'scan-outline',
    label: 'Scanner',
    androidOnly: true,
  },
  {
    eyebrow: 'ACCOUNT',
    href: '/account',
    icon: 'person-circle-outline',
    label: 'Account settings',
  },
];

function isNavItemActive(href: Href, pathname: string) {
  const path = String(href);
  if (path === '/') return pathname === '/' || pathname === '/command-center';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function initials(name: string | null | undefined) {
  const value = name?.trim();
  if (!value) return 'KF';
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
}

function displaySection(pathname: string) {
  if (pathname === '/' || pathname === '/command-center') return 'COMMAND CENTER';
  if (pathname.startsWith('/inventory')) return 'INVENTORY';
  if (pathname.startsWith('/crosslisting')) return 'LISTING';
  if (pathname.startsWith('/books')) return 'BOOKS & REPORTS';
  if (pathname.startsWith('/market-research')) return 'MARKET RESEARCH';
  if (pathname.startsWith('/seller-assistant')) return 'FLIP ASSISTANT';
  if (pathname.startsWith('/scanner')) return 'SCANNER';
  if (pathname.startsWith('/account')) return 'ACCOUNT';
  return 'KEEPFLIP WORKSPACE';
}

function Brand({ compact = false }: { compact?: boolean }) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={compact ? responsiveStyles.brandCompact : responsiveStyles.brand}>
      <Image
        accessibilityLabel="KeepFlip"
        contentFit="contain"
        source={require('@/assets/images/icon3.png')}
        style={compact ? responsiveStyles.brandMarkCompact : responsiveStyles.brandMark}
      />
      {!compact ? (
        <View style={responsiveStyles.brandCopy}>
          <Text style={responsiveStyles.brandName}>KEEPFLIP</Text>
          <Text style={responsiveStyles.brandTagline}>SOURCING SMARTER. FLIPPING BETTER.</Text>
        </View>
      ) : null}
    </View>
  );
}

function NavButton({
  item,
  active,
  onPress,
  colors,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
}) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <Pressable
      accessibilityLabel={item.androidOnly ? `${item.label}, Android app` : item.label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        responsiveStyles2.navButton,
        active && {
          backgroundColor: colors.iconSurfaceGold,
          borderColor: colors.accentGoldBorder,
        },
        pressed && responsiveStyles2.navButtonPressed,
      ]}>
      <View style={[responsiveStyles2.navIcon, active && { backgroundColor: colors.iconSurfaceGold }]}>
        <Ionicons
          color={active ? colors.goldBright : colors.textMuted}
          name={item.icon}
          size={18}
        />
      </View>
      <View style={responsiveStyles2.navCopy}>
        <Text style={[responsiveStyles2.navLabel, { color: active ? colors.text : colors.textMuted }]}>
          {item.label}
        </Text>
        {item.androidOnly ? (
          <Text style={[responsiveStyles2.navMeta, { color: colors.goldBright }]}>ANDROID CAPTURE</Text>
        ) : null}
      </View>
      {active ? <View style={[responsiveStyles2.navActiveDot, { backgroundColor: colors.goldBright }]} /> : null}
    </Pressable>
  );
}

export function KeepFlipWebShell({ children }: PropsWithChildren) {
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  const { width } = useResponsiveLayout();
  const isWide = width >= 980;
  const isPhone = width < 480;
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const userInitials = initials(user?.name);

  const navigate = (href: Href) => {
    router.push(href);
  };

  const navigation = (
    <>
      <Text style={[responsiveStyles3.navGroupLabel, { color: colors.textMuted }]}>WORKSPACE</Text>
      {primaryNavigation.map((item) => (
        <NavButton
          colors={colors}
          active={isNavItemActive(item.href, pathname)}
          item={item}
          key={String(item.href)}
          onPress={() => navigate(item.href)}
        />
      ))}
      <Text style={[responsiveStyles3.navGroupLabel, responsiveStyles3.navGroupLabelSpaced, { color: colors.textMuted }]}>TOOLS</Text>
      {utilityNavigation.map((item) => (
        <NavButton
          colors={colors}
          active={isNavItemActive(item.href, pathname)}
          item={item}
          key={String(item.href)}
          onPress={() => navigate(item.href)}
        />
      ))}
    </>
  );

  return (
    <View style={[responsiveStyles3.root, { backgroundColor: colors.backgroundDeep }]}>
      {isWide ? (
        <View style={[responsiveStyles3.sidebar, { backgroundColor: colors.background, borderRightColor: colors.divider }]}>
          <Brand />
          <ScrollView
            contentContainerStyle={responsiveStyles3.sidebarNavigation}
            showsVerticalScrollIndicator={false}>
            {navigation}
          </ScrollView>
          <View style={[responsiveStyles3.sidebarFooter, { borderTopColor: colors.divider }]}>
            <Pressable
              accessibilityLabel="Open account settings"
              accessibilityRole="button"
              onPress={() => navigate('/account')}
              style={({ pressed }) => [responsiveStyles3.profileButton, pressed && responsiveStyles3.navButtonPressed]}>
              <View style={[responsiveStyles3.avatar, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
                <Text style={[responsiveStyles3.avatarText, { color: colors.goldBright }]}>{userInitials}</Text>
              </View>
              <View style={responsiveStyles3.profileCopy}>
                <Text numberOfLines={1} style={[responsiveStyles3.profileName, { color: colors.text }]}>
                  {user?.name?.trim() || 'KeepFlip seller'}
                </Text>
                <Text style={[responsiveStyles3.profileMeta, { color: colors.textMuted }]}>VIEW ACCOUNT</Text>
              </View>
              <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
            </Pressable>
            <Pressable
              accessibilityLabel="Sign out"
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [responsiveStyles3.signOutButton, pressed && responsiveStyles3.navButtonPressed]}>
              <Ionicons color={colors.textMuted} name="log-out-outline" size={16} />
              <Text style={[responsiveStyles3.signOutLabel, { color: colors.textMuted }]}>SIGN OUT</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[responsiveStyles3.mobileChrome, isPhone && responsiveStyles3.mobileChromePhone, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}>
          <View style={responsiveStyles3.mobileTopRow}>
            <Brand compact />
            <View style={responsiveStyles3.mobileTopActions}>
              <Pressable
                accessibilityLabel="Open Android scanner"
                accessibilityRole="button"
                onPress={() => navigate('/scanner')}
                style={({ pressed }) => [responsiveStyles3.mobileAction, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }, pressed && responsiveStyles3.navButtonPressed]}>
                <Ionicons color={colors.scannerCyan} name="scan-outline" size={17} />
                <Text style={[responsiveStyles3.mobileActionLabel, isPhone && responsiveStyles3.mobileActionLabelPhone, { color: colors.scannerCyan }]}>{isPhone ? 'ANDROID SCAN' : 'SCAN ON ANDROID'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Open account settings"
                accessibilityRole="button"
                onPress={() => navigate('/account')}
                style={[responsiveStyles3.avatar, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
                <Text style={[responsiveStyles3.avatarText, { color: colors.goldBright }]}>{userInitials}</Text>
              </Pressable>
            </View>
          </View>
          <View style={[responsiveStyles3.mobileSectionRow, isPhone && responsiveStyles3.mobileSectionRowPhone]}>
            <Text numberOfLines={1} style={[responsiveStyles3.mobileSectionLabel, { color: colors.goldBright }]}>{displaySection(pathname)}</Text>
            <Text numberOfLines={1} style={[responsiveStyles3.mobileSectionMeta, { color: colors.textMuted }]}>PRIVATE WORKSPACE</Text>
          </View>
          <ScrollView
            contentContainerStyle={[responsiveStyles3.mobileNavigation, isPhone && responsiveStyles3.mobileNavigationPhone]}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {primaryNavigation.concat(utilityNavigation.slice(0, 2)).map((item) => (
              <NavButton
                colors={colors}
                active={isNavItemActive(item.href, pathname)}
                item={item}
                key={String(item.href)}
                onPress={() => navigate(item.href)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[responsiveStyles3.main, !isWide && responsiveStyles3.mainMobile, isPhone && responsiveStyles3.mainMobilePhone]}>
        <View style={[responsiveStyles3.topbar, !isWide && responsiveStyles3.topbarMobile, { borderBottomColor: colors.divider }]}>
          <View>
            <Text style={[responsiveStyles3.topbarEyebrow, { color: colors.textMuted }]}>{displaySection(pathname)}</Text>
            <Text style={[responsiveStyles3.topbarTitle, { color: colors.text }]}>KeepFlip workspace</Text>
          </View>
          <View style={responsiveStyles3.topbarStatus}>
            <View style={[responsiveStyles3.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[responsiveStyles3.topbarStatusText, { color: colors.textMuted }]}>PRIVATE WORKSPACE</Text>
          </View>
        </View>
        <View style={responsiveStyles3.routeContent}>{children}</View>
        <WebSiteFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    minHeight: '100%',
    width: '100%',
  },
  sidebar: {
    width: 264,
    minHeight: '100%',
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 28,
  },
  brandCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  brandMark: {
    width: 55,
    height: 55,
  },
  brandMarkCompact: {
    width: 50,
    height: 50,
  },
  brandCopy: {
    gap: 3,
    justifyContent: 'center',
  },
  brandName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 19,
    letterSpacing: 2.4,
  },
  brandTagline: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.medium,
    fontSize: 7,
    letterSpacing: 1.5,
  },
  sidebarNavigation: {
    gap: 5,
    paddingBottom: 20,
  },
  navGroupLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 2,
    paddingHorizontal: 12,
    paddingBottom: 7,
    paddingTop: 0,
  },
  navGroupLabelSpaced: {
    paddingTop: 22,
  },
  navButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
  },
  navButtonPressed: {
    opacity: 0.72,
  },
  navIcon: {
    width: 35,
    height: 35,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  navLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
  },
  navMeta: {
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    letterSpacing: 1,
  },
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sidebarFooter: {
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 10,
  },
  profileButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 7,
    borderRadius: 12,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  profileName: {
    fontFamily: theme.fonts.semibold,
    fontSize: 11,
  },
  profileMeta: {
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    letterSpacing: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  signOutButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  signOutLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mainMobile: {
    paddingTop: 104,
    alignSelf: 'stretch',
    width: '100%',
  },
  mainMobilePhone: {
    paddingTop: 110,
  },
  topbar: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    paddingHorizontal: 30,
    borderBottomWidth: 1,
  },
  topbarMobile: {
    display: 'none',
  },
  topbarEyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  topbarTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    marginTop: 4,
  },
  topbarStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  topbarStatusText: {
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  routeContent: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  mobileChrome: {
    position: 'absolute',
    zIndex: 5,
    left: 0,
    right: 0,
    top: 0,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  mobileChromePhone: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  mobileTopRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  mobileSectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minWidth: 0,
    paddingTop: 7,
  },
  mobileSectionRowPhone: {
    gap: 10,
  },
  mobileSectionLabel: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  mobileSectionMeta: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    letterSpacing: 0.8,
    textAlign: 'right',
  },
  mobileAction: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  mobileActionLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  mobileActionLabelPhone: {
    fontSize: 6.5,
    letterSpacing: 0.6,
  },
  mobileNavigation: {
    flexDirection: 'row',
    gap: 5,
    paddingTop: 8,
  },
  mobileNavigationPhone: {
    gap: 4,
    paddingTop: 7,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    sidebar: {
      ...styles["sidebar"],
      width: layout.isWeb ? layout.webResponsiveWidth(264) : 264,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
    },
    brand: {
      ...styles["brand"],
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(28) : 28,
    },
    brandMark: {
      ...styles["brandMark"],
      width: layout.isWeb ? layout.webResponsiveWidth(55) : 55,
      height: layout.isWeb ? layout.webResponsiveHeight(55) : 55,
    },
    brandMarkCompact: {
      ...styles["brandMarkCompact"],
      width: layout.isWeb ? layout.webResponsiveWidth(50) : 50,
      height: layout.isWeb ? layout.webResponsiveHeight(50) : 50,
    },
    brandCopy: {
      ...styles["brandCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    brandTagline: {
      ...styles["brandTagline"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    sidebarNavigation: {
      ...styles["sidebarNavigation"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(20) : 20,
    },
    navGroupLabel: {
      ...styles["navGroupLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    navGroupLabelSpaced: {
      ...styles["navGroupLabelSpaced"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(22) : 22,
    },
    navButton: {
      ...styles["navButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    navIcon: {
      ...styles["navIcon"],
      width: layout.isWeb ? layout.webResponsiveWidth(35) : 35,
      height: layout.isWeb ? layout.webResponsiveHeight(35) : 35,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    navLabel: {
      ...styles["navLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    navMeta: {
      ...styles["navMeta"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    navActiveDot: {
      ...styles["navActiveDot"],
      width: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      height: layout.isWeb ? layout.webResponsiveHeight(5) : 5,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    sidebarFooter: {
      ...styles["sidebarFooter"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    profileButton: {
      ...styles["profileButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(52) : 52,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    profileCopy: {
      ...styles["profileCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    profileName: {
      ...styles["profileName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    profileMeta: {
      ...styles["profileMeta"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    avatar: {
      ...styles["avatar"],
      width: layout.isWeb ? layout.webResponsiveWidth(32) : 32,
      height: layout.isWeb ? layout.webResponsiveHeight(32) : 32,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    avatarText: {
      ...styles["avatarText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    signOutButton: {
      ...styles["signOutButton"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(32) : 32,
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
    signOutLabel: {
      ...styles["signOutLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    mainMobile: {
      ...styles["mainMobile"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(104) : 104,
    },
    mainMobilePhone: {
      ...styles["mainMobilePhone"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(110) : 110,
    },
    topbar: {
      ...styles["topbar"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(78) : 78,
      gap: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(30) : 30,
    },
    topbarEyebrow: {
      ...styles["topbarEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    topbarTitle: {
      ...styles["topbarTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    topbarStatus: {
      ...styles["topbarStatus"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    statusDot: {
      ...styles["statusDot"],
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
    },
    topbarStatusText: {
      ...styles["topbarStatusText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    mobileChrome: {
      ...styles["mobileChrome"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
      paddingBottom: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
    },
    mobileChromePhone: {
      ...styles["mobileChromePhone"],
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    mobileTopRow: {
      ...styles["mobileTopRow"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
    },
    mobileTopActions: {
      ...styles["mobileTopActions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    mobileSectionRow: {
      ...styles["mobileSectionRow"],
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    mobileSectionRowPhone: {
      ...styles["mobileSectionRowPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    mobileSectionLabel: {
      ...styles["mobileSectionLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
    mobileSectionMeta: {
      ...styles["mobileSectionMeta"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    mobileAction: {
      ...styles["mobileAction"],
      minHeight: layout.isWeb ? layout.webResponsiveHeight(30) : 30,
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
    },
    mobileActionLabel: {
      ...styles["mobileActionLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(7) : 7,
    },
    mobileActionLabelPhone: {
      ...styles["mobileActionLabelPhone"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(6.5) : 6.5,
    },
    mobileNavigation: {
      ...styles["mobileNavigation"],
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
    },
    mobileNavigationPhone: {
      ...styles["mobileNavigationPhone"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
  });
}
