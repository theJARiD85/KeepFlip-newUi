import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  useState,
  useEffect,
  type ComponentProps,
  type ComponentRef,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipCompanion } from '@/components/flip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  KeepFlipBackground,
} from '@/components/ui/keepflip-background';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import { getAppwriteCoreServices } from '@/lib/appwrite';
import {
  KEEPFLIP_PLAN_DEFINITIONS,
  linkKeepFlipPreAccountPurchase,
  loadKeepFlipPreAccountSubscriptionAccess,
  purchaseKeepFlipPlanBeforeAccount,
  purchaseKeepFlipPlan,
  type KeepFlipBillingCadence,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';
import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';
import { completeScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

export type AuthSubscriptionSelection = {
  cadence: KeepFlipBillingCadence;
  plan: KeepFlipPlanId;
  profileSaved?: boolean;
};

type LaunchAuthMode = 'sign-in' | 'create-account';

type KeepFlipLaunchAuthScreenProps = {
  accountModeLocked?: boolean;
  initialBuyRules?: ResellerBuyRules | null;
  initialMode: LaunchAuthMode;
  initialName?: string;
  migrationMode?: boolean;
  onAuthenticated?: (selection: AuthSubscriptionSelection) => void;
  onBack?: () => void;
};

type IconName = ComponentProps<typeof IconSymbol>['name'];
type TextInputHandle = ComponentRef<typeof TextInput>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function AuthField({
  icon,
  inputRef,
  label,
  onToggleSecure,
  secureVisible,
  ...inputProps
}: TextInputProps & {
  icon: IconName;
  inputRef?: RefObject<TextInputHandle | null>;
  label: string;
  onToggleSecure?: () => void;
  secureVisible?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { fontSize: responsiveFont(10) }]}>{label}</Text>
      <View style={styles.fieldShell}>
        <IconSymbol color={theme.colors.goldMuted} name={icon} size={18} />
        <TextInput
          {...inputProps}
          accessibilityLabel={label}
          placeholderTextColor="rgba(173, 167, 178, 0.62)"
          ref={inputRef}
          selectionColor={theme.colors.goldBright}
          style={styles.fieldInput}
        />
        {onToggleSecure ? (
          <Pressable
            accessibilityLabel={secureVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onToggleSecure}
            style={({ pressed }) => [styles.visibilityButton, pressed && styles.pressed]}>
            <IconSymbol
              color={theme.colors.textMuted}
              name={secureVisible ? 'eye.slash.fill' : 'eye.fill'}
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PlanSelection({
  beforeAccount = false,
  value,
  onChange,
  migrationMode = false,
}: {
  beforeAccount?: boolean;
  value: AuthSubscriptionSelection;
  onChange: (next: AuthSubscriptionSelection) => void;
  migrationMode?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const cadence = value.cadence;

  return (
    <View style={styles.checkoutSection}>
      <View style={styles.checkoutBanner}>
        <View style={styles.checkoutBannerIcon}>
          <IconSymbol
            color={theme.colors.scannerCyan}
            name="sparkles"
            size={20}
          />
        </View>
        <View style={styles.checkoutBannerCopy}>
          <Text style={[styles.checkoutBannerTitle, { fontSize: responsiveFont(8) }]}>
            {migrationMode
              ? 'TRIAL ELIGIBILITY IS CHECKED IN GOOGLE PLAY'
              : '7 DAYS FREE ON EITHER BILLING OPTION'}
          </Text>
          <Text style={[styles.checkoutBannerBody, { fontSize: responsiveFont(12) }]}>
            {beforeAccount
              ? 'Choose a plan first. Google Play must confirm the subscription before KeepFlip creates your account session. Your account details come next.'
              : 'Choose a plan now. After your KeepFlip account is created, the selected plan opens its Google Play signup sheet right here.'}
          </Text>
        </View>
      </View>

      <View style={styles.checkoutBillingSection}>
        <Text style={[styles.checkoutBillingLabel, { fontSize: responsiveFont(7) }]}>BILLING</Text>
        <View
          accessibilityLabel="Billing frequency"
          style={styles.checkoutBillingToggle}>
          {(['monthly', 'annual'] as KeepFlipBillingCadence[]).map((option) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: cadence === option }}
              key={option}
              onPress={() => {
                if (cadence === option) return;
                hapticSelection();
                onChange({ ...value, cadence: option });
              }}
              style={[
                styles.checkoutBillingOption,
                cadence === option && styles.checkoutBillingOptionSelected,
              ]}>
              <Text
                style={[
                  styles.checkoutBillingOptionText,
                  cadence === option && styles.checkoutBillingOptionTextSelected,
                ]}>
                {option === 'monthly' ? 'MONTHLY' : 'ANNUAL'}
              </Text>
              {option === 'annual' ? (
                <Text
                  style={[
                    styles.checkoutBillingOptionSubtext,
                    cadence === option &&
                    styles.checkoutBillingOptionSubtextSelected,
                  ]}>
                  SAVE 2 MONTHS
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.checkoutPlanStack}>
        {KEEPFLIP_PLAN_DEFINITIONS.map((definition) => {
          const selected = value.plan === definition.id;
          const price =
            cadence === 'annual'
              ? definition.annualPriceFallback
              : definition.monthlyPriceFallback;
          const period = cadence === 'annual' ? '/ year' : '/ month';
          const savings =
            cadence === 'annual'
              ? definition.id === 'hobbyist'
                ? 'SAVE $20 / YEAR'
                : 'SAVE $50 / YEAR'
              : null;

          return (
            <Pressable
              accessibilityHint={definition.description}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={definition.id}
              onPress={() => {
                if (selected) return;
                hapticSelection();
                onChange({ ...value, plan: definition.id });
              }}
              style={({ pressed }) => [
                styles.checkoutPlanCard,
                definition.recommended && styles.checkoutPlanCardRecommended,
                selected && styles.checkoutPlanCardSelected,
                pressed && styles.pressed,
              ]}>
              <View style={styles.checkoutPlanTopLine}>
                <View style={styles.checkoutPlanHeading}>
                  <Text style={[styles.checkoutPlanEyebrow, { fontSize: responsiveFont(7) }]}>
                    {definition.eyebrow}
                  </Text>
                  <Text style={[styles.checkoutPlanName, { fontSize: responsiveFont(20) }]}>{definition.name}</Text>
                </View>
                {definition.recommended ? (
                  <View style={styles.checkoutRecommendedBadge}>
                    <Text style={[styles.checkoutRecommendedText, { fontSize: responsiveFont(6) }]}>RECOMMENDED</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.checkoutPriceRow}>
                <Text style={styles.checkoutPrice}>{price}</Text>
                <Text style={styles.checkoutPricePeriod}>{period}</Text>
              </View>
              {savings ? (
                <Text style={styles.checkoutSavingsLine}>{savings}</Text>
              ) : null}

              <View style={styles.checkoutTrialIncludedRow}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="sparkles"
                  size={14}
                />
                <Text style={[styles.checkoutTrialIncludedText, { fontSize: responsiveFont(7) }]}>
                  7-DAY FREE TRIAL INCLUDED
                </Text>
              </View>

              <Text style={[styles.checkoutPlanDescription, { fontSize: responsiveFont(12) }]}>
                {definition.description}
              </Text>
              <View style={styles.checkoutFeatureList}>
                {[...definition.limits, ...definition.features].map((feature) => (
                  <View key={feature} style={styles.checkoutFeatureRow}>
                    <IconSymbol
                      color={theme.colors.scannerCyan}
                      name="checkmark.circle.fill"
                      size={15}
                    />
                    <Text style={[styles.checkoutFeatureText, { fontSize: responsiveFont(11) }]}>{feature}</Text>
                  </View>
                ))}
              </View>

              <View
                style={[
                  styles.checkoutSelectAction,
                  definition.recommended && styles.checkoutSelectActionRecommended,
                  selected && styles.checkoutSelectActionSelected,
                ]}>
                <Text
                  style={[
                    styles.checkoutSelectActionText,
                    definition.recommended &&
                    styles.checkoutSelectActionTextRecommended,
                    selected && styles.checkoutSelectActionTextSelected,
                  ]}>
                  {selected ? 'SELECTED PLAN' : 'SELECT THIS PLAN'}
                </Text>
              </View>
              <Text style={[styles.checkoutAfterTrialText, { fontSize: responsiveFont(9) }]}>
                {price} {cadence === 'annual' ? 'per year' : 'per month'}
                {' '}after any eligible trial. Cancel anytime through Google Play.
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function MigrationNotice() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.migrationNotice}>
      <View style={styles.migrationIcon}>
        <IconSymbol color={theme.colors.scannerCyan} name="sparkles" size={17} />
      </View>
      <View style={styles.migrationCopy}>
        <Text style={[styles.migrationEyebrow, { fontSize: responsiveFont(8) }]}>EXISTING ACCOUNT UPDATE</Text>
        <Text style={[styles.migrationTitle, { fontSize: responsiveFont(15) }]}>KeepFlip is moving to subscriptions.</Text>
        <Text style={[styles.migrationBody, { fontSize: responsiveFont(12) }]}>
          Your existing account stays yours. During this rollout, choose a
          plan below to check eligibility for a one-week store trial and keep your inventory and
          history connected.
        </Text>
      </View>
    </View>
  );
}

export function KeepFlipLaunchAuthScreen({
  accountModeLocked = false,
  initialBuyRules,
  initialMode,
  initialName,
  migrationMode = false,
  onAuthenticated,
  onBack,
}: KeepFlipLaunchAuthScreenProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    createAccount,
    errorMessage,
    isBusy,
    missingKeys,
    retry,
    signIn,
    signUp,
    status,
    user,
  } = useKeepFlipAuth();
  const [mode, setMode] = useState<LaunchAuthMode>(initialMode);
  const [name, setName] = useState(initialName?.trim() ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [selection, setSelection] = useState<AuthSubscriptionSelection>({
    cadence: 'monthly',
    plan: 'serious',
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [preAccountSubscriptionActive, setPreAccountSubscriptionActive] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileSavedForAccount, setProfileSavedForAccount] = useState(true);

  const isPreAccountSignup =
    mode === 'create-account' && !migrationMode && Boolean(initialBuyRules);
  const showPlanSelection = migrationMode || isPreAccountSignup;
  const accountReady =
    mode === 'create-account' &&
    Boolean(createdUserId || (status === 'signed-in' && user?.$id));
  const needsPreAccountSubscription =
    isPreAccountSignup && !preAccountSubscriptionActive && !accountReady;

  useEffect(() => {
    if (!isPreAccountSignup) return;

    let cancelled = false;
    void loadKeepFlipPreAccountSubscriptionAccess()
      .then((access) => {
        if (!cancelled && access?.active) {
          setPreAccountSubscriptionActive(true);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isPreAccountSignup]);

  const submit = async () => {
    if (isBusy || isSubmitting || status === 'setup') return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    setLocalError(null);

    if (!needsPreAccountSubscription && (mode === 'sign-in' || !accountReady)) {
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        setLocalError('Enter a valid email address.');
        return;
      }
      if (password.length < 8) {
        setLocalError('Your password must contain at least 8 characters.');
        return;
      }
    }

    if (
      !needsPreAccountSubscription &&
      mode === 'create-account' &&
      !accountReady
    ) {
      if (normalizedName.length < 2) {
        setLocalError('Flip still needs the name you want shown on your account.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('The passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (needsPreAccountSubscription) {
        const access = await purchaseKeepFlipPlanBeforeAccount(
          selection.plan,
          selection.cadence,
        );
        if (!access.active) {
          throw new Error(
            'KeepFlip could not confirm an active subscription from Google Play. Try again or restore purchases.',
          );
        }

        setPreAccountSubscriptionActive(true);
        setLocalError(null);
        return;
      }

      if (mode === 'sign-in') {
        await signIn(normalizedEmail, password);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        onAuthenticated?.(selection);
        return;
      }

      let accountUserId =
        createdUserId || (status === 'signed-in' ? user?.$id ?? null : null);
      let profileSaved = profileSavedForAccount;

      if (isPreAccountSignup) {
        if (!preAccountSubscriptionActive) {
          throw new Error(
            'Complete the Google Play subscription before creating your KeepFlip session.',
          );
        }

        if (!accountUserId) {
          const createdUser = await createAccount(
            normalizedName,
            normalizedEmail,
            password,
          );
          accountUserId = createdUser.$id;
          setCreatedUserId(accountUserId);
        }

        // Linking occurs before signIn(). If linking or sign-in fails, the
        // account remains sessionless and the same screen can retry safely.
        await linkKeepFlipPreAccountPurchase(accountUserId);
        if (status !== 'signed-in') {
          await signIn(normalizedEmail, password);
        }

        const { account } = getAppwriteCoreServices();
        const currentUser = await account.get();
        if (initialBuyRules) {
          try {
            await completeScanInventoryWalkthrough(
              accountUserId,
              currentUser.name || normalizedName,
              initialBuyRules,
            );
          } catch (error) {
            profileSaved = false;
            setProfileSavedForAccount(false);
            if (__DEV__) {
              console.warn(
                '[KeepFlip][Onboarding] Seller setup could not be saved after account creation:',
                error,
              );
            }
          }
        }
      } else {
        if (!accountUserId) {
          await signUp(normalizedName, normalizedEmail, password);
          const { account } = getAppwriteCoreServices();
          const currentUser = await account.get();
          accountUserId = currentUser.$id;
          setCreatedUserId(accountUserId);

          if (initialBuyRules) {
            try {
              await completeScanInventoryWalkthrough(
                accountUserId,
                currentUser.name || normalizedName,
                initialBuyRules,
              );
            } catch (error) {
              profileSaved = false;
              setProfileSavedForAccount(false);
              if (__DEV__) {
                console.warn(
                  '[KeepFlip][Onboarding] Seller setup could not be saved after account creation:',
                  error,
                );
              }
            }
          }
        }

        const access = await purchaseKeepFlipPlan(
          accountUserId,
          selection.plan,
          selection.cadence,
        );
        if (!access.active) {
          throw new Error(
            'KeepFlip could not confirm the subscription after the store purchase. Try again or restore purchases.',
          );
        }
      }

      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      onAuthenticated?.({ ...selection, profileSaved });
    } catch (error) {
      const wasCancelled =
        Boolean(
          error &&
          typeof error === 'object' &&
          'userCancelled' in error &&
          (error as { userCancelled?: unknown }).userCancelled === true,
        );
      setLocalError(
        wasCancelled
          ? needsPreAccountSubscription
            ? 'The Google Play signup was canceled. No KeepFlip account or session was created.'
            : 'The Google Play signup was canceled. Your KeepFlip account is ready; choose a plan and try again.'
          : error instanceof Error
            ? error.message
            : 'KeepFlip could not complete authentication and subscription signup. Please try again.',
      );
      if (!wasCancelled) {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error,
        ).catch(() => undefined);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = localError ?? (status === 'error' ? errorMessage : null);
  const setupRequired = status === 'setup';

  return (
    <KeepFlipBackground>
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content,
          { paddingBottom: insets.bottom + 30, paddingTop: insets.top + 15 }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
          style={{marginTop: insets.top, marginBottom: insets.bottom}}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            {onBack ? (
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={onBack}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <IconSymbol color={theme.colors.goldBright} name="chevron.left" size={18} />
                <Text style={[styles.backButtonText, { fontSize: responsiveFont(9) }]}>BACK</Text>
              </Pressable>
            ) : null}
            <View style={styles.brandMark}>
              <Image
                accessibilityLabel="KeepFlip logo"
                contentFit="contain"
                source={require('@/assets/images/icon3.png')}
                style={styles.brandLogo}
              />
            </View>
          </View>

          <View style={styles.brandSection}>
            <Text style={[styles.brandEyebrow, { fontSize: responsiveFont(9) }]}>KEEPFLIP / SECURE ACCESS</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(31) }]}>
              {migrationMode ? 'Welcome back.' : mode === 'create-account' ? 'Make your edge official.' : 'Welcome back.'}
            </Text>
            <Text style={[styles.subtitle, { fontSize: responsiveFont(13) }]}>
              {migrationMode
                ? 'Sign in to your existing KeepFlip account, then choose the tier you want to try.'
                : isPreAccountSignup
                  ? 'Choose and activate your Google Play subscription first. Only then will Flip ask for the login details that create your KeepFlip session.'
                : mode === 'create-account'
                  ? 'Flip has your seller setup. Add your login details and choose how you want KeepFlip to work for you.'
                  : 'Sign in to continue to your KeepFlip command center.'}
            </Text>
          </View>

          <View style={styles.panel}>
            {migrationMode ? <MigrationNotice /> : null}

            {mode === 'create-account' && initialName ? (
              <View style={styles.flipNameRow}>
                <FlipCompanion size={43} />
                <Text style={[styles.flipNameText, { fontSize: responsiveFont(13) }]}>Flip will know you as {initialName}.</Text>
              </View>
            ) : null}

            {showPlanSelection ? (
              <PlanSelection
                beforeAccount={isPreAccountSignup}
                migrationMode={migrationMode}
                value={selection}
                onChange={setSelection}
              />
            ) : null}

            {setupRequired ? (
              <View style={styles.setupNotice}>
                <Text style={[styles.setupTitle, { fontSize: responsiveFont(8) }]}>APPWRITE SETUP REQUIRED</Text>
                <Text style={[styles.setupBody, { fontSize: responsiveFont(11) }]}>Add the public Appwrite connection values, then restart this build.</Text>
                {missingKeys.map((key) => <Text key={key} style={styles.setupKey}>{key}</Text>)}
              </View>
            ) : null}

            {displayedError ? (
              <View accessibilityLiveRegion="polite" style={styles.errorNotice}>
                <Text selectable style={[styles.errorText, { fontSize: responsiveFont(12) }]}>{displayedError}</Text>
                {status === 'error' ? (
                  <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void retry()} style={styles.retryButton}>
                    <Text style={[styles.retryText, { fontSize: responsiveFont(9) }]}>RETRY CONNECTION</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {!accountModeLocked ? (
              <View style={styles.modeSwitch}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === 'sign-in' }}
                  disabled={isBusy}
                  onPress={() => setMode('sign-in')}
                  style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}>
                  <Text style={[styles.modeText, mode === 'sign-in' && styles.modeTextActive]}>SIGN IN</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === 'create-account' }}
                  disabled={isBusy}
                  onPress={() => setMode('create-account')}
                  style={[styles.modeButton, mode === 'create-account' && styles.modeButtonActive]}>
                  <Text style={[styles.modeText, mode === 'create-account' && styles.modeTextActive]}>CREATE ACCOUNT</Text>
                </Pressable>
              </View>
            ) : null}

            {!accountReady && !needsPreAccountSubscription ? (
              <View style={styles.form}>
                {mode === 'create-account' && !initialName ? (
                  <AuthField
                    autoCapitalize="words"
                    autoComplete="name"
                    editable={!isBusy && !setupRequired}
                    icon="person.fill"
                    label="Display name"
                    onChangeText={(value) => { setName(value); setLocalError(null); }}
                    placeholder="Your name"
                    textContentType="name"
                    value={name}
                  />
                ) : null}
                <AuthField
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!isBusy && !setupRequired}
                  icon="envelope.fill"
                  inputMode="email"
                  keyboardType="email-address"
                  label="Email"
                  onChangeText={(value) => { setEmail(value); setLocalError(null); }}
                  placeholder="you@example.com"
                  textContentType="emailAddress"
                  value={email}
                />
                <AuthField
                  autoCapitalize="none"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  editable={!isBusy && !setupRequired}
                  icon="lock.fill"
                  label="Password"
                  onChangeText={(value) => { setPassword(value); setLocalError(null); }}
                  onToggleSecure={() => setPasswordVisible((current) => !current)}
                  placeholder="At least 8 characters"
                  secureTextEntry={!passwordVisible}
                  secureVisible={passwordVisible}
                  textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
                  value={password}
                />
                {mode === 'create-account' ? (
                  <AuthField
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isBusy && !setupRequired}
                    icon="checkmark.shield.fill"
                    label="Confirm password"
                    onChangeText={(value) => { setConfirmPassword(value); setLocalError(null); }}
                    onToggleSecure={() => setConfirmPasswordVisible((current) => !current)}
                    placeholder="Repeat your password"
                    secureTextEntry={!confirmPasswordVisible}
                    secureVisible={confirmPasswordVisible}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.accountReadyNotice}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="checkmark.shield.fill"
                  size={18}
                />
                <Text style={[styles.accountReadyText, { fontSize: responsiveFont(12) }]}>
                  {isPreAccountSignup
                    ? 'Your subscription is active. Finish the secure sign-in step to open KeepFlip.'
                    : 'Your KeepFlip account is ready. Continue to open Google Play for the selected plan.'}
                </Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isBusy || isSubmitting, disabled: isBusy || isSubmitting || setupRequired }}
              disabled={isBusy || isSubmitting || setupRequired}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.submitButton, (isBusy || isSubmitting || setupRequired) && styles.buttonDisabled, pressed && styles.pressed]}>
              {isBusy || isSubmitting ? (
                <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
              ) : (
                <>
                  <Text style={[styles.submitText, { fontSize: responsiveFont(11) }]}>
                    {mode === 'sign-in'
                      ? 'ENTER KEEPFLIP'
                      : needsPreAccountSubscription
                        ? 'CONTINUE TO GOOGLE PLAY'
                        : isPreAccountSignup
                          ? 'CREATE ACCOUNT & ENTER KEEPFLIP'
                          : accountReady
                            ? 'START SELECTED PLAN'
                            : 'CREATE ACCOUNT & START TRIAL'}
                  </Text>
                  <IconSymbol color={theme.colors.backgroundDeep} name="arrow.right" size={19} />
                </>
              )}
            </Pressable>

            {mode === 'create-account' ? (
              <Text style={[styles.legalText, { fontSize: responsiveFont(10) }]}>
                By creating an account, you agree to KeepFlip&apos;s{' '}
                <Text onPress={() => router.push('/terms')} style={styles.legalLink}>Terms of Service</Text>{' '}and{' '}<Text onPress={() => router.push('/privacy')} style={styles.legalLink}>Privacy Policy</Text>.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    backButton: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 40, paddingHorizontal: 4 },
    backButtonText: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 1 },
    billingOption: { alignItems: 'center', borderRadius: 10, flex: 1, gap: 2, justifyContent: 'center', minHeight: 44 },
    billingOptionSelected: { backgroundColor: 'rgba(215, 168, 74, 0.16)', borderColor: 'rgba(242, 211, 138, 0.4)', borderWidth: StyleSheet.hairlineWidth },
    billingOptionSubtext: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 0.55 },
    billingOptionText: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 0.9 },
    billingOptionTextSelected: { color: theme.colors.goldBright },
    billingToggle: { backgroundColor: 'rgba(1, 1, 2, 0.72)', borderColor: 'rgba(242, 237, 228, 0.14)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 4, padding: 4 },
    brandEyebrow: { color: theme.colors.gold, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 1.3 },
    brandLogo: { height: 52, width: 52 },
    brandMark: { alignItems: 'center', backgroundColor: 'rgba(5, 4, 5, 0.65)', borderColor: 'rgba(224, 172, 75, 0.25)', borderRadius: 28, borderWidth: 1, height: 60, justifyContent: 'center', width: 60 },
    brandSection: { alignItems: 'center', gap: 8, paddingHorizontal: 10 },
    buttonDisabled: { opacity: 0.42 },
    content: { alignItems: 'center', gap: 20, paddingHorizontal: 16 },
    errorNotice: { backgroundColor: 'rgba(232, 97, 88, 0.08)', borderColor: 'rgba(232, 97, 88, 0.42)', borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 },
    errorText: { color: '#FFB8B1', fontSize: 12, lineHeight: 18 },
    fieldGroup: { gap: 7 },
    fieldInput: { color: theme.colors.text, flex: 1, fontSize: 15, minWidth: 0, paddingVertical: 13 },
    fieldLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
    fieldShell: { alignItems: 'center', backgroundColor: 'rgba(2, 2, 4, 0.82)', borderColor: 'rgba(242, 211, 138, 0.16)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 15 },
    flex: { flex: 1 },
    flipImage: { height: 43, width: 43 },
    flipNameRow: { alignItems: 'center', backgroundColor: 'rgba(141, 114, 255, 0.09)', borderColor: 'rgba(141, 114, 255, 0.28)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 },
    flipNameText: { color: theme.colors.cream, flex: 1, fontSize: 13, lineHeight: 19 },
    form: { gap: 14 },
    headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    legalLink: { color: theme.colors.goldBright, fontWeight: '800', textDecorationLine: 'underline' },
    legalText: { color: theme.colors.textMuted, lineHeight: 16, textAlign: 'center' },
    migrationBody: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
    migrationCopy: { flex: 1, gap: 4 },
    migrationEyebrow: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1 },
    migrationIcon: { alignItems: 'center', backgroundColor: 'rgba(0, 255, 255, 0.08)', borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
    migrationNotice: { backgroundColor: 'rgba(0, 255, 255, 0.055)', borderColor: 'rgba(0, 255, 255, 0.24)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
    migrationTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 15, lineHeight: 20 },
    modeButton: { alignItems: 'center', borderRadius: 999, flex: 1, justifyContent: 'center', minHeight: 42 },
    modeButtonActive: { backgroundColor: 'rgba(215, 168, 74, 0.16)' },
    modeSwitch: { backgroundColor: 'rgba(1, 1, 2, 0.68)', borderColor: 'rgba(242, 211, 138, 0.13)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, padding: 4 },
    modeText: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    modeTextActive: { color: theme.colors.goldBright },
    panel: { backgroundColor: 'rgba(8, 8, 12, 0.93)', borderColor: 'rgba(224, 172, 75, 0.34)', borderRadius: 24, borderWidth: 1, gap: 16, maxWidth: 620, padding: 17, width: '100%' },
    planList: { gap: 9 },
    planOption: { backgroundColor: 'rgba(255, 255, 255, 0.035)', borderColor: 'rgba(242, 237, 228, 0.14)', borderRadius: 15, borderWidth: 1, gap: 7, padding: 12 },
    planTrial: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 0.8 },
    planOptionDescription: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
    planOptionEyebrow: { color: theme.colors.gold, fontFamily: theme.fonts.radar, fontSize: 7, letterSpacing: 1.05 },
    planOptionName: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 17 },
    planOptionSelected: { backgroundColor: 'rgba(0, 255, 255, 0.075)', borderColor: 'rgba(0, 255, 255, 0.62)' },
    planOptionTopLine: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    planOptionCopy: { flex: 1, gap: 2 },
    planPeriod: { color: theme.colors.textMuted, fontSize: 10 },
    planPrice: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 24 },
    planPriceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
    planRadio: { alignItems: 'center', borderColor: 'rgba(242, 237, 228, 0.35)', borderRadius: 999, borderWidth: 1, height: 19, justifyContent: 'center', width: 19 },
    planRadioCore: { backgroundColor: theme.colors.scannerCyan, borderRadius: 999, height: 9, width: 9 },
    planRadioSelected: { borderColor: theme.colors.scannerCyan },
    planSection: { gap: 10 },
    planSectionBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
    planSectionCopy: { flex: 1, gap: 2 },
    planSectionEyebrow: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.05 },
    planSectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
    planSectionIcon: { alignItems: 'center', backgroundColor: 'rgba(0, 255, 255, 0.08)', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
    planSectionTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 16 },
    pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
    retryButton: { alignSelf: 'flex-start', borderColor: 'rgba(224, 172, 75, 0.34)', borderRadius: 999, borderWidth: 1, minHeight: 38, paddingHorizontal: 11, paddingVertical: 8 },
    retryText: { color: theme.colors.scannerAmber, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 0.8 },
    setupBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
    setupKey: { color: theme.colors.goldBright, fontSize: 10, fontWeight: '700' },
    setupNotice: { backgroundColor: 'rgba(141, 114, 255, 0.075)', borderColor: 'rgba(141, 114, 255, 0.36)', borderRadius: 12, borderWidth: 1, gap: 6, padding: 12 },
    setupTitle: { color: theme.colors.scannerViolet, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1.05 },
    subtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, maxWidth: 470, textAlign: 'center' },
    submitButton: { alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 15, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 55 },
    submitText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.85 },
    title: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 31, letterSpacing: -0.6, textAlign: 'center' },
    accountReadyNotice: { alignItems: 'center', backgroundColor: 'rgba(0, 255, 255, 0.055)', borderColor: 'rgba(0, 255, 255, 0.24)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, padding: 12 },
    accountReadyText: { color: theme.colors.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
    checkoutAfterTrialText: { color: 'rgba(173, 167, 178, 0.76)', fontSize: 9, lineHeight: 13, textAlign: 'center' },
    checkoutBanner: { alignItems: 'center', backgroundColor: 'rgba(0, 255, 255, 0.055)', borderColor: 'rgba(0, 255, 255, 0.24)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, padding: 13 },
    checkoutBannerBody: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
    checkoutBannerCopy: { flex: 1, gap: 3 },
    checkoutBannerIcon: { alignItems: 'center', backgroundColor: 'rgba(0, 255, 255, 0.08)', borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
    checkoutBannerTitle: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, fontWeight: '900', letterSpacing: 0.95 },
    checkoutBillingLabel: { color: theme.colors.gold, fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: '900', letterSpacing: 1.1, paddingHorizontal: 2 },
    checkoutBillingOption: { alignItems: 'center', borderRadius: 9, flex: 1, gap: 1, justifyContent: 'center', minHeight: 45, paddingHorizontal: 10 },
    checkoutBillingOptionSelected: { backgroundColor: 'rgba(215, 168, 74, 0.14)', borderColor: 'rgba(242, 211, 138, 0.42)', borderWidth: StyleSheet.hairlineWidth },
    checkoutBillingOptionSubtext: { color: 'rgba(173, 167, 178, 0.66)', fontSize: 7, fontWeight: '800', letterSpacing: 0.45 },
    checkoutBillingOptionSubtextSelected: { color: theme.colors.scannerCyan },
    checkoutBillingOptionText: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 8, fontWeight: '900', letterSpacing: 0.85 },
    checkoutBillingOptionTextSelected: { color: theme.colors.goldBright },
    checkoutBillingSection: { gap: 7 },
    checkoutBillingToggle: { backgroundColor: 'rgba(8, 8, 12, 0.92)', borderColor: 'rgba(242, 237, 228, 0.14)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 4, padding: 4 },
    checkoutFeatureList: { gap: 7 },
    checkoutFeatureRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    checkoutFeatureText: { color: theme.colors.text, flex: 1, fontSize: 11, lineHeight: 15 },
    checkoutPlanCard: { backgroundColor: 'rgba(8, 8, 12, 0.92)', borderColor: 'rgba(242, 237, 228, 0.15)', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, gap: 11, padding: 15 },
    checkoutPlanCardRecommended: { borderColor: 'rgba(0, 255, 255, 0.42)', shadowColor: theme.colors.scannerCyan, shadowOpacity: 0.09, shadowRadius: 20 },
    checkoutPlanCardSelected: { borderColor: 'rgba(141, 114, 255, 0.72)', backgroundColor: 'rgba(141, 114, 255, 0.06)' },
    checkoutPlanDescription: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
    checkoutPlanEyebrow: { color: theme.colors.gold, fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: '900', letterSpacing: 1.15 },
    checkoutPlanHeading: { flex: 1, gap: 2 },
    checkoutPlanName: { color: theme.colors.cream, fontSize: 20, fontWeight: '900' },
    checkoutPlanStack: { gap: 12 },
    checkoutPlanTopLine: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
    checkoutPrice: { color: theme.colors.cream, fontSize: 27, fontVariant: ['tabular-nums'], fontWeight: '900' },
    checkoutPricePeriod: { color: theme.colors.textMuted, fontSize: 11 },
    checkoutPriceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
    checkoutRecommendedBadge: { backgroundColor: theme.colors.scannerCyan, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
    checkoutRecommendedText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.radar, fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
    checkoutSavingsLine: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: '900', letterSpacing: 0.75, marginTop: -6 },
    checkoutSection: { gap: 14 },
    checkoutSelectAction: { alignItems: 'center', borderColor: 'rgba(0, 255, 255, 0.34)', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 46 },
    checkoutSelectActionRecommended: { borderColor: theme.colors.scannerCyan },
    checkoutSelectActionSelected: { backgroundColor: 'rgba(141, 114, 255, 0.16)', borderColor: 'rgba(141, 114, 255, 0.62)' },
    checkoutSelectActionText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 8, fontWeight: '900', letterSpacing: 0.85 },
    checkoutSelectActionTextRecommended: { color: theme.colors.scannerCyan },
    checkoutSelectActionTextSelected: { color: theme.colors.cream },
    checkoutTrialIncludedRow: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(0, 255, 255, 0.055)', borderColor: 'rgba(0, 255, 255, 0.2)', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 6 },
    checkoutTrialIncludedText: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
    visibilityButton: { alignItems: 'center', borderRadius: 999, height: 36, justifyContent: 'center', width: 36 },
  });
  return {
    ...staticStyles,
    backButtonText: [
      staticStyles.backButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    billingOptionSubtext: [
      staticStyles.billingOptionSubtext,
      {
        fontSize: responsiveFont(7),
      },
    ],
    billingOptionText: [
      staticStyles.billingOptionText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    brandEyebrow: [
      staticStyles.brandEyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    brandLogo: [
      staticStyles.brandLogo,
      {
        height: responsiveHeight(52),
        width: responsiveWidth(52),
      },
    ],
    brandMark: [
      staticStyles.brandMark,
      {
        height: responsiveHeight(60),
        width: responsiveWidth(60),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    fieldInput: [
      staticStyles.fieldInput,
      {
        fontSize: responsiveFont(15),
      },
    ],
    fieldLabel: [
      staticStyles.fieldLabel,
      {
        fontSize: responsiveFont(10),
      },
    ],
    flipImage: [
      staticStyles.flipImage,
      {
        height: responsiveHeight(43),
        width: responsiveWidth(43),
      },
    ],
    flipNameText: [
      staticStyles.flipNameText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    legalText: [
      staticStyles.legalText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    migrationBody: [
      staticStyles.migrationBody,
      {
        fontSize: responsiveFont(12),
      },
    ],
    migrationEyebrow: [
      staticStyles.migrationEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    migrationIcon: [
      staticStyles.migrationIcon,
      {
        height: responsiveHeight(36),
        width: responsiveWidth(36),
      },
    ],
    migrationTitle: [
      staticStyles.migrationTitle,
      {
        fontSize: responsiveFont(15),
      },
    ],
    modeText: [
      staticStyles.modeText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    planTrial: [
      staticStyles.planTrial,
      {
        fontSize: responsiveFont(8),
      },
    ],
    planOptionDescription: [
      staticStyles.planOptionDescription,
      {
        fontSize: responsiveFont(11),
      },
    ],
    planOptionEyebrow: [
      staticStyles.planOptionEyebrow,
      {
        fontSize: responsiveFont(7),
      },
    ],
    planOptionName: [
      staticStyles.planOptionName,
      {
        fontSize: responsiveFont(17),
      },
    ],
    planPeriod: [
      staticStyles.planPeriod,
      {
        fontSize: responsiveFont(10),
      },
    ],
    planPrice: [
      staticStyles.planPrice,
      {
        fontSize: responsiveFont(24),
      },
    ],
    planRadio: [
      staticStyles.planRadio,
      {
        height: responsiveHeight(19),
        width: responsiveWidth(19),
      },
    ],
    planRadioCore: [
      staticStyles.planRadioCore,
      {
        height: responsiveHeight(9),
        width: responsiveWidth(9),
      },
    ],
    planSectionBody: [
      staticStyles.planSectionBody,
      {
        fontSize: responsiveFont(11),
      },
    ],
    planSectionEyebrow: [
      staticStyles.planSectionEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    planSectionIcon: [
      staticStyles.planSectionIcon,
      {
        height: responsiveHeight(34),
        width: responsiveWidth(34),
      },
    ],
    planSectionTitle: [
      staticStyles.planSectionTitle,
      {
        fontSize: responsiveFont(16),
      },
    ],
    retryText: [
      staticStyles.retryText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    setupBody: [
      staticStyles.setupBody,
      {
        fontSize: responsiveFont(11),
      },
    ],
    setupKey: [
      staticStyles.setupKey,
      {
        fontSize: responsiveFont(10),
      },
    ],
    setupTitle: [
      staticStyles.setupTitle,
      {
        fontSize: responsiveFont(8),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    submitText: [
      staticStyles.submitText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(31),
      },
    ],
    accountReadyText: [
      staticStyles.accountReadyText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    checkoutAfterTrialText: [
      staticStyles.checkoutAfterTrialText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    checkoutBannerBody: [
      staticStyles.checkoutBannerBody,
      {
        fontSize: responsiveFont(12),
      },
    ],
    checkoutBannerIcon: [
      staticStyles.checkoutBannerIcon,
      {
        height: responsiveHeight(40),
        width: responsiveWidth(40),
      },
    ],
    checkoutBannerTitle: [
      staticStyles.checkoutBannerTitle,
      {
        fontSize: responsiveFont(8),
      },
    ],
    checkoutBillingLabel: [
      staticStyles.checkoutBillingLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    checkoutBillingOptionSubtext: [
      staticStyles.checkoutBillingOptionSubtext,
      {
        fontSize: responsiveFont(7),
      },
    ],
    checkoutBillingOptionText: [
      staticStyles.checkoutBillingOptionText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    checkoutFeatureText: [
      staticStyles.checkoutFeatureText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    checkoutPlanDescription: [
      staticStyles.checkoutPlanDescription,
      {
        fontSize: responsiveFont(12),
      },
    ],
    checkoutPlanEyebrow: [
      staticStyles.checkoutPlanEyebrow,
      {
        fontSize: responsiveFont(7),
      },
    ],
    checkoutPlanName: [
      staticStyles.checkoutPlanName,
      {
        fontSize: responsiveFont(20),
      },
    ],
    checkoutPrice: [
      staticStyles.checkoutPrice,
      {
        fontSize: responsiveFont(27),
      },
    ],
    checkoutPricePeriod: [
      staticStyles.checkoutPricePeriod,
      {
        fontSize: responsiveFont(11),
      },
    ],
    checkoutRecommendedText: [
      staticStyles.checkoutRecommendedText,
      {
        fontSize: responsiveFont(6),
      },
    ],
    checkoutSavingsLine: [
      staticStyles.checkoutSavingsLine,
      {
        fontSize: responsiveFont(7),
      },
    ],
    checkoutSelectActionText: [
      staticStyles.checkoutSelectActionText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    checkoutTrialIncludedText: [
      staticStyles.checkoutTrialIncludedText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    visibilityButton: [
      staticStyles.visibilityButton,
      {
        height: responsiveHeight(36),
        width: responsiveWidth(36),
      },
    ],
  };
}
