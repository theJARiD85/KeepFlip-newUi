import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function FacebookOAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    error?: string | string[];
    secret?: string | string[];
    userId?: string | string[];
  }>();
  const { completeFacebookOAuthSignIn, errorMessage, isBusy, status } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const startedRef = useRef(false);
  const [isCompleting, setIsCompleting] = useState(true);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [didCompleteSignIn, setDidCompleteSignIn] = useState(false);

  const userId = firstParam(params.userId);
  const secret = firstParam(params.secret);
  const oauthError = firstParam(params.error);

  useEffect(() => {
    if (status === 'checking' || isBusy || startedRef.current) return;
    startedRef.current = true;

    // Appwrite returns the token secret in the query string. Remove it from
    // browser history as soon as it has been captured.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }

    if (oauthError || !userId || !secret) {
      return;
    }

    let cancelled = false;
    void completeFacebookOAuthSignIn(userId, secret)
      .then(() => {
        if (!cancelled) setDidCompleteSignIn(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCallbackError(
            error instanceof Error
              ? error.message
              : 'KeepFlip could not finish Facebook sign-in. Please try again.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsCompleting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    completeFacebookOAuthSignIn,
    isBusy,
    oauthError,
    router,
    secret,
    status,
    userId,
  ]);

  useEffect(() => {
    if (didCompleteSignIn && status === 'signed-in' && !callbackError) {
      router.replace('/facebook-dashboard' as Href);
    }
  }, [callbackError, didCompleteSignIn, router, status]);

  const invalidCallback = Boolean(oauthError || !userId || !secret);
  const visibleError =
    callbackError ??
    (invalidCallback
      ? 'Facebook sign-in was canceled or could not be completed. Try again.'
      : errorMessage);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
        <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / SECURE ACCESS</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {visibleError ? 'Facebook sign-in failed.' : 'Finishing sign-in…'}
        </Text>
        {visibleError ? (
          <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.danger }]}>
            {visibleError}
          </Text>
        ) : (
          <View style={styles.progressRow}>
            <ActivityIndicator color={colors.scannerCyan} />
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {isCompleting ? 'Checking your Appwrite session…' : 'Opening your dashboard…'}
            </Text>
          </View>
        )}
        {visibleError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(auth)/sign-in' as Href)}
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.gold }, pressed && styles.pressed]}>
            <Text style={[styles.backButtonText, { color: colors.textOnAccent }]}>Return to sign in</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: 22, borderWidth: 1, gap: 14, maxWidth: 480, padding: 24, width: '100%' },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  title: { fontFamily: theme.fonts.bold, fontSize: 24 },
  message: { fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 21 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  backButton: { alignItems: 'center', borderRadius: 13, justifyContent: 'center', marginTop: 4, minHeight: 48, paddingHorizontal: 16 },
  backButtonText: { fontFamily: theme.fonts.bold, fontSize: 13 },
  pressed: { opacity: 0.8 },
});
