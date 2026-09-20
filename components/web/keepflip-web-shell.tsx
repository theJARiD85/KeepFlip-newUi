import { Image } from 'expo-image';
import { type Href, usePathname, useRouter } from 'expo-router';
import { type PropsWithChildren, type ComponentProps } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type IconName = ComponentProps<typeof IconSymbol>['name'];

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
    icon: 'gauge.with.dots.needle.67percent',
    label: 'Command center',
  },
  {
    eyebrow: 'WORKSPACE',
    href: '/inventory',
    icon: 'shippingbox.fill',
    label: 'Inventory',
  },
  {
    eyebrow: 'WORKSPACE',
    href: '/books',
    icon: 'chart.bar.fill',
    label: 'Books & reports',
  },
  {
    eyebrow: 'INTELLIGENCE',
    href: '/market-research',
    icon: 'magnifyingglass',
    label: 'Market research',
  },
  {
    eyebrow: 'INTELLIGENCE',
    href: '/seller-assistant',
    icon: 'bubble.left.and.bubble.right.fill',
    label: 'Flip assistant',
  },
];

const utilityNavigation: NavItem[] = [
  {
    eyebrow: 'PLAN',
    href: '/flip-plan',
    icon: 'dollarsign.circle.fill',
    label: 'Plan a flip',
  },
  {
    eyebrow: 'CAPTURE',
    href: '/scanner',
    icon: 'viewfinder',
    label: 'Scanner',
    androidOnly: true,
  },
  {
    eyebrow: 'ACCOUNT',
    href: '/account',
    icon: 'person.crop.circle.fill',
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
  if (pathname.startsWith('/books')) return 'BOOKS & REPORTS';
  if (pathname.startsWith('/market-research')) return 'MARKET RESEARCH';
  if (pathname.startsWith('/seller-assistant')) return 'FLIP ASSISTANT';
  if (pathname.startsWith('/scanner')) return 'SCANNER';
  if (pathname.startsWith('/account')) return 'ACCOUNT';
  return 'KEEPFLIP WORKSPACE';
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={compact ? styles.brandCompact : styles.brand}>
      <Image
        accessibilityLabel="KeepFlip"
        contentFit="contain"
        source={require('@/assets/images/icon3.png')}
        style={compact ? styles.brandMarkCompact : styles.brandMark}
      />
      {!compact ? (
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>KEEPFLIP</Text>
          <Text style={styles.brandTagline}>SOURCE WITH SIGNAL</Text>
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
  return (
    <Pressable
      accessibilityLabel={item.androidOnly ? `${item.label}, Android app` : item.label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        active && {
          backgroundColor: colors.iconSurfaceGold,
          borderColor: colors.accentGoldBorder,
        },
        pressed && styles.navButtonPressed,
      ]}>
      <View style={[styles.navIcon, active && { backgroundColor: colors.iconSurfaceGold }]}>
        <IconSymbol
          color={active ? colors.goldBright : colors.textMuted}
          name={item.icon}
          size={18}
        />
      </View>
      <View style={styles.navCopy}>
        <Text style={[styles.navLabel, { color: active ? colors.text : colors.textMuted }]}>
          {item.label}
        </Text>
        {item.androidOnly ? (
          <Text style={[styles.navMeta, { color: colors.goldBright }]}>ANDROID CAPTURE</Text>
        ) : null}
      </View>
      {active ? <View style={[styles.navActiveDot, { backgroundColor: colors.goldBright }]} /> : null}
    </Pressable>
  );
}

export function KeepFlipWebShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
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
      <Text style={[styles.navGroupLabel, { color: colors.textMuted }]}>WORKSPACE</Text>
      {primaryNavigation.map((item) => (
        <NavButton
          colors={colors}
          active={isNavItemActive(item.href, pathname)}
          item={item}
          key={String(item.href)}
          onPress={() => navigate(item.href)}
        />
      ))}
      <Text style={[styles.navGroupLabel, styles.navGroupLabelSpaced, { color: colors.textMuted }]}>TOOLS</Text>
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
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      {isWide ? (
        <View style={[styles.sidebar, { backgroundColor: colors.background, borderRightColor: colors.divider }]}>
          <Brand />
          <ScrollView
            contentContainerStyle={styles.sidebarNavigation}
            showsVerticalScrollIndicator={false}>
            {navigation}
          </ScrollView>
          <View style={[styles.sidebarFooter, { borderTopColor: colors.divider }]}>
            <Pressable
              accessibilityLabel="Open account settings"
              accessibilityRole="button"
              onPress={() => navigate('/account')}
              style={({ pressed }) => [styles.profileButton, pressed && styles.navButtonPressed]}>
              <View style={[styles.avatar, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
                <Text style={[styles.avatarText, { color: colors.goldBright }]}>{userInitials}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={[styles.profileName, { color: colors.text }]}>
                  {user?.name?.trim() || 'KeepFlip seller'}
                </Text>
                <Text style={[styles.profileMeta, { color: colors.textMuted }]}>VIEW ACCOUNT</Text>
              </View>
              <IconSymbol color={colors.textMuted} name="chevron.right" size={16} />
            </Pressable>
            <Pressable
              accessibilityLabel="Sign out"
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.signOutButton, pressed && styles.navButtonPressed]}>
              <IconSymbol color={colors.textMuted} name="rectangle.portrait.and.arrow.right" size={16} />
              <Text style={[styles.signOutLabel, { color: colors.textMuted }]}>SIGN OUT</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.mobileChrome, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}>
          <View style={styles.mobileTopRow}>
            <Brand compact />
            <View style={styles.mobileTopActions}>
              <Pressable
                accessibilityLabel="Open Android scanner"
                accessibilityRole="button"
                onPress={() => navigate('/scanner')}
                style={({ pressed }) => [styles.mobileAction, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }, pressed && styles.navButtonPressed]}>
                <IconSymbol color={colors.scannerCyan} name="viewfinder" size={17} />
                <Text style={[styles.mobileActionLabel, { color: colors.scannerCyan }]}>SCAN ON ANDROID</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Open account settings"
                accessibilityRole="button"
                onPress={() => navigate('/account')}
                style={[styles.avatar, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.accentGoldBorder }]}>
                <Text style={[styles.avatarText, { color: colors.goldBright }]}>{userInitials}</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.mobileNavigation}
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

      <View style={[styles.main, !isWide && styles.mainMobile]}>
        <View style={[styles.topbar, !isWide && styles.topbarMobile, { borderBottomColor: colors.divider }]}>
          <View>
            <Text style={[styles.topbarEyebrow, { color: colors.textMuted }]}>{displaySection(pathname)}</Text>
            <Text style={[styles.topbarTitle, { color: colors.text }]}>KeepFlip workspace</Text>
          </View>
          <View style={styles.topbarStatus}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.topbarStatusText, { color: colors.textMuted }]}>PRIVATE WORKSPACE</Text>
          </View>
        </View>
        <View style={styles.routeContent}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%',
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
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 28,
  },
  brandCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandMark: {
    width: 38,
    height: 38,
  },
  brandMarkCompact: {
    width: 32,
    height: 32,
  },
  brandCopy: {
    gap: 2,
  },
  brandName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
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
    fontSize: 8,
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    paddingBottom: 7,
    paddingTop: 6,
  },
  navGroupLabelSpaced: {
    paddingTop: 22,
  },
  navButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 9,
  },
  navButtonPressed: {
    opacity: 0.72,
  },
  navIcon: {
    width: 32,
    height: 32,
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
  mobileNavigation: {
    gap: 5,
    paddingTop: 8,
  },
});
