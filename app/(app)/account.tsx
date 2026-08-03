import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";

function formattedMemberDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'KeepFlip member';
  return `Member since ${date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isBusy, signOut, user } = useKeepFlipAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (signOutError && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(signOutError);
    }
  }, [signOutError]);

  if (!user) return null;

  const displayName = user.name.trim() || 'KeepFlip member';
  const avatarInitial = (displayName[0] || user.email[0] || 'K').toUpperCase();

  const handleSignOut = async () => {
    if (isBusy) return;
    setSignOutError(null);
    try {
      await signOut();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not sign out this device. Please try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    }
  };

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 74, paddingBottom: insets.bottom + 32 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <Text style={styles.eyebrow}>KEEPFLIP / ACCOUNT</Text>
          <Text style={styles.title}>Seller controls</Text>
          <Text style={styles.subtitle}>
            Your authenticated KeepFlip identity and device session.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(45)} style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text selectable style={styles.name}>
              {displayName}
            </Text>
            <Text selectable style={styles.email}>
              {user.email}
            </Text>
            <Text style={styles.memberDate}>{formattedMemberDate(user.registration)}</Text>
            <View
              accessibilityLabel={user.emailVerification ? 'Email verified' : 'Email not verified'}
              style={[
                styles.verificationBadge,
                !user.emailVerification && styles.verificationBadgePending,
              ]}>
              <View
                style={[
                  styles.verificationDot,
                  !user.emailVerification && styles.verificationDotPending,
                ]}
              />
              <Text
                style={[
                  styles.verificationText,
                  !user.emailVerification && styles.verificationTextPending,
                ]}>
                {user.emailVerification ? 'VERIFIED' : 'UNVERIFIED'}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(90)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>SESSION SECURITY</Text>
            <Text style={styles.sectionTitle}>Protected scanner access</Text>
          </View>
          <View style={styles.securityCard}>
            <View style={styles.securityIcon}>
              <IconSymbol
                color={theme.colors.scannerCyan}
                name="checkmark.shield.fill"
                size={22}
              />
            </View>
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>APPWRITE SESSION ACTIVE</Text>
              <Text style={styles.securityDescription}>
                The scanner is available only while this registered session can be verified.
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(135)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>KEEPFLIP FIELD GUIDE</Text>
            <Text style={styles.sectionTitle}>Scanner walkthrough</Text>
          </View>
          <Pressable
            accessibilityHint="Replays the scan, analysis, and inventory walkthrough"
            accessibilityLabel="Open first item walkthrough"
            accessibilityRole="button"
            onPress={() => {
              if (process.env.EXPO_OS === 'ios') {
                void Haptics.selectionAsync();
              }
              router.push('/walkthrough' as Href);
            }}
            style={({ pressed }) => [
              styles.walkthroughCard,
              pressed && styles.walkthroughCardPressed,
            ]}>
            <View style={styles.walkthroughIcon}>
              <IconSymbol
                color={theme.colors.scannerCyan}
                name="viewfinder"
                size={25}
              />
            </View>
            <View style={styles.walkthroughCopy}>
              <Text style={styles.walkthroughTitle}>SCAN → ANALYZE → SAVE</Text>
              <Text style={styles.walkthroughDescription}>
                Replay the interactive first-item protocol using the real scanner,
                result reels, and inventory card.
              </Text>
            </View>
            <IconSymbol
              color={theme.colors.goldBright}
              name="chevron.right"
              size={20}
            />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(180)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>SELLER PROFILE</Text>
            <Text style={styles.sectionTitle}>Preferences</Text>
          </View>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceTitle}>Marketplace defaults</Text>
            <Text style={styles.preferenceDescription}>
              Payout, listing, shipping, and notification controls will appear here as the
              marketplace workflow comes online.
            </Text>
            <Text style={styles.comingSoon}>COMING NEXT</Text>
          </View>
        </Animated.View>

        {signOutError ? (
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={styles.errorText}>
            {signOutError}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isBusy, disabled: isBusy }}
          disabled={isBusy}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [
            styles.signOutButton,
            isBusy && styles.signOutButtonDisabled,
            pressed && !isBusy && styles.signOutButtonPressed,
          ]}>
          {isBusy ? (
            <ActivityIndicator color={theme.colors.danger} size="small" />
          ) : (
            <IconSymbol
              color={theme.colors.danger}
              name="rectangle.portrait.and.arrow.right"
              size={21}
            />
          )}
          <Text style={styles.signOutText}>SIGN OUT THIS DEVICE</Text>
        </Pressable>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 22,
    paddingHorizontal: 20,
  },
  header: { gap: 7 },
  eyebrow: {
    
    color: theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: { color: theme.colors.cream, fontSize: 32, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  profileCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: theme.radii.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.31)',
    backgroundColor: 'rgba(9, 8, 12, 0.91)',
    boxShadow: '0 15px 44px rgba(0, 0, 0, 0.38), 0 0 22px rgba(215, 168, 74, 0.06)',
  },
  avatar: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.56)',
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
    boxShadow: '0 0 22px rgba(215, 168, 74, 0.12)',
  },
  avatarText: { color: theme.colors.goldBright, fontSize: 27, fontWeight: '900' },
  profileCopy: { minWidth: 0, flex: 1, gap: 4 },
  name: { color: theme.colors.text, fontSize: 20, fontWeight: '900' },
  email: { color: theme.colors.textMuted, fontSize: 13 },
  memberDate: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '800' },
  verificationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.28)',
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
  },
  verificationBadgePending: {
    borderColor: 'rgba(224, 172, 75, 0.3)',
    backgroundColor: 'rgba(224, 172, 75, 0.06)',
  },
  verificationDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: '0 0 8px rgba(88, 223, 232, 0.88)',
  },
  verificationDotPending: {
    backgroundColor: theme.colors.scannerAmber,
    boxShadow: '0 0 8px rgba(224, 172, 75, 0.72)',
  },
  verificationText: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  verificationTextPending: { color: theme.colors.scannerAmber },
  section: { gap: 11 },
  sectionHeading: { gap: 4 },
  sectionEyebrow: {
    color: theme.colors.goldBright,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.55,
  },
  sectionTitle: { color: theme.colors.text, fontSize: 19, fontWeight: '800' },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.2)',
    backgroundColor: 'rgba(6, 11, 14, 0.76)',
  },
  securityIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.26)',
  },
  securityCopy: { flex: 1, gap: 4 },
  securityTitle: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  securityDescription: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  walkthroughCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.24)',
    backgroundColor: 'rgba(3, 10, 14, 0.82)',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.28), 0 0 18px rgba(88, 223, 232, 0.05)',
  },
  walkthroughCardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.988 }],
  },
  walkthroughIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.32)',
    backgroundColor: 'rgba(88, 223, 232, 0.07)',
    boxShadow: '0 0 16px rgba(88, 223, 232, 0.08)',
  },
  walkthroughCopy: {
    minWidth: 0,
    flex: 1,
    gap: 4,
  },
  walkthroughTitle: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  walkthroughDescription: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  preferenceCard: {
    gap: 7,
    padding: 17,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.19)',
    backgroundColor: 'rgba(11, 9, 16, 0.78)',
  },
  preferenceTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  preferenceDescription: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 19 },
  comingSoon: {
    alignSelf: 'flex-start',
    color: theme.colors.scannerViolet,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  errorText: {
    color: '#FFB8B1',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  signOutButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(232, 97, 88, 0.42)',
    backgroundColor: 'rgba(232, 97, 88, 0.06)',
  },
  signOutButtonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  signOutButtonDisabled: { opacity: 0.45 },
  signOutText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
});
