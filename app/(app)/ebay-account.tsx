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
import { useEbayConnection } from '@/components/ebay/ebay-connection-context';
import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  getEbayConnectionStatus,
  getEbayOAuthEnvironment,
  getEbaySellerAccount,
  revokeEbayConnection,
  type EbayConnectionStatusResult,
  type EbaySellerAccountResult,
} from '@/services/ebayConnectionService';

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function environmentLabel(value: 'sandbox' | 'production') {
  return value === 'sandbox' ? 'EBAY SANDBOX' : 'EBAY';
}

function readableEbayValue(value?: string) {
  if (!value) return undefined;
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function listingPriceLabel(cents?: number, currency?: string) {
  if (typeof cents !== 'number') return 'PRICE NOT SET';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return '$' + (cents / 100).toFixed(2);
  }
}

function sellerSyncLabel(lastSyncedAt?: string, freshness?: 'current' | 'stale') {
  if (freshness === 'stale') {
    return 'Showing the last saved details while eBay is temporarily unavailable.';
  }
  if (!lastSyncedAt) {
    return 'Seller details will appear after the first secure sync.';
  }

  const date = new Date(lastSyncedAt);
  if (Number.isNaN(date.getTime())) return 'Seller details are securely synced.';
  return 'Updated ' + date.toLocaleString();
}

export default function EbayAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const { setDisconnected } = useEbayConnection();
  const [connection, setConnection] =
    useState<EbayConnectionStatusResult | null>(null);
  const [sellerAccount, setSellerAccount] =
    useState<EbaySellerAccountResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const userId = user?.$id;

  const refreshConnection = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const status = await getEbayConnectionStatus();
      setConnection(status);
      if (!status.connected) {
        setSellerAccount(null);
        return status;
      }

      try {
        const seller = await getEbaySellerAccount(status.environment);
        setSellerAccount(seller.connected ? seller : null);
        if (!seller.connected) {
          const disconnected = {
            connected: false,
            environment: status.environment,
          };
          setConnection(disconnected);
          return disconnected;
        }
      } catch (error) {
        setSellerAccount(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'KeepFlip could not read your eBay seller details.',
        );
      }

      return status;
    } catch (error) {
      setConnection(null);
      setSellerAccount(null);
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
        setSellerAccount(null);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      let cancelled = false;
      const loadSellerAccount = async () => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
          const status = await getEbayConnectionStatus();
          if (cancelled) return;
          setConnection(status);

          if (!status.connected) {
            setSellerAccount(null);
            return;
          }

          try {
            const seller = await getEbaySellerAccount(status.environment);
            if (cancelled) return;
            setSellerAccount(seller.connected ? seller : null);
            if (!seller.connected) {
              setConnection({ connected: false, environment: status.environment });
            }
          } catch (error) {
            if (cancelled) return;
            setSellerAccount(null);
            setErrorMessage(
              error instanceof Error
                ? error.message
                : 'KeepFlip could not read your eBay seller details.',
            );
          }
        } catch (error) {
          if (cancelled) return;
          setConnection(null);
          setSellerAccount(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'KeepFlip could not check your eBay connection.',
          );
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      };

      void loadSellerAccount();
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const handleRevoke = async () => {
    if (isRevoking || !connection?.connected) return;

    setIsRevoking(true);
    setErrorMessage(null);
    try {
      const result = await revokeEbayConnection(connection.environment);
      setConnection(result);
      setSellerAccount(null);
      setDisconnected(result);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      router.replace('/ebay-connect');
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
  const sellerProfile = sellerAccount?.profile;
  const accountName =
    sellerProfile?.username?.trim() || connection?.ebayUsername?.trim();
  const sellerDisplayName =
    sellerProfile?.businessName?.trim() ||
    sellerProfile?.doingBusinessAs?.trim() ||
    accountName;
  const cachedListings = sellerAccount?.listings ?? [];

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
          <Text style={styles.topLabel}>SELLER ACCOUNT</Text>
          <View style={styles.topSpacer} />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(240).delay(40)} style={styles.hero}>
          <View style={styles.logoShell}>
            <EbayShoppingBagIcon size={70} />
          </View>
          <Text style={styles.eyebrow}>KEEPFLIP + EBAY</Text>
          <Text style={styles.title}>
            {activeConnection ? 'Your seller account' : 'eBay connection'}
          </Text>
          <Text style={styles.subtitle}>
            {activeConnection
              ? 'Seller details and KeepFlip-published listings, with secure account controls below.'
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
                  <Text style={styles.accountTitle}>
                    {sellerDisplayName || 'eBay access active'}
                  </Text>
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
              <Text style={styles.sectionEyebrow}>SELLER INFORMATION</Text>
              <View style={styles.settingsCard}>
                <View style={styles.sellerSummary}>
                  <Text style={styles.settingTitle}>
                    {sellerDisplayName || 'Seller details are syncing'}
                  </Text>
                  <Text selectable style={styles.settingDescription}>
                    {sellerProfile
                      ? 'eBay-managed account details update in eBay. KeepFlip securely refreshes the safe details shown here.'
                      : 'KeepFlip will show the safe account details eBay shares after the first secure sync.'}
                  </Text>
                </View>

                {sellerProfile?.username ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>EBAY HANDLE</Text>
                    <Text selectable style={styles.detailValue}>
                      {sellerProfile.username}
                    </Text>
                  </View>
                ) : null}
                {sellerProfile?.accountType || sellerProfile?.accountStatus ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>ACCOUNT</Text>
                    <Text selectable style={styles.detailValue}>
                      {[
                        readableEbayValue(sellerProfile?.accountType),
                        readableEbayValue(sellerProfile?.accountStatus),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                ) : null}
                {sellerProfile?.registrationMarketplaceId ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>MARKETPLACE</Text>
                    <Text selectable style={styles.detailValue}>
                      {sellerProfile.registrationMarketplaceId.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ) : null}
                {sellerProfile?.businessWebsiteUrl ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>BUSINESS SITE</Text>
                    <Text selectable numberOfLines={1} style={styles.detailValue}>
                      {sellerProfile.businessWebsiteUrl}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.profileSyncNote}>
                  {sellerSyncLabel(
                    sellerProfile?.lastSyncedAt,
                    sellerAccount?.profileFreshness,
                  )}
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(130)} style={styles.section}>
              <Text style={styles.sectionEyebrow}>KEEPFLIP LISTINGS</Text>
              <View style={styles.settingsCard}>
                <View style={styles.listingHeader}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>
                      {sellerAccount?.listingCount
                        ? sellerAccount.listingCount +
                          (sellerAccount.listingCount === 1
                            ? ' saved listing'
                            : ' saved listings')
                        : 'No listings saved yet'}
                    </Text>
                    <Text style={styles.settingDescription}>
                      KeepFlip-published eBay listings appear here after they are created.
                    </Text>
                  </View>
                  <Text style={styles.connectedPill}>KEEPFLIP</Text>
                </View>

                {cachedListings.length ? (
                  cachedListings.slice(0, 3).map((listing, index) => (
                    <View
                      key={
                        listing.listingId ||
                        listing.offerId ||
                        listing.sku ||
                        'listing-' + index
                      }
                      style={styles.listingRow}>
                      <View style={styles.listingCopy}>
                        <Text numberOfLines={2} style={styles.listingTitle}>
                          {listing.title || 'Saved eBay listing'}
                        </Text>
                        <Text style={styles.listingMeta}>
                          {readableEbayValue(listing.status) || 'Saved listing'}
                          {listing.sku ? ' · ' + listing.sku : ''}
                        </Text>
                      </View>
                      <Text style={styles.listingPrice}>
                        {listingPriceLabel(
                          listing.currentPriceCents,
                          listing.currency,
                        )}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.profileSyncNote}>
                    Listings you publish through KeepFlip will be saved here. Existing
                    Seller Hub listings are not shown until KeepFlip can verify and import them.
                  </Text>
                )}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(160)} style={styles.section}>
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
                    <Text style={styles.settingTitle}>Refresh seller details</Text>
                    <Text style={styles.settingDescription}>
                      Check the latest secure seller details and saved KeepFlip listings.
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
                  router.push('/ebay-connect?reconnect=1');
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
  sellerSummary: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242, 211, 138, 0.14)',
  },
  detailLabel: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  detailValue: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.cream,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  profileSyncNote: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  listingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242, 211, 138, 0.14)',
  },
  listingCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  listingTitle: {
    color: theme.colors.cream,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  listingMeta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  listingPrice: {
    color: theme.colors.goldBright,
    fontSize: 12,
    fontWeight: '900',
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
