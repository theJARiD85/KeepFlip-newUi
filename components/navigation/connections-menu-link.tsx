import { Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type ConnectionsMenuLinkProps = {
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

export function ConnectionsMenuLink({
  active,
  disabled,
  onPress,
}: ConnectionsMenuLinkProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();

  return (
    <Pressable
      accessibilityHint="Opens the page to connect, refresh, or revoke eBay and bank connections."
      accessibilityLabel="Manage connections"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        active && styles.linkActive,
        disabled && styles.linkDisabled,
        pressed && !disabled && styles.linkPressed,
      ]}>
      <View style={[styles.iconShell, active && styles.iconShellActive]}>
        <IconSymbol
          color={active ? theme.colors.scannerCyan : theme.colors.goldBright}
          name="checkmark.shield.fill"
          size={21}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { fontSize: responsiveFont(13) }]}>Connections</Text>
        <Text style={[styles.detail, { fontSize: responsiveFont(7) }]}>EBAY + BANK ACCOUNTS</Text>
      </View>
      <IconSymbol color={theme.colors.goldMuted} name="chevron.right" size={18} />
    </Pressable>
  );
}

function createResponsiveStyles() {
  return StyleSheet.create({
    link: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.cardSoft,
    },
    linkActive: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    linkDisabled: { opacity: 0.56 },
    linkPressed: { opacity: 0.76 },
    iconShell: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    iconShellActive: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    copy: { minWidth: 0, flex: 1, gap: 3 },
    label: {
      color: theme.colors.cream,
      fontWeight: '800',
    },
    detail: {
      color: theme.colors.textMuted,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
  });
}
