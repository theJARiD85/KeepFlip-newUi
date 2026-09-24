import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  disconnectPlaidBankConnection,
  getPlaidBankStatus,
  isPlaidBankingConfigured,
  syncPlaidBankTransactions,
  type PlaidBankConnection,
  type PlaidBankLinkResult,
} from '@/services/plaid-bank-service';
import { PlaidBankLinkButton } from '@/components/books/plaid-bank-link-button';

type PlaidBankConnectionCardProps = {
  automationAllowed: boolean;
  onBooksChanged?: () => void;
};

function shortDate(value: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `Last synced ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : 'Not synced yet';
}

function accountLabel(connection: PlaidBankConnection) {
  const firstAccount = connection.accounts[0];
  if (!firstAccount) return 'Selected business account';
  const name = firstAccount.name || firstAccount.subtype || 'Business account';
  return firstAccount.mask ? `${name} ···${firstAccount.mask}` : name;
}

export function PlaidBankConnectionCard({
  automationAllowed,
  onBooksChanged,
}: PlaidBankConnectionCardProps) {
  const { responsiveFont, responsiveHeight } = useResponsiveLayout();
  const [connections, setConnections] = useState<PlaidBankConnection[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!automationAllowed || !isPlaidBankingConfigured()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const status = await getPlaidBankStatus();
      setConnections(status.connections);
      setAutomationEnabled(status.automationEnabled);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Bank connection status is unavailable right now.',
      );
    } finally {
      setLoading(false);
    }
  }, [automationAllowed]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  const connected = async (result: PlaidBankLinkResult) => {
    setConnections((current) => [
      result.connection,
      ...current.filter((item) => item.connectionId !== result.connection.connectionId),
    ]);
    setMessage(
      result.sync.imported > 0
        ? `Connected ${result.connection.institutionName}; ${result.sync.imported} expense${result.sync.imported === 1 ? '' : 's'} added to Books.`
        : `Connected ${result.connection.institutionName}. No new eligible expenses were found.`,
    );
    await loadStatus();
    onBooksChanged?.();
  };

  const sync = async (connectionId?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncPlaidBankTransactions(connectionId);
      setMessage(
        result.imported > 0
          ? `${result.imported} bank expense${result.imported === 1 ? '' : 's'} added to Books.`
          : result.needsReview > 0
            ? 'Bank data changed after posting; review the flagged records before relying on the totals.'
            : 'Bank sync is up to date. No new eligible expenses were found.',
      );
      await loadStatus();
      onBooksChanged?.();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'KeepFlip could not sync bank expenses.',
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = (connection: PlaidBankConnection) => {
    Alert.alert(
      'Disconnect bank account?',
      'KeepFlip will stop importing new expenses from this account. Existing Books records stay unchanged.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError(null);
              setMessage(null);
              try {
                await disconnectPlaidBankConnection(connection.connectionId);
                setConnections((current) =>
                  current.filter((item) => item.connectionId !== connection.connectionId),
                );
                setMessage('Bank account disconnected. Existing Books records were kept.');
              } catch (caughtError) {
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : 'KeepFlip could not disconnect that bank account.',
                );
              } finally {
                setBusy(false);
              }
            })();
          },
          style: 'destructive',
          text: 'Disconnect',
        },
      ],
    );
  };

  if (!automationAllowed) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <IconSymbol color={theme.colors.goldBright} name="creditcard.fill" size={17} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BANK EXPENSES</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(16) }]}>Automate the money out</Text>
          </View>
          <IconSymbol color={theme.colors.textMuted} name="lock.fill" size={15} />
        </View>
        <Text style={[styles.body, { fontSize: responsiveFont(11), lineHeight: responsiveHeight(16) }]}>
          Connect a business bank account to bring eligible outgoing transactions into Books. This is included with the Serious Reseller plan.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>
          <IconSymbol color={theme.colors.scannerCyan} name="creditcard.fill" size={17} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>BANK EXPENSES</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(16) }]}>Automate the money out</Text>
        </View>
        {loading ? <ActivityIndicator color={theme.colors.scannerCyan} size="small" /> : null}
      </View>

      <Text style={[styles.body, { fontSize: responsiveFont(11), lineHeight: responsiveHeight(16) }]}>
        KeepFlip imports outgoing business transactions into Books as recorded cash expenses. Pending items, transfers, deposits, refunds, and income stay out of expense totals.
      </Text>

      {connections.map((connection) => (
        <View key={connection.connectionId} style={styles.connectionRow}>
          <View style={styles.connectionCopy}>
            <Text style={[styles.connectionName, { fontSize: responsiveFont(12) }]}>
              {connection.institutionName}
            </Text>
            <Text style={[styles.connectionDetail, { fontSize: responsiveFont(10) }]}>
              {accountLabel(connection)} · {shortDate(connection.lastSyncedAt)}
            </Text>
            {connection.lastError ? (
              <Text style={[styles.warningText, { fontSize: responsiveFont(10) }]}>
                Last sync issue: {connection.lastError}
              </Text>
            ) : null}
          </View>
          <View style={styles.connectionActions}>
            <Pressable
              accessibilityLabel={`Disconnect ${connection.institutionName}`}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => disconnect(connection)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, busy && styles.disabled]}>
              <IconSymbol color={theme.colors.textMuted} name="xmark" size={15} />
            </Pressable>
          </View>
        </View>
      ))}

      {automationEnabled ? (
        <Text style={[styles.automationText, { fontSize: responsiveFont(10) }]}>
          Background updates are enabled when Plaid sends new transaction data.
        </Text>
      ) : (
        <Text style={[styles.automationText, { fontSize: responsiveFont(10) }]}>
          Sync runs when you open Books. Add the server webhook setting to enable background updates.
        </Text>
      )}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.errorText, { fontSize: responsiveFont(10) }]}>
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.messageText, { fontSize: responsiveFont(10) }]}>
          {message}
        </Text>
      ) : null}

      {loading ? null : connections.length > 0 ? (
        <Pressable
          accessibilityLabel="Refresh bank connection"
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void sync()}
          style={({ pressed }) => [
            styles.refreshAction,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <IconSymbol color={theme.colors.scannerCyan} name="arrow.clockwise" size={14} />
          <Text style={[styles.refreshActionText, { fontSize: responsiveFont(10) }]}>Refresh connection</Text>
        </Pressable>
      ) : (
        <PlaidBankLinkButton
          busy={busy}
          disabled={loading}
          fontSize={responsiveFont(9)}
          onBusyChange={setBusy}
          onError={setError}
          onLinked={(result) => void connected(result)}
          onStart={() => {
            setError(null);
            setMessage(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 11,
    padding: 14,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceCyan,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, gap: 2 },
  eyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: theme.colors.cream,
    fontWeight: '800',
  },
  body: {
    color: theme.colors.textMuted,
  },
  connectionRow: {
    alignItems: 'center',
    borderColor: theme.colors.divider,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  connectionCopy: { flex: 1, gap: 3 },
  connectionName: { color: theme.colors.cream, fontWeight: '800' },
  connectionDetail: { color: theme.colors.textMuted },
  connectionActions: { flexDirection: 'row', gap: 3 },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  automationText: { color: theme.colors.textMuted, lineHeight: 15 },
  refreshAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 2,
  },
  refreshActionText: {
    color: theme.colors.scannerCyan,
    fontWeight: '800',
  },
  warningText: { color: theme.colors.goldBright, lineHeight: 15 },
  errorText: { color: theme.colors.danger, lineHeight: 15 },
  messageText: { color: theme.colors.scannerCyan, lineHeight: 15 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.48 },
});
