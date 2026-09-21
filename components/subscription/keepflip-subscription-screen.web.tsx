import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
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
  type KeepFlipBillingCadence,
  type KeepFlipPlanDefinition,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';
import {
  getKeepFlipWebBillingConfiguration,
  loadKeepFlipWebBillingCatalog,
  purchaseKeepFlipWebBillingPlan,
  type KeepFlipWebBillingCatalog,
  type KeepFlipWebBillingPlanOption,
} from '@/services/keepflip-web-billing';

type BillingLoadState = 'loading' | 'ready' | 'unconfigured' | 'error';

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

function checkoutMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (/cancel|closed/i.test(message)) {
    return 'Checkout was closed before a payment was completed.';
  }
  return message || 'KeepFlip could not open secure checkout. Please try again.';
}

function optionFor(
  catalog: KeepFlipWebBillingCatalog | null,
  plan: KeepFlipPlanId,
  cadence: KeepFlipBillingCadence,
) {
  return catalog?.options[plan][cadence] ?? null;
}

function PlanCard({
  accountHasActivePlan,
  cadence,
  definition,
  disabled,
  onCheckout,
  option,
  purchasing,
  selected,
}: {
  accountHasActivePlan: boolean;
  cadence: KeepFlipBillingCadence;
  definition: KeepFlipPlanDefinition;
  disabled: boolean;
  onCheckout: (plan: KeepFlipPlanId) => void;
  option: KeepFlipWebBillingPlanOption | null;
  purchasing: boolean;
  selected: KeepFlipPlanId | null;
}) {
  const isSelected = selected === definition.id;
  const displayedPrice =
    option?.price ??
    (cadence === 'annual'
      ? definition.annualPriceFallback
      : definition.monthlyPriceFallback);
  const period = cadence === 'annual' ? '/ year' : '/ month';
  const unavailable = !option;
  const actionLabel = accountHasActivePlan
    ? 'ACTIVE ON THIS ACCOUNT'
    : unavailable
      ? 'WEB PACKAGE NOT READY'
      : purchasing && isSelected
        ? 'OPENING SECURE CHECKOUT…'
        : 'CONTINUE TO SECURE CHECKOUT';

  return (
    <View
      style={[
        styles.planCard,
        definition.recommended && styles.planCardRecommended,
      ]}>
      <View style={styles.planHeader}>
        <View style={styles.planTitleBlock}>
          <Text style={styles.planEyebrow}>{definition.eyebrow}</Text>
          <Text style={styles.planName}>{definition.name}</Text>
        </View>
        {definition.recommended ? (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedBadgeText}>BEST FOR BUSINESS</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{displayedPrice}</Text>
        <Text style={styles.pricePeriod}>{period}</Text>
      </View>
      {cadence === 'annual' ? (
        <Text style={styles.annualSavings}>
          {definition.id === 'hobbyist' ? 'SAVE $20 / YEAR' : 'SAVE $50 / YEAR'}
        </Text>
      ) : null}

      <Text style={styles.planDescription}>{definition.description}</Text>
      <View style={styles.features}>
        {[...definition.limits, ...definition.features].map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="checkmark.circle.fill"
              size={17}
            />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityHint={
          accountHasActivePlan
            ? 'Manage the active subscription using the button below.'
            : unavailable
              ? 'This RevenueCat Web Billing package has not been configured yet.'
              : 'Opens secure RevenueCat checkout, with Stripe handling payment.'
        }
        accessibilityLabel={`${definition.name}, ${actionLabel.toLowerCase()}`}
        accessibilityRole="button"
        disabled={disabled || accountHasActivePlan || unavailable}
        onPress={() => onCheckout(definition.id)}
        style={({ pressed }) => [
          styles.checkoutButton,
          definition.recommended && styles.checkoutButtonRecommended,
          (disabled || accountHasActivePlan || unavailable) &&
            styles.checkoutButtonDisabled,
          pressed &&
            !disabled &&
            !accountHasActivePlan &&
            !unavailable &&
            styles.pressed,
        ]}>
        {purchasing && isSelected ? (
          <ActivityIndicator
            color={
              definition.recommended
                ? theme.colors.textOnAccent
                : theme.colors.scannerCyan
            }
            size="small"
          />
        ) : null}
        <Text
          style={[
            styles.checkoutButtonText,
            definition.recommended && styles.checkoutButtonTextRecommended,
          ]}>
          {actionLabel}
        </Text>
      </Pressable>
      {!accountHasActivePlan && !unavailable ? (
        <Text style={styles.planFinePrint}>
          Secure checkout is provided by RevenueCat and Stripe. Cancel anytime.
        </Text>
      ) : null}
    </View>
  );
}

type KeepFlipSubscriptionScreenProps = {
  accountTab?: boolean;
};

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
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const configuration = useMemo(() => getKeepFlipWebBillingConfiguration(), []);
  const [cadence, setCadence] = useState<KeepFlipBillingCadence>('monthly');
  const [catalog, setCatalog] = useState<KeepFlipWebBillingCatalog | null>(
    null,
  );
  const [billingState, setBillingState] = useState<BillingLoadState>(
    configuration.configured ? 'loading' : 'unconfigured',
  );
  const [billingError, setBillingError] = useState<string | null>(
    configuration.message,
  );
  const [purchasingPlan, setPurchasingPlan] =
    useState<KeepFlipPlanId | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const userId = user?.$id ?? '';
  const userEmail = user?.email ?? null;
  const serverAccessVerified = snapshot?.serverRecordAvailable === true;
  const accountHasActivePlan =
    serverAccessVerified && snapshot?.access.active === true;
  const managementUrl =
    catalog?.managementUrl ?? snapshot?.access.managementUrl ?? null;
  const activePlanName = snapshot?.access.plan
    ? KEEPFLIP_PLAN_DEFINITIONS.find(
        (definition) => definition.id === snapshot.access.plan,
      )?.name ?? 'KeepFlip plan'
    : 'KeepFlip plan';
  const endsAt = formatDate(snapshot?.access.expiresAt);

  const loadBillingCatalog = useCallback(async () => {
    if (!userId || !configuration.configured) {
      setCatalog(null);
      setBillingState('unconfigured');
      setBillingError(
        configuration.message ||
          'Sign in with a KeepFlip account before opening web checkout.',
      );
      return;
    }

    setBillingState('loading');
    setBillingError(null);
    try {
      const nextCatalog = await loadKeepFlipWebBillingCatalog(userId);
      setCatalog(nextCatalog);
      setBillingState('ready');
    } catch (error) {
      setCatalog(null);
      setBillingState('error');
      setBillingError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not load web checkout right now.',
      );
    }
  }, [configuration.configured, configuration.message, userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadBillingCatalog();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadBillingCatalog]);

  const syncServerEntitlement = useCallback(async () => {
    // A browser success response is not an authorization grant. Give the
    // signed RevenueCat webhook (or the server's RevenueCat reconciliation)
    // several bounded chances to update the durable subscription row.
    for (const delay of [0, 800, 1_500, 2_500, 4_000, 6_000]) {
      if (delay) await pause(delay);
      await refreshServerSubscription();
    }
  }, [refreshServerSubscription]);

  const openCheckout = useCallback(
    async (plan: KeepFlipPlanId) => {
      if (
        !userId ||
        accountHasActivePlan ||
        !serverAccessVerified ||
        billingState !== 'ready' ||
        purchasingPlan
      ) {
        return;
      }

      const selectedOption = optionFor(catalog, plan, cadence);
      if (!selectedOption) {
        setActionMessage(
          `The ${plan} ${cadence} Web Billing package is not available yet.`,
        );
        return;
      }

      setActionMessage(null);
      setPurchasingPlan(plan);
      try {
        await purchaseKeepFlipWebBillingPlan({
          cadence,
          email: userEmail,
          plan,
          userId,
        });
        setActionMessage(
          'Payment completed. KeepFlip is confirming your plan with the server now…',
        );
        await syncServerEntitlement();
        await loadBillingCatalog();
        setActionMessage(
          'Payment was completed. If your workspace does not open momentarily, use Refresh payment status while KeepFlip receives the signed entitlement update.',
        );
      } catch (error) {
        setActionMessage(checkoutMessage(error));
      } finally {
        setPurchasingPlan(null);
      }
    },
    [
      accountHasActivePlan,
      billingState,
      cadence,
      catalog,
      loadBillingCatalog,
      purchasingPlan,
      serverAccessVerified,
      syncServerEntitlement,
      userEmail,
      userId,
    ],
  );

  const refreshPaymentStatus = useCallback(async () => {
    setActionMessage('Refreshing your server-verified payment status…');
    await Promise.all([refreshServerSubscription(), loadBillingCatalog()]);
    setActionMessage(
      'Payment status refreshed. KeepFlip only opens paid features after its server confirms the subscription.',
    );
  }, [loadBillingCatalog, refreshServerSubscription]);

  const manageSubscription = useCallback(() => {
    if (!managementUrl || typeof window === 'undefined') {
      setActionMessage(
        'KeepFlip has not received a subscription-management link yet. Refresh payment status, then try again.',
      );
      return;
    }

    const opened = window.open(managementUrl, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(managementUrl);
  }, [managementUrl]);

  const checkoutReady =
    billingState === 'ready' &&
    serverAccessVerified &&
    !accountHasActivePlan &&
    purchasingPlan === null;
  const serverNotice = !serverAccessVerified
    ? 'Checkout is paused because KeepFlip cannot verify subscription access with its server yet. Fix the Subscription Police connection before accepting payments.'
    : serverSubscriptionState === 'loading'
      ? 'Confirming your server-side subscription status…'
      : null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <IconSymbol color={colors.goldBright} name="creditcard.fill" size={24} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / WEB BILLING</Text>
            <Text style={[styles.title, { color: colors.text }]}>Choose the plan that fits your flips.</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Secure checkout uses RevenueCat with Stripe. Your KeepFlip workspace opens only after the server confirms the entitlement.
            </Text>
          </View>
        </View>

        {accountTab ? (
          <Pressable
            accessibilityLabel="Return to account settings"
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.backToAccount, pressed && styles.pressed]}>
            <Text style={[styles.backToAccountText, { color: colors.scannerCyan }]}>← ACCOUNT SETTINGS</Text>
          </Pressable>
        ) : null}

        {accountHasActivePlan ? (
          <View
            style={[
              styles.activeBanner,
              { backgroundColor: colors.successSurface, borderColor: colors.success },
            ]}>
            <IconSymbol color={colors.success} name="checkmark.circle.fill" size={22} />
            <View style={styles.activeBannerCopy}>
              <Text style={[styles.activeBannerTitle, { color: colors.success }]}>
                {activePlanName} is active
              </Text>
              <Text style={[styles.activeBannerBody, { color: colors.textMuted }]}>
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
              style={({ pressed }) => [
                styles.manageButton,
                { borderColor: colors.success },
                !managementUrl && styles.checkoutButtonDisabled,
                pressed && managementUrl && styles.pressed,
              ]}>
              <Text style={[styles.manageButtonText, { color: colors.success }]}>MANAGE BILLING</Text>
            </Pressable>
          </View>
        ) : null}

        {serverNotice ? (
          <View
            style={[
              styles.notice,
              { backgroundColor: colors.iconSurfaceGold, borderColor: colors.goldMuted },
            ]}>
            <IconSymbol
              color={colors.goldBright}
              name="exclamationmark.triangle.fill"
              size={19}
            />
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>{serverNotice}</Text>
          </View>
        ) : null}

        {billingState !== 'ready' ? (
          <View
            style={[
              styles.notice,
              {
                backgroundColor:
                  billingState === 'error'
                    ? colors.dangerSurface
                    : colors.iconSurfaceCyan,
                borderColor:
                  billingState === 'error'
                    ? colors.danger
                    : colors.accentCyanBorder,
              },
            ]}>
            {billingState === 'loading' ? (
              <ActivityIndicator color={colors.scannerCyan} size="small" />
            ) : (
              <IconSymbol
                color={billingState === 'error' ? colors.danger : colors.scannerCyan}
                name={billingState === 'error' ? 'exclamationmark.triangle.fill' : 'sparkles'}
                size={19}
              />
            )}
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              {billingState === 'loading'
                ? 'Loading your secure web checkout…'
                : billingError || 'Web checkout is not configured yet.'}
            </Text>
          </View>
        ) : null}

        <View style={styles.billingToggleSection}>
          <Text style={[styles.toggleLabel, { color: colors.textMuted }]}>BILLING FREQUENCY</Text>
          <View style={[styles.billingToggle, { borderColor: colors.divider }]}>
            {(['monthly', 'annual'] as const).map((nextCadence) => {
              const selected = cadence === nextCadence;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={nextCadence}
                  onPress={() => setCadence(nextCadence)}
                  style={({ pressed }) => [
                    styles.billingToggleButton,
                    selected && {
                      backgroundColor: colors.gold,
                      borderColor: colors.gold,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.billingToggleTitle,
                      { color: selected ? colors.textOnAccent : colors.text },
                    ]}>
                    {nextCadence === 'annual' ? 'ANNUAL' : 'MONTHLY'}
                  </Text>
                  <Text
                    style={[
                      styles.billingToggleSubtext,
                      { color: selected ? colors.textOnAccent : colors.textMuted },
                    ]}>
                    {nextCadence === 'annual' ? 'SAVE 2 MONTHS' : 'FLEXIBLE MONTH TO MONTH'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.planGrid, compact && styles.planGridCompact]}>
          {KEEPFLIP_PLAN_DEFINITIONS.map((definition) => (
            <PlanCard
              accountHasActivePlan={accountHasActivePlan}
              cadence={cadence}
              definition={definition}
              disabled={!checkoutReady}
              key={definition.id}
              onCheckout={(plan) => void openCheckout(plan)}
              option={optionFor(catalog, definition.id, cadence)}
              purchasing={purchasingPlan !== null}
              selected={purchasingPlan}
            />
          ))}
        </View>

        {actionMessage ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.actionMessage,
              { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder },
            ]}>
            <Text style={[styles.actionMessageText, { color: colors.text }]}>{actionMessage}</Text>
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityLabel="Refresh payment status"
            accessibilityRole="button"
            disabled={purchasingPlan !== null}
            onPress={() => void refreshPaymentStatus()}
            style={({ pressed }) => [
              styles.refreshButton,
              { borderColor: colors.accentCyanBorder },
              purchasingPlan !== null && styles.checkoutButtonDisabled,
              pressed && purchasingPlan === null && styles.pressed,
            ]}>
            <IconSymbol color={colors.scannerCyan} name="arrow.clockwise" size={17} />
            <Text style={[styles.refreshButtonText, { color: colors.scannerCyan }]}>REFRESH PAYMENT STATUS</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="View KeepFlip terms"
            accessibilityRole="button"
            onPress={() => router.push('/terms')}
            style={({ pressed }) => [styles.termsButton, pressed && styles.pressed]}>
            <Text style={[styles.termsButtonText, { color: colors.textMuted }]}>VIEW TERMS</Text>
          </Pressable>
        </View>

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          KeepFlip never handles your full card number. RevenueCat and Stripe process web payments; the server remains the source of truth for your plan and access.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 1_170,
    paddingBottom: 42,
    paddingHorizontal: 30,
    paddingTop: 36,
    width: '100%',
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceGold,
    borderColor: theme.colors.accentGoldBorder,
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    marginTop: 3,
    width: 52,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 32,
    letterSpacing: -0.4,
    lineHeight: 39,
    marginTop: 5,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 7,
    maxWidth: 760,
  },
  backToAccount: {
    alignSelf: 'flex-start',
    marginTop: 18,
    minHeight: 34,
    paddingVertical: 7,
  },
  backToAccountText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1,
  },
  activeBanner: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    marginTop: 26,
    padding: 17,
  },
  activeBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  activeBannerTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
  },
  activeBannerBody: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  manageButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 13,
  },
  manageButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.7,
  },
  notice: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginTop: 22,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  billingToggleSection: {
    marginTop: 30,
  },
  toggleLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  billingToggle: {
    alignSelf: 'flex-start',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  billingToggleButton: {
    borderColor: 'transparent',
    borderRadius: 11,
    borderWidth: 1,
    minWidth: 176,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  billingToggleTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  billingToggleSubtext: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    marginTop: 3,
  },
  planGrid: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 22,
  },
  planGridCompact: {
    flexDirection: 'column',
  },
  planCard: {
    backgroundColor: theme.colors.backgroundRaised,
    borderColor: theme.colors.divider,
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: 24,
  },
  planCardRecommended: {
    borderColor: theme.colors.gold,
    borderWidth: 2,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  planTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  planEyebrow: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  planName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 23,
    lineHeight: 28,
    marginTop: 5,
  },
  recommendedBadge: {
    backgroundColor: theme.colors.iconSurfaceGold,
    borderColor: theme.colors.accentGoldBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recommendedBadgeText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.7,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  price: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 34,
    letterSpacing: -0.8,
  },
  pricePeriod: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
  },
  annualSavings: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  planDescription: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 17,
    minHeight: 64,
  },
  features: {
    gap: 10,
    marginTop: 20,
  },
  featureRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  featureText: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  checkoutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceCyan,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 26,
    minHeight: 49,
    paddingHorizontal: 14,
  },
  checkoutButtonRecommended: {
    backgroundColor: theme.colors.gold,
    borderColor: theme.colors.gold,
  },
  checkoutButtonDisabled: {
    opacity: 0.48,
  },
  checkoutButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.75,
  },
  checkoutButtonTextRecommended: {
    color: theme.colors.textOnAccent,
  },
  planFinePrint: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    textAlign: 'center',
  },
  actionMessage: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 21,
    padding: 14,
  },
  actionMessageText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 20,
  },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 24,
  },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 43,
    paddingHorizontal: 14,
  },
  refreshButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.7,
  },
  termsButton: {
    justifyContent: 'center',
    minHeight: 43,
    paddingHorizontal: 7,
  },
  termsButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  disclaimer: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    maxWidth: 920,
  },
  pressed: {
    opacity: 0.76,
  },
});
