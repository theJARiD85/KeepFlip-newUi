import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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

function PlanCard({
  definition,
  currentPlan,
  monthlyPrice,
  annualPrice,
  purchasing,
  checkoutEnabled,
  onPurchase,
}: {
  definition: KeepFlipPlanDefinition;
  currentPlan: KeepFlipPlanId | null;
  monthlyPrice: string | null;
  annualPrice: string | null;
  purchasing: boolean;
  checkoutEnabled: boolean;
  onPurchase: (
    plan: KeepFlipPlanId,
    cadence: KeepFlipBillingCadence,
  ) => void;
}) {
  const isCurrent = currentPlan === definition.id;
  const primaryPrice = monthlyPrice || definition.monthlyPriceFallback;
  const annualDisplay =
    annualPrice || definition.annualPriceFallback;

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
        <Text style={styles.price}>{primaryPrice}</Text>
        <Text style={styles.pricePeriod}>/ month</Text>
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
        disabled={!checkoutEnabled || purchasing || isCurrent}
        onPress={() => onPurchase(definition.id, 'monthly')}
        style={({ pressed }) => [
          styles.subscribeButton,
          definition.recommended && styles.subscribeButtonRecommended,
          (!checkoutEnabled || purchasing || isCurrent) && styles.buttonDisabled,
          pressed &&
          checkoutEnabled &&
          !purchasing &&
          !isCurrent &&
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
            ]}>
            {isCurrent
              ? 'CURRENT PLAN'
              : currentPlan
                ? 'SWITCH TO THIS PLAN'
                : 'START 7-DAY FREE TRIAL'}
          </Text>
        )}
      </Pressable>

      {definition.id === 'hobbyist' && annualDisplay ? (
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
          <Text style={styles.annualButtonText}>
            ANNUAL · {annualDisplay} / YEAR
          </Text>
          <Text style={styles.annualSavingsText}>
            Save $50 / year · equivalent to $20.83 / month
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function KeepFlipSubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const access = snapshot?.access ?? null;
  const catalog = snapshot?.catalog ?? null;
  const checkoutEnabled = state === 'ready' && snapshot?.configured === true;
  const canLeavePlanScreen =
    !areKeepFlipSubscriptionsEnforced() || access?.active === true;
  const trialEnds = formatDate(access?.isTrial ? access.expiresAt : null);
  const renewalDate = formatDate(
    access?.active && !access.isTrial ? access.expiresAt : null,
  );

  const statusCopy = useMemo(() => {
    if (state === 'loading') return 'Checking your KeepFlip plan…';
    if (state === 'unconfigured') {
      return 'Subscription checkout is staged in this build and will activate once the RevenueCat store keys are added.';
    }
    if (state === 'error') return 'KeepFlip could not verify subscription access.';
    if (access?.isTrial) {
      return trialEnds
        ? `Free trial active through ${trialEnds}.`
        : 'Your 7-day free trial is active.';
    }
    if (access?.active) {
      return renewalDate
        ? `${access.willRenew ? 'Renews' : 'Access continues'} through ${renewalDate}.`
        : 'Your subscription is active.';
    }
    return 'Choose the level that matches how you resell. New subscribers start with a 7-day free trial.';
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
    cadence: KeepFlipBillingCadence,
  ) => {
    hapticSelection();
    setActionMessage(null);
    const activated = await purchase(plan, cadence);
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

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom,
            paddingTop: insets.top / 2,
          },
        ]}
        style={{marginBottom: insets.bottom, marginTop: insets.top}}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          {canLeavePlanScreen ? (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.buttonPressed,
              ]}>
              <IconSymbol
                color={theme.colors.cream}
                name="chevron.left"
                size={18}
              />
            </Pressable>
          ) : (
            <View
              accessibilityLabel="A KeepFlip plan is required to continue"
              style={styles.planRequiredIcon}>
              <IconSymbol
                color={theme.colors.goldBright}
                name="lock.fill"
                size={17}
              />
            </View>
          )}

          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>KEEPFLIP / PLAN & BILLING</Text>
            <Text style={styles.title}>Built for the way you resell</Text>
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
            <Text style={styles.trialTitle}>7 DAYS FREE</Text>
            <Text style={styles.trialBody}>{statusCopy}</Text>
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
                checkoutEnabled={checkoutEnabled}
                currentPlan={
                  access?.active ? access.plan : null
                }
                definition={definition}
                key={definition.id}
                monthlyPrice={
                  catalog?.prices[definition.id].monthly ?? null
                }
                onPurchase={(plan, cadence) =>
                  void handlePurchase(plan, cadence)
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
                ? 'Checkout is intentionally disabled until the RevenueCat public SDK key and store offering are configured for this build.'
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
                <Text style={styles.continueButtonText}>CONTINUE TO KEEPFLIP</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleManage()}
                style={({ pressed }) => [
                  styles.utilityButton,
                  pressed && styles.utilityButtonPressed,
                ]}>
                <Text style={styles.utilityButtonText}>
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
              <Text style={styles.utilityButtonText}>
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
            <Text style={styles.refreshButtonText}>
              REFRESH PLAN STATUS
            </Text>
          </Pressable>
        </View>

        <Text selectable style={styles.finePrint}>
          Subscription billing, trial eligibility, renewals, upgrades, and
          cancellations are confirmed by Google Play or the App Store. Your
          store account controls payment. Cancel before the trial ends to avoid
          the first paid renewal.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: 18,
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
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(242, 237, 228, 0.05)',
    borderColor: 'rgba(242, 237, 228, 0.14)',
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
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  trialBody: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
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
    gap: 12,
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
  priceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
  price: {
    color: theme.colors.cream,
    fontSize: 25,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  pricePeriod: { color: theme.colors.textMuted, fontSize: 11 },
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
  annualButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(215, 168, 74, 0.055)',
    borderColor: 'rgba(215, 168, 74, 0.28)',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
  },
  annualButtonPressed: {
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
  },
  annualButtonText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  annualSavingsText: {
    color: theme.colors.textMuted,
    fontSize: 9,
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
    fontSize: 8,
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
