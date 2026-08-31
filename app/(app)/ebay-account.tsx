import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  getEbayConnectionStatus,
  getEbayOAuthEnvironment,
  revokeEbayConnection,
  type EbayConnectionStatusResult,
} from '@/services/ebayConnectionService';

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function environmentLabel(value: 'sandbox' | 'production') {
  return value === 'sandbox' ? 'EBAY SANDBOX' : 'EBAY';
}

export default function EbayAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const [connection, setConnection] =
    useState<EbayConnectionStatusResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const userId = user?.$id;

  const refreshConnection = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const status = await getEbayConnectionStatus();
      setConnection(status);
      return status;
    } catch (error) {
      setConnection(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not check your eBay connection.',
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setConnection(null);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      let cancelled = false;
      setIsLoading(true);
      setErrorMessage(null);

      void getEbayConnectionStatus()
        .then((status) => {
          if (!cancelled) setConnection(status);
        })
        .catch((error) => {
          if (cancelled) return;
          setConnection(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'KeepFlip could not check your eBay connection.',
          );
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const handleRevoke = async () => {
    if (isRevoking || !connection?.connected) return;

    setIsRevoking(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await revokeEbayConnection(connection.environment);
      setConnection(result);
      setSuccessMessage(
        result.remoteRevocation === false
          ? 'KeepFlip removed its saved eBay access, but eBay did not confirm the remote revoke. Finish it from eBay third-party app access.'
          : 'eBay access has been revoked. Connect again if you want to restore it.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not revoke eBay access. Please try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    } finally {
      setIsRevoking(false);
    }
  };

  const confirmRevoke = () => {
    if (isRevoking || !connection?.connected) return;

    hapticSelection();
    Alert.alert(
      'Revoke eBay access?',
      'KeepFlip will revoke its eBay authorization and remove the saved eBay tokens from this account. You can reconnect later.',
      [
        { text: 'Keep access', style: 'cancel' },
        {
          text: 'Revoke access',
          style: 'destructive',
          onPress: () => void handleRevoke(),
        },
      ],
    );
  };

  const activeConnection = connection?.connected === true;
  const environment = connection?.environment ?? getEbayOAuthEnvironment();
  const accountName = connection?.ebayUsername?.trim();

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(220)} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="chevron.right"
              size={22}
              style={styles.backIcon}
            />
          </Pressable>
          <Text style={styles.topLabel}>EBAY ACCOUNT</Text>
          <View style={styles.topSpacer} />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(240).delay(40)} style={styles.hero}>
          <View style={styles.logoShell}>
            <EbayShoppingBagIcon size={70} />
          </View>
          <Text style={styles.eyebrow}>KEEPFLIP + EBAY</Text>
          <Text style={styles.title}>
            {activeConnection ? 'Your eBay account' : 'eBay connection'}
          </Text>
          <Text style={styles.subtitle}>
            {activeConnection
              ? 'Review the account linked to KeepFlip and control its authorization.'
              : 'Connect an eBay account to manage authorized account-level features.'}
          </Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
            <Text style={styles.loadingText}>CHECKING YOUR EBAY CONNECTION</Text>
          </View>
        ) : activeConnection ? (
          <>
            <Animated.View entering={FadeInDown.duration(250).delay(70)} style={styles.accountCard}>
              <View style={styles.accountHeading}>
                <View style={styles.statusIcon}>
                  <IconSymbol
                    color={theme.colors.scannerCyan}
                    name="checkmark.shield.fill"
                    size={24}
                  />
                </View>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountTitle}>eBay access active</Text>
                  <Text selectable style={styles.accountIdentity}>
                    {accountName
                      ? 'Connected as ' + accountName
                      : 'Your connected eBay account is ready for KeepFlip.'}
                  </Text>
                </View>
              </View>
              <View style={styles.accountMeta}>
                <Text style={styles.metaLabel}>ENVIRONMENT</Text>
                <Text style={styles.metaValue}>{environmentLabel(environment)}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(100)} style={styles.section}>
              <Text style={styles.sectionEyebrow}>ACCESS SETTINGS</Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <IconSymbol
                    color={theme.colors.scannerCyan}
                    name="lock.fill"
                    size={20}
                  />
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>Authorization status</Text>
                    <Text style={styles.settingDescription}>
                      KeepFlip can use the eBay permissions you approved.
                    </Text>
                  </View>
                  <Text style={styles.connectedPill}>CONNECTED</Text>
                </View>
                <View style={styles.settingDivider} />
                <View style={styles.settingRow}>
                  <IconSymbol
                    color={theme.colors.goldBright}
                    name="arrow.clockwise"
                    size={20}
                  />
                <Pressable
                accessibilityLabel="Refresh eBay connection status"
                accessibilityRole="button"
                accessibilityState={{ busy: isLoading, disabled: isLoading || isRevoking }}
                disabled={isLoading || isRevoking}
                onPress={() => {
                  hapticSelection();
                  void refreshConnection();
                }}
                style={({ pressed }) => [
                  styles.settingCopy,
                  (isLoading || isRevoking) && styles.buttonDisabled,
                  pressed && !isLoading && !isRevoking && styles.pressed,
                ]}>
                    <Text style={styles.settingTitle}>Connection refresh</Text>
                    <Text style={styles.settingDescription}>
                      Check the latest secure connection status before using eBay tools.
                    </Text>
                </Pressable>
                </View>
              </View>
            </Animated.View>

            <View style={styles.actions}>
              <Pressable
                accessibilityLabel="Reconnect eBay account"
                accessibilityRole="button"
                disabled={isRevoking}
                onPress={() => {
                  hapticSelection();
                  router.push('/ebay-connect');
                }}
                style={({ pressed }) => [
                  styles.reconnectButton,
                  isRevoking && styles.buttonDisabled,
                  pressed && !isRevoking && styles.pressed,
                ]}>
                <EbayShoppingBagIcon size={22} />
                <Text style={styles.reconnectButtonText}>RECONNECT EBAY</Text>
                <IconSymbol
                  color={theme.colors.backgroundDeep}
                  name="arrow.right"
                  size={19}
                />
              </Pressable>

              <Pressable
                accessibilityLabel="Revoke eBay access"
                accessibilityRole="button"
                accessibilityState={{ busy: isRevoking, disabled: isRevoking }}
                disabled={isRevoking}
                onPress={confirmRevoke}
                style={({ pressed }) => [
                  styles.revokeButton,
                  isRevoking && styles.buttonDisabled,
                  pressed && !isRevoking && styles.pressed,
                ]}>
                {isRevoking ? (
                  <ActivityIndicator color={theme.colors.danger} size="small" />
                ) : (
                  <IconSymbol
                    color={theme.colors.danger}
                    name="xmark"
                    size={20}
                  />
                )}
                <Text style={styles.revokeButtonText}>REVOKE EBAY ACCESS</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Animated.View entering={FadeInDown.duration(240).delay(70)} style={styles.emptyCard}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="lock.fill"
              size={25}
            />
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>
                {errorMessage ? 'Connection status unavailable' : 'No eBay account connected'}
              </Text>
              <Text selectable style={styles.emptyBody}>
                {errorMessage ??
                  'Link your eBay account to give KeepFlip the permissions you approve.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Connect eBay account"
              accessibilityRole="button"
              onPress={() => {
                hapticSelection();
                router.replace('/ebay-connect');
              }}
              style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}>
              <Text style={styles.connectButtonText}>CONNECT EBAY</Text>
              <IconSymbol
                color={theme.colors.backgroundDeep}
                name="arrow.right"
                size={18}
              />
            </Pressable>
          </Animated.View>
        )}

        {successMessage ? (
          <View style={[styles.messageCard, styles.messageSuccess]}>
            <Text selectable style={styles.messageText}>
              {successMessage}
            </Text>
          </View>
        ) : null}

        {errorMessage && activeConnection ? (
          <View style={[styles.messageCard, styles.messageError]}>
            <Text selectable style={styles.messageText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 20,
    paddingHorizontal: 20,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.28)',
    backgroundColor: 'rgba(7, 7, 11, 0.78)',
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
  },
  topLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  topSpacer: {
    width: 44,
    height: 44,
  },
  hero: {
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  logoShell: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.30)',
    backgroundColor: 'rgba(7, 12, 15, 0.86)',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.34), 0 0 24px rgba(88, 223, 232, 0.08)',
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 540,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  loadingCard: {
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.24)',
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
  },
  loadingText: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  accountCard: {
    gap: 16,
    padding: 17,
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.34)',
    backgroundColor: 'rgba(6, 13, 17, 0.82)',
    boxShadow: '0 16px 34px rgba(0, 0, 0, 0.28)',
  },
  accountHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  statusIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.26)',
    backgroundColor: 'rgba(88, 223, 232, 0.09)',
  },
  accountCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  accountTitle: {
    color: theme.colors.cream,
    fontSize: 17,
    fontWeight: '900',
  },
  accountIdentity: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  accountMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(88, 223, 232, 0.18)',
  },
  metaLabel: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  metaValue: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  section: {
    gap: 8,
  },
  sectionEyebrow: {
    color: theme.colors.goldBright,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  settingsCard: {
    gap: 14,
    padding: 16,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.20)',
    backgroundColor: 'rgba(8, 8, 11, 0.74)',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  settingTitle: {
    color: theme.colors.cream,
    fontSize: 14,
    fontWeight: '800',
  },
  settingDescription: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  connectedPill: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(242, 211, 138, 0.18)',
  },
  actions: {
    gap: 10,
  },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.36)',
    backgroundColor: 'rgba(215, 168, 74, 0.08)',
  },
  secondaryButtonText: {
    color: theme.colors.goldBright,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  reconnectButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.goldBright,
    boxShadow: '0 12px 28px rgba(215, 168, 74, 0.16)',
  },
  reconnectButtonText: {
    color: theme.colors.backgroundDeep,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  revokeButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(232, 97, 88, 0.50)',
    backgroundColor: 'rgba(232, 97, 88, 0.07)',
  },
  revokeButtonText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  emptyCard: {
    alignItems: 'stretch',
    gap: 14,
    padding: 17,
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.24)',
    backgroundColor: 'rgba(8, 8, 11, 0.78)',
  },
  emptyCopy: {
    gap: 4,
  },
  emptyTitle: {
    color: theme.colors.cream,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  connectButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.goldBright,
  },
  connectButtonText: {
    color: theme.colors.backgroundDeep,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.05,
  },
  messageCard: {
    padding: 13,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
  },
  messageSuccess: {
    borderColor: 'rgba(88, 223, 232, 0.28)',
    backgroundColor: 'rgba(88, 223, 232, 0.07)',
  },
  messageError: {
    borderColor: 'rgba(232, 97, 88, 0.34)',
    backgroundColor: 'rgba(232, 97, 88, 0.07)',
  },
  messageText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.988 }],
  },
});
