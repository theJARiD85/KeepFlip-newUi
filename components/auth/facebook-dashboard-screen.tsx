import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { Models } from 'react-native-appwrite';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { getAppwriteCoreServices } from '@/lib/appwrite';

export function FacebookDashboardScreen() {
  const router = useRouter();
  const { signOut, status } = useKeepFlipAuth();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const [user, setUser] = useState<Models.User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'checking') return;
    if (status !== 'signed-in') {
      router.replace('/(auth)/sign-in' as Href);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const currentUser = await getAppwriteCoreServices().account.get();
        if (!cancelled) setUser(currentUser);
      } catch {
        await signOut().catch(() => undefined);
        if (!cancelled) {
          router.replace('/(auth)/sign-in' as Href);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, signOut, status]);

  const handleSignOut = async () => {
    if (isSigningOut || !user) return;
    setErrorMessage(null);
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/(auth)/sign-in' as Href);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not sign you out. Please try again.',
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  if (status !== 'signed-in' || !user) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
          <ActivityIndicator color={colors.scannerCyan} />
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Checking your Appwrite session…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
        <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / DASHBOARD</Text>
        <Text style={[styles.title, { color: colors.text }]}>You’re signed in.</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Your Appwrite account is ready.</Text>

        <View style={[styles.userCard, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
          <Text style={[styles.userLabel, { color: colors.textMuted }]}>SIGNED IN AS</Text>
          <Text style={[styles.userName, { color: colors.text }]}>
            {user.name.trim() || user.email || 'KeepFlip user'}
          </Text>
          {user.email ? (
            <Text style={[styles.userEmail, { color: colors.textMuted }]}>{user.email}</Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isSigningOut, disabled: isSigningOut }}
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: colors.gold },
            isSigningOut && styles.disabled,
            pressed && !isSigningOut && styles.pressed,
          ]}>
          {isSigningOut ? <ActivityIndicator color={colors.textOnAccent} size="small" /> : null}
          <Text style={[styles.signOutText, { color: colors.textOnAccent }]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: 22, borderWidth: 1, gap: 12, maxWidth: 540, padding: 26, width: '100%' },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  title: { fontFamily: theme.fonts.bold, fontSize: 30 },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 21 },
  userCard: { borderRadius: 15, borderWidth: 1, gap: 6, marginTop: 8, minHeight: 100, justifyContent: 'center', padding: 16 },
  userLabel: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1 },
  userName: { fontFamily: theme.fonts.bold, fontSize: 19, lineHeight: 26 },
  userEmail: { fontFamily: theme.fonts.body, fontSize: 13 },
  errorText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18 },
  signOutButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 8, minHeight: 50, paddingHorizontal: 16 },
  signOutText: { fontFamily: theme.fonts.bold, fontSize: 14 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
