import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

type WebOnboardingStage = 'welcome' | 'meet-flip';

export function WebOnboardingScreen({ stage }: { stage: WebOnboardingStage }) {
  const router = useRouter();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const isWelcome = stage === 'welcome';

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View style={styles.content}>
        <View style={[styles.brandMark, { backgroundColor: colors.gold }]}>
          <Text style={[styles.brandMarkText, { color: colors.textOnAccent }]}>K</Text>
        </View>
        <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP WEB WORKSPACE</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {isWelcome ? 'A calmer way to decide what to flip.' : 'Set up your reseller workspace.'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {isWelcome
            ? 'KeepFlip turns item evidence, realized costs, and resale operations into one clear next move.'
            : 'Tell us where you are starting. You can refine sourcing rules and business details after you create your account.'}
        </Text>

        {isWelcome ? (
          <View style={styles.actions}>
            <ActionButton
              colors={colors}
              label="Create an account"
              onPress={() => router.push('/meet-flip')}
              primary
            />
            <ActionButton
              colors={colors}
              label="I already use KeepFlip"
              onPress={() => router.push('/sign-in')}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            <View style={[styles.note, { backgroundColor: colors.iconSurfaceCyan, borderColor: colors.accentCyanBorder }]}>
              <Text style={[styles.noteTitle, { color: colors.scannerCyan }]}>WEB-FIRST SETUP</Text>
              <Text style={[styles.noteBody, { color: colors.textMuted }]}>The Android app will handle camera capture. Your account, inventory, Books, and research are ready here.</Text>
            </View>
            <ActionButton
              colors={colors}
              label="Continue to account creation"
              onPress={() => router.push('/subscription-setup')}
              primary
            />
            <ActionButton
              colors={colors}
              label="Back"
              onPress={() => router.back()}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function ActionButton({
  colors,
  label,
  onPress,
  primary = false,
}: {
  colors: ReturnType<typeof getKeepFlipThemeColors>;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary
          ? { backgroundColor: colors.gold, borderColor: colors.gold }
          : { backgroundColor: colors.backgroundRaised, borderColor: colors.divider },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, { color: primary ? colors.textOnAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  content: { alignItems: 'center', maxWidth: 620, width: '100%' },
  brandMark: { alignItems: 'center', borderRadius: 16, height: 52, justifyContent: 'center', width: 52 },
  brandMarkText: { fontFamily: theme.fonts.bold, fontSize: 28 },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.8, marginTop: 22 },
  title: { fontFamily: theme.fonts.bold, fontSize: 42, lineHeight: 49, marginTop: 12, maxWidth: 580, textAlign: 'center' },
  body: { fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 25, marginTop: 14, maxWidth: 520, textAlign: 'center' },
  actions: { gap: 12, marginTop: 30, maxWidth: 440, width: '100%' },
  action: { alignItems: 'center', borderRadius: 14, borderWidth: 1, minHeight: 54, justifyContent: 'center', paddingHorizontal: 18 },
  actionText: { fontFamily: theme.fonts.semibold, fontSize: 14 },
  note: { borderRadius: 14, borderWidth: 1, padding: 15 },
  noteTitle: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  noteBody: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19, marginTop: 5 },
  pressed: { opacity: 0.78 },
});
