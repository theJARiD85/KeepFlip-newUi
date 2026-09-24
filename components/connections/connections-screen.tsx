import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEbayConnection } from '@/components/ebay/ebay-connection-context';
import { PlaidBankLinkButton } from '@/components/books/plaid-bank-link-button';
import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import {
  refreshEbayConnection,
  revokeEbayConnection,
} from '@/services/ebayConnectionService';
import {
  disconnectPlaidBankConnection,
  getPlaidBankStatus,
  isPlaidBankingConfigured,
  syncPlaidBankTransactions,
  type PlaidBankConnection,
  type PlaidBankLinkResult,
  type PlaidBankStatus,
} from '@/services/plaid-bank-service';

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function accountLabel(connection: PlaidBankConnection) {
  const firstAccount = connection.accounts[0];
  if (!firstAccount) return 'Selected business account';
  const name = firstAccount.name || firstAccount.subtype || 'Business account';
  return firstAccount.mask ? `${name} ···${firstAccount.mask}` : name;
}

function lastSyncedLabel(value: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `Last synced ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : 'Not synced yet';
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, contentWidth, pageGutter, responsiveFont, responsiveHeight } =
    useResponsiveLayout();
  const { canUse } = useKeepFlipSubscription();
  const { connection: ebayConnection, errorMessage: ebayStatusError, isChecking: isCheckingEbay,
    refreshConnection: refreshEbayStatus, setDisconnected } = useEbayConnection();

  const automatedBooksAllowed = canUse('automated_books');
  const plaidConfigured = isPlaidBankingConfigured();
  const canManagePlaid = automatedBooksAllowed && plaidConfigured;
  const plaidLinkSupported = process.env.EXPO_OS === 'android' || process.env.EXPO_OS === 'web';

  const [plaidStatus, setPlaidStatus] = useState<PlaidBankStatus | null>(null);
  const [isLoadingPlaid, setIsLoadingPlaid] = useState(true);
  const [plaidStatusError, setPlaidStatusError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEbayRevoke, setConfirmEbayRevoke] = useState(false);
  const [confirmPlaidDisconnect, setConfirmPlaidDisconnect] = useState<string | null>(null);

  const loadPlaidStatus = useCallback(async () => {
    if (!canManagePlaid) {
      setPlaidStatus(null);
      setPlaidStatusError(null);
      setIsLoadingPlaid(false);
      return;
    }

    setIsLoadingPlaid(true);
    try {
      const status = await getPlaidBankStatus();
      setPlaidStatus(status);
      setPlaidStatusError(null);
    } catch (error) {
      setPlaidStatusError(errorText(error, 'KeepFlip could not check your bank connections.'));
    } finally {
      setIsLoadingPlaid(false);
    }
  }, [canManagePlaid]);

  useFocusEffect(
    useCallback(() => {
      void refreshEbayStatus();
      void loadPlaidStatus();
    }, [loadPlaidStatus, refreshEbayStatus]),
  );

  const plaidConnections = plaidStatus?.connections ?? [];

  const refreshEbay = async () => {
    if (busyAction || !ebayConnection?.connected) return;
    hapticSelection();
    setBusyAction('ebay-refresh');
    setActionError(null);
    setNotice(null);
    try {
      await refreshEbayConnection(ebayConnection.environment);
      const refreshedStatus = await refreshEbayStatus();
      if (!refreshedStatus?.connected) {
        throw new Error('The eBay connection could not be confirmed after refresh.');
      }
      setNotice('eBay access refreshed securely.');
    } catch (error) {
      setActionError(errorText(error, 'KeepFlip could not refresh eBay access.'));
    } finally {
      setBusyAction(null);
    }
  };

  const revokeEbay = async () => {
    if (busyAction || !ebayConnection?.connected) return;
    setBusyAction('ebay-revoke');
    setActionError(null);
    setNotice(null);
    try {
      const result = await revokeEbayConnection(ebayConnection.environment);
      setDisconnected(result);
      setConfirmEbayRevoke(false);
      setNotice('eBay access was revoked. You can reconnect it at any time.');
    } catch (error) {
      setActionError(errorText(error, 'KeepFlip could not revoke eBay access.'));
    } finally {
      setBusyAction(null);
    }
  };

  const refreshPlaid = async (connection: PlaidBankConnection) => {
    if (busyAction) return;
    hapticSelection();
    setBusyAction(`plaid-refresh:${connection.connectionId}`);
    setActionError(null);
    setNotice(null);
    try {
      const result = await syncPlaidBankTransactions(connection.connectionId);
      await loadPlaidStatus();
      setNotice(
        result.imported > 0
          ? `${connection.institutionName}: ${result.imported} expense${result.imported === 1 ? '' : 's'} added to Books.`
          : result.needsReview > 0
            ? `${connection.institutionName}: updated bank data needs review in Books.`
            : `${connection.institutionName} is up to date. No new eligible expenses were found.`,
      );
    } catch (error) {
      setActionError(errorText(error, `KeepFlip could not refresh ${connection.institutionName}.`));
    } finally {
      setBusyAction(null);
    }
  };

  const disconnectPlaid = async (connection: PlaidBankConnection) => {
    if (busyAction) return;
    setBusyAction(`plaid-disconnect:${connection.connectionId}`);
    setActionError(null);
    setNotice(null);
    try {
      await disconnectPlaidBankConnection(connection.connectionId);
      setConfirmPlaidDisconnect(null);
      await loadPlaidStatus();
      setNotice(`${connection.institutionName} was disconnected. Existing Books records were kept.`);
    } catch (error) {
      setActionError(errorText(error, `KeepFlip could not disconnect ${connection.institutionName}.`));
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlaidLinked = async (result: PlaidBankLinkResult) => {
    await loadPlaidStatus();
    setNotice(
      result.sync.imported > 0
        ? `Connected ${result.connection.institutionName}; ${result.sync.imported} expense${result.sync.imported === 1 ? '' : 's'} added to Books.`
        : `Connected ${result.connection.institutionName}. No new eligible expenses were found.`,
    );
  };

  const eBayIsConnected = ebayConnection?.connected === true;
  const eBayStatusLabel = isCheckingEbay && !ebayConnection
    ? 'Checking connection…'
    : ebayStatusError
      ? 'Status unavailable'
      : eBayIsConnected
        ? ebayConnection.needsReconnect
          ? 'Reconnect needed'
          : ebayConnection.accessTokenExpired
            ? 'Refresh needed'
            : 'Connected'
        : 'Not connected';

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: pageGutter,
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
          <IconSymbol color={theme.colors.scannerCyan} name="checkmark.shield.fill" size={24} />
          </View>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(9) }]}>ACCOUNT ACCESS</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(29) }]}>Connections</Text>
          <Text style={[styles.subtitle, { fontSize: responsiveFont(13), lineHeight: responsiveHeight(19) }]}>
            Connect and manage the eBay and business bank accounts you use with KeepFlip.
          </Text>
        </View>

        <View style={styles.serviceCard}>
          <View style={styles.serviceHeader}>
            <View style={[styles.serviceIcon, styles.ebayIcon]}>
              <EbayShoppingBagIcon size={24} />
            </View>
            <View style={styles.serviceCopy}>
              <Text style={[styles.serviceEyebrow, { fontSize: responsiveFont(8) }]}>MARKETPLACE</Text>
              <Text style={[styles.serviceTitle, { fontSize: responsiveFont(17) }]}>eBay</Text>
            </View>
            {isCheckingEbay ? <ActivityIndicator color={theme.colors.scannerCyan} size="small" /> : (
              <View style={[styles.statusPill, eBayIsConnected ? styles.statusPillConnected : styles.statusPillOff]}>
                <View style={[styles.statusDot, eBayIsConnected ? styles.statusDotConnected : styles.statusDotOff]} />
                <Text style={[styles.statusText, { fontSize: responsiveFont(8) }, eBayIsConnected && styles.statusTextConnected]}>
                  {eBayStatusLabel.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.description, { fontSize: responsiveFont(11), lineHeight: responsiveHeight(16) }]}>
            KeepFlip uses only the eBay permissions you approve. Your eBay sign-in stays with eBay.
          </Text>

          {eBayIsConnected ? (
            <View style={styles.connectionDetails}>
              <Text selectable style={[styles.connectionName, { fontSize: responsiveFont(13) }]}>
                {ebayConnection.ebayUsername || 'eBay seller account'}
              </Text>
              <Text style={[styles.connectionMeta, { fontSize: responsiveFont(10) }]}>
                {ebayConnection.environment === 'sandbox' ? 'eBay Sandbox' : 'Production eBay'}
              </Text>
            </View>
          ) : null}

          {ebayStatusError ? (
            <Text accessibilityLiveRegion="polite" selectable style={[styles.errorText, { fontSize: responsiveFont(10) }]}>
              {ebayStatusError}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {eBayIsConnected ? (
              <>
                <ActionButton
                  busy={busyAction === 'ebay-refresh'}
                  disabled={busyAction !== null || isCheckingEbay}
                  label="Refresh connection"
                  onPress={() => void refreshEbay()}
                />
                {ebayConnection.needsReconnect ? (
                  <ActionButton
                    disabled={busyAction !== null}
                    label="Reconnect eBay"
                    onPress={() => router.push({
                      pathname: '/ebay-connect',
                      params: { reconnect: '1', returnTo: 'connections' },
                    })}
                    primary
                  />
                ) : null}
                <ActionButton
                  disabled={busyAction !== null}
                  label="Revoke"
                  onPress={() => {
                    hapticSelection();
                    setConfirmEbayRevoke((current) => !current);
                    setActionError(null);
                    setNotice(null);
                  }}
                  destructive
                />
              </>
            ) : ebayStatusError ? (
              <ActionButton
                busy={isCheckingEbay}
                disabled={isCheckingEbay || busyAction !== null}
                label="Retry status check"
                onPress={() => void refreshEbayStatus()}
              />
            ) : (
              <ActionButton
                disabled={busyAction !== null || isCheckingEbay}
                label="Connect eBay"
                onPress={() => router.push({
                  pathname: '/ebay-connect',
                  params: { returnTo: 'connections' },
                })}
                primary
              />
            )}
          </View>

          {confirmEbayRevoke && eBayIsConnected ? (
            <ConfirmAction
              busy={busyAction === 'ebay-revoke'}
              cancelLabel="Keep connected"
              confirmLabel="Revoke eBay access"
              message="KeepFlip will revoke its eBay authorization and remove the saved eBay tokens. You can reconnect later."
              onCancel={() => setConfirmEbayRevoke(false)}
              onConfirm={() => void revokeEbay()}
            />
          ) : null}
        </View>

        <View style={styles.serviceCard}>
          <View style={styles.serviceHeader}>
            <View style={[styles.serviceIcon, styles.bankIcon]}>
              <IconSymbol color={theme.colors.scannerCyan} name="creditcard.fill" size={19} />
            </View>
            <View style={styles.serviceCopy}>
              <Text style={[styles.serviceEyebrow, { fontSize: responsiveFont(8) }]}>BUSINESS BANK</Text>
              <Text style={[styles.serviceTitle, { fontSize: responsiveFont(17) }]}>Plaid</Text>
            </View>
            {canManagePlaid && isLoadingPlaid ? <ActivityIndicator color={theme.colors.scannerCyan} size="small" /> : (
              <View style={[styles.statusPill, plaidConnections.length > 0 ? styles.statusPillConnected : styles.statusPillOff]}>
                <View style={[styles.statusDot, plaidConnections.length > 0 ? styles.statusDotConnected : styles.statusDotOff]} />
                  <Text style={[styles.statusText, { fontSize: responsiveFont(8) }, plaidConnections.length > 0 && styles.statusTextConnected]}>
                  {!automatedBooksAllowed
                    ? 'PLAN REQUIRED'
                    : !plaidConfigured
                      ? 'UNAVAILABLE'
                      : isLoadingPlaid
                        ? 'CHECKING'
                        : plaidStatusError
                          ? 'STATUS UNAVAILABLE'
                        : plaidConnections.length > 0
                          ? `${plaidConnections.length} CONNECTED`
                          : 'NOT CONNECTED'}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.description, { fontSize: responsiveFont(11), lineHeight: responsiveHeight(16) }]}>
            Plaid lets KeepFlip sync eligible outgoing business transactions into Books as recorded expenses.
          </Text>

          {!automatedBooksAllowed ? (
            <View style={styles.infoBanner}>
              <IconSymbol color={theme.colors.goldBright} name="lock.fill" size={16} />
              <Text style={[styles.infoText, { fontSize: responsiveFont(10), lineHeight: responsiveHeight(15) }]}>
                Business bank connections are included with the Serious Reseller plan.
              </Text>
            </View>
          ) : !plaidConfigured ? (
            <View style={styles.infoBanner}>
                <IconSymbol color={theme.colors.goldBright} name="exclamationmark.triangle.fill" size={16} />
              <Text style={[styles.infoText, { fontSize: responsiveFont(10), lineHeight: responsiveHeight(15) }]}>
                Bank connections are not configured in this app build yet.
              </Text>
            </View>
          ) : null}

          {plaidConnections.map((bankConnection) => (
            <View key={bankConnection.connectionId} style={styles.bankConnection}>
              <View style={styles.bankConnectionCopy}>
                <Text selectable style={[styles.connectionName, { fontSize: responsiveFont(13) }]}>
                  {bankConnection.institutionName}
                </Text>
                <Text style={[styles.connectionMeta, { fontSize: responsiveFont(10) }]}>
                  {accountLabel(bankConnection)} · {lastSyncedLabel(bankConnection.lastSyncedAt)}
                </Text>
                {bankConnection.lastError ? (
                  <Text selectable style={[styles.warningText, { fontSize: responsiveFont(10) }]}>
                    Last sync issue: {bankConnection.lastError}
                  </Text>
                ) : null}
              </View>
              <View style={styles.bankActions}>
                <ActionButton
                  busy={busyAction === `plaid-refresh:${bankConnection.connectionId}`}
                  disabled={busyAction !== null || isLoadingPlaid}
                  label="Refresh"
                  onPress={() => void refreshPlaid(bankConnection)}
                  compact
                />
                <ActionButton
                  disabled={busyAction !== null || isLoadingPlaid}
                  label="Disconnect"
                  onPress={() => {
                    hapticSelection();
                    setConfirmPlaidDisconnect((current) =>
                      current === bankConnection.connectionId ? null : bankConnection.connectionId,
                    );
                    setActionError(null);
                    setNotice(null);
                  }}
                  destructive
                  compact
                />
              </View>
              {confirmPlaidDisconnect === bankConnection.connectionId ? (
                <ConfirmAction
                  busy={busyAction === `plaid-disconnect:${bankConnection.connectionId}`}
                  cancelLabel="Keep connection"
                  confirmLabel="Disconnect bank"
                  message="New bank expenses will stop syncing. Existing Books records stay unchanged."
                  onCancel={() => setConfirmPlaidDisconnect(null)}
                  onConfirm={() => void disconnectPlaid(bankConnection)}
                />
              ) : null}
            </View>
          ))}

          {canManagePlaid && plaidStatus?.automationEnabled ? (
            <Text style={[styles.syncNote, { fontSize: responsiveFont(10) }]}>
              Background transaction updates are enabled.
            </Text>
          ) : canManagePlaid && plaidConnections.length > 0 ? (
            <Text style={[styles.syncNote, { fontSize: responsiveFont(10) }]}>
              Refresh a connection to check for new bank expenses.
            </Text>
          ) : null}

          {plaidStatusError ? (
            <>
              <Text accessibilityLiveRegion="polite" selectable style={[styles.errorText, { fontSize: responsiveFont(10) }]}>
                {plaidStatusError}
              </Text>
              {canManagePlaid ? (
                <ActionButton
                  busy={isLoadingPlaid}
                  disabled={busyAction !== null || isLoadingPlaid}
                  label="Retry bank status"
                  onPress={() => void loadPlaidStatus()}
                />
              ) : null}
            </>
          ) : null}

          {canManagePlaid && !plaidStatusError && plaidConnections.length === 0 && !isLoadingPlaid ? (
            plaidLinkSupported ? (
              <PlaidBankLinkButton
                busy={busyAction === 'plaid-link'}
                disabled={busyAction !== null || isLoadingPlaid}
                fontSize={responsiveFont(10)}
                onBusyChange={(busy) => {
                  setBusyAction((current) =>
                    busy
                      ? 'plaid-link'
                      : current === 'plaid-link'
                        ? null
                        : current,
                  );
                }}
                onError={(message) => {
                  setActionError(message);
                  setNotice(null);
                }}
                onLinked={(result) => void handlePlaidLinked(result)}
                onStart={() => {
                  setActionError(null);
                  setNotice(null);
                }}
              />
            ) : (
              <View style={styles.infoBanner}>
                <IconSymbol color={theme.colors.goldBright} name="lock.fill" size={16} />
                <Text style={[styles.infoText, { fontSize: responsiveFont(10), lineHeight: responsiveHeight(15) }]}>
                  Bank linking is available on Android and web. You can still manage existing connections here.
                </Text>
              </View>
            )
          ) : null}
        </View>

        {actionError ? (
          <View style={styles.feedbackError}>
            <Text accessibilityLiveRegion="polite" selectable style={[styles.feedbackText, { fontSize: responsiveFont(11) }]}>
              {actionError}
            </Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.feedbackSuccess}>
            <Text accessibilityLiveRegion="polite" style={[styles.feedbackText, { fontSize: responsiveFont(11) }]}>
              {notice}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeepFlipBackground>
  );
}

function ActionButton({
  busy = false,
  compact = false,
  destructive = false,
  disabled = false,
  label,
  onPress,
  primary = false,
}: {
  busy?: boolean;
  compact?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { responsiveFont } = useResponsiveLayout();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.compactActionButton,
        primary && styles.primaryActionButton,
        destructive && styles.destructiveActionButton,
        (disabled || busy) && styles.disabledActionButton,
        pressed && !disabled && !busy && styles.pressedActionButton,
      ]}>
      {busy ? <ActivityIndicator color={primary ? theme.colors.textOnAccent : theme.colors.scannerCyan} size="small" /> : null}
      <Text style={[
        styles.actionLabel,
        { fontSize: responsiveFont(compact ? 9 : 10) },
        primary && styles.primaryActionLabel,
        destructive && styles.destructiveActionLabel,
      ]}>
        {busy ? `${label}…` : label}
      </Text>
    </Pressable>
  );
}

function ConfirmAction({
  busy,
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { responsiveFont } = useResponsiveLayout();
  return (
    <View style={styles.confirmBox}>
      <Text style={[styles.confirmMessage, { fontSize: responsiveFont(10) }]}>{message}</Text>
      <View style={styles.confirmActions}>
        <ActionButton disabled={busy} label={cancelLabel} onPress={onCancel} compact />
        <ActionButton busy={busy} disabled={busy} destructive label={confirmLabel} onPress={onConfirm} compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 16,
    paddingBottom: 28,
  },
  hero: { gap: 8, paddingBottom: 2 },
  heroIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
    marginBottom: 3,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: { color: theme.colors.textMuted, maxWidth: 520 },
  serviceCard: {
    gap: 13,
    padding: 16,
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.card,
  },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  serviceIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.medium,
    borderWidth: 1,
  },
  ebayIcon: {
    borderColor: theme.colors.accentGoldBorder,
    backgroundColor: theme.colors.iconSurfaceGold,
  },
  bankIcon: {
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  serviceCopy: { flex: 1, gap: 2 },
  serviceEyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  serviceTitle: { color: theme.colors.cream, fontWeight: '900' },
  statusPill: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
  },
  statusPillConnected: {
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  statusPillOff: {
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.cardSoft,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotConnected: { backgroundColor: theme.colors.scannerCyan },
  statusDotOff: { backgroundColor: theme.colors.textMuted },
  statusText: { color: theme.colors.textMuted, fontWeight: '900', letterSpacing: 0.4 },
  statusTextConnected: { color: theme.colors.scannerCyan },
  description: { color: theme.colors.textMuted },
  connectionDetails: {
    gap: 3,
    padding: 11,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.cardSoft,
  },
  connectionName: { color: theme.colors.cream, fontWeight: '800' },
  connectionMeta: { color: theme.colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  compactActionButton: { minHeight: 33, paddingHorizontal: 10, paddingVertical: 6 },
  primaryActionButton: {
    borderColor: theme.colors.gold,
    backgroundColor: theme.colors.goldBright,
  },
  destructiveActionButton: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.cardSoft,
  },
  disabledActionButton: { opacity: 0.5 },
  pressedActionButton: { opacity: 0.75 },
  actionLabel: { color: theme.colors.scannerCyan, fontWeight: '900' },
  primaryActionLabel: { color: theme.colors.textOnAccent },
  destructiveActionLabel: { color: theme.colors.danger },
  bankConnection: {
    gap: 10,
    padding: 12,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.cardSoft,
  },
  bankConnectionCopy: { gap: 3 },
  bankActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  warningText: { color: theme.colors.danger, lineHeight: 15 },
  syncNote: { color: theme.colors.textMuted },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 11,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.accentGoldBorder,
    backgroundColor: theme.colors.iconSurfaceGold,
  },
  infoText: { flex: 1, color: theme.colors.cream },
  errorText: { color: theme.colors.danger, lineHeight: 15 },
  confirmBox: {
    gap: 10,
    padding: 12,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.cardSoft,
  },
  confirmMessage: { color: theme.colors.textMuted, lineHeight: 15 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  feedbackError: {
    padding: 12,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.card,
  },
  feedbackSuccess: {
    padding: 12,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: theme.colors.accentCyanBorder,
    backgroundColor: theme.colors.iconSurfaceCyan,
  },
  feedbackText: { color: theme.colors.cream, lineHeight: 16 },
});
