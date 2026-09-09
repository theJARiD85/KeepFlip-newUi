import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { useEbayConnection } from '@/components/ebay/ebay-connection-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type EbayMenuConnectionLinkProps = {
  active: boolean;
  disabled: boolean;
  open: boolean;
  onPress: (connected: boolean) => void;
};

export function EbayMenuConnectionLink({
  active,
  disabled,
  open,
  onPress,
}: EbayMenuConnectionLinkProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const {
    connection,
    errorMessage,
    isChecking,
    refreshConnection,
  } = useEbayConnection();

  useEffect(() => {
    if (!open) return;

    void refreshConnection();
  }, [open, refreshConnection]);

  const hasStatusError = errorMessage !== null;

  const isConnected = connection?.connected === true;
  const interactionDisabled = disabled || isChecking;
  const username = isConnected ? connection?.ebayUsername : undefined;
  const label = isChecking
    ? 'Checking eBay account'
    : isConnected
      ? 'eBay account connected'
      : hasStatusError
        ? 'Check eBay connection'
        : 'Link your eBay account';
  const detail = isChecking
    ? 'SECURE STATUS CHECK'
    : isConnected
      ? username
        ? 'CONNECTED AS ' + username + ' · MANAGE ACCESS'
        : 'CONNECTED · MANAGE ACCESS'
      : hasStatusError
        ? 'STATUS UNAVAILABLE · OPEN TO RETRY'
        : 'CONNECT EBAY ACCESS';
  const accessibilityLabel = isConnected
    ? username
      ? 'Manage connected eBay account ' + username
      : 'Manage connected eBay account'
    : 'Link your eBay account';
  const accessibilityHint = isConnected
    ? 'Opens eBay account settings, including the option to revoke access.'
    : 'Opens the secure eBay connection screen.';

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={interactionDisabled}
      onPress={() => onPress(isConnected)}
      style={({ pressed }) => [
        styles.link,
        (active || isConnected) && styles.linkActive,
        isConnected && styles.linkConnected,
        interactionDisabled && styles.linkDisabled,
        pressed && !interactionDisabled && styles.linkPressed,
      ]}>
      <EbayShoppingBagIcon size={29} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.label, { fontSize: responsiveFont(13) }]}>
          {label}
        </Text>
        <Text numberOfLines={1} style={[styles.detail, isConnected && styles.detailConnected]}>
          {detail}
        </Text>
      </View>
      <IconSymbol
        color={isConnected ? theme.colors.scannerCyan : theme.colors.goldMuted}
        name="chevron.right"
        size={18}
      />
    </Pressable>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
    const staticStyles = StyleSheet.create({
  link: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.18)',
    backgroundColor: 'rgba(6, 6, 9, 0.62)',
  },
  linkActive: {
    borderColor: 'rgba(242, 211, 138, 0.36)',
    backgroundColor: 'rgba(215, 168, 74, 0.09)',
  },
  linkConnected: {
    borderColor: 'rgba(88, 223, 232, 0.48)',
    backgroundColor: 'rgba(88, 223, 232, 0.08)',
  },
  linkDisabled: {
    opacity: 0.56,
  },
  linkPressed: {
    opacity: 0.76,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  label: {
    color: theme.colors.cream,
    fontSize: 13,
    fontWeight: '800',
  },
  detail: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  detailConnected: {
    color: theme.colors.scannerCyan,
  },
});
  return {
    ...staticStyles,
  label: [
    staticStyles.label,
    {
        fontSize: responsiveLayout.responsiveFont(13),
    },
  ],
  detail: [
    staticStyles.detail,
    {
        fontSize: responsiveLayout.responsiveFont(7),
    },
  ],
  };
}
