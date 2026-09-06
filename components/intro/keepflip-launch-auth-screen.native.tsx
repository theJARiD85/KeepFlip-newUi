import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  useState,
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
  KEEPFLIP_PLAN_DEFINITIONS,
  type KeepFlipBillingCadence,
  type KeepFlipPlanId,
} from '@/services/keepflip-subscription-service';
import { completeScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';
import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';
import { getAppwriteCoreServices } from '@/lib/appwrite';

export type AuthSubscriptionSelection = {
  cadence: KeepFlipBillingCadence;
  plan: KeepFlipPlanId;
  profileSaved?: boolean;
};

type LaunchAuthMode = 'sign-in' | 'create-account';

type KeepFlipLaunchAuthScreenProps = {
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
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
  value,
  onChange,
}: {
  value: AuthSubscriptionSelection;
  onChange: (next: AuthSubscriptionSelection) => void;
}) {
  const cadence = value.cadence;

  return (
    <View style={styles.planSection}>
      <View style={styles.planSectionHeading}>
        <View style={styles.planSectionIcon}>
          <IconSymbol color={theme.colors.scannerCyan} name="sparkles" size={17} />
        </View>
        <View style={styles.planSectionCopy}>
          <Text style={styles.planSectionEyebrow}>CHOOSE YOUR KEEPFLIP PLAN</Text>
          <Text style={styles.planSectionTitle}>Every tier includes a free trial.</Text>
        </View>
      </View>

      <Text style={styles.planSectionBody}>
        Your choice is saved with account setup. The store checkout appears
        after your login is created.
      </Text>

      <View accessibilityLabel="Billing frequency" style={styles.billingToggle}>
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
            style={[styles.billingOption, cadence === option && styles.billingOptionSelected]}>
            <Text style={[styles.billingOptionText, cadence === option && styles.billingOptionTextSelected]}>
              {option === 'monthly' ? 'MONTHLY' : 'ANNUAL'}
            </Text>
            {option === 'annual' ? (
              <Text style={styles.billingOptionSubtext}>SAVE 2 MONTHS</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.planList}>
        {KEEPFLIP_PLAN_DEFINITIONS.map((definition) => {
          const selected = value.plan === definition.id;
          const price = cadence === 'annual'
            ? definition.annualPriceFallback
            : definition.monthlyPriceFallback;
          const period = cadence === 'annual' ? '/ year' : '/ month';

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
                styles.planOption,
                selected && styles.planOptionSelected,
                pressed && styles.pressed,
              ]}>
              <View style={styles.planOptionTopLine}>
                <View style={styles.planOptionCopy}>
                  <Text style={styles.planOptionEyebrow}>{definition.eyebrow}</Text>
                  <Text style={styles.planOptionName}>{definition.name}</Text>
                </View>
                <View style={[styles.planRadio, selected && styles.planRadioSelected]}>
                  {selected ? <View style={styles.planRadioCore} /> : null}
                </View>
              </View>
              <View style={styles.planPriceRow}>
                <Text style={styles.planPrice}>{price}</Text>
                <Text style={styles.planPeriod}>{period}</Text>
              </View>
              <Text style={styles.planTrial}>7-DAY FREE TRIAL INCLUDED</Text>
              <Text style={styles.planOptionDescription}>{definition.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MigrationNotice() {
  return (
    <View style={styles.migrationNotice}>
      <View style={styles.migrationIcon}>
        <IconSymbol color={theme.colors.scannerCyan} name="sparkles" size={17} />
      </View>
      <View style={styles.migrationCopy}>
        <Text style={styles.migrationEyebrow}>EXISTING ACCOUNT UPDATE</Text>
        <Text style={styles.migrationTitle}>KeepFlip is moving to subscriptions.</Text>
        <Text style={styles.migrationBody}>
          Your existing account stays yours. During this rollout, choose a
          plan below to start your one-week trial and keep your inventory and
          history connected.
        </Text>
      </View>
    </View>
  );
}

export function KeepFlipLaunchAuthScreen({
  initialBuyRules,
  initialMode,
  initialName,
  migrationMode = false,
  onAuthenticated,
  onBack,
}: KeepFlipLaunchAuthScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    errorMessage,
    isBusy,
    missingKeys,
    retry,
    signIn,
    signUp,
    status,
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

  const showPlanSelection = mode === 'create-account' || migrationMode;

  const submit = async () => {
    if (isBusy || status === 'setup') return;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    setLocalError(null);

    if (mode === 'create-account' && normalizedName.length < 2) {
      setLocalError('Flip still needs the name you want shown on your account.');
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setLocalError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Your password must contain at least 8 characters.');
      return;
    }
    if (mode === 'create-account' && password !== confirmPassword) {
      setLocalError('The passwords do not match.');
      return;
    }

    try {
      let profileSaved = true;
      if (mode === 'sign-in') {
        await signIn(normalizedEmail, password);
      } else {
        await signUp(normalizedName, normalizedEmail, password);
        if (initialBuyRules) {
          try {
            const { account } = getAppwriteCoreServices();
            const currentUser = await account.get();
            await completeScanInventoryWalkthrough(
              currentUser.$id,
              currentUser.name || normalizedName,
              initialBuyRules,
            );
          } catch (error) {
            profileSaved = false;
            if (__DEV__) {
              console.warn('[KeepFlip][Onboarding] Seller setup could not be saved after account creation:', error);
            }
          }
        }
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      onAuthenticated?.({ ...selection, ...(mode === 'create-account' ? { profileSaved } : {}) });
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not complete authentication. Please try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
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
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28, paddingTop: insets.top + 12 },
          ]}
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
                <Text style={styles.backButtonText}>BACK</Text>
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
            <Text style={styles.brandEyebrow}>KEEPFLIP / SECURE ACCESS</Text>
            <Text style={styles.title}>
              {migrationMode ? 'Welcome back.' : mode === 'create-account' ? 'Make your edge official.' : 'Welcome back.'}
            </Text>
            <Text style={styles.subtitle}>
              {migrationMode
                ? 'Sign in to your existing KeepFlip account, then choose the tier you want to try.'
                : mode === 'create-account'
                  ? 'Flip has your seller setup. Add your login details and choose how you want KeepFlip to work for you.'
                  : 'Sign in to continue to your KeepFlip command center.'}
            </Text>
          </View>

          <View style={styles.panel}>
            {migrationMode ? <MigrationNotice /> : null}

            {mode === 'create-account' && initialName ? (
              <View style={styles.flipNameRow}>
                <Image
                  accessibilityLabel="Flip"
                  contentFit="contain"
                  source={require('@/assets/images/flip-mascot.png')}
                  style={styles.flipImage}
                />
                <Text style={styles.flipNameText}>Flip will know you as {initialName}.</Text>
              </View>
            ) : null}

            {showPlanSelection ? (
              <PlanSelection value={selection} onChange={setSelection} />
            ) : null}

            {setupRequired ? (
              <View style={styles.setupNotice}>
                <Text style={styles.setupTitle}>APPWRITE SETUP REQUIRED</Text>
                <Text style={styles.setupBody}>Add the public Appwrite connection values, then restart this build.</Text>
                {missingKeys.map((key) => <Text key={key} style={styles.setupKey}>{key}</Text>)}
              </View>
            ) : null}

            {displayedError ? (
              <View accessibilityLiveRegion="polite" style={styles.errorNotice}>
                <Text selectable style={styles.errorText}>{displayedError}</Text>
                {status === 'error' ? (
                  <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void retry()} style={styles.retryButton}>
                    <Text style={styles.retryText}>RETRY CONNECTION</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isBusy, disabled: isBusy || setupRequired }}
              disabled={isBusy || setupRequired}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.submitButton, (isBusy || setupRequired) && styles.buttonDisabled, pressed && styles.pressed]}>
              {isBusy ? (
                <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
              ) : (
                <>
                  <Text style={styles.submitText}>{mode === 'sign-in' ? 'ENTER KEEPFLIP' : 'CREATE SECURE ACCOUNT'}</Text>
                  <IconSymbol color={theme.colors.backgroundDeep} name="arrow.right" size={19} />
                </>
              )}
            </Pressable>

            {mode === 'create-account' ? (
              <Text style={styles.legalText}>
                By creating an account, you agree to KeepFlip&apos;s{' '}
                <Text onPress={() => router.push('/terms')} style={styles.legalLink}>Terms of Service</Text>{' '}and{' '}
                <Text onPress={() => router.push('/privacy')} style={styles.legalLink}>Privacy Policy</Text>.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
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
  legalText: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
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
  visibilityButton: { alignItems: 'center', borderRadius: 999, height: 36, justifyContent: 'center', width: 36 },
});
