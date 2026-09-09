import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { useKeepFlipFeedbackNudge } from '@/components/feedback/keepflip-feedback-nudge';
import { KeepFlipAccountTabs } from '@/components/account/keepflip-account-tabs';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { KeepFlipSubscriptionScreen } from '@/components/subscription/keepflip-subscription-screen';
import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import {
  getEbayConnectionStatus,
  type EbayConnectionStatusResult,
} from '@/services/ebayConnectionService';
import { KEEPFLIP_PLAN_DEFINITIONS } from '@/services/keepflip-subscription-service';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont, { responsiveHeight, responsiveWidth } from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
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
  const { tab } = useLocalSearchParams<{
    tab?: string | string[];
  }>();
  const selectedTab = Array.isArray(tab) ? tab[0] : tab;

  if (selectedTab === 'subscription') {
    return <KeepFlipSubscriptionScreen accountTab />;
  }

  return <AccountDetailsTab />;
}

function AccountDetailsTab() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isBusy, signOut, user } = useKeepFlipAuth();
  const { openFeedbackEmail, openStoreReview } = useKeepFlipFeedbackNudge();
  const {
    errorMessage: subscriptionError,
    snapshot: subscriptionSnapshot,
    state: subscriptionState,
  } = useKeepFlipSubscription();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [ebayConnection, setEbayConnection] =
    useState<EbayConnectionStatusResult | null>(null);
  const [ebayConnectionLoading, setEbayConnectionLoading] = useState(false);
  const [ebayConnectionError, setEbayConnectionError] = useState<string | null>(null);

  const userId = user?.$id;

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setEbayConnection(null);
        setEbayConnectionError(null);
        setEbayConnectionLoading(false);
        return;
      }

      let cancelled = false;
      setEbayConnectionLoading(true);
      setEbayConnectionError(null);

      void getEbayConnectionStatus()
        .then((status) => {
          if (!cancelled) setEbayConnection(status);
        })
        .catch((error) => {
          if (cancelled) return;
          setEbayConnection(null);
          setEbayConnectionError(
            error instanceof Error
              ? error.message
              : 'KeepFlip could not verify the eBay connection.',
          );
        })
        .finally(() => {
          if (!cancelled) setEbayConnectionLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  if (!user) return null;

  const displayName = user.name.trim() || 'KeepFlip member';
  const avatarInitial = (displayName[0] || user.email[0] || 'K').toUpperCase();
  const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '2.0.7';

  const ebayDescription = ebayConnectionLoading
    ? 'Checking your eBay authorization with KeepFlip.'
    : ebayConnectionError
      ? 'Connection status is unavailable. Open eBay connection to retry.'
      : ebayConnection?.needsReconnect
        ? 'Your saved eBay authorization needs to be renewed.'
        : ebayConnection?.connected
          ? `Authorized for ${ebayConnection.environment === 'sandbox' ? 'eBay Sandbox' : 'eBay'} features.`
          : 'Connect eBay for authorized sourcing and messaging features.';

  const newEbayDestination = ebayConnection?.connected ? '/ebay-account' : '/ebay-connect';

  const subscriptionAccess = subscriptionSnapshot?.access ?? null;
  const subscriptionPlan = KEEPFLIP_PLAN_DEFINITIONS.find(
    (plan) => plan.id === subscriptionAccess?.plan,
  );

  const subscriptionDescription =
    subscriptionState === 'loading'
      ? 'Checking your current KeepFlip plan and store access.'
      : subscriptionState === 'unconfigured'
        ? 'Plan checkout is ready for RevenueCat store configuration.'
        : subscriptionState === 'error'
          ? 'Subscription status is unavailable right now.'
          : subscriptionAccess?.isTrial
            ? `${subscriptionPlan?.name ?? 'KeepFlip plan'} · 7-day free trial active.`
            : subscriptionAccess?.active
              ? `${subscriptionPlan?.name ?? 'KeepFlip plan'} is active on this account.`
              : 'Choose Hobbyist or Serious Reseller and start with 7 days free.';

  const subscriptionStatus =
    subscriptionState === 'error'
      ? { label: 'CHECK', tone: 'danger' as const }
      : subscriptionAccess?.billingIssue
        ? { label: 'BILLING', tone: 'warning' as const }
        : subscriptionAccess?.isTrial
          ? { label: 'TRIAL', tone: 'violet' as const }
          : subscriptionAccess?.active
            ? { label: 'ACTIVE', tone: 'active' as const }
            : subscriptionState === 'unconfigured'
              ? { label: 'SETUP', tone: 'muted' as const }
              : { label: 'NO PLAN', tone: 'muted' as const };

  const ebayStatus = ebayConnectionError
    ? { label: 'CHECK', tone: 'danger' as const }
    : ebayConnection?.needsReconnect
      ? { label: 'RECONNECT', tone: 'warning' as const }
      : ebayConnection?.connected
        ? { label: 'CONNECTED', tone: 'active' as const }
        : { label: 'NOT CONNECTED', tone: 'muted' as const };

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

  const handleOpenFeedback = async () => {
    hapticSelection();
    setFeedbackError(null);
    try {
      await openFeedbackEmail();
    } catch {
      setFeedbackError(
        'Your device could not open email. Contact support@keep-flip.com for help.',
      );
    }
  };

  const handleOpenStoreReview = async () => {
    hapticSelection();
    setFeedbackError(null);
    try {
      await openStoreReview();
    } catch {
      setFeedbackError(
        'KeepFlip could not open Google Play right now. Please try again later.',
      );
    }
  };

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content,
          { paddingTop: insets.top / 2, paddingBottom: insets.bottom }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        style={{marginTop: insets.top, marginBottom: insets.bottom}}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>KEEPFLIP / ACCOUNT</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(28)}]}>Account & access</Text>
          <Text style={[styles.subtitle, { fontSize: responsiveFont(13)}]}>
            Your identity, security, data controls, and connected services.
          </Text>
        </Animated.View>

        <KeepFlipAccountTabs active="account" />

        <Animated.View entering={FadeInDown.duration(260).delay(45)} style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={[styles.avatarText, { fontSize: responsiveFont(22) }]}>{avatarInitial}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text selectable style={[styles.name, { fontSize: responsiveFont(18) }]}>
              {displayName}
            </Text>
            <Text selectable style={styles.email}>
              {user.email}
            </Text>
            <Text style={[styles.memberDate, { fontSize: responsiveFont(9) }]}>{formattedMemberDate(user.registration)}</Text>
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
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>ACCOUNT</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16)}]}>Profile & security</Text>
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

        <Animated.View entering={FadeInDown.duration(260).delay(120)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>PLAN & BILLING</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16)}]}>KeepFlip subscription</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens KeepFlip plans, billing, restore purchases, and subscription management."
              actionBusy={subscriptionState === 'loading'}
              actionLabel={subscriptionAccess?.active ? 'MANAGE' : 'VIEW PLANS'}
              description={subscriptionDescription}
              icon="creditcard.fill"
              label={subscriptionPlan?.name ?? 'KeepFlip plan'}
              onPress={() => {
                hapticSelection();
                router.replace('/account?tab=subscription' as Href);
              }}
              status={subscriptionState === 'loading' ? undefined : subscriptionStatus}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(145)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>CONNECTED SERVICES</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16)}]}>Marketplace access</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens the eBay connection screen."
              actionBusy={ebayConnectionLoading}
              actionLabel={ebayConnection?.connected ? 'MANAGE' : 'CONNECT'}
              description={ebayDescription}
              label="eBay"
              leading={<EbayShoppingBagIcon size={24} />}
              onPress={() => {
                hapticSelection();
                router.push(newEbayDestination as Href);
              }}
              status={ebayConnectionLoading ? undefined : ebayStatus}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(260).delay(170)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>LEGAL & POLICY</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16)}]}>Your data and terms</Text>
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

        <Animated.View entering={FadeInDown.duration(260).delay(195)} style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>SUPPORT</Text>
            <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16)}]}>Feedback & reviews</Text>
          </View>
          <View style={styles.settingsList}>
            <KeepFlipControlRow
              accent="cyan"
              accessibilityHint="Opens an email to share feedback with KeepFlip."
              description="Tell us what worked, what missed, or what would make KeepFlip more useful."
              icon="envelope.fill"
              label="Share feedback"
              onPress={() => void handleOpenFeedback()}
            />
            <KeepFlipControlRow
              accent="gold"
              accessibilityHint="Opens KeepFlip's Google Play page where you can leave a review."
              description="Open Google Play to leave an honest review."
              icon="star.fill"
              label="Rate KeepFlip"
              onPress={() => void handleOpenStoreReview()}
            />
          </View>
          {feedbackError ? (
            <Text accessibilityLiveRegion="polite" selectable style={[styles.errorText, { fontSize: responsiveFont(11)}]}>
              {feedbackError}
            </Text>
          ) : null}
        </Animated.View>

        {signOutError ? (
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={[styles.errorText, { fontSize: responsiveFont(11)}]}>
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
          <Text style={[styles.signOutText, { fontSize: responsiveFont(10) }]}>LOG OUT OF THIS DEVICE</Text>
        </Pressable>

        <View style={styles.versionFooter}>
          <View style={styles.versionDot} />
          <Text style={[styles.versionLabel, { fontSize: responsiveFont(8) }]}>KEEPFLIP</Text>
          <Text selectable style={[styles.versionValue, { fontSize: responsiveFont(9) }]}>
            v{appVersion}
          </Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
    const staticStyles = StyleSheet.create({
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
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  versionValue: {
    color: theme.colors.goldMuted,
    fontSize: 9,
    fontWeight: '800',
  },
});
  return {
    ...staticStyles,
  eyebrow: [
    staticStyles.eyebrow,
    {
        fontSize: responsiveLayout.responsiveFont(9),
    },
  ],
  title: [
    staticStyles.title,
    {
        fontSize: responsiveLayout.responsiveFont(28),
    },
  ],
  subtitle: [
    staticStyles.subtitle,
    {
        fontSize: responsiveLayout.responsiveFont(13),
    },
  ],
  avatar: [
    staticStyles.avatar,
    {
        width: responsiveLayout.responsiveWidth(54),
        height: responsiveLayout.responsiveHeight(54),
    },
  ],
  avatarText: [
    staticStyles.avatarText,
    {
        fontSize: responsiveLayout.responsiveFont(22),
    },
  ],
  name: [
    staticStyles.name,
    {
        fontSize: responsiveLayout.responsiveFont(18),
    },
  ],
  email: [
    staticStyles.email,
    {
        fontSize: responsiveLayout.responsiveFont(12),
    },
  ],
  memberDate: [
    staticStyles.memberDate,
    {
        fontSize: responsiveLayout.responsiveFont(9),
    },
  ],
  verificationDot: [
    staticStyles.verificationDot,
    {
        width: responsiveLayout.responsiveWidth(5),
        height: responsiveLayout.responsiveHeight(5),
    },
  ],
  verificationText: [
    staticStyles.verificationText,
    {
        fontSize: responsiveLayout.responsiveFont(7),
    },
  ],
  sectionEyebrow: [
    staticStyles.sectionEyebrow,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  sectionTitle: [
    staticStyles.sectionTitle,
    {
        fontSize: responsiveLayout.responsiveFont(16),
    },
  ],
  errorText: [
    staticStyles.errorText,
    {
        fontSize: responsiveLayout.responsiveFont(11),
    },
  ],
  signOutText: [
    staticStyles.signOutText,
    {
        fontSize: responsiveLayout.responsiveFont(10),
    },
  ],
  versionDot: [
    staticStyles.versionDot,
    {
        width: responsiveLayout.responsiveWidth(4),
        height: responsiveLayout.responsiveHeight(4),
    },
  ],
  versionLabel: [
    staticStyles.versionLabel,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  versionValue: [
    staticStyles.versionValue,
    {
        fontSize: responsiveLayout.responsiveFont(9),
    },
  ],
  };
}