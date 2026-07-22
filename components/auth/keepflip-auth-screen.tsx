import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputProps } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useRouter } from "expo-router";

type AuthMode = 'sign-in' | 'create-account';
type IconName = ComponentProps<typeof IconSymbol>['name'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthField({
  icon,
  inputRef,
  label,
  onToggleSecure,
  secureVisible,
  ...inputProps
}: TextInputProps & {
  icon: IconName;
  inputRef?: React.RefObject<TextInput | null>;
  label: string;
  onToggleSecure?: () => void;
  secureVisible?: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldShell, isFocused && styles.fieldShellFocused]}>
        <IconSymbol
          color={isFocused ? theme.colors.goldBright : theme.colors.goldMuted}
          name={icon}
          size={18}
        />
        <TextInput
          {...inputProps}
          accessibilityLabel={label}
          onBlur={(event) => {
            setIsFocused(false);
            inputProps.onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            inputProps.onFocus?.(event);
          }}
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

function SetupNotice({ missingKeys }: { missingKeys: string[] }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.setupNotice}>
      <View style={styles.noticeHeading}>
        <View style={styles.noticeIcon}>
          <IconSymbol color={theme.colors.scannerViolet} name="lock.fill" size={17} />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeEyebrow}>APPWRITE SETUP REQUIRED</Text>
          <Text selectable style={styles.noticeText}>
            Add the public project connection values, then restart the development build.
          </Text>
        </View>
      </View>
      <View style={styles.missingList}>
        {missingKeys.map((key) => (
          <Text key={key} selectable style={styles.missingKey}>
            {key}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

export function KeepFlipAuthScreen() {
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
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode || isBusy) return;
    setMode(nextMode);
    setLocalError(null);
    setPassword('');
    setConfirmPassword('');
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const submit = async () => {
    if (isBusy || status === 'setup') return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    setLocalError(null);

    if (mode === 'create-account' && normalizedName.length < 2) {
      setLocalError('Enter the name you want shown on your KeepFlip account.');
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setLocalError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      setLocalError('Your password must contain at least 8 characters.');
      passwordRef.current?.focus();
      return;
    }
    if (mode === 'create-account' && password !== confirmPassword) {
      setLocalError('The passwords do not match.');
      confirmPasswordRef.current?.focus();
      return;
    }

    try {
      if (mode === 'sign-in') {
        await signIn(normalizedEmail, password);
      } else {
        await signUp(normalizedName, normalizedEmail, password);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'KeepFlip could not complete authentication. Please try again.';
      setLocalError(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    }
  };

  const displayedError = localError ?? (status === 'error' ? errorMessage : null);
  const setupRequired = status === 'setup';

  useEffect(() => {
    if (displayedError && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(displayedError);
    }
  }, [displayedError]);

  return (
    <KeepFlipBackground>
      <View pointerEvents="none" style={styles.authGlow} />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: insets.bottom + 30 },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(320)} style={styles.shell}>
            <View style={styles.brandSection}>
              <View style={styles.logoHalo}>
                <Image
                  accessibilityLabel="KeepFlip gold scanner mark"
                  contentFit="contain"
                  source={require('@/assets/images/icon.png')}
                  style={styles.logo}
                />
              </View>
              <Text style={styles.brandEyebrow}>KEEPFLIP / SECURE ACCESS</Text>
              <Text style={styles.title}>Know what it&apos;s worth.</Text>
              <Text style={styles.subtitle}>
                Sign in before KeepFlip activates the scanner and analyzes your inventory.
              </Text>
            </View>

            <Animated.View layout={LinearTransition.duration(180)} style={styles.authPanel}>
              <View accessibilityRole="tablist" style={styles.modeSwitch}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'sign-in' }}
                  disabled={isBusy}
                  onPress={() => switchMode('sign-in')}
                  style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}>
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === 'sign-in' && styles.modeButtonTextActive,
                    ]}>
                    SIGN IN
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'create-account' }}
                  disabled={isBusy}
                  onPress={() => switchMode('create-account')}
                  style={[
                    styles.modeButton,
                    mode === 'create-account' && styles.modeButtonActive,
                  ]}>
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === 'create-account' && styles.modeButtonTextActive,
                    ]}>
                    CREATE ACCOUNT
                  </Text>
                </Pressable>
              </View>

              {setupRequired ? <SetupNotice missingKeys={missingKeys} /> : null}

              {displayedError ? (
                <Animated.View
                  accessibilityLiveRegion="polite"
                  entering={FadeInDown.duration(180)}
                  exiting={FadeOut.duration(130)}
                  style={styles.errorNotice}>
                  <Text selectable style={styles.errorText}>
                    {displayedError}
                  </Text>
                  {status === 'error' ? (
                    <Pressable
                      accessibilityLabel="Retry Appwrite session check"
                      accessibilityRole="button"
                      disabled={isBusy}
                      onPress={() => void retry()}
                      style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                      <IconSymbol
                        color={theme.colors.scannerAmber}
                        name="arrow.clockwise"
                        size={16}
                      />
                      <Text style={styles.retryText}>RETRY CONNECTION</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : null}

              <Animated.View
                entering={FadeIn.duration(180)}
                key={mode}
                layout={LinearTransition.duration(180)}
                style={styles.form}>
                {mode === 'create-account' ? (
                  <AuthField
                    autoCapitalize="words"
                    autoComplete="name"
                    editable={!isBusy && !setupRequired}
                    icon="person.fill"
                    label="Display name"
                    onChangeText={(value) => {
                      setName(value);
                      setLocalError(null);
                    }}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    placeholder="Your name"
                    returnKeyType="next"
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
                  inputRef={emailRef}
                  keyboardType="email-address"
                  label="Email"
                  onChangeText={(value) => {
                    setEmail(value);
                    setLocalError(null);
                  }}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="you@example.com"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  value={email}
                />

                <AuthField
                  autoCapitalize="none"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  editable={!isBusy && !setupRequired}
                  icon="lock.fill"
                  inputRef={passwordRef}
                  label="Password"
                  onChangeText={(value) => {
                    setPassword(value);
                    setLocalError(null);
                  }}
                  onSubmitEditing={
                    mode === 'create-account'
                      ? () => confirmPasswordRef.current?.focus()
                      : () => void submit()
                  }
                  onToggleSecure={() => setPasswordVisible((current) => !current)}
                  placeholder="At least 8 characters"
                  returnKeyType={mode === 'sign-in' ? 'done' : 'next'}
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
                    inputRef={confirmPasswordRef}
                    label="Confirm password"
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      setLocalError(null);
                    }}
                    onSubmitEditing={() => void submit()}
                    onToggleSecure={() =>
                      setConfirmPasswordVisible((current) => !current)
                    }
                    placeholder="Repeat your password"
                    returnKeyType="done"
                    secureTextEntry={!confirmPasswordVisible}
                    secureVisible={confirmPasswordVisible}
                    textContentType="newPassword"
                    value={confirmPassword}
                  />
                ) : null}
              </Animated.View>

              <Pressable
                accessibilityHint="Authenticates with the connected Appwrite project"
                accessibilityLabel={
                  isBusy
                    ? mode === 'sign-in'
                      ? 'Signing in to KeepFlip'
                      : 'Creating KeepFlip account'
                    : mode === 'sign-in'
                      ? 'Enter KeepFlip'
                      : 'Create secure account'
                }
                accessibilityRole="button"
                accessibilityState={{ busy: isBusy, disabled: isBusy || setupRequired }}
                disabled={isBusy || setupRequired}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.submitButton,
                  (isBusy || setupRequired) && styles.submitButtonDisabled,
                  pressed && !isBusy && !setupRequired && styles.submitButtonPressed,
                ]}>
                {isBusy ? (
                  <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {mode === 'sign-in' ? 'ENTER KEEPFLIP' : 'CREATE SECURE ACCOUNT'}
                    </Text>
                    <IconSymbol color={theme.colors.backgroundDeep} name="arrow.right" size={19} />
                  </>
                )}
              </Pressable>

              {mode === "create-account" ? (
                <Text style={styles.legalConsentText}>
                  By creating an account, you agree to KeepFlip&apos;s{" "}
                  <Text
                    accessibilityHint="Opens KeepFlip's Terms of Service"
                    accessibilityRole="link"
                    onPress={() => router.push("/terms")}
                    style={styles.legalLink}
                  >
                    Terms of Service
                  </Text>{" "}
                  and{" "}
                  <Text
                    accessibilityHint="Opens KeepFlip's Privacy Policy"
                    accessibilityRole="link"
                    onPress={() => router.push("/privacy")}
                    style={styles.legalLink}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              ) : null}

              <View style={styles.securityLine}>
                <IconSymbol color={theme.colors.scannerCyan} name="lock.fill" size={14} />
                <Text style={styles.securityText}>
                  All sessions are managed by Appwrite. Private information is never shared without your consent.
                </Text>
              </View>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  authGlow: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 16%, rgba(224, 172, 75, 0.13) 0%, transparent 31%),
      radial-gradient(circle at 12% 82%, rgba(88, 223, 232, 0.055) 0%, transparent 32%),
      radial-gradient(circle at 94% 70%, rgba(141, 114, 255, 0.07) 0%, transparent 34%)
    `,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  shell: { width: '100%', maxWidth: 520, gap: 25 },
  brandSection: { alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  logoHalo: {
    width: 138,
    height: 138,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(224, 172, 75, 0.18)',
    backgroundColor: 'rgba(5, 4, 5, 0.44)',
    boxShadow: '0 0 44px rgba(224, 172, 75, 0.15)',
  },
  logo: { width: 126, height: 126 },
  brandEyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 390,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  authPanel: {
    gap: 17,
    padding: 20,
    borderRadius: theme.radii.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(224, 172, 75, 0.34)',
    backgroundColor: 'rgba(8, 8, 11, 0.93)',
    boxShadow: '0 18px 55px rgba(0, 0, 0, 0.46), 0 0 24px rgba(224, 172, 75, 0.055)',
  },
  modeSwitch: {
    minHeight: 45,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.13)',
    backgroundColor: 'rgba(1, 1, 2, 0.68)',
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: theme.radii.pill,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(215, 168, 74, 0.14)',
    boxShadow: 'inset 0 0 0 1px rgba(242, 211, 138, 0.2)',
  },
  modeButtonText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  modeButtonTextActive: { color: theme.colors.goldBright },
  form: { gap: 14 },
  fieldGroup: { gap: 7 },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
  },
  fieldShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    borderRadius: theme.radii.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.16)',
    backgroundColor: 'rgba(2, 2, 4, 0.82)',
  },
  fieldShellFocused: {
    borderColor: 'rgba(242, 211, 138, 0.68)',
    boxShadow: '0 0 18px rgba(215, 168, 74, 0.09)',
  },
  fieldInput: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 13,
    color: theme.colors.text,
    fontSize: 15,
  },
  visibilityButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  submitButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.goldBright,
    boxShadow: '0 0 24px rgba(242, 211, 138, 0.22)',
  },
  submitButtonPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  submitButtonDisabled: { opacity: 0.42 },
  submitText: {
    color: theme.colors.backgroundDeep,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  legalConsentText: {
    paddingHorizontal: 8,
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },
  legalLink: {
    color: theme.colors.goldBright,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  securityLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  securityText: {
    flexShrink: 1,
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  setupNotice: {
    gap: 13,
    padding: 15,
    borderRadius: theme.radii.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.36)',
    backgroundColor: 'rgba(141, 114, 255, 0.075)',
  },
  noticeHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  noticeIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.36)',
  },
  noticeCopy: { flex: 1, gap: 4 },
  noticeEyebrow: {
    color: theme.colors.scannerViolet,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  noticeText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  missingList: { gap: 5 },
  missingKey: {
    color: theme.colors.goldBright,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  errorNotice: {
    gap: 11,
    padding: 14,
    borderRadius: theme.radii.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(232, 97, 88, 0.42)',
    backgroundColor: 'rgba(232, 97, 88, 0.075)',
  },
  errorText: { color: '#FFB8B1', fontSize: 12, lineHeight: 18 },
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(224, 172, 75, 0.34)',
  },
  retryText: {
    color: theme.colors.scannerAmber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.85,
  },
  pressed: { opacity: 0.65 },
});
