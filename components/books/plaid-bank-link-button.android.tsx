import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import type { PlaidBankLinkResult } from '@/services/plaid-bank-service';
import { linkPlaidBankAccount } from '@/services/plaid-bank-link.android';

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
      style={({ pressed }) => [styles.button, pressed && styles.pressed, (busy || opening || disabled) && styles.disabled]}>
      {busy || opening ? (
        <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
      ) : (
        <IconSymbol color={theme.colors.textOnAccent} name="arrow.right" size={15} />
      )}
      <Text style={[styles.label, { fontSize }]}>CONNECT BUSINESS BANK</Text>
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
