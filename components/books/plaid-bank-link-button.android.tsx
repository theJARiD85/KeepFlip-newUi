import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { linkPlaidBankAccount } from '@/services/plaid-bank-link.android';
import type { PlaidBankLinkResult } from '@/services/plaid-bank-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type PlaidBankLinkButtonProps = {
  busy: boolean;
  disabled?: boolean;
  fontSize: number;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onLinked: (result: PlaidBankLinkResult) => void;
  onStart: () => void;
};

export function PlaidBankLinkButton({
  busy,
  disabled = false,
  fontSize,
  onBusyChange,
  onError,
  onLinked,
  onStart,
}: PlaidBankLinkButtonProps) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [opening, setOpening] = useState(false);

  const start = async () => {
    if (busy || opening || disabled) return;
    onStart();
    onBusyChange(true);
    setOpening(true);
    try {
      onLinked(await linkPlaidBankAccount());
    } catch (caughtError) {
      onError(
        caughtError instanceof Error
          ? caughtError.message
          : 'KeepFlip could not connect that bank account.',
      );
    } finally {
      setOpening(false);
      onBusyChange(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: busy || opening, disabled: busy || opening || disabled }}
      disabled={busy || opening || disabled}
      onPress={() => void start()}
      style={({ pressed }) => [responsiveStyles.button, pressed && responsiveStyles.pressed, (busy || opening || disabled) && responsiveStyles.disabled]}>
      {busy || opening ? (
        <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
      ) : (
        <Ionicons color={theme.colors.textOnAccent} name="arrow-forward" size={15} />
      )}
      <Text style={[responsiveStyles.label, { fontSize }]}>CONNECT BUSINESS BANK</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 9,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 41,
    paddingHorizontal: 12,
  },
  label: {
    color: theme.colors.textOnAccent,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.48 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    button: {
      ...styles["button"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      gap: layout.isWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
      minHeight: layout.isWeb ? layout.webResponsiveHeight(41) : layout.responsiveHeight(41),
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
  });
}
