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
import { SemanticHeading, WebActionLink, WebPageHead } from '@/components/web/web-public-page';
import {
  KeepFlipAuthError,
  useKeepFlipAuth,
} from '@/components/auth/keepflip-auth-context';
import {
  KEEPFLIP_HOME_DESCRIPTION,
  KEEPFLIP_HOME_FAQS,
  KEEPFLIP_HOME_TITLE,
} from '@/constants/keepflip-public-site';
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
      <WebPageHead
        canonicalPath="/"
        description={KEEPFLIP_HOME_DESCRIPTION}
        title={KEEPFLIP_HOME_TITLE}
      />
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
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(24) : layout.responsiveHeight(24),
    },
    authLayout: {
      ...styles["authLayout"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(28) : layout.responsiveWidth(28),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(42) : layout.responsiveHeight(42),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(1120) : layout.responsiveWidth(1120),
    },
    story: {
      ...styles["story"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(24) : layout.responsiveWidth(24),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(15) : layout.responsiveWidth(15),
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(540) : layout.responsiveHeight(540),
    },
    storyEyebrow: {
      ...styles["storyEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    storyTitle: {
      ...styles["storyTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(40) : layout.responsiveFont(40),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(48) : layout.responsiveFont(48),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(400) : layout.responsiveWidth(400),
    },
    storyBody: {
      ...styles["storyBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(26) : layout.responsiveFont(26),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(410) : layout.responsiveWidth(410),
    },
    storySteps: {
      ...styles["storySteps"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(16) : layout.responsiveHeight(16),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(22) : layout.responsiveHeight(22),
    },
    storyStep: {
      ...styles["storyStep"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
    },
    storyNumber: {
      ...styles["storyNumber"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
      minWidth: layout.isWideWeb ? layout.webResponsiveWidth(35) : layout.responsiveWidth(35),
    },
    storyStepCopy: {
      ...styles["storyStepCopy"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    storyStepTitle: {
      ...styles["storyStepTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    storyStepDetail: {
      ...styles["storyStepDetail"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    brandRow: {
      ...styles["brandRow"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(28) : layout.responsiveHeight(28),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(620) : layout.responsiveWidth(620),
    },
    brandMark: {
      ...styles["brandMark"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      height: layout.isWideWeb ? layout.webResponsiveHeight(34) : layout.responsiveHeight(34),
      width: layout.isWideWeb ? layout.webResponsiveWidth(34) : layout.responsiveWidth(34),
    },
    brandMarkText: {
      ...styles["brandMarkText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    webPill: {
      ...styles["webPill"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(7) : layout.responsiveHeight(7),
    },
    statusDot: {
      ...styles["statusDot"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
      height: layout.isWideWeb ? layout.webResponsiveHeight(7) : layout.responsiveHeight(7),
      width: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    webPillText: {
      ...styles["webPillText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    card: {
      ...styles["card"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(24) : layout.responsiveWidth(24),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(560) : layout.responsiveWidth(560),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(38) : layout.responsiveFont(38),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(44) : layout.responsiveFont(44),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(10) : layout.responsiveHeight(10),
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(23) : layout.responsiveFont(23),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(560) : layout.responsiveWidth(560),
    },
    backButton: {
      ...styles["backButton"],
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
    },
    backButtonText: {
      ...styles["backButtonText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    fieldGroup: {
      ...styles["fieldGroup"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(20) : layout.responsiveHeight(20),
    },
    fieldLabel: {
      ...styles["fieldLabel"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    input: {
      ...styles["input"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(50) : layout.responsiveHeight(50),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(15) : layout.responsiveWidth(15),
    },
    errorBox: {
      ...styles["errorBox"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
    },
    errorText: {
      ...styles["errorText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    setupBox: {
      ...styles["setupBox"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
    },
    setupTitle: {
      ...styles["setupTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    setupText: {
      ...styles["setupText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
    },
    billingSection: {
      ...styles["billingSection"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(22) : layout.responsiveHeight(22),
    },
    billingEyebrow: {
      ...styles["billingEyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    billingCopy: {
      ...styles["billingCopy"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
    },
    billingToggle: {
      ...styles["billingToggle"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    billingToggleOption: {
      ...styles["billingToggleOption"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(999) : layout.responsiveWidth(999),
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(38) : layout.responsiveHeight(38),
    },
    billingToggleText: {
      ...styles["billingToggleText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
    },
    billingPlanList: {
      ...styles["billingPlanList"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    billingPlan: {
      ...styles["billingPlan"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
    },
    billingPlanHeading: {
      ...styles["billingPlanHeading"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    billingPlanName: {
      ...styles["billingPlanName"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    billingPlanPrice: {
      ...styles["billingPlanPrice"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    billingPlanDescription: {
      ...styles["billingPlanDescription"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    billingConfirmed: {
      ...styles["billingConfirmed"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
    },
    submitButton: {
      ...styles["submitButton"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(14) : layout.responsiveWidth(14),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(24) : layout.responsiveHeight(24),
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(52) : layout.responsiveHeight(52),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(18) : layout.responsiveWidth(18),
    },
    submitText: {
      ...styles["submitText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    switchRow: {
      ...styles["switchRow"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(22) : layout.responsiveHeight(22),
    },
    switchText: {
      ...styles["switchText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    switchAction: {
      ...styles["switchAction"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
    footerNote: {
      ...styles["footerNote"],
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(40) : layout.responsiveHeight(40),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(1120) : layout.responsiveWidth(1120),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(18) : layout.responsiveHeight(18),
    },
    footerLabel: {
      ...styles["footerLabel"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    footerText: {
      ...styles["footerText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(7) : layout.responsiveHeight(7),
    },
  });
}
