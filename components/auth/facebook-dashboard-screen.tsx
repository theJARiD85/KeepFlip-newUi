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
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export function FacebookDashboardScreen() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
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
      <View style={[responsiveStyles.root, { backgroundColor: colors.backgroundDeep }]}>
        <View style={[responsiveStyles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
          <ActivityIndicator color={colors.scannerCyan} />
          <Text style={[responsiveStyles.subtitle, { color: colors.textMuted }]}>Checking your Appwrite session…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[responsiveStyles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View style={[responsiveStyles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
        <Text style={[responsiveStyles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / DASHBOARD</Text>
        <Text style={[responsiveStyles.title, { color: colors.text }]}>You’re signed in.</Text>
        <Text style={[responsiveStyles.subtitle, { color: colors.textMuted }]}>Your Appwrite account is ready.</Text>

        <View style={[responsiveStyles.userCard, { backgroundColor: colors.surfaceInset, borderColor: colors.divider }]}>
          <Text style={[responsiveStyles.userLabel, { color: colors.textMuted }]}>SIGNED IN AS</Text>
          <Text style={[responsiveStyles.userName, { color: colors.text }]}>
            {user.name.trim() || user.email || 'KeepFlip user'}
          </Text>
          {user.email ? (
            <Text style={[responsiveStyles.userEmail, { color: colors.textMuted }]}>{user.email}</Text>
          ) : null}
        </View>

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={[responsiveStyles.errorText, { color: colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isSigningOut, disabled: isSigningOut }}
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [
            responsiveStyles.signOutButton,
            { backgroundColor: colors.gold },
            isSigningOut && responsiveStyles.disabled,
            pressed && !isSigningOut && responsiveStyles.pressed,
          ]}>
          {isSigningOut ? <ActivityIndicator color={colors.textOnAccent} size="small" /> : null}
          <Text style={[responsiveStyles.signOutText, { color: colors.textOnAccent }]}>Sign out</Text>
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    card: {
      ...styles["card"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(22) : 22,
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(540) : 540,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(30) : 30,
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(21) : 21,
    },
    userCard: {
      ...styles["userCard"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(15) : 15,
      gap: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(100) : 100,
    },
    userLabel: {
      ...styles["userLabel"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    userName: {
      ...styles["userName"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(19) : 19,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(26) : 26,
    },
    userEmail: {
      ...styles["userEmail"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : 13,
    },
    errorText: {
      ...styles["errorText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
    signOutButton: {
      ...styles["signOutButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(14) : 14,
      gap: layout.isWeb ? layout.webResponsiveWidth(9) : 9,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(8) : 8,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(50) : 50,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
    },
    signOutText: {
      ...styles["signOutText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
  });
}
