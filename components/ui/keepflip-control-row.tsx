import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

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
  accent?: 'cyan' | 'gold' | 'violet';
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
  const iconColor =
    accent === 'cyan'
      ? theme.colors.scannerCyan
      : accent === 'violet'
        ? theme.colors.scannerViolet
        : theme.colors.goldBright;
  const iconStyle =
    accent === 'cyan'
      ? styles.rowIconCyan
      : accent === 'violet'
        ? styles.rowIconViolet
        : styles.rowIconGold;
  const isPressable = Boolean(onPress) && !actionBusy;

  const content = (
    <>
      <View style={[styles.rowIcon, iconStyle]}>
        {leading ?? (icon ? <IconSymbol color={iconColor} name={icon} size={19} /> : null)}
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{label}</Text>
          {status ? <KeepFlipStatusBadge label={status.label} tone={status.tone} /> : null}
        </View>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {actionBusy ? (
        <ActivityIndicator color={iconColor} size="small" style={styles.rowSpinner} />
      ) : isPressable && actionLabel ? (
        <View style={styles.rowAction}>
          <Text style={styles.rowActionText}>{actionLabel}</Text>
        </View>
      ) : isPressable ? (
        <IconSymbol
          color={theme.colors.goldMuted}
          name="chevron.right"
          size={18}
          style={styles.rowChevron}
        />
      ) : staticLabel ? (
        <Text style={styles.rowStaticLabel}>{staticLabel}</Text>
      ) : null}
    </>
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

const styles = StyleSheet.create({
  controlRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(242, 211, 138, 0.14)',
  },
  controlRowPressed: {
    backgroundColor: 'rgba(242, 211, 138, 0.05)',
  },
  rowIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(3, 3, 6, 0.54)',
  },
  rowIconGold: { borderColor: 'rgba(242, 211, 138, 0.23)' },
  rowIconCyan: { borderColor: 'rgba(88, 223, 232, 0.24)' },
  rowIconViolet: { borderColor: 'rgba(141, 114, 255, 0.26)' },
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
    borderColor: 'rgba(242, 211, 138, 0.28)',
    backgroundColor: 'rgba(215, 168, 74, 0.075)',
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
    borderColor: 'rgba(88, 223, 232, 0.30)',
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
  },
  statusBadgeMuted: {
    borderColor: 'rgba(242, 211, 138, 0.20)',
    backgroundColor: 'rgba(242, 211, 138, 0.04)',
  },
  statusBadgeWarning: {
    borderColor: 'rgba(224, 172, 75, 0.32)',
    backgroundColor: 'rgba(224, 172, 75, 0.06)',
  },
  statusBadgeDanger: {
    borderColor: 'rgba(232, 97, 88, 0.34)',
    backgroundColor: 'rgba(232, 97, 88, 0.06)',
  },
  statusBadgeViolet: {
    borderColor: 'rgba(141, 114, 255, 0.30)',
    backgroundColor: 'rgba(141, 114, 255, 0.07)',
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
