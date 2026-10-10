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
import { Ionicons } from '@react-native-vector-icons/ionicons';

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

import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
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
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
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
    <KeyboardAvoidingView behavior="padding" style={responsiveStyles.root}>
      <ScrollView
        contentContainerStyle={[responsiveStyles.scrollContent, webContentSizing]}
        keyboardShouldPersistTaps="handled"
      >
        <WebSiteHeader
          colorScheme="dark"
          label={isCreateAccount ? 'CREATE RESELLER WORKSPACE' : 'SIGN IN TO KEEPFLIP'}
          showMarketingLinks
        />
        <View style={[responsiveStyles.authLayout, !isWide && responsiveStyles.authLayoutNarrow]}>
          {isWide ? (
            <View style={[responsiveStyles.story, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
              <Text style={[responsiveStyles.storyEyebrow, { color: colors.goldBright }]}>KEEPFLIP / RESELLER OPERATIONS</Text>
              <Text style={[responsiveStyles.storyTitle, { color: colors.text }]}>From the find to the sale.</Text>
              <Text style={[responsiveStyles.storyBody, { color: colors.textMuted }]}>
                Research a possible buy, keep track of the item, and see what you kept after fees.
              </Text>
              <View style={[responsiveStyles.storySteps, { borderTopColor: colors.divider }]}>
                <StoryStep number="01" title="SOURCE" detail="Research the find" color={colors.goldBright} />
                <StoryStep number="02" title="DECIDE" detail="Count the costs" color={colors.goldBright} />
                <StoryStep number="03" title="TRACK" detail="See what you kept" color={colors.goldBright} />
              </View>
            </View>
          ) : null}
        <View style={[responsiveStyles.card, isWide && responsiveStyles.cardWide, !isWide && responsiveStyles.cardNarrow, width < 480 && responsiveStyles.cardPhone, { backgroundColor: colors.card, borderColor: colors.divider }]}>
          <Text style={[responsiveStyles.eyebrow, { color: colors.goldBright }]}>RESELLER OPERATIONS, EVERYWHERE</Text>
          <Text style={[responsiveStyles.title, { color: colors.text }]}>{isCreateAccount ? "Let's make your account." : 'Welcome back.'}</Text>
          <Text style={[responsiveStyles.subtitle, { color: colors.textMuted }]}>
            {isCreateAccount
              ? 'Add your name, email, and password. No credit card is required. Your Flip setup and workflow tour begin after you sign in.'
              : 'Use the web workspace for inventory, Books, market research, and assistant planning. Open the Android app when it is time to capture an item.'}
          </Text>

          {onBack && !pendingMfaSignIn ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [responsiveStyles.backButton, pressed && responsiveStyles.pressed]}
            >
              <Text style={[responsiveStyles.backButtonText, { color: colors.scannerCyan }]}><Ionicons color={colors.scannerCyan} name="arrow-back" size={13} /> BACK TO FLIP SETUP</Text>
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
            <View style={[responsiveStyles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
              <Text style={[responsiveStyles.errorText, { color: colors.danger }]}>{localError ?? errorMessage}</Text>
            </View>
          ) : null}

          {status === 'setup' && missingKeys.length ? (
            <View style={[responsiveStyles.setupBox, { backgroundColor: colors.iconSurfaceGold, borderColor: colors.goldMuted }]}>
              <Text style={[responsiveStyles.setupTitle, { color: colors.goldBright }]}>Appwrite is not configured for this build yet.</Text>
              <Text style={[responsiveStyles.setupText, { color: colors.textMuted }]}>The browser shell is ready, but authentication needs the public Appwrite endpoint and project ID in the web environment.</Text>
            </View>
          ) : null}

          {!pendingMfaSignIn ? <Pressable
            accessibilityRole="button"
            disabled={isBusy || isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              responsiveStyles.submitButton,
              { backgroundColor: colors.gold },
              pressed && responsiveStyles.pressed,
              (isBusy || isSubmitting) && responsiveStyles.disabled,
            ]}
          >
            {isBusy || isSubmitting ? <ActivityIndicator color={colors.textOnAccent} /> : null}
            <Text style={[responsiveStyles.submitText, { color: colors.textOnAccent }]}>{submitLabel}</Text>
          </Pressable> : null}

          {!isCreateAccount && !pendingMfaSignIn ? (
            <FacebookSignInButton
              disabled={isBusy || isSubmitting || status === 'setup'}
            />
          ) : null}

          {!pendingMfaSignIn ? <View style={responsiveStyles.switchRow}>
            <Text style={[responsiveStyles.switchText, { color: colors.textMuted }]}>
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
              <Text style={[responsiveStyles.switchAction, { color: colors.scannerCyan }]}>
                {isCreateAccount ? 'Sign in' : 'Meet Flip & start setup'}
              </Text>
            </Pressable>
          </View> : null}
        </View>
        </View>

        <View style={[responsiveStyles.footerNote, { borderColor: colors.divider }]}>
          <Text style={[responsiveStyles.footerLabel, { color: colors.goldBright }]}>CAPTURE WHERE IT WORKS BEST</Text>
          <Text style={[responsiveStyles.footerText, { color: colors.textMuted }]}>KeepFlip’s live scanner, camera permissions, and native vision pipeline stay in the Android app. Your decisions, records, and realized financial picture stay available here.</Text>
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
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles2.storyStep}>
      <Text style={[responsiveStyles2.storyNumber, { color }]}>{number}</Text>
      <View style={responsiveStyles2.storyStepCopy}>
        <Text style={[responsiveStyles2.storyStepTitle, { color }]}>{title}</Text>
        <Text style={[responsiveStyles2.storyStepDetail, { color: KEEPFLIP_PUBLIC_COLORS.textMuted }]}>{detail}</Text>
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
  const responsiveStyles3 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles3.fieldGroup}>
      <Text style={[responsiveStyles3.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.textMuted}
        style={[responsiveStyles3.input, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text }]}
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    scrollContent: {
      ...styles["scrollContent"],
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
    },
    authLayout: {
      ...styles["authLayout"],
      gap: layout.isWeb ? layout.webResponsiveWidth(28) : 28,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(42) : 42,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(1120) : 1120,
    },
    story: {
      ...styles["story"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
      gap: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(540) : 540,
    },
    storyEyebrow: {
      ...styles["storyEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    storyTitle: {
      ...styles["storyTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(40) : 40,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(48) : 48,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(400) : 400,
    },
    storyBody: {
      ...styles["storyBody"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(16) : 16,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(26) : 26,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(410) : 410,
    },
    storySteps: {
      ...styles["storySteps"],
      gap: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(22) : 22,
    },
    storyStep: {
      ...styles["storyStep"],
      gap: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    storyNumber: {
      ...styles["storyNumber"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(22) : 22,
      minWidth: layout.isWeb ? layout.webResponsiveWidth(35) : 35,
    },
    storyStepCopy: {
      ...styles["storyStepCopy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    storyStepTitle: {
      ...styles["storyStepTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    storyStepDetail: {
      ...styles["storyStepDetail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    brandRow: {
      ...styles["brandRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginBottom: layout.isWeb ? layout.webResponsiveHeight(28) : 28,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(620) : 620,
    },
    brandMark: {
      ...styles["brandMark"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      height: layout.isWeb ? layout.webResponsiveHeight(34) : 34,
      width: layout.isWeb ? layout.webResponsiveWidth(34) : 34,
    },
    brandMarkText: {
      ...styles["brandMarkText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    webPill: {
      ...styles["webPill"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
    statusDot: {
      ...styles["statusDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      height: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
      width: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
    },
    webPillText: {
      ...styles["webPillText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    card: {
      ...styles["card"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(24) : 24,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(560) : 560,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(38) : 38,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(44) : 44,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(10) : 10,
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(23) : 23,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(560) : 560,
    },
    backButton: {
      ...styles["backButton"],
      marginTop: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    backButtonText: {
      ...styles["backButtonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    fieldGroup: {
      ...styles["fieldGroup"],
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : 7,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(20) : 20,
    },
    fieldLabel: {
      ...styles["fieldLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    input: {
      ...styles["input"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(50) : 50,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    errorBox: {
      ...styles["errorBox"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
    },
    errorText: {
      ...styles["errorText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(19) : 19,
    },
    setupBox: {
      ...styles["setupBox"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
    },
    setupTitle: {
      ...styles["setupTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    setupText: {
      ...styles["setupText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    billingSection: {
      ...styles["billingSection"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(22) : 22,
    },
    billingEyebrow: {
      ...styles["billingEyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    billingCopy: {
      ...styles["billingCopy"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    billingToggle: {
      ...styles["billingToggle"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    billingToggleOption: {
      ...styles["billingToggleOption"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(999) : 999,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
    },
    billingToggleText: {
      ...styles["billingToggleText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    billingPlanList: {
      ...styles["billingPlanList"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
    },
    billingPlan: {
      ...styles["billingPlan"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    billingPlanHeading: {
      ...styles["billingPlanHeading"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
    },
    billingPlanName: {
      ...styles["billingPlanName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    billingPlanPrice: {
      ...styles["billingPlanPrice"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    billingPlanDescription: {
      ...styles["billingPlanDescription"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(16) : 16,
    },
    billingConfirmed: {
      ...styles["billingConfirmed"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(17) : 17,
    },
    submitButton: {
      ...styles["submitButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(24) : 24,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(52) : 52,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
    },
    submitText: {
      ...styles["submitText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    switchRow: {
      ...styles["switchRow"],
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(22) : 22,
    },
    switchText: {
      ...styles["switchText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    switchAction: {
      ...styles["switchAction"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    footerNote: {
      ...styles["footerNote"],
      marginTop: layout.isWeb ? layout.webResponsiveHeight(40) : 40,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(1120) : 1120,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(18) : 18,
    },
    footerLabel: {
      ...styles["footerLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    footerText: {
      ...styles["footerText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(7) : 7,
    },
  });
}
