import * as Haptics from 'expo-haptics';
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  KEEPFLIP_PLAN_DEFINITIONS,
  areKeepFlipSubscriptionsEnforced,
  type KeepFlipBillingCadence,
  type KeepFlipPlanDefinition,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function hapticSelection() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function annualSavings(plan: KeepFlipPlanId) {
  if (plan === 'hobbyist') return 'SAVE $20 / YEAR';
  if (plan === 'serious') return 'SAVE $50 / YEAR';
  return null;
}

function PlanCard({
  cadence,
  checkoutEnabled,
  currentPlan,
  definition,
  monthlyPrice,
  annualPrice,
  purchasing,
  onPurchase,
}: {
  cadence: KeepFlipBillingCadence;
  checkoutEnabled: boolean;
  currentPlan: KeepFlipPlanId | null;
  definition: KeepFlipPlanDefinition;
  monthlyPrice: string | null;
  annualPrice: string | null;
  purchasing: boolean;
  onPurchase: (
    plan: KeepFlipPlanId,
    cadence: KeepFlipBillingCadence,
  ) => void;
}) {
  const { responsiveFont } = useResponsiveLayout();
  const isCurrent = currentPlan === definition.id;
  const selectedPrice =
    cadence === 'annual'
      ? annualPrice ?? definition.annualPriceFallback
      : monthlyPrice ?? definition.monthlyPriceFallback;
  const periodLabel = cadence === 'annual' ? '/ year' : '/ month';
  const savings = cadence === 'annual' ? annualSavings(definition.id) : null;

  return (
    <View
      style={[
        styles.planCard,
        definition.recommended && styles.planCardRecommended,
        isCurrent && styles.planCardCurrent,
      ]}>
      <View style={styles.planTopLine}>
        <View style={styles.planHeading}>
          <Text style={styles.planEyebrow}>{definition.eyebrow}</Text>
          <Text style={styles.planName}>{definition.name}</Text>
        </View>

        {isCurrent ? (
          <View style={styles.currentBadge}>
            <Text style={styles.currentText}>CURRENT</Text>
          </View>
        ) : definition.recommended ? (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>RECOMMENDED</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{selectedPrice}</Text>
        <Text style={styles.pricePeriod}>{periodLabel}</Text>
      </View>

      {savings ? (
        <Text style={styles.savingsLine}>{savings}</Text>
      ) : null}

      <View style={styles.trialIncludedRow}>
        <IconSymbol
          color={theme.colors.scannerCyan}
          name="sparkles"
          size={14}
        />
        <Text style={styles.trialIncludedText}>
          7-DAY FREE TRIAL INCLUDED
        </Text>
      </View>

      <Text style={styles.planDescription}>{definition.description}</Text>

      <View style={styles.featureList}>
        {[...definition.limits, ...definition.features].map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="checkmark.circle.fill"
              size={15}
            />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!checkoutEnabled || purchasing}
        onPress={() => onPurchase(definition.id, cadence)}
        style={({ pressed }) => [
          styles.subscribeButton,
          definition.recommended && styles.subscribeButtonRecommended,
          (!checkoutEnabled || purchasing) && styles.buttonDisabled,
          pressed &&
            checkoutEnabled &&
            !purchasing &&
            styles.buttonPressed,
        ]}>
        {purchasing ? (
          <ActivityIndicator
            color={
              definition.recommended
                ? theme.colors.backgroundDeep
                : theme.colors.scannerCyan
            }
            size="small"
          />
        ) : (
          <Text
            style={[
              styles.subscribeButtonText,
              definition.recommended &&
                styles.subscribeButtonTextRecommended,
              { fontSize: responsiveFont(10) },
            ]}>
            {currentPlan && !isCurrent
              ? 'SWITCH PLAN'
              : 'START 7-DAY FREE TRIAL'}
          </Text>
        )}
      </Pressable>

<<<<<<< Updated upstream
      <Text style={styles.afterTrialText}>
        Then {selectedPrice} {cadence === 'annual' ? 'per year' : 'per month'}.
        Cancel anytime.
      </Text>
=======
        <Pressable
          accessibilityRole="button"
          disabled={!checkoutEnabled || purchasing}
          onPress={() => onPurchase('hobbyist', 'annual')}
          style={({ pressed }) => [
            styles.annualButton,
            (!checkoutEnabled || purchasing) && styles.buttonDisabled,
            pressed &&
            checkoutEnabled &&
            !purchasing &&
            styles.annualButtonPressed,
          ]}>
          <Text style={[styles.annualButtonText, { fontSize: responsiveFont(10)}]}>
            ANNUAL · {annualDisplay} / YEAR
          </Text>
          <Text style={[styles.annualSavingsText, { fontSize: responsiveFont(9)}]}>
            Save $50 / year · equivalent to $4.17 / month
          </Text>
        </Pressable>
>>>>>>> Stashed changes
    </View>
  );
}

export function KeepFlipSubscriptionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { source } = useLocalSearchParams<{ source?: string | string[] }>();
  const isOnboarding =
    (Array.isArray(source) ? source[0] : source) === 'onboarding';
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();

  const {
    errorMessage,
    manage,
    purchase,
    purchasing,
    refresh,
    restore,
    restoring,
    snapshot,
    state,
  } = useKeepFlipSubscription();

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cadence, setCadence] =
    useState<KeepFlipBillingCadence>('monthly');

  const access = snapshot?.access ?? null;
  const catalog = snapshot?.catalog ?? null;
  const checkoutEnabled = state === 'ready' && snapshot?.configured === true;
  const isPaywallLocked =
    access?.active !== true &&
    (isOnboarding || areKeepFlipSubscriptionsEnforced());

  useEffect(() => {
    if (!isPaywallLocked) return;

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
    });

    return unsubscribe;
  }, [isPaywallLocked, navigation]);

  const trialEnds = formatDate(access?.isTrial ? access.expiresAt : null);
  const renewalDate = formatDate(
    access?.active && !access.isTrial ? access.expiresAt : null,
  );

  const statusCopy = useMemo(() => {
    if (state === 'loading') return 'Checking your KeepFlip plan…';
    if (state === 'unconfigured') {
      return 'Subscription checkout will activate when the RevenueCat store configuration is available in this build.';
    }
    if (state === 'error') {
      return 'KeepFlip could not verify subscription access.';
    }
    if (access?.isTrial) {
      return trialEnds
        ? `Free trial active through ${trialEnds}.`
        : 'Your free trial is active.';
    }
    if (access?.active) {
      return renewalDate
        ? `${access.willRenew ? 'Renews' : 'Access continues'} through ${renewalDate}.`
        : 'Your subscription is active.';
    }
    return 'Every KeepFlip plan starts with a 7-day free trial. Choose monthly or annual billing below.';
  }, [
    access?.active,
    access?.isTrial,
    access?.willRenew,
    renewalDate,
    state,
    trialEnds,
  ]);

  const handlePurchase = async (
    plan: KeepFlipPlanId,
    selectedCadence: KeepFlipBillingCadence,
  ) => {
    hapticSelection();
    setActionMessage(null);
    const activated = await purchase(plan, selectedCadence);
    if (activated) {
      setActionMessage('Your KeepFlip plan is active.');
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    }
  };

  const handleRestore = async () => {
    hapticSelection();
    setActionMessage(null);
    const restored = await restore();
    setActionMessage(
      restored
        ? 'Your subscription was restored.'
        : 'No active KeepFlip subscription was found for this store account.',
    );
  };

  const handleManage = async () => {
    hapticSelection();
    setActionMessage(null);
    try {
      await manage();
    } catch {
      // The provider surfaces the useful error.
    }
  };

  const selectCadence = (nextCadence: KeepFlipBillingCadence) => {
    if (nextCadence === cadence) return;
    hapticSelection();
    setCadence(nextCadence);
  };

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 24,
            paddingTop: insets.top + 18,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View
            accessibilityLabel={
              isPaywallLocked
                ? 'A KeepFlip plan is required to continue'
                : 'KeepFlip plan and billing'
            }
            style={styles.planRequiredIcon}>
            <IconSymbol
              color={theme.colors.goldBright}
              name={isPaywallLocked ? 'lock.fill' : 'creditcard.fill'}
              size={17}
            />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              {isOnboarding
                ? 'KEEPFLIP / CHOOSE YOUR PLAN'
                : 'KEEPFLIP / PLAN & BILLING'}
            </Text>
            <Text style={styles.title}>
              {isOnboarding
                ? 'Choose how you want to KeepFlip'
                : 'Built for the way you resell'}
            </Text>
          </View>
        </View>

        <View style={styles.trialBanner}>
          <View style={styles.trialIcon}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="sparkles"
              size={20}
            />
          </View>
          <View style={styles.trialCopy}>
            <Text style={styles.trialTitle}>7 DAYS FREE ON EITHER BILLING OPTION</Text>
            <Text style={styles.trialBody}>{statusCopy}</Text>
          </View>
        </View>

        <View style={styles.billingSection}>
          <Text style={styles.billingLabel}>BILLING</Text>
          <View
            accessibilityLabel="Billing frequency"
            style={styles.billingToggle}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: cadence === 'monthly' }}
              onPress={() => selectCadence('monthly')}
              style={[
                styles.billingOption,
                cadence === 'monthly' && styles.billingOptionSelected,
              ]}>
              <Text
                style={[
                  styles.billingOptionText,
                  cadence === 'monthly' && styles.billingOptionTextSelected,
                ]}>
                MONTHLY
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: cadence === 'annual' }}
              onPress={() => selectCadence('annual')}
              style={[
                styles.billingOption,
                cadence === 'annual' && styles.billingOptionSelected,
              ]}>
              <Text
                style={[
                  styles.billingOptionText,
                  cadence === 'annual' && styles.billingOptionTextSelected,
                ]}>
                ANNUAL
              </Text>
              <Text
                style={[
                  styles.billingOptionSubtext,
                  cadence === 'annual' &&
                    styles.billingOptionSubtextSelected,
                ]}>
                SAVE 2 MONTHS
              </Text>
            </Pressable>
          </View>
        </View>

        {state === 'loading' ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator
              color={theme.colors.scannerCyan}
              size="small"
            />
            <Text style={styles.loadingText}>
              Loading store plans and current access
            </Text>
          </View>
        ) : (
          <View style={styles.planStack}>
            {KEEPFLIP_PLAN_DEFINITIONS.map((definition) => (
              <PlanCard
                annualPrice={
                  catalog?.prices[definition.id].annual ?? null
                }
                cadence={cadence}
                checkoutEnabled={checkoutEnabled}
                currentPlan={access?.active ? access.plan : null}
                definition={definition}
                key={definition.id}
                monthlyPrice={
                  catalog?.prices[definition.id].monthly ?? null
                }
                onPurchase={(plan, selectedCadence) =>
                  void handlePurchase(plan, selectedCadence)
                }
                purchasing={purchasing}
              />
            ))}
          </View>
        )}

        {!checkoutEnabled && state !== 'loading' ? (
          <View style={styles.checkoutNotice}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="exclamationmark.triangle.fill"
              size={16}
            />
            <Text style={styles.checkoutNoticeText}>
              {state === 'unconfigured'
                ? 'Checkout is disabled until the RevenueCat public SDK key and store offering are configured for this build.'
                : 'Checkout is temporarily unavailable while KeepFlip verifies subscription access.'}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

        {actionMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={styles.successText}>
            {actionMessage}
          </Text>
        ) : null}

        <View style={styles.accountActions}>
          {access?.active ? (
            <>
              <Pressable
                accessibilityHint="Returns to KeepFlip with your active plan."
                accessibilityRole="button"
                onPress={() => {
                  hapticSelection();
                  router.replace('/');
                }}
                style={({ pressed }) => [
                  styles.continueButton,
                  pressed && styles.continueButtonPressed,
                ]}>
                <Text style={styles.continueButtonText}>
                  CONTINUE TO KEEPFLIP
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleManage()}
                style={({ pressed }) => [
                  styles.utilityButton,
                  pressed && styles.utilityButtonPressed,
                ]}>
                <Text
                  style={[
                    styles.utilityButtonText,
                    { fontSize: responsiveFont(11) },
                  ]}>
                  MANAGE SUBSCRIPTION
                </Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!checkoutEnabled || restoring}
            onPress={() => void handleRestore()}
            style={({ pressed }) => [
              styles.utilityButton,
              (!checkoutEnabled || restoring) && styles.buttonDisabled,
              pressed &&
                checkoutEnabled &&
                !restoring &&
                styles.utilityButtonPressed,
            ]}>
            {restoring ? (
              <ActivityIndicator
                color={theme.colors.goldBright}
                size="small"
              />
            ) : (
              <Text
                style={[
                  styles.utilityButtonText,
                  { fontSize: responsiveFont(11) },
                ]}>
                RESTORE PURCHASES
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.utilityButtonPressed,
            ]}>
            <Text
              style={[
                styles.refreshButtonText,
                { fontSize: responsiveFont(9) },
              ]}>
              REFRESH PLAN STATUS
            </Text>
          </Pressable>
        </View>

        <Text selectable style={styles.finePrint}>
          Free trial availability is determined by Google Play or the App Store
          and is generally limited to eligible new subscribers. Billing begins
          after the trial unless cancelled before it ends. Subscription billing,
          renewals, upgrades, and cancellations are controlled by your store
          account.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 760,
    paddingHorizontal: 18,
    width: '100%',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 11,
  },
  planRequiredIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(215, 168, 74, 0.07)',
    borderColor: 'rgba(215, 168, 74, 0.24)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: { flex: 1, gap: 3, paddingTop: 1 },
  eyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.35,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.55,
    lineHeight: 33,
  },
  trialBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.055)',
    borderColor: 'rgba(0, 255, 255, 0.24)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  trialIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  trialCopy: { flex: 1, gap: 3 },
  trialTitle: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.95,
  },
  trialBody: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  billingSection: { gap: 7 },
  billingLabel: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.1,
    paddingHorizontal: 2,
  },
  billingToggle: {
    backgroundColor: 'rgba(8, 8, 12, 0.92)',
    borderColor: 'rgba(242, 237, 228, 0.14)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  billingOption: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 45,
    paddingHorizontal: 10,
  },
  billingOptionSelected: {
    backgroundColor: 'rgba(215, 168, 74, 0.14)',
    borderColor: 'rgba(242, 211, 138, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  billingOptionText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.85,
  },
  billingOptionTextSelected: {
    color: theme.colors.goldBright,
  },
  billingOptionSubtext: {
    color: 'rgba(173, 167, 178, 0.66)',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.45,
  },
  billingOptionSubtextSelected: {
    color: theme.colors.scannerCyan,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 7, 10, 0.52)',
    borderColor: 'rgba(242, 237, 228, 0.12)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 76,
    padding: 14,
  },
  loadingText: { color: theme.colors.textMuted, fontSize: 12 },
  planStack: { gap: 12 },
  planCard: {
    backgroundColor: 'rgba(8, 8, 12, 0.92)',
    borderColor: 'rgba(242, 237, 228, 0.15)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 11,
    padding: 15,
  },
  planCardRecommended: {
    borderColor: 'rgba(0, 255, 255, 0.42)',
    shadowColor: theme.colors.scannerCyan,
    shadowOpacity: 0.09,
    shadowRadius: 20,
  },
  planCardCurrent: {
    borderColor: 'rgba(215, 168, 74, 0.44)',
  },
  planTopLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  planHeading: { flex: 1, gap: 2 },
  planEyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  planName: {
    color: theme.colors.cream,
    fontSize: 20,
    fontWeight: '900',
  },
  recommendedBadge: {
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  recommendedText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.radar,
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  currentBadge: {
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
    borderColor: 'rgba(215, 168, 74, 0.34)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  currentText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 4,
  },
  price: {
    color: theme.colors.cream,
    fontSize: 27,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  pricePeriod: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  savingsLine: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.75,
    marginTop: -6,
  },
  trialIncludedRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 255, 255, 0.055)',
    borderColor: 'rgba(0, 255, 255, 0.2)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  trialIncludedText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  planDescription: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  featureList: { gap: 7 },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  featureText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  subscribeButton: {
    alignItems: 'center',
    borderColor: 'rgba(0, 255, 255, 0.34)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 46,
  },
  subscribeButtonRecommended: {
    backgroundColor: theme.colors.scannerCyan,
    borderColor: theme.colors.scannerCyan,
  },
  subscribeButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.85,
  },
  subscribeButtonTextRecommended: {
    color: theme.colors.backgroundDeep,
  },
  afterTrialText: {
    color: 'rgba(173, 167, 178, 0.76)',
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.78 },
  checkoutNotice: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(215, 168, 74, 0.055)',
    borderColor: 'rgba(215, 168, 74, 0.26)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    padding: 11,
  },
  checkoutNoticeText: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  successText: {
    color: theme.colors.scannerCyan,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  accountActions: { gap: 8 },
  continueButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 46,
  },
  continueButtonPressed: { opacity: 0.82 },
  continueButtonText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  utilityButton: {
    alignItems: 'center',
    borderColor: 'rgba(215, 168, 74, 0.28)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 44,
  },
  utilityButtonPressed: {
    backgroundColor: 'rgba(242, 237, 228, 0.055)',
  },
  utilityButtonText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.85,
  },
  refreshButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  refreshButtonText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  finePrint: {
    color: 'rgba(173, 167, 178, 0.68)',
    fontSize: 9,
    lineHeight: 14,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
});
