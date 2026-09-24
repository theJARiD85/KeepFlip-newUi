import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  KEEPFLIP_PLAN_DEFINITIONS,
} from '@/services/keepflip-subscription-service';
import {
  getKeepFlipWebBillingConfiguration,
  keepFlipWebBillingCustomerHasActiveEntitlement,
  loadKeepFlipWebBillingCatalog,
  presentKeepFlipWebBillingPaywall,
} from '@/services/keepflip-web-billing';

type KeepFlipSubscriptionScreenProps = {
  accountTab?: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function KeepFlipSubscriptionScreen({
  accountTab = false,
}: KeepFlipSubscriptionScreenProps) {
  const { user } = useKeepFlipAuth();
  const {
    refresh: refreshServerSubscription,
    snapshot,
    state: serverSubscriptionState,
  } = useKeepFlipSubscription();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const router = useRouter();
  const configuration = useMemo(() => getKeepFlipWebBillingConfiguration(), []);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(
    configuration.message,
  );
  const [isPresenting, setIsPresenting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const paywallHostRef = useRef<HTMLDivElement>(null);
  const autoOpenedForUserRef = useRef<string | null>(null);

  const userId = user?.$id ?? '';
  const serverAccessVerified = snapshot?.serverRecordAvailable === true;
  const accountHasActivePlan =
    serverAccessVerified && snapshot?.access.active === true;
  const activePlanName = snapshot?.access.plan
    ? KEEPFLIP_PLAN_DEFINITIONS.find(
        (definition) => definition.id === snapshot.access.plan,
      )?.name ?? 'KeepFlip plan'
    : 'KeepFlip plan';
  const endsAt = formatDate(snapshot?.access.expiresAt);

  const loadManagementUrl = useCallback(async () => {
    if (!userId || !configuration.configured) return;
    try {
      const catalog = await loadKeepFlipWebBillingCatalog(userId);
      setManagementUrl(catalog.managementUrl);
      setBillingError(null);
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not connect to RevenueCat Web Billing.',
      );
    }
  }, [configuration.configured, userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadManagementUrl();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadManagementUrl]);

  const refreshPaymentStatus = useCallback(async () => {
    setActionMessage('Refreshing your server-verified payment status…');
    await Promise.all([refreshServerSubscription(), loadManagementUrl()]);
    setActionMessage(
      'Payment status refreshed. KeepFlip only opens paid features after its server confirms the subscription.',
    );
  }, [loadManagementUrl, refreshServerSubscription]);

  const openRevenueCatPaywall = useCallback(async () => {
    if (!userId || accountHasActivePlan || isPresenting) return;
    const htmlTarget = paywallHostRef.current;
    if (!htmlTarget) {
      setBillingError('KeepFlip could not mount the RevenueCat paywall. Refresh and try again.');
      return;
    }

    setBillingError(null);
    setActionMessage(null);
    setIsPresenting(true);
    try {
      const result = await presentKeepFlipWebBillingPaywall(userId, htmlTarget);
      if (keepFlipWebBillingCustomerHasActiveEntitlement(result.customerInfo)) {
        setActionMessage('Purchase received. KeepFlip is waiting for server confirmation…');
        // A browser result is payment UI feedback, not an access grant. Access
        // remains locked until the signed webhook/server reconciliation lands.
        for (const delay of [0, 800, 1_500, 2_500, 4_000, 6_000]) {
          if (delay) await pause(delay);
          await refreshServerSubscription();
        }
        await loadManagementUrl();
        setActionMessage(
          'Payment flow finished. KeepFlip will unlock paid features once the server confirms the subscription; refresh status if it is still pending.',
        );
      }
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not open the RevenueCat paywall.',
      );
    } finally {
      setIsPresenting(false);
    }
  }, [
    accountHasActivePlan,
    isPresenting,
    loadManagementUrl,
    refreshServerSubscription,
    userId,
  ]);

  useEffect(() => {
    if (
      !userId ||
      !configuration.configured ||
      accountHasActivePlan ||
      serverSubscriptionState === 'loading' ||
      autoOpenedForUserRef.current === userId
    ) {
      return;
    }
    autoOpenedForUserRef.current = userId;
    void openRevenueCatPaywall();
  }, [
    accountHasActivePlan,
    configuration.configured,
    openRevenueCatPaywall,
    serverSubscriptionState,
    userId,
  ]);

  const manageSubscription = useCallback(() => {
    if (!managementUrl || typeof window === 'undefined') {
      setBillingError(
        'KeepFlip has not received a subscription-management link yet. Refresh payment status, then try again.',
      );
      return;
    }
    const opened = window.open(managementUrl, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(managementUrl);
  }, [managementUrl]);

  const serverNotice = !serverAccessVerified
    ? 'KeepFlip cannot currently verify a subscription record with its server. A successful checkout will not unlock paid features until that server check succeeds.'
    : serverSubscriptionState === 'loading'
      ? 'Confirming your server-side subscription status…'
      : null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <IconSymbol color={colors.goldBright} name="creditcard.fill" size={24} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / WEB BILLING</Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {accountHasActivePlan ? 'Your KeepFlip plan' : 'Built for the way you resell'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {accountHasActivePlan
                ? 'Your plan and access are verified by KeepFlip’s server.'
                : 'Choose your subscription in the RevenueCat paywall. Your workspace opens only after the server confirms the entitlement.'}
            </Text>
          </View>
        </View>

        {accountTab ? (
          <Pressable
            accessibilityLabel="Return to account settings"
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={[styles.backButtonText, { color: colors.scannerCyan }]}>← ACCOUNT SETTINGS</Text>
          </Pressable>
        ) : null}

        {accountHasActivePlan ? (
          <View style={[styles.activeBanner, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
            <IconSymbol color={colors.success} name="checkmark.circle.fill" size={22} />
            <View style={styles.activeCopy}>
              <Text style={[styles.activeTitle, { color: colors.success }]}>{activePlanName} is active</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {endsAt
                  ? snapshot?.access.willRenew
                    ? `Your plan renews on ${endsAt}.`
                    : `Your access continues through ${endsAt}.`
                  : 'Your paid KeepFlip access is confirmed by the server.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Manage subscription"
              accessibilityRole="button"
              disabled={!managementUrl}
              onPress={manageSubscription}
              style={({ pressed }) => [styles.outlineButton, { borderColor: colors.success }, !managementUrl && styles.disabled, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, { color: colors.success }]}>MANAGE BILLING</Text>
            </Pressable>
          </View>
        ) : null}

        {serverNotice ? (
          <View style={[styles.notice, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.goldMuted }]}>
            <IconSymbol color={colors.goldBright} name="exclamationmark.triangle.fill" size={19} />
            <Text style={[styles.body, { color: colors.textMuted }]}>{serverNotice}</Text>
          </View>
        ) : null}

        {billingError ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
            <IconSymbol color={colors.danger} name="exclamationmark.triangle.fill" size={19} />
            <Text style={[styles.body, { color: colors.danger }]}>{billingError}</Text>
          </View>
        ) : null}

        {!accountHasActivePlan ? (
          <>
            <div ref={paywallHostRef} style={{ minHeight: 520, width: '100%' }} />
            <Pressable
              accessibilityRole="button"
              disabled={!configuration.configured || isPresenting}
              onPress={() => void openRevenueCatPaywall()}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.gold }, (!configuration.configured || isPresenting) && styles.disabled, pressed && styles.pressed]}>
              {isPresenting ? <ActivityIndicator color={colors.textOnAccent} /> : null}
              <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>
                {isPresenting ? 'OPENING REVENUECAT PAYWALL…' : 'OPEN SUBSCRIPTION PAYWALL'}
              </Text>
            </Pressable>
          </>
        ) : null}

        {actionMessage ? (
          <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder }]}>
            <Text style={[styles.body, { color: colors.text }]}>{actionMessage}</Text>
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityLabel="Refresh payment status"
            accessibilityRole="button"
            onPress={() => void refreshPaymentStatus()}
            style={({ pressed }) => [styles.outlineButton, { borderColor: colors.accentCyanBorder }, pressed && styles.pressed]}>
            <IconSymbol color={colors.scannerCyan} name="arrow.clockwise" size={17} />
            <Text style={[styles.buttonText, { color: colors.scannerCyan }]}>REFRESH PAYMENT STATUS</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="View KeepFlip terms"
            accessibilityRole="button"
            onPress={() => router.push('/terms')}
            style={({ pressed }) => [styles.termsButton, pressed && styles.pressed]}>
            <Text style={[styles.termsText, { color: colors.textMuted }]}>VIEW TERMS</Text>
          </Pressable>
        </View>

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          RevenueCat processes web subscriptions. KeepFlip’s server remains the authority for your plan and app access.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', maxWidth: 1_170, paddingBottom: 42, paddingHorizontal: 30, paddingTop: 36, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 16 },
  headerIcon: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceGold, borderColor: theme.colors.accentGoldBorder, borderRadius: 16, borderWidth: 1, height: 52, justifyContent: 'center', marginTop: 3, width: 52 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1.6 },
  title: { fontFamily: theme.fonts.bold, fontSize: 32, letterSpacing: -0.4, lineHeight: 39, marginTop: 5 },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 760 },
  backButton: { alignSelf: 'flex-start', marginTop: 18, minHeight: 34, paddingVertical: 7 },
  backButtonText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1 },
  activeBanner: { alignItems: 'center', borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 13, marginTop: 26, padding: 17 },
  activeCopy: { flex: 1, minWidth: 0 },
  activeTitle: { fontFamily: theme.fonts.bold, fontSize: 16 },
  body: { flex: 1, fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 21 },
  notice: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 22, padding: 14 },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 18, minHeight: 50, paddingHorizontal: 18 },
  outlineButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  buttonText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.7 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  footerActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 24 },
  termsButton: { alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  termsText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.7 },
  disclaimer: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 20, marginTop: 22, maxWidth: 800 },
});
