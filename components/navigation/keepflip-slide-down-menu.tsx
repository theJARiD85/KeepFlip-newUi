import * as Haptics from 'expo-haptics';
import { type Href, usePathname, useRouter } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EbayMenuConnectionLink } from '@/components/navigation/ebay-menu-connection-link';
import {
  MENU_CLOSE_DURATION_MS,
  useKeepFlipMenu,
} from '@/components/navigation/keepflip-menu-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { SourcingTripControl } from '@/components/sourcing/sourcing-trip-control';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
type MenuDestination = {
  eyebrow: string;
  href: Href;
  icon: ComponentProps<typeof IconSymbol>['name'];
  label: string;
};

const destinations: MenuDestination[] = [
  {
    eyebrow: 'RUN YOUR BUSINESS',
    href: '/command-center' as Href,
    icon: 'gauge.with.dots.needle.67percent',
    label: 'Command Center',
  },
  { eyebrow: 'IDENTIFY & VALUE', href: '/scanner' as Href, icon: 'viewfinder', label: 'Scanner' },
  { eyebrow: 'YOUR SAVED FINDS', href: '/inventory', icon: 'shippingbox.fill', label: 'Inventory' },
];

const MENU_BACKGROUND_DARK = `
      radial-gradient(circle at 86% 0%, rgba(224, 172, 75, 0.17) 0%, transparent 34%),
      radial-gradient(circle at 2% 100%, rgba(141, 114, 255, 0.09) 0%, transparent 38%),
      linear-gradient(155deg, rgba(18, 15, 22, 0.99) 0%, rgba(3, 3, 6, 0.99) 74%)
    `;

function getLightMenuBackground() {
  return `
      radial-gradient(circle at 86% 0%, rgba(215, 168, 74, 0.18) 0%, transparent 34%),
      radial-gradient(circle at 2% 100%, rgba(140, 120, 203, 0.14) 0%, transparent 38%),
      radial-gradient(circle at 18% 56%, rgba(0, 177, 187, 0.12) 0%, transparent 36%),
      linear-gradient(155deg, ${theme.colors.card} 0%, ${theme.colors.card} 74%)
    `;
}

const MENU_SHADOW_DARK = '0 22px 60px rgba(0, 0, 0, 0.72), 0 0 30px rgba(215, 168, 74, 0.10)';
const MENU_SHADOW_LIGHT = `{offsetX: 0, offsetY: 18, blurRadius: 48, spreadDistance: 2, color: 'rgba(76, 60, 47, 0', inset: true}`;

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
}

function isDestinationActive(destinationPath: string, pathname: string) {
  if (destinationPath === '/command-center') {
    return (
      pathname === '/' ||
      pathname === '/command-center' ||
      pathname === '/books'
    );
  }

  return pathname.startsWith(destinationPath);
}

export function KeepFlipSlideDownMenu() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const { closeMenu, isMenuOpen, toggleMenu } = useKeepFlipMenu();
  const isMenuDisabled = pathname === '/walkthrough';
  const progress = useSharedValue(0);
  const [isMenuMounted, setIsMenuMounted] = useState(isMenuOpen);
  const panelHeight = Math.min(660, Math.max(543, height - insets.bottom - 30));

  useEffect(() => {
    let openFrame: number | undefined;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    if (isMenuOpen) {
      openFrame = requestAnimationFrame(() => {
        setIsMenuMounted(true);
        progress.value = withTiming(1, {
          duration: MENU_CLOSE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        });
      });
    } else {
      progress.value = withTiming(0, {
        duration: MENU_CLOSE_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
      });

      unmountTimer = setTimeout(() => {
        setIsMenuMounted(false);
      }, MENU_CLOSE_DURATION_MS);
    }

    return () => {
      if (openFrame != null) cancelAnimationFrame(openFrame);
      if (unmountTimer != null) clearTimeout(unmountTimer);
    };
  }, [isMenuOpen, progress]);

  useEffect(() => {
    if (isMenuDisabled && isMenuOpen) {
      closeMenu();
    }
  }, [closeMenu, isMenuDisabled, isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeMenu();
      return true;
    });

    return () => subscription.remove();
  }, [closeMenu, isMenuOpen]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(panelHeight + 24) * (1 - progress.value) }],
  }));

  const menuBackground = effectiveColorScheme === 'light'
    ? getLightMenuBackground()
    : MENU_BACKGROUND_DARK;
  const menuShadow = effectiveColorScheme === 'light'
    ? MENU_SHADOW_LIGHT
    : MENU_SHADOW_DARK;

  const handleToggle = () => {
    if (isMenuDisabled) return;
    hapticSelection();
    toggleMenu();
  };

  const handleNavigate = (destination: MenuDestination) => {
    if (isMenuDisabled) return;
    hapticSelection();
    closeMenu();

    const destinationPath = destination.href.toString();
    const isAlreadyOnDestination =
      destinationPath === '/command-center'
        ? pathname === '/' || pathname === '/command-center'
        : pathname === destinationPath;

    if (!isAlreadyOnDestination) {
      requestAnimationFrame(() => router.replace(destination.href));
    }
  };

  const handleQuickNavigate = (destination: '/account' | '/notifications') => {
    if (isMenuDisabled) return;
    hapticSelection();
    closeMenu();
    if (!pathname.startsWith(destination)) {
      requestAnimationFrame(() => router.replace(destination as Href));
    }
  };

  const handleEbayNavigate = (isConnected: boolean) => {
    if (isMenuDisabled) return;
    hapticSelection();
    closeMenu();

    const destination = (isConnected ? '/ebay-account' : '/ebay-connect') as Href;
    if (!pathname.startsWith(destination.toString())) {
      requestAnimationFrame(() => router.push(destination));
    }
  };

  return (
    <View collapsable={false} pointerEvents="box-none" style={styles.overlayRoot}>
      {isMenuMounted && !isMenuDisabled ? (
        <>
          <Animated.View
            pointerEvents={isMenuOpen ? 'auto' : 'none'}
            style={[styles.backdrop, backdropStyle]}>
            <Pressable
              accessibilityLabel="Close navigation menu"
              accessibilityRole="button"
              disabled={!isMenuOpen}
              onPress={closeMenu}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Animated.View
            accessibilityElementsHidden={!isMenuOpen}
            accessibilityViewIsModal={isMenuOpen}
            importantForAccessibility={isMenuOpen ? 'yes' : 'no-hide-descendants'}
            pointerEvents={isMenuOpen ? 'auto' : 'none'}
            style={[
              styles.panel,
              {
                height: panelHeight,
                paddingTop: insets.top,
                experimental_backgroundImage: menuBackground,
                boxShadow: menuShadow,
              },
              panelStyle,
            ]}>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.panelContent}
              contentInsetAdjustmentBehavior="never"
              showsVerticalScrollIndicator={false}>
              <View style={styles.brandRow}>
                <View style={styles.brandLockup}>
                  <View style={styles.brandBackdrop}>
                    <Image
                      source={require('@/assets/images/icon.png')}
                      accessibilityLabel="KeepFlip"
                      style={styles.brandMark}
                    />
                  </View>
                  <View style={styles.brandCopy}>
                    <Text style={[styles.brandName, { fontSize: responsiveFont(22) }]}>KEEPFLIP</Text>
                    <View style={styles.brandDescriptorContainer}>
                      <Text numberOfLines={1} style={styles.brandDescriptor}>Sourcing smarter. </Text>
                      <Text numberOfLines={1} style={styles.brandDescriptor}>Flipping better.</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.brandActions}>
                  <Pressable
                    accessibilityLabel="Close navigation menu"
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={closeMenu}
                    style={({ pressed }) => [
                      styles.closeButton,
                      pressed && styles.controlPressed,
                    ]}>
                    <IconSymbol name="xmark" size={22} color={theme.colors.goldBright} />
                  </Pressable>
                </View>
              </View>

              <View pointerEvents="none" style={styles.goldRail} />
              <View style={{flexDirection: 'row', justifyContent: 'center', gap: 16, backgroundColor: 'transparent'}}>
                <Pressable
                    onPress={() => handleQuickNavigate('/account')}
                    style={[styles.quickAction, {flexDirection: 'row', justifyContent: 'center', gap: 16, backgroundColor: 'transparent'}]}>
                  <View>
                      <IconSymbol
                        name="person.crop.circle.fill"
                        size={19}
                        color={pathname.startsWith('/account') ? theme.colors.scannerCyan : theme.colors.goldBright}
                      />
                    </View>
                </Pressable>
                <Pressable
                  onPress={() => handleQuickNavigate('/notifications')}
                  accessibilityLabel="Open Notifications"
                  accessibilityRole="button"
                  hitSlop={8}
                  style={[styles.quickAction, {flexDirection: 'row', justifyContent: 'center', gap: 16, backgroundColor: 'transparent'}]}>
                  <View>
                        <IconSymbol
                          name="envelope.fill"
                          size={19}
                          color={pathname.startsWith('/notifications') ? theme.colors.scannerCyan : theme.colors.goldBright}
                        />
                      </View>
                </Pressable>
              </View>
              <View style={styles.navigationBlock}>
                <Text style={[styles.sectionLabel, { fontSize: responsiveFont(9) }]}>NAVIGATION</Text>

                <View style={styles.destinationList}>
                  {destinations.map((destination, index) => {
                    const destinationPath = destination.href.toString();
                    const isActive = isDestinationActive(destinationPath, pathname);

                    return (
                      <Pressable
                        accessibilityLabel={`Open ${destination.label}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={destinationPath}
                        onPress={() => handleNavigate(destination)}
                        style={({ pressed }) => [
                          styles.destination,
                          isActive && styles.destinationActive,
                          pressed && styles.destinationPressed,
                        ]}>
                        <View
                          style={[
                            styles.destinationIcon,
                            isActive && styles.destinationIconActive,
                          ]}>
                          <IconSymbol
                            color={
                              isActive
                                ? theme.colors.goldBright
                                : theme.colors.goldMuted
                            }
                            name={destination.icon}
                            size={24}
                          />
                        </View>

                        <View style={styles.destinationCopy}>
                          <Text
                            style={[
                              styles.destinationLabel,
                              isActive && styles.destinationLabelActive,
                            ]}>
                            {destination.label}
                          </Text>
                          <Text style={[styles.destinationEyebrow, { fontSize: responsiveFont(8) }]}>
                            {destination.eyebrow}
                          </Text>
                        </View>

                        {isActive ? (
                          <View
                            accessibilityLabel="Current screen"
                            style={styles.activeIndicator}
                          />
                        ) : (
                          <IconSymbol
                            name="chevron.right"
                            size={19}
                            color={theme.colors.goldMuted}
                          />
                        )}

                        <Text style={styles.destinationNumber}>0{index + 1}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.workflowBlock}>
                <Text style={[styles.sectionLabel, { fontSize: responsiveFont(9) }]}>WORKFLOW</Text>
                <SourcingTripControl />
              </View>

              <EbayMenuConnectionLink
                active={
                  pathname.startsWith('/ebay-connect') || pathname.startsWith('/ebay-account')
                }
                disabled={isMenuDisabled}
                open={isMenuOpen}
                onPress={handleEbayNavigate}
              />

              <View style={styles.systemStatus}>
                <View style={styles.systemStatusDot} />
                <View style={styles.systemStatusCopy}>
                  <Text style={[styles.systemStatusLabel, { fontSize: responsiveFont(8) }]}>KEEPFLIP VISION</Text>
                  <Text style={[styles.systemStatusValue, { fontSize: responsiveFont(10) }]}>SYSTEM READY</Text>
                </View>
                <Text style={[styles.systemStatusCode, { fontSize: responsiveFont(9) }]}>KF//01</Text>
              </View>
            </ScrollView>
          </Animated.View>
        </>
      ) : null}

      <View
        accessibilityElementsHidden={isMenuDisabled}
        importantForAccessibility={isMenuDisabled ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isMenuDisabled || isMenuOpen ? 'none' : 'auto'}
        style={[
          styles.triggerWrap,
          {
            top: insets.top + 12,
            opacity: isMenuDisabled || isMenuOpen ? 0 : 1,
            transform: [{ scale: isMenuOpen ? 0.92 : 1 }],
          },
        ]}>
        <Pressable
          accessibilityLabel="Open navigation menu"
          accessibilityRole="button"
          disabled={isMenuDisabled || isMenuOpen}
          hitSlop={10}
          onPress={handleToggle}
          style={({ pressed }) => [styles.trigger, pressed && styles.controlPressed]}>
          <IconSymbol name="line.3.horizontal" size={22} color={theme.colors.goldBright} />
          <View pointerEvents="none" style={styles.triggerStatusDot} />
        </Pressable>
      </View>
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    overlayRoot: {
      ...StyleSheet.absoluteFill,
      zIndex: 10000,
      elevation: 10000,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      zIndex: 10000,
      elevation: 10000,
      backgroundColor: theme.colors.scrim,
    },
    panel: {
      position: 'absolute',
      zIndex: 10001,
      elevation: 10001,
      top: 0,
      right: 0,
      left: 0,
      overflow: 'hidden',
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderLeftWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderBottomRightRadius: theme.radii.large,
      borderBottomLeftRadius: theme.radii.large,
      backgroundColor: theme.colors.card,
    },
    panelContent: {
      flexGrow: 1,
      gap: 15,
      top: 14,
      paddingHorizontal: 20,
      paddingBottom: 30,
    },
    brandRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    brandActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    brandLockup: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    brandBackdrop: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: theme.colors.backgroundRaised,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.gold,
    },
    brandMark: {
      width: 65,
      height: 50,
    },
    brandCopy: {
      minWidth: 0,
      gap: 5,
      bottom: 5,
    },
    brandName: {
      color: theme.colors.cream,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: 2.6,
    },
    brandDescriptorContainer: {
      maxWidth: 150,
    },
    brandDescriptor: {
      color: theme.colors.gold,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.8,
    },
    closeButton: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.38)',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    quickAction: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.cardSoft,
    },
    quickActionActive: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    controlPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.95 }],
    },
    goldRail: {
      height: 1,
      experimental_backgroundImage:
        'linear-gradient(90deg, transparent 0%, rgba(215, 168, 74, 0.55) 20%, rgba(242, 211, 138, 0.92) 50%, rgba(215, 168, 74, 0.55) 80%, transparent 100%)',
      boxShadow: '0 0 12px rgba(215, 168, 74, 0.24)',
    },
    navigationBlock: {
      gap: 10,
    },
    workflowBlock: {
      gap: 10,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2.2,
    },
    destinationList: {
      gap: 9,
    },
    destination: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: 'rgba(138, 100, 43, 0.18)',
      backgroundColor: theme.colors.cardSoft,
    },
    destinationActive: {
      borderColor: 'rgba(242, 211, 138, 0.42)',
      backgroundColor: theme.colors.iconSurfaceGold,
      boxShadow: 'inset 0 0 22px rgba(215, 168, 74, 0.06), 0 0 20px rgba(215, 168, 74, 0.07)',
    },
    destinationPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.985 }],
    },
    destinationIcon: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: 'rgba(138, 100, 43, 0.24)',
      backgroundColor: theme.colors.iconSurface,
    },
    destinationIconActive: {
      borderColor: 'rgba(242, 211, 138, 0.48)',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    destinationCopy: {
      minWidth: 0,
      flex: 1,
      gap: 3,
    },
    destinationLabel: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '800',
    },
    destinationLabelActive: {
      color: theme.colors.cream,
    },
    destinationEyebrow: {
      color: theme.colors.textMuted,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 1.35,
    },
    activeIndicator: {
      width: 7,
      height: 7,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.scannerCyan,
      boxShadow: '0 0 10px rgba(88, 223, 232, 0.88)',
    },
    destinationNumber: {
      position: 'absolute',
      right: 8,
      bottom: -6,
      color: 'rgba(242, 211, 138, 0.055)',
      fontSize: 38,
      fontWeight: '900',
      letterSpacing: -2,
    },
    ebayLink: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.18)',
      backgroundColor: theme.colors.cardSoft,
    },
    ebayLinkActive: {
      borderColor: 'rgba(242, 211, 138, 0.36)',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    ebayLinkPressed: {
      opacity: 0.76,
    },
    ebayLinkCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    ebayLinkText: {
      color: theme.colors.cream,
      fontSize: 13,
      fontWeight: '800',
    },
    ebayLinkEyebrow: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    systemStatus: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.18)',
      backgroundColor: theme.colors.cardSoft,
    },
    systemStatusDot: {
      width: 6,
      height: 6,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.scannerCyan,
      boxShadow: '0 0 10px rgba(88, 223, 232, 0.85)',
    },
    systemStatusCopy: {
      flex: 1,
      gap: 1,
    },
    systemStatusLabel: {
      color: theme.colors.textMuted,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 1.35,
    },
    systemStatusValue: {
      color: theme.colors.scannerCyan,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    systemStatusCode: {
      color: theme.colors.goldMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
    },
    triggerWrap: {
      position: 'absolute',
      right: 20,
      zIndex: 10002,
      elevation: 10002,
    },
    trigger: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.48)',
      backgroundColor: theme.colors.card,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.48), 0 0 18px rgba(215, 168, 74, 0.12)',
    },
    triggerStatusDot: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      width: 5,
      height: 5,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.background,
      backgroundColor: theme.colors.scannerCyan,
      boxShadow: '0 0 7px rgba(88, 223, 232, 0.82)',
    },
  });
  return {
    ...staticStyles,
    brandMark: [
      staticStyles.brandMark,
      {
        width: responsiveWidth(65),
        height: responsiveHeight(50),
      },
    ],
    brandName: [
      staticStyles.brandName,
      {
        fontSize: responsiveFont(22),
      },
    ],
    brandDescriptor: [
      staticStyles.brandDescriptor,
      {
        fontSize: responsiveFont(9),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(46),
        height: responsiveHeight(46),
      },
    ],
    goldRail: [
      staticStyles.goldRail,
      {
        height: responsiveHeight(1),
      },
    ],
    sectionLabel: [
      staticStyles.sectionLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    destinationIcon: [
      staticStyles.destinationIcon,
      {
        width: responsiveWidth(46),
        height: responsiveHeight(46),
      },
    ],
    destinationLabel: [
      staticStyles.destinationLabel,
      {
        fontSize: responsiveFont(17),
      },
    ],
    destinationEyebrow: [
      staticStyles.destinationEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    activeIndicator: [
      staticStyles.activeIndicator,
      {
        width: responsiveWidth(7),
        height: responsiveHeight(7),
      },
    ],
    destinationNumber: [
      staticStyles.destinationNumber,
      {
        fontSize: responsiveFont(38),
      },
    ],
    ebayLinkText: [
      staticStyles.ebayLinkText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    ebayLinkEyebrow: [
      staticStyles.ebayLinkEyebrow,
      {
        fontSize: responsiveFont(7),
      },
    ],
    systemStatusDot: [
      staticStyles.systemStatusDot,
      {
        width: responsiveWidth(6),
        height: responsiveHeight(6),
      },
    ],
    systemStatusLabel: [
      staticStyles.systemStatusLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    systemStatusValue: [
      staticStyles.systemStatusValue,
      {
        fontSize: responsiveFont(10),
      },
    ],
    systemStatusCode: [
      staticStyles.systemStatusCode,
      {
        fontSize: responsiveFont(9),
      },
    ],
    trigger: [
      staticStyles.trigger,
      {
        width: responsiveWidth(48),
        height: responsiveHeight(48),
      },
    ],
    triggerStatusDot: [
      staticStyles.triggerStatusDot,
      {
        width: responsiveWidth(5),
        height: responsiveHeight(5),
      },
    ],
  };
}
