import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AuthenticationFactor,
  AuthenticatorType,
  type Models,
} from 'react-native-appwrite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';
import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
import { getAppwriteCoreServices } from '@/lib/appwrite';

export function KeepFlipSecurityScreen() {
  const responsiveLayout = useResponsiveLayout();
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { contentMaxWidth, pageGutter, responsiveFont } = useResponsiveLayout();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(Boolean(user?.mfa));
  const [hasAuthenticator, setHasAuthenticator] = useState(false);
  const [authenticatorSecret, setAuthenticatorSecret] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(false);
  const [recoveryCodeResetRequired, setRecoveryCodeResetRequired] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.$id) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const { account } = getAppwriteCoreServices();
        const [currentUser, factors] = await Promise.all([
          account.get(),
          account.listMFAFactors(),
        ]);
        if (cancelled) return;
        setMfaEnabled(currentUser.mfa);
        setHasAuthenticator(factors.totp);
      } catch {
        if (!cancelled) {
          setError('KeepFlip could not load your security settings. Try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  async function beginAuthenticatorSetup() {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { account } = getAppwriteCoreServices();
      const result = await account.createMFAAuthenticator({
        type: AuthenticatorType.Totp,
      });
      setAuthenticatorSecret(result.secret);
      setOtp('');
    } catch {
      setError('KeepFlip could not start authenticator setup. Try again.');
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyAuthenticator() {
    const cleanOtp = otp.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    let authenticatorVerified = false;
    try {
      const { account } = getAppwriteCoreServices();
      await account.updateMFAAuthenticator({
        type: AuthenticatorType.Totp,
        otp: cleanOtp,
      });
      authenticatorVerified = true;
      setHasAuthenticator(true);
      setAuthenticatorSecret(null);
      setOtp('');
      const result = await account.createMFARecoveryCodes();
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryCodesSaved(false);
      setRecoveryCodeResetRequired(false);
    } catch {
      setError(
        authenticatorVerified
          ? 'Your authenticator is verified. Keep this page open and retry recovery-code setup.'
          : 'That code did not verify. Check the time on your device and try again.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function retryRecoveryCodeSetup() {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const { account } = getAppwriteCoreServices();
      const result = await account.createMFARecoveryCodes();
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryCodesSaved(false);
      setRecoveryCodeResetRequired(false);
    } catch {
      setRecoveryCodeResetRequired(true);
      setError('Recovery codes may already have been generated. Verify your authenticator to replace that set and continue.');
    } finally {
      setIsBusy(false);
    }
  }

  async function resetRecoveryCodes() {
    const cleanOtp = recoveryOtp.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const { account } = getAppwriteCoreServices();
      const challenge = await account.createMFAChallenge({
        factor: AuthenticationFactor.Totp,
      });
      await account.updateMFAChallenge({
        challengeId: challenge.$id,
        otp: cleanOtp,
      });
      let result: Models.MfaRecoveryCodes;
      try {
        result = await account.updateMFARecoveryCodes();
      } catch {
        result = await account.createMFARecoveryCodes();
      }
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryCodesSaved(false);
      setRecoveryCodeResetRequired(false);
      setRecoveryOtp('');
    } catch {
      setError('KeepFlip could not refresh recovery codes. Check your authenticator code and try again.');
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelAuthenticatorSetup() {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const { account } = getAppwriteCoreServices();
      await account.deleteMFAAuthenticator({ type: AuthenticatorType.Totp });
      setAuthenticatorSecret(null);
      setHasAuthenticator(false);
      setOtp('');
      setNotice('Authenticator setup was canceled.');
    } catch {
      setError('KeepFlip could not cancel authenticator setup. Try again.');
    } finally {
      setIsBusy(false);
    }
  }

  async function enableMfa() {
    if (!recoveryCodesSaved || isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { account } = getAppwriteCoreServices();
      const currentUser = await account.updateMFA({ mfa: true });
      setMfaEnabled(currentUser.mfa);
      setRecoveryCodes(null);
      setRecoveryCodesSaved(false);
      setNotice('Two-step verification is now on for this account.');
      await refresh();
    } catch {
      setError('KeepFlip could not enable MFA. Your authenticator is still connected; try again.');
    } finally {
      setIsBusy(false);
    }
  }

  async function disableMfa() {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { account } = getAppwriteCoreServices();
      const currentUser = await account.updateMFA({ mfa: false });
      setMfaEnabled(currentUser.mfa);
      setNotice('Two-step verification is now off for this account.');
      await refresh();
    } catch {
      setError('KeepFlip could not turn off MFA. Try again.');
    } finally {
      setIsBusy(false);
    }
  }

  const sectionStyle = [responsiveStyles.section, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }];

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={{
          alignSelf: 'center',
          gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(18) : 18,
          maxWidth: contentMaxWidth,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: pageGutter,
          paddingTop: insets.top + 12,
          width: '100%',
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => ({ alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8, opacity: pressed ? 0.7 : 1, paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8 })}
        >
          <Ionicons color={colors.scannerCyan} name="chevron.left" size={17} />
          <Text style={{ color: colors.scannerCyan, fontSize: responsiveFont(10), fontWeight: '700' }}>ACCOUNT</Text>
        </Pressable>

        <View style={{ gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6 }}>
          <Text style={{ color: colors.goldBright, fontSize: responsiveFont(9), fontWeight: '700', letterSpacing: 1.3 }}>KEEPFLIP / SECURITY</Text>
          <Text style={{ color: colors.text, fontSize: responsiveFont(27), fontWeight: '800' }}>
            Two-step verification
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: responsiveFont(12), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(18) : 18 }}>
            Use an authenticator app to add a one-time code after your password when you sign in. This is optional.
          </Text>
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" selectable style={{ color: colors.danger, fontSize: responsiveFont(11) }}>{error}</Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" selectable style={{ color: colors.scannerCyan, fontSize: responsiveFont(11) }}>{notice}</Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.scannerCyan} />
        ) : (
          <View style={sectionStyle}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10 }}>
              <View style={[responsiveStyles.statusDot, { backgroundColor: mfaEnabled ? colors.scannerCyan : colors.gold }]} />
              <Text style={{ color: colors.text, flex: 1, fontSize: responsiveFont(15), fontWeight: '700' }}>
                {mfaEnabled ? 'MFA is on' : 'MFA is off'}
              </Text>
              <Text style={{ color: mfaEnabled ? colors.scannerCyan : colors.textMuted, fontSize: responsiveFont(9), fontWeight: '800' }}>
                {mfaEnabled ? 'ACTIVE' : 'OPTIONAL'}
              </Text>
            </View>

            {mfaEnabled ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: responsiveFont(11), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 }}>
                  Sign-in currently requires your password and a second-factor code. You can turn this off while MFA is optional.
                </Text>
                <ActionButton
                  busy={isBusy}
                  colors={colors}
                  disabled={isBusy}
                  label="Turn off two-step verification"
                  onPress={() => void disableMfa()}
                  responsiveFont={responsiveFont}
                  secondary
                />
              </>
            ) : authenticatorSecret ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: responsiveFont(11), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 }}>
                  In your authenticator app, choose “enter setup key.” Name it KeepFlip, then enter this key:
                </Text>
                <Text selectable style={[responsiveStyles.secret, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text, fontSize: responsiveFont(16) }]}>
                  {authenticatorSecret}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: responsiveFont(10), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16 }}>
                  Keep this setup key private. Enter the current 6-digit code below to verify the authenticator.
                </Text>
                <TextInput
                  accessibilityLabel="Authenticator verification code"
                  autoComplete="one-time-code"
                  autoCorrect={false}
                  editable={!isBusy}
                  keyboardType="number-pad"
                  maxLength={8}
                  onChangeText={(value) => {
                    setOtp(value.replace(/\D/g, '').slice(0, 6));
                    setError(null);
                  }}
                  onSubmitEditing={() => void verifyAuthenticator()}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  style={[responsiveStyles.otpInput, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text, fontSize: responsiveFont(16) }]}
                  value={otp}
                />
                <ActionButton
                  busy={isBusy}
                  colors={colors}
                  disabled={isBusy || otp.length !== 6}
                  label="Verify authenticator"
                  onPress={() => void verifyAuthenticator()}
                  responsiveFont={responsiveFont}
                />
                <ActionButton
                  busy={isBusy}
                  colors={colors}
                  disabled={isBusy}
                  label="Cancel setup"
                  onPress={() => void cancelAuthenticatorSetup()}
                  responsiveFont={responsiveFont}
                  secondary
                />
              </>
            ) : hasAuthenticator ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: responsiveFont(11), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 }}>
                  Your authenticator is connected. Generate and save your recovery codes to finish enabling MFA.
                </Text>
                {recoveryCodes ? (
                  <RecoveryCodeSetup
                    acknowledged={recoveryCodesSaved}
                    colors={colors}
                    codes={recoveryCodes}
                    isBusy={isBusy}
                    onAcknowledge={() => setRecoveryCodesSaved((value) => !value)}
                    onEnable={() => void enableMfa()}
                    responsiveFont={responsiveFont}
                  />
                ) : (
                  <>
                    {recoveryCodeResetRequired ? (
                      <>
                        <Text style={{ color: colors.textMuted, fontSize: responsiveFont(10), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16 }}>
                          Enter a current authenticator code to replace any existing recovery-code set.
                        </Text>
                        <TextInput
                          accessibilityLabel="Authenticator code to refresh recovery codes"
                          autoComplete="one-time-code"
                          autoCorrect={false}
                          editable={!isBusy}
                          keyboardType="number-pad"
                          maxLength={6}
                          onChangeText={(value) => setRecoveryOtp(value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          placeholderTextColor={colors.textMuted}
                          style={[responsiveStyles.otpInput, { backgroundColor: colors.surfaceInset, borderColor: colors.divider, color: colors.text, fontSize: responsiveFont(16) }]}
                          value={recoveryOtp}
                        />
                        <ActionButton
                          busy={isBusy}
                          colors={colors}
                          disabled={isBusy || recoveryOtp.length !== 6}
                          label="Replace recovery codes"
                          onPress={() => void resetRecoveryCodes()}
                          responsiveFont={responsiveFont}
                        />
                      </>
                    ) : (
                      <ActionButton
                        busy={isBusy}
                        colors={colors}
                        disabled={isBusy}
                        label="Generate recovery codes"
                        onPress={() => void retryRecoveryCodeSetup()}
                        responsiveFont={responsiveFont}
                      />
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, fontSize: responsiveFont(11), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(17) : 17 }}>
                  Add a time-based authenticator and save recovery codes to optionally require a second code when you sign in.
                </Text>
                <ActionButton
                  busy={isBusy}
                  colors={colors}
                  disabled={isBusy}
                  label="Set up authenticator app"
                  onPress={() => void beginAuthenticatorSetup()}
                  responsiveFont={responsiveFont}
                />
              </>
            )}
          </View>
        )}

        <Text style={{ color: colors.textMuted, fontSize: responsiveFont(10), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16 }}>
          Two-step verification is optional. If you enable it, Appwrite verifies authenticator or recovery codes during sign-in.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

export default function SecurityScreen() {
  return <KeepFlipSecurityScreen />;
}

function RecoveryCodeSetup({
  acknowledged,
  colors,
  codes,
  isBusy,
  onAcknowledge,
  onEnable,
  responsiveFont,
}: {
  acknowledged: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  codes: string[];
  isBusy: boolean;
  onAcknowledge: () => void;
  onEnable: () => void;
  responsiveFont: (size: number) => number;
}) {
  const responsiveLayout2 = useResponsiveLayout();
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={{ gap: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveWidth(12) : 12 }}>
      <Text style={{ color: colors.goldBright, fontSize: responsiveFont(11), fontWeight: '700', lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(17) : 17 }}>
        Save these one-time recovery codes somewhere private. Each code can be used once if you lose your authenticator.
      </Text>
      <View style={[responsiveStyles2.recoveryGrid, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
        {codes.map((code) => (
          <Text key={code} selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: responsiveFont(12), letterSpacing: 1 }}>
            {code}
          </Text>
        ))}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged, disabled: isBusy }}
        disabled={isBusy}
        onPress={onAcknowledge}
        style={{ alignItems: 'center', flexDirection: 'row', gap: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveWidth(9) : 9, opacity: isBusy ? 0.55 : 1, paddingVertical: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveHeight(5) : 5 }}
      >
        <View style={[responsiveStyles2.checkbox, { backgroundColor: acknowledged ? colors.scannerCyan : 'transparent', borderColor: acknowledged ? colors.scannerCyan : colors.textMuted }]}>
          {acknowledged ? <Ionicons color={colors.textOnAccent} name="checkmark.circle.fill" size={12} /> : null}
        </View>
        <Text style={{ color: colors.text, flex: 1, fontSize: responsiveFont(11), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(16) : 16 }}>
          I saved my recovery codes somewhere safe.
        </Text>
      </Pressable>
      <ActionButton
        busy={isBusy}
        colors={colors}
        disabled={isBusy || !acknowledged}
        label="Enable two-step verification"
        onPress={onEnable}
        responsiveFont={responsiveFont}
      />
    </View>
  );
}

function ActionButton({
  busy = false,
  colors,
  disabled,
  label,
  onPress,
  responsiveFont,
  secondary = false,
}: {
  busy?: boolean;
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  disabled: boolean;
  label: string;
  onPress: () => void;
  responsiveFont: (size: number) => number;
  secondary?: boolean;
}) {
  const responsiveLayout3 = useResponsiveLayout();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: secondary ? colors.surfaceInset : colors.gold,
        borderColor: secondary ? colors.divider : colors.gold,
        borderRadius: responsiveLayout3.isWeb ? responsiveLayout3.webResponsiveWidth(13) : 13,
        borderWidth: 1,
        flex: 1,
        flexDirection: 'row',
        gap: responsiveLayout3.isWeb ? responsiveLayout3.webResponsiveWidth(8) : 8,
        justifyContent: 'center',
        minHeight: responsiveLayout3.isWeb ? responsiveLayout3.webResponsiveHeight(48) : 48,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        paddingHorizontal: responsiveLayout3.isWeb ? responsiveLayout3.webResponsiveWidth(12) : 12,
      })}
    >
      {busy ? <ActivityIndicator color={secondary ? colors.text : colors.textOnAccent} size="small" /> : null}
      <Text style={{ color: secondary ? colors.text : colors.textOnAccent, fontSize: responsiveFont(10), fontWeight: '800', textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  otpInput: {
    borderRadius: 12,
    borderWidth: 1,
    letterSpacing: 5,
    minHeight: 52,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  recoveryGrid: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
    justifyContent: 'space-between',
    padding: 15,
  },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 15,
    padding: 18,
  },
  secret: {
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: 'monospace',
    letterSpacing: 1.2,
    padding: 14,
    textAlign: 'center',
  },
  statusDot: {
    borderRadius: 9,
    height: 9,
    width: 9,
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    checkbox: {
      ...styles["checkbox"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
      height: layout.isWeb ? layout.webResponsiveHeight(20) : 20,
      width: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
    },
    otpInput: {
      ...styles["otpInput"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(52) : 52,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
    },
    recoveryGrid: {
      ...styles["recoveryGrid"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      gap: layout.isWeb ? layout.webResponsiveWidth(13) : 13,
    },
    section: {
      ...styles["section"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
      gap: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
    },
    secret: {
      ...styles["secret"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
    },
    statusDot: {
      ...styles["statusDot"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      height: layout.isWeb ? layout.webResponsiveHeight(9) : 9,
      width: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
    },
  });
}
