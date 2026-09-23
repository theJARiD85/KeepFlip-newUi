import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  KeepFlipAuthError,
  useKeepFlipAuth,
} from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { getAppwriteCoreServices } from '@/lib/appwrite';
import {
  KEEPFLIP_PLAN_DEFINITIONS,
  type KeepFlipBillingCadence,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';
import {
  keepFlipWebBillingPurchaseIsActive,
  linkKeepFlipWebBillingAccount,
  purchaseKeepFlipWebBillingPlanBeforeAccount,
} from '@/services/keepflip-web-billing';
import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';
import { completeScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

type WebAuthMode = 'sign-in' | 'create-account';

type WebAuthCompletion = {
  profileSaved: boolean;
};

type WebAuthScreenProps = {
  initialBuyRules?: ResellerBuyRules | null;
  initialMode: WebAuthMode;
  initialName?: string;
  onAuthenticated?: (result: WebAuthCompletion) => void | Promise<void>;
  onBack?: () => void;
};

export function WebAuthScreen({
  initialBuyRules,
  initialMode,
  initialName,
  onAuthenticated,
  onBack,
}: WebAuthScreenProps) {
  const router = useRouter();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const {
    createAccount,
    errorMessage,
    isBusy,
    missingKeys,
    signIn,
    status,
  } = useKeepFlipAuth();
  const [name, setName] = useState(initialName?.trim() ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [billingCadence, setBillingCadence] =
    useState<KeepFlipBillingCadence>('monthly');
  const [billingPlan, setBillingPlan] =
    useState<KeepFlipPlanId>('serious');
  const [preAccountSubscriptionActive, setPreAccountSubscriptionActive] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCreateAccount = initialMode === 'create-account';
  const submitLabel = isCreateAccount
    ? preAccountSubscriptionActive
      ? 'Create my workspace'
      : 'Start subscription & continue'
    : 'Sign in to KeepFlip';

  async function submit() {
    if (isBusy || isSubmitting) return;

    setLocalError(null);
    setIsSubmitting(true);
    try {
      if (isCreateAccount) {
        if (!preAccountSubscriptionActive) {
          const purchase = await purchaseKeepFlipWebBillingPlanBeforeAccount({
            cadence: billingCadence,
            email,
            plan: billingPlan,
          });
          if (!keepFlipWebBillingPurchaseIsActive(purchase, billingPlan)) {
            throw new Error(
              'KeepFlip could not confirm an active subscription. The account was not created.',
            );
          }
          setPreAccountSubscriptionActive(true);
          return;
        }

        let accountUserId: string;
        let sessionEstablished = false;
        try {
          const createdUser = await createAccount(
            name,
            email,
            password,
          );
          accountUserId = createdUser.$id;
        } catch (accountError) {
          /*
           * A browser refresh or a failed post-create link can leave the
           * Appwrite user behind while the successful anonymous RevenueCat
           * purchase remains in this tab. Recover that exact account and link
           * the pending purchase instead of starting another subscription.
           */
          if (
            accountError instanceof KeepFlipAuthError &&
            accountError.code === 'AUTH_ACCOUNT_EXISTS'
          ) {
            await signIn(email, password);
            const { account } = getAppwriteCoreServices();
            accountUserId = (await account.get()).$id;
            sessionEstablished = true;
          } else {
            throw accountError;
          }
        }

        await linkKeepFlipWebBillingAccount(accountUserId);
        if (!sessionEstablished) await signIn(email, password);
      } else {
        await signIn(email, password);
      }

      let profileSaved = true;
      if (isCreateAccount && initialBuyRules) {
        try {
          const { account } = getAppwriteCoreServices();
          const currentUser = await account.get();
          await completeScanInventoryWalkthrough(
            currentUser.$id,
            currentUser.name || name.trim(),
            initialBuyRules,
          );
        } catch (profileError) {
          profileSaved = false;
          if (__DEV__) {
            console.warn(
              '[KeepFlip][Web onboarding] Seller setup could not be saved after account creation:',
              profileError,
            );
          }
        }
      }

      if (onAuthenticated) {
        await onAuthenticated({ profileSaved });
      } else {
        router.replace(profileSaved ? '/' : '/walkthrough');
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'KeepFlip could not complete that request.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.root, { backgroundColor: colors.backgroundDeep }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: colors.gold }]}>
            <Text style={[styles.brandMarkText, { color: colors.textOnAccent }]}>K</Text>
          </View>
          <Text style={[styles.brandName, { color: colors.text }]}>KEEPFLIP</Text>
          <View style={[styles.webPill, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.scannerCyan }]} />
            <Text style={[styles.webPillText, { color: colors.scannerCyan }]}>WEB WORKSPACE</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
          <Text style={[styles.eyebrow, { color: colors.goldBright }]}>RESELLER OPERATIONS, EVERYWHERE</Text>
          <Text style={[styles.title, { color: colors.text }]}>Make every flip easier to trust.</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Use the web workspace for inventory, Books, market research, and assistant planning. Open the Android app when it is time to capture an item.</Text>

          {onBack ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={[styles.backButtonText, { color: colors.scannerCyan }]}>← BACK TO FLIP SETUP</Text>
            </Pressable>
          ) : null}

          {isCreateAccount ? (
            <Field
              autoCapitalize="words"
              colors={colors}
              label="Your name"
              onChangeText={setName}
              placeholder="Jamie Reseller"
              value={name}
            />
          ) : null}
          <Field
            autoCapitalize="none"
            autoComplete="email"
            colors={colors}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <Field
            autoCapitalize="none"
            autoComplete={isCreateAccount ? 'new-password' : 'password'}
            colors={colors}
            label="Password"
            onChangeText={setPassword}
            placeholder={isCreateAccount ? 'At least 8 characters' : 'Your password'}
            secureTextEntry
            value={password}
          />

          {isCreateAccount ? (
            <WebBillingChoice
              active={preAccountSubscriptionActive}
              cadence={billingCadence}
              colors={colors}
              onCadenceChange={setBillingCadence}
              onPlanChange={setBillingPlan}
              plan={billingPlan}
            />
          ) : null}

          {localError || errorMessage ? (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{localError ?? errorMessage}</Text>
            </View>
          ) : null}

          {status === 'setup' && missingKeys.length ? (
            <View style={[styles.setupBox, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.goldMuted }]}>
              <Text style={[styles.setupTitle, { color: colors.goldBright }]}>Appwrite is not configured for this build yet.</Text>
              <Text style={[styles.setupText, { color: colors.textMuted }]}>The browser shell is ready, but authentication needs the public Appwrite endpoint and project ID in the web environment.</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isBusy || isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: colors.gold },
              pressed && styles.pressed,
              (isBusy || isSubmitting) && styles.disabled,
            ]}
          >
            {isBusy || isSubmitting ? <ActivityIndicator color={colors.textOnAccent} /> : null}
            <Text style={[styles.submitText, { color: colors.textOnAccent }]}>{submitLabel}</Text>
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: colors.textMuted }]}>
              {isCreateAccount ? 'Already have a KeepFlip account?' : 'New to KeepFlip?'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLocalError(null);
                if (isCreateAccount) {
                  router.replace('/sign-in');
                  return;
                }
                router.push('/welcome');
              }}
            >
              <Text style={[styles.switchAction, { color: colors.scannerCyan }]}>
                {isCreateAccount ? 'Sign in' : 'Meet Flip & start setup'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.footerNote, { borderColor: colors.divider }]}>
          <Text style={[styles.footerLabel, { color: colors.goldBright }]}>CAPTURE WHERE IT WORKS BEST</Text>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>KeepFlip’s live scanner, camera permissions, and native vision pipeline stay in the Android app. Your decisions, records, and realized financial picture stay available here.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  colors,
  label,
  ...props
}: ComponentProps<typeof TextInput> & {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text }]}
      />
    </View>
  );
}

function WebBillingChoice({
  active,
  cadence,
  colors,
  onCadenceChange,
  onPlanChange,
  plan,
}: {
  active: boolean;
  cadence: KeepFlipBillingCadence;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  onCadenceChange: (cadence: KeepFlipBillingCadence) => void;
  onPlanChange: (plan: KeepFlipPlanId) => void;
  plan: KeepFlipPlanId;
}) {
  return (
    <View
      style={[
        styles.billingSection,
        { backgroundColor: colors.surfaceInset, borderColor: colors.divider },
      ]}
    >
      <Text style={[styles.billingEyebrow, { color: colors.goldBright }]}>SUBSCRIPTION REQUIRED BEFORE ACCOUNT</Text>
      <Text style={[styles.billingCopy, { color: colors.textMuted }]}>Choose a plan and complete secure checkout first. KeepFlip will not create the Appwrite account until RevenueCat confirms an active subscription or eligible trial.</Text>

      {!active ? (
        <>
          <View style={styles.billingToggle}>
            {(['monthly', 'annual'] as const).map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: cadence === option }}
                key={option}
                onPress={() => onCadenceChange(option)}
                style={[
                  styles.billingToggleOption,
                  { borderColor: colors.divider },
                  cadence === option && {
                    backgroundColor: colors.iconSurfaceCyan,
                    borderColor: colors.accentCyanBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.billingToggleText,
                    { color: cadence === option ? colors.scannerCyan : colors.textMuted },
                  ]}
                >
                  {option === 'monthly' ? 'MONTHLY' : 'ANNUAL'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.billingPlanList}>
            {KEEPFLIP_PLAN_DEFINITIONS.map((definition) => {
              const selected = plan === definition.id;
              const price =
                cadence === 'annual'
                  ? definition.annualPriceFallback
                  : definition.monthlyPriceFallback;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={definition.id}
                  onPress={() => onPlanChange(definition.id)}
                  style={[
                    styles.billingPlan,
                    { borderColor: colors.divider },
                    selected && {
                      backgroundColor: colors.iconSurfaceCyan,
                      borderColor: colors.accentCyanBorder,
                    },
                  ]}
                >
                  <View style={styles.billingPlanHeading}>
                    <Text style={[styles.billingPlanName, { color: selected ? colors.scannerCyan : colors.text }]}>{definition.name}</Text>
                    <Text style={[styles.billingPlanPrice, { color: colors.text }]}>{price}{cadence === 'annual' ? '/yr' : '/mo'}</Text>
                  </View>
                  <Text style={[styles.billingPlanDescription, { color: colors.textMuted }]}>{definition.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={[styles.billingConfirmed, { color: colors.scannerCyan }]}>SUBSCRIPTION CONFIRMED — CREATE YOUR KEEPFLIP ACCOUNT BELOW.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
    maxWidth: 620,
    width: '100%',
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  brandMarkText: { fontFamily: theme.fonts.bold, fontSize: 19 },
  brandName: { fontFamily: theme.fonts.bold, fontSize: 14, letterSpacing: 2.2 },
  webPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  webPillText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1 },
  card: {
    borderRadius: theme.radii.large,
    borderWidth: 1,
    maxWidth: 620,
    padding: 30,
    width: '100%',
  },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 13, letterSpacing: 1.7 },
  title: { fontFamily: theme.fonts.bold, fontSize: 38, lineHeight: 44, marginTop: 10 },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, marginTop: 12, maxWidth: 560 },
  backButton: { alignSelf: 'flex-start', marginTop: 18, paddingVertical: 4 },
  backButtonText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.9 },
  fieldGroup: { gap: 7, marginTop: 20 },
  fieldLabel: { fontFamily: theme.fonts.semibold, fontSize: 14, letterSpacing: 0.6 },
  input: { borderRadius: 14, borderWidth: 1, fontFamily: theme.fonts.body, fontSize: 15, minHeight: 50, paddingHorizontal: 15 },
  errorBox: { borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 12 },
  errorText: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  setupBox: { borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 13 },
  setupTitle: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  setupText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
  billingSection: { borderRadius: 14, borderWidth: 1, gap: 10, marginTop: 22, padding: 15 },
  billingEyebrow: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 1.1 },
  billingCopy: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18 },
  billingToggle: { flexDirection: 'row', gap: 8 },
  billingToggleOption: { borderRadius: 999, borderWidth: 1, flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  billingToggleText: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.8 },
  billingPlanList: { gap: 8 },
  billingPlan: { borderRadius: 12, borderWidth: 1, gap: 5, padding: 12 },
  billingPlanHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  billingPlanName: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 13 },
  billingPlanPrice: { fontFamily: theme.fonts.bold, fontSize: 13 },
  billingPlanDescription: { fontFamily: theme.fonts.body, fontSize: 11, lineHeight: 16 },
  billingConfirmed: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.5, lineHeight: 17 },
  submitButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 24, minHeight: 52, paddingHorizontal: 18 },
  submitText: { fontFamily: theme.fonts.bold, fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 22 },
  switchText: { fontFamily: theme.fonts.body, fontSize: 13 },
  switchAction: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  footerNote: { borderTopWidth: 1, marginTop: 24, maxWidth: 620, paddingTop: 18, width: '100%' },
  footerLabel: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1.4 },
  footerText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
});
