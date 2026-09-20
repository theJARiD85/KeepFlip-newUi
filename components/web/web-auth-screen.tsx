import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type WebAuthMode = 'sign-in' | 'create-account';

export function WebAuthScreen({ initialMode }: { initialMode: WebAuthMode }) {
  const router = useRouter();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const {
    errorMessage,
    isBusy,
    missingKeys,
    signIn,
    signUp,
    status,
  } = useKeepFlipAuth();
  const [mode, setMode] = useState<WebAuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isCreateAccount = mode === 'create-account';
  const submitLabel = isCreateAccount ? 'Create my workspace' : 'Sign in to KeepFlip';

  async function submit() {
    setLocalError(null);
    try {
      if (isCreateAccount) {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
      router.replace('/');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'KeepFlip could not complete that request.');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.root, { backgroundColor: colors.backgroundDeep }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: colors.gold }]}>
            <Text style={[styles.brandMarkText, { color: colors.textOnAccent }]}>K</Text>
          </View>
          <Text style={[styles.brandName, { color: colors.text }]}>KEEPFLIP</Text>
          <View style={[styles.webPill, { borderColor: colors.accentCyanBorder, backgroundColor: colors.iconSurfaceCyan }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.scannerCyan }]} />
            <Text style={[styles.webPillText, { color: colors.scannerCyan }]}>WEB WORKSPACE</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundRaised, borderColor: colors.divider }]}>
          <Text style={[styles.eyebrow, { color: colors.goldBright }]}>RESELLER OPERATIONS, EVERYWHERE</Text>
          <Text style={[styles.title, { color: colors.text }]}>Make every flip easier to trust.</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Use the web workspace for inventory, Books, market research, and assistant planning. Open the Android app when it is time to capture an item.</Text>

          {isCreateAccount ? (
            <Field
              autoCapitalize="words"
              colors={colors}
              label="Your name"
              onChangeText={setName}
              placeholder="Jamie Reseller"
              value={name}
            />
          ) : null}
          <Field
            autoCapitalize="none"
            autoComplete="email"
            colors={colors}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <Field
            autoCapitalize="none"
            autoComplete={isCreateAccount ? 'new-password' : 'password'}
            colors={colors}
            label="Password"
            onChangeText={setPassword}
            placeholder={isCreateAccount ? 'At least 8 characters' : 'Your password'}
            secureTextEntry
            value={password}
          />

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

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: colors.gold },
              pressed && styles.pressed,
              isBusy && styles.disabled,
            ]}
          >
            {isBusy ? <ActivityIndicator color={colors.textOnAccent} /> : null}
            <Text style={[styles.submitText, { color: colors.textOnAccent }]}>{submitLabel}</Text>
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: colors.textMuted }]}>
              {isCreateAccount ? 'Already have a KeepFlip account?' : 'New to KeepFlip?'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLocalError(null);
                setMode(isCreateAccount ? 'sign-in' : 'create-account');
              }}
            >
              <Text style={[styles.switchAction, { color: colors.scannerCyan }]}>
                {isCreateAccount ? 'Sign in' : 'Create an account'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.footerNote, { borderColor: colors.divider }]}>
          <Text style={[styles.footerLabel, { color: colors.goldBright }]}>CAPTURE WHERE IT WORKS BEST</Text>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>KeepFlip’s live scanner, camera permissions, and native vision pipeline stay in the Android app. Your decisions, records, and realized financial picture stay available here.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
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
  webPillText: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1 },
  card: {
    borderRadius: theme.radii.large,
    borderWidth: 1,
    maxWidth: 620,
    padding: 30,
    width: '100%',
  },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.7 },
  title: { fontFamily: theme.fonts.bold, fontSize: 38, lineHeight: 44, marginTop: 10 },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, marginTop: 12, maxWidth: 560 },
  fieldGroup: { gap: 7, marginTop: 20 },
  fieldLabel: { fontFamily: theme.fonts.semibold, fontSize: 11, letterSpacing: 0.6 },
  input: { borderRadius: 14, borderWidth: 1, fontFamily: theme.fonts.body, fontSize: 15, minHeight: 50, paddingHorizontal: 15 },
  errorBox: { borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 12 },
  errorText: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  setupBox: { borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 13 },
  setupTitle: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  setupText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
  submitButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 24, minHeight: 52, paddingHorizontal: 18 },
  submitText: { fontFamily: theme.fonts.bold, fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 22 },
  switchText: { fontFamily: theme.fonts.body, fontSize: 13 },
  switchAction: { fontFamily: theme.fonts.semibold, fontSize: 13 },
  footerNote: { borderTopWidth: 1, marginTop: 24, maxWidth: 620, paddingTop: 18, width: '100%' },
  footerLabel: { fontFamily: theme.fonts.bold, fontSize: 9, letterSpacing: 1.4 },
  footerText: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
});
