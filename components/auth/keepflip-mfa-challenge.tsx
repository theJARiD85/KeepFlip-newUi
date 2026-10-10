import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { AuthenticationFactor } from 'react-native-appwrite';

import {
  useKeepFlipAuth,
  type KeepFlipMfaSignInState,
} from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors } from '@/constants/keepflip-theme';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type KeepFlipMfaChallengeProps = {
  pending: KeepFlipMfaSignInState;
  onAuthenticated?: () => void | Promise<void>;
};

export function KeepFlipMfaChallenge({
  pending,
  onAuthenticated,
}: KeepFlipMfaChallengeProps) {
  const responsiveLayout = useResponsiveLayout();
  const {
    cancelMfaSignIn,
    changeMfaSignInFactor,
    completeMfaSignIn,
    isBusy,
  } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { responsiveFont } = useResponsiveLayout();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const methods = [
    pending.availableFactors.totp
      ? { factor: AuthenticationFactor.Totp, label: 'Authenticator app' }
      : null,
    pending.availableFactors.email
      ? { factor: AuthenticationFactor.Email, label: 'Email code' }
      : null,
    pending.availableFactors.phone
      ? { factor: AuthenticationFactor.Phone, label: 'Text message' }
      : null,
    pending.availableFactors.recoveryCode
      ? { factor: AuthenticationFactor.Recoverycode, label: 'Recovery code' }
      : null,
  ].filter((method): method is NonNullable<typeof method> => Boolean(method));

  const isRecoveryCode = pending.factor === AuthenticationFactor.Recoverycode;
  const instructions =
    pending.factor === AuthenticationFactor.Totp
      ? 'Enter the current code from your authenticator app to finish signing in.'
      : pending.factor === AuthenticationFactor.Email
        ? 'Enter the code sent to the email address on your account.'
        : pending.factor === AuthenticationFactor.Phone
          ? 'Enter the code sent to the phone number on your account.'
          : 'Enter one unused recovery code to finish signing in.';

  async function selectMethod(factor: AuthenticationFactor) {
    if (isBusy) return;
    setError(null);
    setCode('');
    try {
      await changeMfaSignInFactor(factor);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'KeepFlip could not request that verification method.',
      );
    }
  }

  async function verify() {
    if (isBusy) return;
    setError(null);
    try {
      await completeMfaSignIn(code);
      await onAuthenticated?.();
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'KeepFlip could not verify that code.',
      );
    }
  }

  async function backToPassword() {
    if (isBusy) return;
    setError(null);
    setCode('');
    try {
      await cancelMfaSignIn();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'KeepFlip could not end the pending sign-in.',
      );
    }
  }

  return (
    <View style={{ gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14, paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(12) : 12 }}>
      <View style={{ gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5 }}>
        <Text style={{ color: colors.text, fontSize: responsiveFont(20), fontWeight: '700' }}>
          Verify it’s you
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: responsiveFont(12), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(18) : 18 }}>
          {instructions}
        </Text>
      </View>

      {methods.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 }}>
          {methods.map((method) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: method.factor === pending.factor, disabled: isBusy }}
              disabled={isBusy}
              key={method.factor}
              onPress={() => void selectMethod(method.factor)}
              style={({ pressed }) => ({
                backgroundColor: method.factor === pending.factor ? colors.iconSurfaceCyan : colors.surfaceInset,
                borderColor: method.factor === pending.factor ? colors.scannerCyan : colors.divider,
                borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
                borderWidth: 1,
                opacity: pressed || isBusy ? 0.7 : 1,
                paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
                paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
              })}
            >
              <Text style={{ color: method.factor === pending.factor ? colors.scannerCyan : colors.textMuted, fontSize: responsiveFont(10), fontWeight: '700' }}>
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7 }}>
        <Text style={{ color: colors.textMuted, fontSize: responsiveFont(10), fontWeight: '700' }}>
          {isRecoveryCode ? 'RECOVERY CODE' : 'VERIFICATION CODE'}
        </Text>
        <TextInput
          accessibilityLabel={isRecoveryCode ? 'Recovery code' : 'Verification code'}
          autoCapitalize={isRecoveryCode ? 'characters' : 'none'}
          autoComplete="one-time-code"
          autoCorrect={false}
          editable={!isBusy}
          keyboardType={isRecoveryCode ? 'default' : 'number-pad'}
          onChangeText={(value) => {
            setCode(value);
            setError(null);
          }}
          onSubmitEditing={() => void verify()}
          placeholder={isRecoveryCode ? 'Enter one unused code' : 'Enter your code'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          style={{
            backgroundColor: colors.surfaceInset,
            borderColor: colors.divider,
            borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14,
            borderWidth: 1,
            color: colors.text,
            fontSize: responsiveFont(16),
            letterSpacing: isRecoveryCode ? 1 : 5,
            minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(54) : 54,
            paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14,
            textAlign: isRecoveryCode ? 'left' : 'center',
          }}
          value={code}
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: responsiveFont(11) }}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void selectMethod(pending.factor)}
          style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed || isBusy ? 0.65 : 1, paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5 })}
        >
          <Text style={{ color: colors.scannerCyan, fontSize: responsiveFont(10), fontWeight: '700' }}>
            {pending.factor === AuthenticationFactor.Email
              ? 'SEND A NEW EMAIL CODE'
              : pending.factor === AuthenticationFactor.Phone
                ? 'SEND A NEW TEXT CODE'
                : 'REFRESH VERIFICATION'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isBusy, disabled: isBusy || !code.trim() }}
        disabled={isBusy || !code.trim()}
        onPress={() => void verify()}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: colors.gold,
          borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : 14,
          flexDirection: 'row',
          gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
          justifyContent: 'center',
          minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(52) : 52,
          opacity: isBusy || !code.trim() ? 0.55 : pressed ? 0.78 : 1,
          paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
        })}
      >
        {isBusy ? <ActivityIndicator color={colors.textOnAccent} /> : null}
        <Text style={{ color: colors.textOnAccent, fontSize: responsiveFont(11), fontWeight: '800' }}>
          VERIFY AND SIGN IN
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => void backToPassword()}
        style={({ pressed }) => ({ alignSelf: 'center', opacity: pressed || isBusy ? 0.65 : 1, padding: 8 })}
      >
        <Text style={{ color: colors.scannerCyan, fontSize: responsiveFont(10), fontWeight: '700' }}>
          BACK TO PASSWORD SIGN IN
        </Text>
      </Pressable>
    </View>
  );
}
