import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
type KeepFlipControlIconName = ComponentProps<typeof IconSymbol>['name'];
export type KeepFlipStatusTone =
  | 'active'
  | 'muted'
  | 'warning'
  | 'danger'
  | 'violet';

export type KeepFlipStatusBadgeProps = {
  label: string;
  tone: KeepFlipStatusTone;
};

export type KeepFlipControlRowProps = {
  accent?: 'cyan' | 'gold' | 'violet' | 'danger';
  actionBusy?: boolean;
  actionLabel?: string;
  accessibilityHint?: string;
  description: string;
  icon?: KeepFlipControlIconName;
  label: string;
  leading?: ReactNode;
  onPress?: () => void;
  staticLabel?: string;
  status?: KeepFlipStatusBadgeProps;
};

export function KeepFlipStatusBadge({
  label,
  tone,
}: KeepFlipStatusBadgeProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const chipStyle = {
    active: styles.statusBadgeActive,
    muted: styles.statusBadgeMuted,
    warning: styles.statusBadgeWarning,
    danger: styles.statusBadgeDanger,
    violet: styles.statusBadgeViolet,
  }[tone];
  const textStyle = {
    active: styles.statusBadgeTextActive,
    muted: styles.statusBadgeTextMuted,
    warning: styles.statusBadgeTextWarning,
    danger: styles.statusBadgeTextDanger,
    violet: styles.statusBadgeTextViolet,
  }[tone];
  const dotStyle = {
    active: styles.statusBadgeDotActive,
    muted: styles.statusBadgeDotMuted,
    warning: styles.statusBadgeDotWarning,
    danger: styles.statusBadgeDotDanger,
    violet: styles.statusBadgeDotViolet,
  }[tone];

  return (
    <View accessibilityLabel={label} style={[styles.statusBadge, chipStyle]}>
      <View style={[styles.statusBadgeDot, dotStyle]} />
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

export function KeepFlipControlRow({
  accent = 'gold',
  actionBusy = false,
  actionLabel,
  accessibilityHint,
  description,
  icon,
  label,
  leading,
  onPress,
  staticLabel,
  status,
}: KeepFlipControlRowProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const iconColor =
    accent === 'cyan'
      ? theme.colors.scannerCyan
      : accent === 'violet'
        ? theme.colors.scannerViolet
        : accent === 'danger'
          ? theme.colors.danger
          : theme.colors.goldBright;
  const iconStyle =
    accent === 'cyan'
      ? styles.rowIconCyan
      : accent === 'violet'
        ? styles.rowIconViolet
        : styles.rowIconGold;
  const isPressable = Boolean(onPress) && !actionBusy;

  const content = (
    <View style={styles.container}>
      <View style={[styles.rowIcon, iconStyle]}>
        {leading ?? (icon ? <IconSymbol color={iconColor} name={icon} size={19} /> : null)}
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, { fontSize: responsiveFont(14) }]}>{label}</Text>
          {status ? <KeepFlipStatusBadge label={status.label} tone={status.tone} /> : null}
        </View>
        <Text style={[styles.rowDescription, { fontSize: responsiveFont(10), lineHeight: 14 }]}>{description}</Text>
      </View>
      {actionBusy ? (
        <ActivityIndicator color={iconColor} size="small" style={styles.rowSpinner} />
      ) : isPressable && actionLabel ? (
        <View style={styles.rowAction}>
          <Text style={[styles.rowActionText, { fontSize: responsiveFont(7) }]}>{actionLabel}</Text>
        </View>
      ) : isPressable ? (
        <IconSymbol
          color={theme.colors.goldMuted}
          name="chevron.right"
          size={18}
          style={styles.rowChevron}
        />
      ) : staticLabel ? (
        <Text style={[styles.rowStaticLabel, { fontSize: responsiveFont(7) }]}>{staticLabel}</Text>
      ) : null}
    </View>
  );

  if (!isPressable) {
    return <View style={styles.controlRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.controlRow, pressed && styles.controlRowPressed]}>
      {content}
    </Pressable>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 7
    },
    controlRow: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    controlRowPressed: {
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    rowIcon: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: theme.colors.iconSurface,
    },
    rowIconGold: {
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    rowIconCyan: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    rowIconViolet: {
      borderColor: theme.colors.accentVioletBorder,
      backgroundColor: theme.colors.iconSurfaceViolet,
    },
    rowCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    rowTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rowTitle: {
      minWidth: 0,
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    rowDescription: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 14,
    },
    rowAction: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 7,
      paddingVertical: 6,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    rowActionText: {
      color: theme.colors.goldBright,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    rowChevron: { marginLeft: 1 },
    rowSpinner: { marginHorizontal: 4 },
    rowStaticLabel: {
      maxWidth: 68,
      color: theme.colors.goldMuted,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.6,
      textAlign: 'right',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
    },
    statusBadgeActive: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    statusBadgeMuted: {
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    statusBadgeWarning: {
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    statusBadgeDanger: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
    },
    statusBadgeViolet: {
      borderColor: theme.colors.accentVioletBorder,
      backgroundColor: theme.colors.iconSurfaceViolet,
    },
    statusBadgeDot: {
      width: 4,
      height: 4,
      borderRadius: theme.radii.pill,
    },
    statusBadgeDotActive: { backgroundColor: theme.colors.scannerCyan },
    statusBadgeDotMuted: { backgroundColor: theme.colors.goldMuted },
    statusBadgeDotWarning: { backgroundColor: theme.colors.scannerAmber },
    statusBadgeDotDanger: { backgroundColor: theme.colors.danger },
    statusBadgeDotViolet: { backgroundColor: theme.colors.scannerViolet },
    statusBadgeText: {
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.62,
    },
    statusBadgeTextActive: { color: theme.colors.scannerCyan },
    statusBadgeTextMuted: { color: theme.colors.goldMuted },
    statusBadgeTextWarning: { color: theme.colors.scannerAmber },
    statusBadgeTextDanger: { color: theme.colors.danger },
    statusBadgeTextViolet: { color: theme.colors.scannerViolet },
  });
  return {
    ...staticStyles,
    rowIcon: [
      staticStyles.rowIcon,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    rowTitle: [
      staticStyles.rowTitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    rowDescription: [
      staticStyles.rowDescription,
      {
        fontSize: responsiveFont(10),
      },
    ],
    rowActionText: [
      staticStyles.rowActionText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    rowStaticLabel: [
      staticStyles.rowStaticLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    statusBadgeDot: [
      staticStyles.statusBadgeDot,
      {
        width: responsiveWidth(4),
        height: responsiveHeight(4),
      },
    ],
    statusBadgeText: [
      staticStyles.statusBadgeText,
      {
        fontSize: responsiveFont(7),
      },
    ],
  };
}
