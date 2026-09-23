import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  syncPlaidBankTransactions,
  type PlaidBankLinkResult,
} from '@/services/plaid-bank-service';

const LINK_TOKEN_STORAGE_KEY = 'keepflip.plaid.link_token';

function clearSavedLinkToken() {
  try {
    window.sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted browser contexts.
  }
}

function clearOAuthReturnQuery() {
  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has('oauth_state_id')) return;
  currentUrl.searchParams.delete('oauth_state_id');
  window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

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
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string>();
  const [openWhenReady, setOpenWhenReady] = useState(false);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      clearSavedLinkToken();
      clearOAuthReturnQuery();
      try {
        if (!publicToken) throw new Error('Plaid did not return a bank connection token.');
        const connection = await exchangePlaidPublicToken({
          accounts: metadata.accounts.slice(0, 50).map((account) => ({
            id: account.id,
            mask: account.mask,
            name: account.name,
            subtype: account.subtype,
            type: account.type,
          })),
          institution: metadata.institution
            ? { id: metadata.institution.institution_id, name: metadata.institution.name }
            : null,
          publicToken,
        });
        const result = {
          connection,
          sync: await syncPlaidBankTransactions(connection.connectionId),
        };
        setLinkToken(null);
        setReceivedRedirectUri(undefined);
        onLinked(result);
      } catch (caughtError) {
        onError(
          caughtError instanceof Error
            ? caughtError.message
            : 'KeepFlip could not finish connecting that bank account.',
        );
      } finally {
        onBusyChange(false);
        setOpenWhenReady(false);
      }
    },
    [onBusyChange, onError, onLinked],
  );

  const { error: plaidLoadError, open, ready } = usePlaidLink({
    onExit: (error) => {
      clearSavedLinkToken();
      clearOAuthReturnQuery();
      setLinkToken(null);
      setReceivedRedirectUri(undefined);
      setOpenWhenReady(false);
      onBusyChange(false);
      if (error?.display_message || error?.error_message) {
        onError(error.display_message || error.error_message);
      }
    },
    onSuccess,
    receivedRedirectUri,
    token: linkToken,
  });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (!query.has('oauth_state_id')) return;

    let savedToken: string | null = null;
    try {
      savedToken = window.sessionStorage.getItem(LINK_TOKEN_STORAGE_KEY);
    } catch {
      onError('This browser could not resume the secure bank-link session. Please try again.');
      return;
    }

    if (!savedToken) {
      onError('The bank sign-in session expired. Please start the connection again.');
      return;
    }
    setLinkToken(savedToken);
    setReceivedRedirectUri(window.location.href);
    setOpenWhenReady(true);
    onBusyChange(true);
  }, [onBusyChange, onError]);

  useEffect(() => {
    if (!openWhenReady || !ready) return;
    setOpenWhenReady(false);
    open();
  }, [open, openWhenReady, ready]);

  useEffect(() => {
    if (!plaidLoadError) return;
    onError('Plaid Link could not load. Check your connection and try again.');
    onBusyChange(false);
  }, [onBusyChange, onError, plaidLoadError]);

  const start = async () => {
    if (busy || disabled) return;
    onStart();
    onBusyChange(true);
    try {
      const { linkToken: nextToken } = await createPlaidLinkToken('web');
      window.sessionStorage.setItem(LINK_TOKEN_STORAGE_KEY, nextToken);
      setReceivedRedirectUri(undefined);
      setLinkToken(nextToken);
      setOpenWhenReady(true);
    } catch (caughtError) {
      onError(
        caughtError instanceof Error
          ? caughtError.message
          : 'KeepFlip could not prepare secure bank linking.',
      );
      onBusyChange(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={() => void start()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, (busy || disabled) && styles.disabled]}>
      {busy ? (
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
