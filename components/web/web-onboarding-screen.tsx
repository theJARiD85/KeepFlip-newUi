import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FlipCompanion } from '@/components/flip';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { getKeepFlipThemeColors, keepFlipTheme as theme } from '@/constants/keepflip-theme';

export function WebOnboardingScreen({
  onExistingLogin,
  onNewUser,
}: {
  onExistingLogin?: () => void;
  onNewUser?: () => void;
}) {
  const router = useRouter();
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const colors = getKeepFlipThemeColors(effectiveColorScheme);
  const { width } = useWindowDimensions();
  const flipSize = width <= 390 ? 108 : 132;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundDeep }]}>
      <View style={styles.content}>
        <View style={[styles.brandMark, { backgroundColor: colors.gold }]}>
          <Text style={[styles.brandMarkText, { color: colors.textOnAccent }]}>K</Text>
        </View>
        <Text style={[styles.eyebrow, { color: colors.goldBright }]}>KEEPFLIP / MEET FLIP</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Source smarter. Flip with a plan.
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Meet Flip, your resale sidekick. A few quick questions will set the buying rules that guide the evidence and advice you see everywhere in KeepFlip.
        </Text>
        <View style={[styles.flipCard, { backgroundColor: colors.iconSurfaceViolet, borderColor: colors.accentVioletBorder }]}>
          <FlipCompanion cropToSquare={false} size={flipSize} />
          <View style={styles.flipCopy}>
            <Text style={[styles.flipEyebrow, { color: colors.scannerCyan }]}>FLIP IS READY</Text>
            <Text style={[styles.flipText, { color: colors.textMuted }]}>He will learn the kind of deals, pace, profit, and risk that fit your business.</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <ActionButton
            colors={colors}
            label="Meet Flip & set my rules"
            onPress={onNewUser ?? (() => router.push('/meet-flip'))}
            primary
          />
          <ActionButton
            colors={colors}
            label="I already use KeepFlip"
            onPress={onExistingLogin ?? (() => router.push('/sign-in'))}
          />
        </View>
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
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 13, letterSpacing: 1.8, marginTop: 22 },
  title: { fontFamily: theme.fonts.bold, fontSize: 42, lineHeight: 49, marginTop: 12, maxWidth: 580, textAlign: 'center' },
  body: { fontFamily: theme.fonts.body, fontSize: 16, lineHeight: 25, marginTop: 14, maxWidth: 520, textAlign: 'center' },
  actions: { gap: 12, marginTop: 30, maxWidth: 440, width: '100%' },
  action: { alignItems: 'center', borderRadius: 14, borderWidth: 1, minHeight: 54, justifyContent: 'center', paddingHorizontal: 18 },
  actionText: { fontFamily: theme.fonts.semibold, fontSize: 14 },
  flipCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 14, marginTop: 28, maxWidth: 440, padding: 14, width: '100%' },
  flipCopy: { flex: 1, gap: 5, minWidth: 0 },
  flipEyebrow: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  flipText: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.78 },
});
