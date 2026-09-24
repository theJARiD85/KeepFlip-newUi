import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipAppearancePicker } from '@/components/settings/keepflip-appearance-picker';
import { useFreeTierPaywall } from '@/components/subscription/use-free-tier-paywall';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export default function FreeAccountRoute() {
  const styles = useResponsiveStyles(createStyles);
  const { responsiveFont } = useResponsiveLayout();
  const { isBusy, signOut, user } = useKeepFlipAuth();
  const presentPaywall = useFreeTierPaywall();
  const [appearancePickerOpen, setAppearancePickerOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert(
        'Could not sign out',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  return (
    <KeepFlipBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>KEEPFLIP / FREE SCANNER</Text>
        <Text style={[styles.title, { fontSize: responsiveFont(27) }]}>Your account</Text>
        <Text style={[styles.subtitle, { fontSize: responsiveFont(13) }]}>Your scanner and valuation workspace.</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <IconSymbol color={theme.colors.goldBright} name="person.crop.circle.fill" size={28} />
          </View>
          <View style={styles.profileCopy}>
            <Text style={[styles.name, { fontSize: responsiveFont(17) }]}>{user?.name || 'KeepFlip member'}</Text>
            <Text style={[styles.email, { fontSize: responsiveFont(12) }]}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <View style={styles.freeCard}>
          <Text style={[styles.freeLabel, { fontSize: responsiveFont(10) }]}>CURRENT ACCESS</Text>
          <Text style={[styles.freeTitle, { fontSize: responsiveFont(18) }]}>Free Scanner</Text>
          <Text style={[styles.subtitle, { fontSize: responsiveFont(12) }]}>Scan and value items here. Your scans aren’t saved to inventory.</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void presentPaywall('/command-center')}
          style={({ pressed }) => [styles.action, styles.upgradeAction, pressed && styles.pressed]}>
          <IconSymbol color={theme.colors.backgroundDeep} name="sparkles" size={18} />
          <Text style={[styles.upgradeText, { fontSize: responsiveFont(13) }]}>Explore the full KeepFlip plan</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setAppearancePickerOpen(true)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <IconSymbol color={theme.colors.goldBright} name="circle.lefthalf.filled" size={18} />
          <Text style={[styles.actionText, { fontSize: responsiveFont(13) }]}>Appearance</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [styles.action, isBusy && styles.disabled, pressed && styles.pressed]}>
          <IconSymbol color={theme.colors.textMuted} name="rectangle.portrait.and.arrow.right" size={18} />
          <Text style={[styles.actionText, { fontSize: responsiveFont(13) }]}>{isBusy ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </ScrollView>
      <KeepFlipAppearancePicker
        onClose={() => setAppearancePickerOpen(false)}
        visible={appearancePickerOpen}
      />
    </KeepFlipBackground>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingTop: 96, gap: 14 },
    eyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.display, letterSpacing: 1.8 },
    title: { color: theme.colors.cream, fontFamily: theme.fonts.bold },
    subtitle: { color: theme.colors.textMuted, fontFamily: theme.fonts.body, lineHeight: 19 },
    profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.accentGoldBorder, backgroundColor: theme.colors.card },
    avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: theme.colors.iconSurfaceGold },
    profileCopy: { flex: 1, gap: 4 },
    name: { color: theme.colors.cream, fontFamily: theme.fonts.bold },
    email: { color: theme.colors.textMuted, fontFamily: theme.fonts.body },
    freeCard: { padding: 18, gap: 7, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(88, 223, 232, 0.35)', backgroundColor: 'rgba(88, 223, 232, 0.07)' },
    freeLabel: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.display, letterSpacing: 1.5 },
    freeTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold },
    action: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.surfaceSoft, backgroundColor: theme.colors.card },
    upgradeAction: { justifyContent: 'center', borderColor: theme.colors.scannerCyan, backgroundColor: theme.colors.scannerCyan },
    upgradeText: { color: theme.colors.backgroundDeep, fontFamily: theme.fonts.bold },
    actionText: { color: theme.colors.cream, fontFamily: theme.fonts.medium },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.5 },
  });
}
