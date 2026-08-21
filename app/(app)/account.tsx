import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
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

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isBusy, signOut, user } = useKeepFlipAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (!user) return null;

  const displayName = user.name.trim() || 'KeepFlip member';
  const avatarInitial = (displayName[0] || user.email[0] || 'K').toUpperCase();
  const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '2.0.7';

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
          <Text style={styles.title}>Account & access</Text>
          <Text style={styles.subtitle}>
            Your identity, security, data controls, and device session.
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
            <Text style={styles.sectionEyebrow}>ACCOUNT</Text>
            <Text style={styles.sectionTitle}>Profile & security</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              description="Your signed-in name and email are shown above."
              icon="person.fill"
              label="Profile"
              staticLabel="CURRENT"
            />
            <KeepFlipControlRow
              accent="cyan"
              description="This device has an authenticated KeepFlip session."
              icon="lock.fill"
              label="Security"
              staticLabel="PROTECTED"
            />
            <KeepFlipControlRow
              accent="violet"
              description="Account-level data controls will appear here as they become available."
              icon="checkmark.shield.fill"
              label="Privacy & data"
              staticLabel="COMING SOON"
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(135)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>LEGAL & POLICY</Text>
            <Text style={styles.sectionTitle}>Your data and terms</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accessibilityHint="Opens KeepFlip's terms of service."
              description="The terms that apply when you use KeepFlip."
              icon="tag.fill"
              label="Terms"
              onPress={() => {
                hapticSelection();
                router.push('/terms' as Href);
              }}
            />
            <KeepFlipControlRow
              accent="violet"
              accessibilityHint="Opens KeepFlip's privacy policy."
              description="The current policy for privacy and data handling."
              icon="checkmark.shield.fill"
              label="Privacy policy"
              onPress={() => {
                hapticSelection();
                router.push('/privacy' as Href);
              }}
            />
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

        <View style={styles.versionFooter}>
          <View style={styles.versionDot} />
          <Text style={styles.versionLabel}>KEEPFLIP</Text>
          <Text selectable style={styles.versionValue}>
            v{appVersion}
          </Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 18,
  },
  header: { gap: 4 },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  subtitle: {
    maxWidth: 520,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  profileCard: {
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.31)',
    backgroundColor: 'rgba(9, 8, 12, 0.91)',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
  },
  avatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.56)',
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
  },
  avatarText: { color: theme.colors.goldBright, fontSize: 22, fontWeight: '900' },
  profileCopy: { minWidth: 0, flex: 1, gap: 3 },
  name: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  email: { color: theme.colors.textMuted, fontSize: 12 },
  memberDate: { color: theme.colors.goldBright, fontSize: 9, fontWeight: '800' },
  verificationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
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
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  verificationTextPending: { color: theme.colors.scannerAmber },
  section: { gap: 7 },
  sectionHeading: { gap: 2 },
  sectionEyebrow: {
    color: theme.colors.goldBright,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  settingsList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242, 211, 138, 0.20)',
  },
  errorText: {
    color: '#FFB8B1',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  signOutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(232, 97, 88, 0.42)',
    backgroundColor: 'rgba(232, 97, 88, 0.06)',
  },
  signOutButtonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  signOutButtonDisabled: { opacity: 0.45 },
  signOutText: {
    color: theme.colors.danger,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  versionFooter: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 1,
  },
  versionDot: {
    width: 4,
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.scannerCyan,
  },
  versionLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  versionValue: {
    color: theme.colors.goldMuted,
    fontSize: 8,
    fontWeight: '800',
  },
});
