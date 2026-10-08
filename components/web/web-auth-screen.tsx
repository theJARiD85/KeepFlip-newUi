import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { FacebookSignInButton } from '@/components/auth/facebook-sign-in-button';
import { KeepFlipMfaChallenge } from '@/components/auth/keepflip-mfa-challenge';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { WebSiteFooter, WebSiteHeader } from '@/components/web/web-site-chrome';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { KEEPFLIP_PUBLIC_COLORS } from '@/constants/keepflip-public-site';
import { getAppwriteCoreServices } from '@/lib/appwrite';
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';
import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';
import { completeScanInventoryWalkthrough } from '@/services/user-profile-onboarding-service';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
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
  const { width, webPageGutter } = useResponsiveLayout();
  const isWide = width >= 900;
  const webContentSizing =
    Platform.OS === 'web'
      ? {
          width: '100%' as const,
          maxWidth: 1560,
          minWidth: 0,
          alignSelf: 'center' as const,
          paddingHorizontal: webPageGutter,
        }
      : undefined;

  const router = useRouter();
  const colors = KEEPFLIP_PUBLIC_COLORS;
  const {
    createAccount,
    errorMessage,
    isBusy,
    missingKeys,
    pendingMfaSignIn,
    signIn,
    status,
  } = useKeepFlipAuth();
  const [name, setName] = useState(initialName?.trim() ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signupAccountPendingRef = useRef(false);
  const signupCompletionTrackedRef = useRef(false);
  const loginCompletionTrackedRef = useRef(false);

  const isCreateAccount = initialMode === 'create-account';
  const submitLabel = isCreateAccount
    ? 'Create free workspace'
    : 'Sign in to KeepFlip';

  const trackAuthenticatedOutcome = useCallback(() => {
    if (isCreateAccount) {
      if (
        !signupAccountPendingRef.current ||
        signupCompletionTrackedRef.current
      ) {
        return;
      }
      signupCompletionTrackedRef.current = true;
      signupAccountPendingRef.current = false;
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.signupCompleted, {
        method: 'email',
        flow: 'free_tier',
      });
      return;
    }

    if (loginCompletionTrackedRef.current) return;
    loginCompletionTrackedRef.current = true;
    trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.loginCompleted, {
      method: 'email',
    });
  }, [isCreateAccount]);

  async function submit() {
    if (isBusy || isSubmitting) return;

    setLocalError(null);
    setIsSubmitting(true);
    try {
      if (isCreateAccount) {
        if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 8) {
          throw new Error('Enter your name, a valid email, and a password with at least 8 characters.');
        }
        let sessionEstablished = false;
        try {
          await createAccount(
            name,
            email,
            password,
          );
          signupAccountPendingRef.current = true;
        } catch (accountError) {
          if (
            accountError instanceof KeepFlipAuthError &&
            accountError.code === 'AUTH_ACCOUNT_EXISTS'
          ) {
            await signIn(email, password);
            sessionEstablished = true;
          } else {
            throw accountError;
          }
        }

        if (!sessionEstablished) await signIn(email, password);
      } else {
        await signIn(email, password);
        trackAuthenticatedOutcome();
      }

      if (isCreateAccount) trackAuthenticatedOutcome();
      await finishAuthenticatedFlow();
    } catch (error) {
      const mfaIsPending =
        error instanceof KeepFlipAuthError &&
        error.code === 'AUTH_MFA_REQUIRED';
      setLocalError(
        mfaIsPending
          ? null
          : error instanceof Error
            ? error.message
            : 'KeepFlip could not complete that request.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function finishAuthenticatedFlow() {
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
  }

  async function finishAfterMfa() {
    trackAuthenticatedOutcome();
    await finishAuthenticatedFlow();
  }

  return (
    <KeepFlipBackground colorScheme="dark">
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, webContentSizing]}
        keyboardShouldPersistTaps="handled"
      >
        <WebSiteHeader
          colorScheme="dark"
          label={isCreateAccount ? 'CREATE RESELLER WORKSPACE' : 'SIGN IN TO KEEPFLIP'}
          showMarketingLinks
        />
        <View style={[styles.authLayout, !isWide && styles.authLayoutNarrow]}>
          {isWide ? (
            <View style={[styles.story, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
              <Text style={[styles.storyEyebrow, { color: colors.goldBright }]}>KEEPFLIP / RESELLER OPERATIONS</Text>
              <Text style={[styles.storyTitle, { color: colors.text }]}>From the find to the sale.</Text>
              <Text style={[styles.storyBody, { color: colors.textMuted }]}>
                Research a possible buy, keep track of the item, and see what you kept after fees.
              </Text>
              <View style={[styles.storySteps, { borderTopColor: colors.divider }]}>
                <StoryStep number="01" title="SOURCE" detail="Research the find" color={colors.goldBright} />
                <StoryStep number="02" title="DECIDE" detail="Count the costs" color={colors.goldBright} />
                <StoryStep number="03" title="TRACK" detail="See what you kept" color={colors.goldBright} />
              </View>
            </View>
          ) : null}
        <View style={[styles.card, isWide && styles.cardWide, !isWide && styles.cardNarrow, width < 480 && styles.cardPhone, { backgroundColor: colors.card, borderColor: colors.divider }]}>
          <Text style={[styles.eyebrow, { color: colors.goldBright }]}>RESELLER OPERATIONS, EVERYWHERE</Text>
          <Text style={[styles.title, { color: colors.text }]}>{isCreateAccount ? "Let's make your account." : 'Welcome back.'}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isCreateAccount
              ? 'Add your name, email, and password. No credit card is required. Your Flip setup and workflow tour begin after you sign in.'
              : 'Use the web workspace for inventory, Books, market research, and assistant planning. Open the Android app when it is time to capture an item.'}
          </Text>

          {onBack && !pendingMfaSignIn ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={[styles.backButtonText, { color: colors.scannerCyan }]}>← BACK TO FLIP SETUP</Text>
            </Pressable>
          ) : null}

          {pendingMfaSignIn ? (
            <KeepFlipMfaChallenge
              onAuthenticated={finishAfterMfa}
              pending={pendingMfaSignIn}
            />
          ) : isCreateAccount ? (
            <Field
              autoCapitalize="words"
              colors={colors}
              label="Your name"
              onChangeText={setName}
              placeholder="Jamie Reseller"
              value={name}
            />
          ) : null}
          {!pendingMfaSignIn ? <Field
            autoCapitalize="none"
            autoComplete="email"
            colors={colors}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          /> : null}

          {!pendingMfaSignIn ? <Field
            autoCapitalize="none"
            autoComplete={isCreateAccount ? 'new-password' : 'password'}
            colors={colors}
            label="Password"
            onChangeText={setPassword}
            placeholder={isCreateAccount ? 'At least 8 characters' : 'Your password'}
            secureTextEntry
            value={password}
          /> : null}


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

          {!pendingMfaSignIn ? <Pressable
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
          </Pressable> : null}

          {!isCreateAccount && !pendingMfaSignIn ? (
            <FacebookSignInButton
              disabled={isBusy || isSubmitting || status === 'setup'}
            />
          ) : null}

          {!pendingMfaSignIn ? <View style={styles.switchRow}>
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
                router.push('/meet-flip');
              }}
            >
              <Text style={[styles.switchAction, { color: colors.scannerCyan }]}>
                {isCreateAccount ? 'Sign in' : 'Meet Flip & start setup'}
              </Text>
            </Pressable>
          </View> : null}
        </View>
        </View>

        <View style={[styles.footerNote, { borderColor: colors.divider }]}>
          <Text style={[styles.footerLabel, { color: colors.goldBright }]}>CAPTURE WHERE IT WORKS BEST</Text>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>KeepFlip’s live scanner, camera permissions, and native vision pipeline stay in the Android app. Your decisions, records, and realized financial picture stay available here.</Text>
        </View>
        <WebSiteFooter
          colorScheme="dark"
          inFlow
          showMarketingLinks
          suppressAuthLinks={isSubmitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

function StoryStep({ number, title, detail, color }: { number: string; title: string; detail: string; color: string }) {
  return (
    <View style={styles.storyStep}>
      <Text style={[styles.storyNumber, { color }]}>{number}</Text>
      <View style={styles.storyStepCopy}>
        <Text style={[styles.storyStepTitle, { color }]}>{title}</Text>
        <Text style={[styles.storyStepDetail, { color: KEEPFLIP_PUBLIC_COLORS.textMuted }]}>{detail}</Text>
      </View>
    </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingVertical: 24,
  },
  authLayout: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 28,
    justifyContent: 'center',
    marginTop: 42,
    maxWidth: 1120,
    width: '100%',
  },
  authLayoutNarrow: {
    alignItems: 'stretch',
    flexDirection: 'column',
    minWidth: 0,
  },
  story: {
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: 15,
    justifyContent: 'center',
    minHeight: 540,
    padding: 36,
  },
  storyEyebrow: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.5 },
  storyTitle: { fontFamily: theme.fonts.bold, fontSize: 40, lineHeight: 48, maxWidth: 400 },
  storyBody: { fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 26, maxWidth: 410 },
  storySteps: { borderTopWidth: 1, gap: 14, marginTop: 16, paddingTop: 22 },
  storyStep: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  storyNumber: { fontFamily: theme.fonts.bold, fontSize: 22, minWidth: 35 },
  storyStepCopy: { gap: 3 },
  storyStepTitle: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1 },
  storyStepDetail: { fontFamily: theme.fonts.body, fontSize: 13 },
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
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 560,
    padding: 32,
    width: '100%',
  },
  cardWide: {
    flex: 1,
  },
  cardNarrow: {
    alignSelf: 'center',
    minWidth: 0,
  },
  cardPhone: {
    padding: 22,
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
  switchRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 22 },
  switchText: { fontFamily: theme.fonts.body, fontSize: 13 },
  switchAction: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  footerNote: { alignSelf: 'center', borderTopWidth: 1, marginTop: 40, maxWidth: 1120, paddingTop: 18, width: '100%' },
  footerLabel: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1.4 },
  footerText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
});
