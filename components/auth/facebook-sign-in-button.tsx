import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  createKeepFlipFacebookOAuthLoginUrl,
  getKeepFlipFacebookCallbackUri,
  KEEPFLIP_FACEBOOK_CALLBACK_ROUTE,
} from '@/services/keepflip-facebook-oauth-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type FacebookSignInButtonProps = {
  disabled?: boolean;
};

export function FacebookSignInButton({ disabled = false }: FacebookSignInButtonProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const router = useRouter();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const [isOpening, setIsOpening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePress = async () => {
    if (disabled || isOpening) return;

    setErrorMessage(null);
    setIsOpening(true);
    try {
      const loginUrl = await createKeepFlipFacebookOAuthLoginUrl();

      if (Platform.OS === 'web') {
        window.location.assign(loginUrl);
        return;
      }

      const callbackUri = getKeepFlipFacebookCallbackUri();
      const callbackScheme = `${new URL(callbackUri).protocol}//`;
      const result = await WebBrowser.openAuthSessionAsync(
        loginUrl,
        callbackScheme,
      );

      if (result.type !== 'success' || !('url' in result) || !result.url) {
        setErrorMessage(
          result.type === 'cancel' || result.type === 'dismiss'
            ? 'Facebook sign-in was canceled. Try again when you are ready.'
            : 'Facebook sign-in did not finish. Please try again.',
        );
        return;
      }

      const callbackUrl = new URL(result.url);
      const searchParams = callbackUrl.searchParams;
      const callbackQuery = new URLSearchParams();
      const userId = searchParams.get('userId');
      const secret = searchParams.get('secret');
      if (userId) callbackQuery.set('userId', userId);
      if (secret) callbackQuery.set('secret', secret);
      if (searchParams.has('error')) {
        callbackQuery.set('error', 'facebook_oauth_failed');
      }
      const queryString = callbackQuery.toString();
      router.replace(
        `${KEEPFLIP_FACEBOOK_CALLBACK_ROUTE}${queryString ? `?${queryString}` : ''}` as Href,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not start Facebook sign-in. Please try again.',
      );
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <View style={responsiveStyles.container}>
      <Pressable
        accessibilityLabel="Sign in with Facebook"
        accessibilityRole="button"
        accessibilityState={{ busy: isOpening, disabled: disabled || isOpening }}
        disabled={disabled || isOpening}
        onPress={() => void handlePress()}
        style={({ pressed }) => [
          responsiveStyles.button,
          (disabled || isOpening) && responsiveStyles.disabled,
          pressed && !disabled && !isOpening && responsiveStyles.pressed,
        ]}>
        {isOpening ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Svg height={24} width={24} viewBox="0 0 24 24" fill="none">
            <Path
              d="M21 12.055C21 7.05406 16.9706 3 12 3C7.02943 3 3 7.05406 3 12.055C3 16.5745 6.29115 20.3207 10.5938 21V14.6725H8.30859V12.055H10.5938V10.0601C10.5938 7.79066 11.9374 6.53711 13.9932 6.53711C14.9776 6.53711 16.0078 6.71397 16.0078 6.71397V8.94234H14.873C13.755 8.94234 13.4062 9.64039 13.4062 10.3572V12.055H15.9023L15.5033 14.6725H13.4062V21C17.7088 20.3207 21 16.5745 21 12.055Z"
              fill="#C4C6D7"
            />
          </Svg>
        )}
        <Text style={responsiveStyles.buttonText}>Sign in with Facebook</Text>
      </Pressable>

      {errorMessage ? (
        <Text accessibilityLiveRegion="polite" style={[responsiveStyles.errorText, { color: colors.danger }]}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 12, width: '100%' },
  button: {
    alignItems: 'center',
    backgroundColor: '#1877F2',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.84 },
  errorText: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    container: {
      ...styles["container"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(12) : 12,
    },
    button: {
      ...styles["button"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(11) : 11,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(52) : 52,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(18) : 18,
    },
    buttonText: {
      ...styles["buttonText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    errorText: {
      ...styles["errorText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
  });
}
