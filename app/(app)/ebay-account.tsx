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
import { EbayListingSetupEditor } from '@/components/ebay/ebay-listing-setup-editor';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';
import {
  fetchEbayListingImportCandidates,
  linkImportedEbayListing,
} from '@/services/ebay-listing-import-service';
import {
  getEbayConnectionStatus,
  getEbayOAuthEnvironment,
  getEbaySellerAccount,
  updateEbaySellerListingDefaults,
  revokeEbayConnection,
  type EbayConnectionStatusResult,
  type EbaySellerListingDefaults,
  type EbaySellerAccountResult,
} from '@/services/ebayConnectionService';
import {
  createImportedEbayInventoryItem,
  listInventoryItems,
  updateInventoryMarketplaceLink,
  type InventoryItem,
} from '@/services/inventory-service';
import type { EbayListingImportCandidate } from '@/types/ebay-listing-import';

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

const EMPTY_LISTING_DEFAULTS: EbaySellerListingDefaults = {
  defaultMerchantLocationKey: null,
  defaultPaymentPolicyId: null,
  defaultFulfillmentPolicyId: null,
  defaultReturnPolicyId: null,
};

export default function EbayAccountScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

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
  const [importCandidates, setImportCandidates] = useState<EbayListingImportCandidate[]>([]);
  const [importNextOffset, setImportNextOffset] = useState<number | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImportingListings, setIsImportingListings] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<string[]>([]);
  const [listingDefaultsDraft, setListingDefaultsDraft] =
    useState<EbaySellerListingDefaults | null>(null);
  const [isSavingListingDefaults, setIsSavingListingDefaults] = useState(false);
  const [listingDefaultsMessage, setListingDefaultsMessage] = useState<string | null>(null);
  const userId = user?.$id;
  const activeConnection = connection?.connected === true;
  const environment = connection?.environment ?? getEbayOAuthEnvironment();

  const refreshConnection = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const status = await getEbayConnectionStatus();
      setConnection(status);
      if (!status.connected) {
        setSellerAccount(null);
        setListingDefaultsDraft(null);
        return status;
      }

      try {
        const seller = await getEbaySellerAccount(status.environment);
        setSellerAccount(seller.connected ? seller : null);
        setListingDefaultsDraft(seller.listingSetup?.defaults ?? null);
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
      setListingDefaultsDraft(null);
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
            setListingDefaultsDraft(null);
            return;
          }

          try {
            const seller = await getEbaySellerAccount(status.environment);
            if (cancelled) return;
            setSellerAccount(seller.connected ? seller : null);
            setListingDefaultsDraft(seller.listingSetup?.defaults ?? null);
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

  const discoverEbayListings = useCallback(
    async (offset = 0) => {
      if (!activeConnection || isImportingListings) return;

      setIsImportingListings(true);
      setImportMessage(null);
      try {
        const result = await fetchEbayListingImportCandidates(environment, { offset });
        setImportCandidates((current) =>
          offset === 0 ? result.candidates : [...current, ...result.candidates],
        );
        setImportNextOffset(result.nextOffset);
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.ebayListingsDiscovered, {
          count: result.candidates.length,
          offset,
        });
        setImportMessage(
          result.candidates.length
            ? `Found ${result.candidates.length} active Inventory API listing${result.candidates.length === 1 ? '' : 's'} on this page.`
            : 'No active Inventory API listings were found on this page.',
        );
      } catch (error) {
        setImportMessage(
          error instanceof Error
            ? error.message
            : 'KeepFlip could not import eBay listings.',
        );
      } finally {
        setIsImportingListings(false);
      }
    },
    [activeConnection, environment, isImportingListings],
  );

  const importEbayListing = useCallback(
    async (candidate: EbayListingImportCandidate) => {
      if (!userId || importingKey) return;

      const key = candidate.sourceRecordKey;
      setImportingKey(key);
      setImportMessage(null);
      try {
        const inventory = await listInventoryItems(userId);
        const existing = inventory.find(
          (item: InventoryItem) =>
            (candidate.listingId && item.ebayListingId === candidate.listingId) ||
            item.ebayOfferId === candidate.offerId ||
            (item.ebaySku && item.ebaySku.toLowerCase() === candidate.sku.toLowerCase()),
        );
        const item = existing ||
          (await createImportedEbayInventoryItem({ ownerId: userId, candidate }));

        if (existing) {
          await updateInventoryMarketplaceLink({
            ownerId: userId,
            itemId: existing.id,
            ebaySku: candidate.sku,
            ebayOfferId: candidate.offerId,
            ebayListingId: candidate.listingId,
          });
        }

        await linkImportedEbayListing({
          environment,
          itemId: item.id,
          candidate,
        });
        setImportedKeys((current) =>
          current.includes(key) ? current : [...current, key],
        );
        setImportMessage(
          existing
            ? `Linked ${candidate.title} to its existing KeepFlip inventory item.`
            : `Imported ${candidate.title} into KeepFlip inventory. Review its cost, photos, and analysis before relying on it for decisions.`,
        );
        await refreshConnection();
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.ebayListingImported, {
          environment,
          existing_item: Boolean(existing),
        });
      } catch (error) {
        setImportMessage(
          error instanceof Error
            ? error.message
            : 'KeepFlip could not import this eBay listing.',
        );
      } finally {
        setImportingKey(null);
      }
    },
    [environment, importingKey, refreshConnection, userId],
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
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.ebayAccountDisconnected, {
        environment: result.environment,
      });
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

  const sellerProfile = sellerAccount?.profile;
  const accountName =
    sellerProfile?.username?.trim() || connection?.ebayUsername?.trim();
  const sellerDisplayName =
    sellerProfile?.businessName?.trim() ||
    sellerProfile?.doingBusinessAs?.trim() ||
    accountName;
  const cachedListings = sellerAccount?.listings ?? [];
  const listingSetup = sellerAccount?.listingSetup;
  const savedListingDefaultCount = listingSetup
    ? Object.values(listingSetup.defaultSelection).filter(Boolean).length
    : 0;
  const listingDefaults =
    listingDefaultsDraft ?? listingSetup?.defaults ?? EMPTY_LISTING_DEFAULTS;

  const saveListingDefaults = useCallback(async () => {
    if (!listingSetup || isSavingListingDefaults) return;

    setIsSavingListingDefaults(true);
    setListingDefaultsMessage(null);
    try {
      const nextSetup = await updateEbaySellerListingDefaults(
        listingDefaults,
        environment,
        listingSetup.marketplaceId,
      );
      setListingDefaultsDraft(nextSetup.defaults);
      setSellerAccount((current) =>
        current ? { ...current, listingSetup: nextSetup } : current,
      );
      setListingDefaultsMessage(
        'Saved. KeepFlip will use these verified eBay codes for new listings.',
      );
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.ebayListingDefaultsSaved, {
        marketplace_id: listingSetup.marketplaceId,
      });
    } catch (error) {
      setListingDefaultsMessage(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not save your eBay listing setup.',
      );
    } finally {
      setIsSavingListingDefaults(false);
    }
  }, [environment, isSavingListingDefaults, listingDefaults, listingSetup]);

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content,
        {
          paddingTop: insets.top + 15,
          paddingBottom: insets.bottom + 30,
        }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(240).delay(40)} style={styles.hero}>
          <View style={styles.logoShell}>
            <EbayShoppingBagIcon size={70} />
          </View>
          <Text style={[styles.eyebrow, { fontFamily: theme.fonts.display, fontSize: responsiveFont(10) }]}>KEEPFLIP + EBAY</Text>
          <Text style={[styles.title, { fontFamily: theme.fonts.bold, fontSize: responsiveFont(26) }]}>
            {activeConnection ? 'Your seller account' : 'eBay connection'}
          </Text>
          <Text style={[styles.subtitle, {fontFamily: theme.fonts.body, fontSize: responsiveFont(12) }]}>
            {activeConnection
              ? 'Seller details and KeepFlip-published listings, with secure account controls below.'
              : 'Connect an eBay account to manage authorized account-level features.'}
          </Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
            <Text style={[styles.loadingText, { fontSize: responsiveFont(9) }]}>CHECKING YOUR EBAY CONNECTION</Text>
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
                  <Text style={[styles.accountTitle, { fontSize: responsiveFont(17) }]}>
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
                <Text style={[styles.metaLabel, { fontSize: responsiveFont(8) }]}>ENVIRONMENT</Text>
                <Text style={[styles.metaValue, { fontSize: responsiveFont(10) }]}>{environmentLabel(environment)}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(100)} style={styles.section}>
              <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>SELLER INFORMATION</Text>
              <View style={styles.settingsCard}>
                <View style={styles.sellerSummary}>
                  <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>
                    {sellerDisplayName || 'Seller details are syncing'}
                  </Text>
                  <Text selectable style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
                    {sellerProfile
                      ? 'eBay-managed account details update in eBay. KeepFlip securely refreshes the safe details shown here.'
                      : 'KeepFlip will show the safe account details eBay shares after the first secure sync.'}
                  </Text>
                </View>

                {sellerProfile?.username ? (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>EBAY HANDLE</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
                      {sellerProfile.username}
                    </Text>
                  </View>
                ) : null}
                {sellerProfile?.accountType || sellerProfile?.accountStatus ? (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>ACCOUNT</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
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
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>MARKETPLACE</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
                      {sellerProfile.registrationMarketplaceId.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ) : null}
                {sellerProfile?.businessWebsiteUrl ? (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>BUSINESS SITE</Text>
                    <Text selectable numberOfLines={1} style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
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

            {listingSetup ? (
              <Animated.View
                entering={FadeInDown.duration(250).delay(130)}
                style={styles.section}>
                <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>LISTING SETUP</Text>
                <View style={styles.settingsCard}>
                  <View style={styles.settingRow}>
                    <IconSymbol
                      color={
                        listingSetup.state === 'ready'
                          ? theme.colors.scannerCyan
                          : theme.colors.goldBright
                      }
                      name={
                        listingSetup.state === 'ready'
                          ? 'checkmark.shield.fill'
                          : 'exclamationmark.triangle.fill'
                      }
                      size={20}
                    />
                    <View style={styles.settingCopy}>
                      <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>
                        {listingSetup.state === 'ready'
                          ? 'Ready to list'
                          : listingSetup.state === 'failed'
                            ? 'Setup needs a refresh'
                            : 'Listing setup needs attention'}
                      </Text>
                      <Text style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
                        {listingSetup.message ||
                          'KeepFlip checks the eBay policies and inventory location needed to publish a listing.'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.connectedPill,
                        listingSetup.state !== 'ready' && styles.setupPillPending,
                      ]}>
                      {listingSetup.state === 'ready' ? 'READY' : 'CHECK'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>SAVED DEFAULTS</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
                      {savedListingDefaultCount + ' of 4 ready'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(8) }]}>EBAY OPTIONS FOUND</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(12) }]}>
                      {[
                        listingSetup.policyCounts.payment + ' payment',
                        listingSetup.policyCounts.fulfillment + ' shipping',
                        listingSetup.policyCounts.return + ' return',
                        listingSetup.locationCount + ' location',
                      ].join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.profileSyncNote}>
                    {listingSetup.lastCheckedAt
                      ? 'Checked ' +
                      new Date(listingSetup.lastCheckedAt).toLocaleString()
                      : 'eBay listing setup has not been checked yet.'}
                  </Text>
                  <EbayListingSetupEditor
                    setup={listingSetup}
                    draft={listingDefaults}
                    saving={isSavingListingDefaults}
                    onChange={(defaults) => setListingDefaultsDraft(defaults)}
                    onSave={() => void saveListingDefaults()}
                  />
                  {listingDefaultsMessage ? (
                    <Text selectable style={styles.profileSyncNote}>
                      {listingDefaultsMessage}
                    </Text>
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.duration(250).delay(160)} style={styles.section}>
              <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>KEEPFLIP LISTINGS</Text>
              <View style={styles.settingsCard}>
                <View style={styles.listingHeader}>
                  <View style={styles.settingCopy}>
                    <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>
                      {sellerAccount?.listingCount
                        ? sellerAccount.listingCount +
                        (sellerAccount.listingCount === 1
                          ? ' saved listing'
                          : ' saved listings')
                        : 'No listings saved yet'}
                    </Text>
                    <Text style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
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
                        <Text numberOfLines={2} style={[styles.listingTitle, { fontSize: responsiveFont(12) }]}>
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

            <Animated.View entering={FadeInDown.duration(250).delay(185)} style={styles.section}>
              <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>IMPORT ACTIVE EBAY LISTINGS</Text>
              <View style={styles.settingsCard}>
                <View style={styles.listingHeader}>
                  <View style={styles.settingCopy}>
                    <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>Review before adding to inventory</Text>
                    <Text style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
                      KeepFlip reads active listings managed by eBay&apos;s Inventory API. Each listing is matched by SKU, offer, or listing ID before it is linked or imported.
                    </Text>
                  </View>
                  <Text style={styles.connectedPill}>{importCandidates.length ? importCandidates.length : 'READY'}</Text>
                </View>

                <Pressable
                  accessibilityLabel="Import active eBay listings"
                  accessibilityRole="button"
                  accessibilityState={{ busy: isImportingListings, disabled: isImportingListings }}
                  disabled={isImportingListings}
                  onPress={() => {
                    hapticSelection();
                    void discoverEbayListings(0);
                  }}
                  style={({ pressed }) => [
                    styles.importButton,
                    isImportingListings && styles.buttonDisabled,
                    pressed && !isImportingListings && styles.pressed,
                  ]}>
                  {isImportingListings ? (
                    <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
                  ) : (
                    <IconSymbol color={theme.colors.textOnAccent} name="arrow.right" size={18} />
                  )}
                  <Text style={[styles.importButtonText, { fontSize: responsiveFont(10) }]}>
                    {isImportingListings ? 'READING EBAY' : 'IMPORT ACTIVE LISTINGS'}
                  </Text>
                </Pressable>

                {importMessage ? (
                  <Text selectable style={styles.profileSyncNote}>{importMessage}</Text>
                ) : null}

                {importCandidates.map((candidate) => {
                  const imported = importedKeys.includes(candidate.sourceRecordKey);
                  const busy = importingKey === candidate.sourceRecordKey;
                  return (
                    <View key={candidate.sourceRecordKey} style={styles.listingRow}>
                      <View style={styles.listingCopy}>
                        <Text numberOfLines={2} style={[styles.listingTitle, { fontSize: responsiveFont(12) }]}>{candidate.title}</Text>
                        <Text style={styles.listingMeta}>
                          {candidate.sku} · qty {candidate.quantityAvailable}
                          {candidate.condition ? ' · ' + readableEbayValue(candidate.condition) : ''}
                        </Text>
                      </View>
                      <View style={styles.importListingAction}>
                        <Text style={styles.listingPrice}>
                          {listingPriceLabel(candidate.currentPriceCents ?? undefined, candidate.currency ?? undefined)}
                        </Text>
                        <Pressable
                          accessibilityLabel={imported ? 'Listing imported' : 'Import eBay listing'}
                          accessibilityRole="button"
                          accessibilityState={{ busy, disabled: imported || Boolean(importingKey) }}
                          disabled={imported || Boolean(importingKey)}
                          onPress={() => {
                            hapticSelection();
                            void importEbayListing(candidate);
                          }}
                          style={({ pressed }) => [
                            styles.importRowButton,
                            imported && styles.importRowButtonDone,
                            (busy || Boolean(importingKey)) && !imported && styles.buttonDisabled,
                            pressed && !imported && !busy && !importingKey && styles.pressed,
                          ]}>
                          {busy ? (
                            <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
                          ) : (
                            <Text style={[styles.importRowButtonText, { fontSize: responsiveFont(8) }]}>{imported ? 'IMPORTED' : 'IMPORT'}</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                {importNextOffset !== null ? (
                  <Pressable
                    accessibilityLabel="Load more eBay listings"
                    accessibilityRole="button"
                    disabled={isImportingListings}
                    onPress={() => void discoverEbayListings(importNextOffset)}
                    style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}>
                    <Text style={[styles.loadMoreText, { fontSize: responsiveFont(9) }]}>LOAD MORE LISTINGS</Text>
                  </Pressable>
                ) : null}

                {importCandidates.length ? (
                  <Text style={styles.importCoverageNote}>
                    Older Seller Hub or legacy Trading API listings may require eBay migration before they appear through this Inventory API import.
                  </Text>
                ) : null}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(190)} style={styles.section}>
              <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>ACCESS SETTINGS</Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <IconSymbol
                    color={theme.colors.scannerCyan}
                    name="lock.fill"
                    size={20}
                  />
                  <View style={styles.settingCopy}>
                    <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>Authorization status</Text>
                    <Text style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
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
                    <Text style={[styles.settingTitle, { fontSize: responsiveFont(14) }]}>Refresh seller details</Text>
                    <Text style={[styles.settingDescription, { fontSize: responsiveFont(11) }]}>
                      Check the latest secure seller details and saved KeepFlip listings.
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>

            <View style={styles.actions}>

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
                <Text style={[styles.revokeButtonText, { fontSize: responsiveFont(11) }]}>REVOKE EBAY ACCESS</Text>
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
              <Text style={[styles.emptyTitle, { fontSize: responsiveFont(17) }]}>
                {errorMessage ? 'Connection status unavailable' : 'No eBay account connected'}
              </Text>
              <Text selectable style={[styles.emptyBody, { fontSize: responsiveFont(12) }]}>
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
              <Text style={[styles.connectButtonText, { fontSize: responsiveFont(11) }]}>CONNECT EBAY</Text>
              <IconSymbol
                color={theme.colors.textOnAccent}
                name="arrow.right"
                size={18}
              />
            </Pressable>
          </Animated.View>
        )}


        {errorMessage && activeConnection ? (
          <View style={[styles.messageCard, styles.messageError]}>
            <Text selectable style={[styles.messageText, { fontSize: responsiveFont(12) }]}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
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
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.surfaceOverlay,
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.card,
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.surfaceInset,
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
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
      borderColor: theme.colors.accentCyanBorder,
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
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.surfaceOverlay,
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
    setupPillPending: {
      color: theme.colors.goldBright,
    },
    settingDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.iconSurfaceGold,
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
      borderColor: theme.colors.divider,
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
      borderColor: theme.colors.divider,
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
    importButton: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.goldBright,
    },
    importButtonText: {
      color: theme.colors.textOnAccent,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    importListingAction: {
      alignItems: 'flex-end',
      gap: 7,
    },
    importRowButton: {
      minWidth: 72,
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 9,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    importRowButtonDone: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    importRowButtonText: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    loadMoreButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    loadMoreText: {
      color: theme.colors.goldBright,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1,
    },
    importCoverageNote: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
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
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
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
      color: theme.colors.textOnAccent,
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
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
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
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.surfaceOverlay,
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
      color: theme.colors.textOnAccent,
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    messageError: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
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
  return {
    ...staticStyles,
    backButton: [
      staticStyles.backButton,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    topLabel: [
      staticStyles.topLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    topSpacer: [
      staticStyles.topSpacer,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    logoShell: [
      staticStyles.logoShell,
      {
        width: responsiveWidth(104),
        height: responsiveHeight(104),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(30),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    loadingText: [
      staticStyles.loadingText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    statusIcon: [
      staticStyles.statusIcon,
      {
        width: responsiveWidth(48),
        height: responsiveHeight(48),
      },
    ],
    accountTitle: [
      staticStyles.accountTitle,
      {
        fontSize: responsiveFont(17),
      },
    ],
    accountIdentity: [
      staticStyles.accountIdentity,
      {
        fontSize: responsiveFont(12),
      },
    ],
    metaLabel: [
      staticStyles.metaLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    metaValue: [
      staticStyles.metaValue,
      {
        fontSize: responsiveFont(10),
      },
    ],
    sectionEyebrow: [
      staticStyles.sectionEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    settingTitle: [
      staticStyles.settingTitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    settingDescription: [
      staticStyles.settingDescription,
      {
        fontSize: responsiveFont(11),
      },
    ],
    connectedPill: [
      staticStyles.connectedPill,
      {
        fontSize: responsiveFont(8),
      },
    ],
    detailLabel: [
      staticStyles.detailLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    detailValue: [
      staticStyles.detailValue,
      {
        fontSize: responsiveFont(12),
      },
    ],
    profileSyncNote: [
      staticStyles.profileSyncNote,
      {
        fontSize: responsiveFont(11),
      },
    ],
    listingTitle: [
      staticStyles.listingTitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    listingMeta: [
      staticStyles.listingMeta,
      {
        fontSize: responsiveFont(10),
      },
    ],
    listingPrice: [
      staticStyles.listingPrice,
      {
        fontSize: responsiveFont(12),
      },
    ],
    importButtonText: [
      staticStyles.importButtonText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    importRowButtonText: [
      staticStyles.importRowButtonText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    loadMoreText: [
      staticStyles.loadMoreText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    importCoverageNote: [
      staticStyles.importCoverageNote,
      {
        fontSize: responsiveFont(10),
      },
    ],
    secondaryButtonText: [
      staticStyles.secondaryButtonText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    reconnectButtonText: [
      staticStyles.reconnectButtonText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    revokeButtonText: [
      staticStyles.revokeButtonText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    emptyTitle: [
      staticStyles.emptyTitle,
      {
        fontSize: responsiveFont(17),
      },
    ],
    emptyBody: [
      staticStyles.emptyBody,
      {
        fontSize: responsiveFont(12),
      },
    ],
    connectButtonText: [
      staticStyles.connectButtonText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    messageText: [
      staticStyles.messageText,
      {
        fontSize: responsiveFont(12),
      },
    ],
  };
}
