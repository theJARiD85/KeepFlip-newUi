import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

import {
  MENU_CLOSE_DURATION_MS,
  useKeepFlipMenu,
} from '@/components/navigation/keepflip-menu-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type MenuDestination = {
  eyebrow: string;
  href: Href;
  icon: 'viewfinder' | 'shippingbox.fill' | 'person.crop.circle.fill';
  label: string;
};

const destinations: MenuDestination[] = [
  { eyebrow: 'IDENTIFY & VALUE', href: '/', icon: 'viewfinder', label: 'Scanner' },
  { eyebrow: 'YOUR SAVED FINDS', href: '/inventory', icon: 'shippingbox.fill', label: 'Inventory' },
  { eyebrow: 'SELLER CONTROLS', href: '/account', icon: 'person.crop.circle.fill', label: 'Account' },
];

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
}

export function KeepFlipSlideDownMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const {
    closeMenu,
    isMenuOpen,
    toggleMenu,
  } = useKeepFlipMenu();
  const progress = useSharedValue(0);
  const [isMenuMounted, setIsMenuMounted] = useState(isMenuOpen);
  const panelHeight = Math.min(548, Math.max(430, height - insets.bottom - 84));

  useEffect(() => {
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    if (isMenuOpen) {
      setIsMenuMounted(true);
      progress.value = withTiming(1, {
        duration: MENU_CLOSE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
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
      if (unmountTimer != null) clearTimeout(unmountTimer);
    };
  }, [isMenuOpen, progress]);

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

  const handleToggle = () => {
    hapticSelection();
    toggleMenu();
  };

  const handleNavigate = (destination: MenuDestination) => {
    hapticSelection();
    closeMenu();

    const destinationPath = destination.href.toString();
    const isAlreadyActive =
      destinationPath === '/' ? pathname === '/' : pathname.startsWith(destinationPath);

    if (!isAlreadyActive) {
      requestAnimationFrame(() => router.replace(destination.href));
    }
  };

  return (
    <View
      collapsable={false}
      pointerEvents="box-none"
      style={styles.overlayRoot}
    >
      {isMenuMounted ? (
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
              { height: panelHeight, paddingTop: insets.top + 14 },
              panelStyle,
            ]}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.panelContent}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={styles.brandLockup}>
              <Image
                accessibilityLabel="KeepFlip"
                contentFit="contain"
                source={require('@/assets/images/icon.png')}
                style={styles.brandMark}
              />
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>KEEPFLIP</Text>
                <Text style={styles.brandDescriptor}>FLIP INTELLIGENCE</Text>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Close navigation menu"
              accessibilityRole="button"
              hitSlop={10}
              onPress={closeMenu}
              style={({ pressed }) => [styles.closeButton, pressed && styles.controlPressed]}>
              <IconSymbol name="xmark" size={22} color={theme.colors.goldBright} />
            </Pressable>
          </View>

          <View pointerEvents="none" style={styles.goldRail} />

          <View style={styles.navigationBlock}>
            <Text style={styles.sectionLabel}>NAVIGATION</Text>

            <View style={styles.destinationList}>
              {destinations.map((destination, index) => {
                const destinationPath = destination.href.toString();
                const isActive =
                  destinationPath === '/'
                    ? pathname === '/'
                    : pathname.startsWith(destinationPath);

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
                    <View style={[styles.destinationIcon, isActive && styles.destinationIconActive]}>
                      <IconSymbol
                        color={isActive ? theme.colors.goldBright : theme.colors.goldMuted}
                        name={destination.icon}
                        size={24}
                      />
                    </View>

                    <View style={styles.destinationCopy}>
                      <Text style={[styles.destinationLabel, isActive && styles.destinationLabelActive]}>
                        {destination.label}
                      </Text>
                      <Text style={styles.destinationEyebrow}>{destination.eyebrow}</Text>
                    </View>

                    {isActive ? (
                      <View accessibilityLabel="Current screen" style={styles.activeIndicator} />
                    ) : (
                      <IconSymbol name="chevron.right" size={19} color={theme.colors.goldMuted} />
                    )}

                    <Text style={styles.destinationNumber}>0{index + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.systemStatus}>
            <View style={styles.systemStatusDot} />
            <View style={styles.systemStatusCopy}>
              <Text style={styles.systemStatusLabel}>KEEPFLIP VISION</Text>
              <Text style={styles.systemStatusValue}>SYSTEM READY</Text>
            </View>
            <Text style={styles.systemStatusCode}>KF//01</Text>
          </View>
            </ScrollView>
          </Animated.View>
        </>
      ) : null}

      <View
        pointerEvents={isMenuOpen ? 'none' : 'auto'}
        style={[
          styles.triggerWrap,
          {
            top: insets.top + 12,
            opacity: isMenuOpen ? 0 : 1,
            transform: [{ scale: isMenuOpen ? 0.92 : 1 }],
          },
        ]}>
        <Pressable
          accessibilityLabel="Open navigation menu"
          accessibilityRole="button"
          disabled={isMenuOpen}
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

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 10000,
    elevation: 10000,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: 'rgba(1, 1, 2, 0.68)',
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
    borderColor: 'rgba(215, 168, 74, 0.30)',
    borderBottomRightRadius: theme.radii.large,
    borderBottomLeftRadius: theme.radii.large,
    backgroundColor: 'rgba(7, 7, 11, 0.98)',
    experimental_backgroundImage: `
      radial-gradient(circle at 86% 0%, rgba(224, 172, 75, 0.17) 0%, transparent 34%),
      radial-gradient(circle at 2% 100%, rgba(141, 114, 255, 0.09) 0%, transparent 38%),
      linear-gradient(155deg, rgba(18, 15, 22, 0.99) 0%, rgba(3, 3, 6, 0.99) 74%)
    `,
    boxShadow: '0 22px 60px rgba(0, 0, 0, 0.72), 0 0 30px rgba(215, 168, 74, 0.10)',
  },
  panelContent: {
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  brandRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brandLockup: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 48,
    height: 48,
  },
  brandCopy: {
    minWidth: 0,
    gap: 2,
  },
  brandName: {
    color: theme.colors.cream,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 2.6,
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
    backgroundColor: 'rgba(5, 5, 8, 0.72)',
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
    backgroundColor: 'rgba(8, 8, 11, 0.68)',
  },
  destinationActive: {
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(215, 168, 74, 0.13)',
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
    backgroundColor: 'rgba(3, 3, 5, 0.60)',
  },
  destinationIconActive: {
    borderColor: 'rgba(242, 211, 138, 0.48)',
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
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
  systemStatus: {
    marginTop: 'auto',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.18)',
    backgroundColor: 'rgba(3, 3, 6, 0.62)',
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
    backgroundColor: 'rgba(7, 7, 11, 0.88)',
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
