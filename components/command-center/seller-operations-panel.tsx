import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  KeepFlipControlRow,
  type KeepFlipControlRowProps,
} from '@/components/ui/keepflip-control-row';
import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { EbaySellerHealthPanel } from '@/components/command-center/ebay-seller-health-panel';

import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  agingRecommendations,
  parseMoneyInput,
} from '@/lib/seller-assistance';
import {
  buildRealizedItemMargins,
  buildSellerPerformance,
  type SellerOrderPerformanceInput,
} from '@/lib/seller-performance';
import {
  getEbayOAuthEnvironment,
  getEbaySellerAccount,
  type EbaySellerListing,
} from '@/services/ebayConnectionService';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import { checkKeepFlipCapabilitiesAccess } from '@/services/keepflip-subscription-service';
import {
  isResellerBookkeepingConfigured,
  syncEbayBookkeeping,
} from '@/services/reseller-bookkeeping-service';
import {
  listResellerLedgerEntries,
  type ResellerLedgerEntry,
} from '@/services/reseller-ledger-service';
import {
  createManualSellerOrder,
  fetchEbaySellerOrders,
  listManualSellerOrders,
  markEbaySellerOrderShipped,
  markManualSellerOrderShipped,
  matchEbayOrderLinesToInventory,
  postSellerOrderToBooks,
  type EbaySellerOrder,
  type SellerOrder,
} from '@/services/seller-order-service';
function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>SELLER OPERATIONS</Text>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>
          {title}
        </Text>
      </View>
      <View style={styles.sectionSurface}>{children}</View>
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled = false,
  description = 'Open this seller operation.',
  icon = 'arrow.right',
  accent = 'gold',
  actionLabel,
  status,
  busy = false,
  staticLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  description?: string;
  icon?: KeepFlipControlRowProps['icon'];
  accent?: KeepFlipControlRowProps['accent'];
  actionLabel?: string;
  status?: KeepFlipControlRowProps['status'];
  busy?: boolean;
  staticLabel?: string;
}) {
  return (
    <KeepFlipControlRow
      accent={accent}
      actionBusy={busy}
      actionLabel={actionLabel}
      accessibilityHint={description}
      description={description}
      icon={icon}
      label={title}
      onPress={disabled || busy ? undefined : onPress}
      staticLabel={staticLabel ?? (disabled && !busy ? 'LOCKED' : undefined)}
      status={status}
    />
  );
}

function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { fontSize: responsiveFont(8) }]}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: theme.colors.backgroundDeep,
    },
    content: {
      width: '100%',
      maxWidth: 850,
      alignSelf: 'center',
      gap: 12,
      padding: 16,
      paddingBottom: 44,
    },
    section: {
      gap: 7,
    },
    sectionHeading: {
      gap: 2,
    },
    sectionEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.35,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    sectionSurface: {
      gap: 10,
      padding: 10,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.card,
    },
    controlList: {
      overflow: 'hidden',
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.cardSoft,
    },
    recordCard: {
      overflow: 'hidden',
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.cardSoft,
    },
    recordDetails: {
      gap: 10,
      paddingHorizontal: 10,
      paddingTop: 3,
      paddingBottom: 10,
    },
    formSurface: {
      gap: 10,
      padding: 10,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.cardSoft,
    },
    heading: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      letterSpacing: -0.1,
    },
    text: {
      color: theme.colors.text,
      fontSize: 12,
      lineHeight: 18,
    },
    muted: {
      color: theme.colors.textMuted,
      fontSize: 10,
      lineHeight: 15,
    },
    label: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    field: {
      gap: 5,
    },
    input: {
      minHeight: 42,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceInset,
      borderColor: theme.colors.dividerStrong,
      borderWidth: 1,
      borderRadius: theme.radii.small,
      paddingHorizontal: 11,
      paddingVertical: 10,
      fontSize: 12,
    },
    multiline: {
      minHeight: 84,
      textAlignVertical: 'top',
    },
    error: {
      color: theme.colors.danger,
      fontSize: 11,
      lineHeight: 16,
    },
  });
  return {
    ...staticStyles,
    heading: [
      staticStyles.heading,
      {
        fontSize: responsiveFont(15),
      },
    ],
    text: [
      staticStyles.text,
      {
        fontSize: responsiveFont(12),
      },
    ],
    muted: [
      staticStyles.muted,
      {
        fontSize: responsiveFont(10),
      },
    ],
    label: [
      staticStyles.label,
      {
        fontSize: responsiveFont(8),
      },
    ],
    input: [
      staticStyles.input,
      {
        fontSize: responsiveFont(12),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(11),
      },
    ],
  };
}
function message(cause: unknown, fallback = 'That action could not be completed.') {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

function money(cents: number | null | undefined, currency = 'USD') {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function dateLabel(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleDateString();
}

function listingForItem(item: InventoryItem, listings: EbaySellerListing[]) {
  return listings.find(
    (listing) =>
      (item.ebayListingId &&
        listing.listingId &&
        item.ebayListingId === listing.listingId) ||
      (item.ebayOfferId && listing.offerId && item.ebayOfferId === listing.offerId) ||
      ((item.ebaySku || item.sku) &&
        listing.sku &&
        (item.ebaySku || item.sku)?.toLowerCase() === listing.sku.toLowerCase()),
  );
}

type SaleDraft = {
  soldPrice: string;
  listPrice: string;
  fees: string;
  shipping: string;
  refund: string;
  payout: string;
  quantity: string;
  soldAt: string;
  shipBy: string;
  packingNotes: string;
};

const EMPTY_DRAFT: SaleDraft = {
  soldPrice: '',
  listPrice: '',
  fees: '0',
  shipping: '0',
  refund: '0',
  payout: '',
  quantity: '1',
  soldAt: new Date().toISOString().slice(0, 10),
  shipBy: '',
  packingNotes: '',
};

type SellerFeatureAccess = {
  automaticBooks: boolean;
  automaticOrders: boolean;
  basicBooks: boolean;
  sellerAnalytics: boolean;
};

const NO_SELLER_FEATURE_ACCESS: SellerFeatureAccess = {
  automaticBooks: false,
  automaticOrders: false,
  basicBooks: false,
  sellerAnalytics: false,
};

export function SellerOperationsPanel({ ownerId, embedded = false }: { ownerId: string; embedded?: boolean }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const { limitFor, snapshot } = useKeepFlipSubscription();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [manualOrders, setManualOrders] = useState<SellerOrder[]>([]);
  const [ledger, setLedger] = useState<ResellerLedgerEntry[]>([]);
  const [ebayOrders, setEbayOrders] = useState<EbaySellerOrder[]>([]);
  const [ebayListings, setEbayListings] = useState<EbaySellerListing[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [draft, setDraft] = useState<SaleDraft>(EMPTY_DRAFT);
  const [tracking, setTracking] = useState<Record<string, { carrier: string; number: string }>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverFeatures, setServerFeatures] = useState<SellerFeatureAccess>(
    NO_SELLER_FEATURE_ACCESS,
  );

  const automaticOrders = serverFeatures.automaticOrders;
  const automaticBooks = serverFeatures.automaticBooks;
  const basicBooks = serverFeatures.basicBooks;
  const advancedAnalytics = serverFeatures.sellerAnalytics;
  const listingLimit = limitFor('concurrentActiveListings');

  const loadBase = useCallback(async () => {
    setLoading(true);
    setErrors({});

    let nextFeatures = NO_SELLER_FEATURE_ACCESS;
    let subscriptionError = '';
    try {
      const checks = await checkKeepFlipCapabilitiesAccess([
        'basic_books',
        'automated_books',
        'automatic_order_sync',
        'seller_analytics',
      ]);
      nextFeatures = {
        automaticBooks: checks.automated_books?.allowed === true,
        automaticOrders: checks.automatic_order_sync?.allowed === true,
        basicBooks: checks.basic_books?.allowed === true,
        sellerAnalytics: checks.seller_analytics?.allowed === true,
      };
    } catch (cause) {
      // A feature screen must never use a cached plan or a direct table read
      // when its authenticated server check is unavailable.
      subscriptionError = message(
        cause,
        'KeepFlip could not verify subscription access. Protected tools are unavailable.',
      );
    }
    setServerFeatures(nextFeatures);

    const [inventoryResult, orderResult, ledgerResult, sellerResult] =
      await Promise.allSettled([
        listInventoryItems(ownerId),
        listManualSellerOrders(ownerId),
        nextFeatures.basicBooks
          ? listResellerLedgerEntries(ownerId)
          : Promise.resolve([] as ResellerLedgerEntry[]),
        nextFeatures.automaticOrders
          ? getEbaySellerAccount(getEbayOAuthEnvironment())
          : Promise.resolve(null),
      ]);

    const nextErrors: Record<string, string> = {};
    if (subscriptionError) nextErrors.subscription = subscriptionError;
    if (inventoryResult.status === 'fulfilled') {
      setInventory(inventoryResult.value);
      setSelectedItemId((current) =>
        current &&
        inventoryResult.value.some(
          (item) =>
            item.id === current && (item.quantityOnHand > 0 || item.isListed),
        )
          ? current
          : '',
      );
    } else {
      nextErrors.inventory = message(inventoryResult.reason, 'Inventory could not load.');
    }

    if (orderResult.status === 'fulfilled') setManualOrders(orderResult.value);
    else nextErrors.orders = message(orderResult.reason, 'Manual orders could not load.');

    if (ledgerResult.status === 'fulfilled') setLedger(ledgerResult.value);
    else nextErrors.books = message(ledgerResult.reason, 'Books could not load.');

    if (
      sellerResult.status === 'fulfilled' &&
      sellerResult.value?.connected
    ) {
      setEbayListings(sellerResult.value.listings);
    } else {
      setEbayListings([]);
    }

    setErrors(nextErrors);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void loadBase();
  }, [
    loadBase,
    snapshot?.access.active,
    snapshot?.access.expiresAt,
    snapshot?.access.plan,
    snapshot?.access.trialSource,
  ]);

  const matchedEbayOrders = useMemo(
    () => matchEbayOrderLinesToInventory(ebayOrders, inventory),
    [ebayOrders, inventory],
  );
  const margins = useMemo(
    () => buildRealizedItemMargins({ inventory, entries: ledger }),
    [inventory, ledger],
  );

  const performanceOrders = useMemo<SellerOrderPerformanceInput[]>(() => {
    const manual: SellerOrderPerformanceInput[] = manualOrders.map((order) => ({
      id: order.id,
      sourceItemId: order.sourceItemId,
      quantity: order.quantity,
      soldPriceCents: order.soldPriceCents,
      listPriceCents: order.listPriceCents,
      refundCents: order.refundCents,
      soldAt: order.soldAt,
    }));
    const ebay = matchedEbayOrders.flatMap((order) =>
      order.lineItems.map((line) => ({
        id: line.externalLineKey,
        sourceItemId: line.itemId,
        quantity: line.quantity ?? 1,
        soldPriceCents: line.total?.amountCents ?? line.sale?.amountCents ?? null,
        listPriceCents: null,
        refundCents: order.refundsCents,
        soldAt: order.soldAt,
      })),
    );
    return [...manual, ...ebay];
  }, [manualOrders, matchedEbayOrders]);

  const performance = useMemo(
    () => buildSellerPerformance({ inventory, margins, orders: performanceOrders }),
    [inventory, margins, performanceOrders],
  );

  const selectedItem = inventory.find((item) => item.id === selectedItemId) ?? null;

  async function recordManualSale() {
    if (!selectedItem || working) return;
    setWorking(true);
    setNotice('');
    setErrors((current) => ({ ...current, create: '' }));
    try {
      const quantity = Number(draft.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error('Quantity sold must be a positive whole number.');
      }
      const soldPriceCents = parseMoneyInput(draft.soldPrice);
      if (soldPriceCents == null || soldPriceCents <= 0) {
        throw new Error('Enter the actual sold price.');
      }
      const order = await createManualSellerOrder({
        ownerId,
        sourceItemId: selectedItem.id,
        title: selectedItem.title,
        currency: selectedItem.currency,
        quantity,
        soldPriceCents,
        listPriceCents: parseMoneyInput(draft.listPrice),
        feesCents: parseMoneyInput(draft.fees),
        shippingExpenseCents: parseMoneyInput(draft.shipping),
        refundCents: parseMoneyInput(draft.refund),
        payoutCents: parseMoneyInput(draft.payout),
        soldAt: draft.soldAt,
        shipBy: draft.shipBy || null,
        packingNotes: draft.packingNotes,
      });
      setManualOrders((current) => [order, ...current]);
      setDraft({ ...EMPTY_DRAFT, soldAt: new Date().toISOString().slice(0, 10) });

      if (basicBooks && isResellerBookkeepingConfigured()) {
        try {
          await postSellerOrderToBooks(order);
          setLedger(await listResellerLedgerEntries(ownerId));
          setNotice('Sale saved and linked to the item in Books.');
        } catch (cause) {
          setNotice(
            `Sale saved. Books still needs review: ${message(cause)} The same reconciliation can be retried safely.`,
          );
        }
      } else if (basicBooks) {
        setNotice('Sale saved. Configure Books to create the linked financial records.');
      } else {
        setNotice('Sale saved. Books posting requires an active KeepFlip subscription.');
      }
    } catch (cause) {
      setErrors((current) => ({ ...current, create: message(cause) }));
    } finally {
      setWorking(false);
    }
  }

  function selectSaleItem(itemId: string) {
    if (working) return;
    if (selectedItemId !== itemId) {
      setDraft({ ...EMPTY_DRAFT, soldAt: new Date().toISOString().slice(0, 10) });
      setErrors((current) => ({ ...current, create: '' }));
    }
    setSelectedItemId(itemId);
  }

  async function syncOrders() {
    if (!automaticOrders || working) return;
    setWorking(true);
    setNotice('');
    try {
      const page = await fetchEbaySellerOrders();
      setEbayOrders(page.orders);
      setNotice(
        `Loaded ${page.orders.length} eBay order${page.orders.length === 1 ? '' : 's'} through the secured seller backend.`,
      );
    } catch (cause) {
      setErrors((current) => ({ ...current, ebay: message(cause) }));
    } finally {
      setWorking(false);
    }
  }

  async function syncMoney() {
    if (!automaticBooks || working) return;
    setWorking(true);
    setNotice('');
    try {
      const result = await syncEbayBookkeeping();
      setLedger(await listResellerLedgerEntries(ownerId));
      setNotice(
        `Money Sync posted ${result.posted} event${result.posted === 1 ? '' : 's'}; ${result.needsReview + result.needsItemMatch + result.needsItemCost} remain in review${result.invalidRepaired ? `; replaced ${result.invalidRepaired} corrected invalid record${result.invalidRepaired === 1 ? '' : 's'}` : ''}.`,
      );
    } catch (cause) {
      setErrors((current) => ({ ...current, money: message(cause) }));
    } finally {
      setWorking(false);
    }
  }

  async function shipManual(order: SellerOrder) {
    if (working) return;
    setWorking(true);
    try {
      const value = tracking[order.id] ?? { carrier: '', number: '' };
      const updated = await markManualSellerOrderShipped({
        ownerId,
        orderId: order.id,
        trackingNumber: value.number || null,
        shippingCarrierCode: value.carrier || null,
      });
      setManualOrders((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setNotice(`${order.title} marked shipped.`);
    } catch (cause) {
      setErrors((current) => ({ ...current, fulfillment: message(cause) }));
    } finally {
      setWorking(false);
    }
  }

  async function shipEbay(order: EbaySellerOrder) {
    if (!automaticOrders || working) return;
    const value = tracking[order.externalOrderKey] ?? { carrier: '', number: '' };
    if (!value.carrier.trim() || !value.number.trim()) {
      setErrors((current) => ({
        ...current,
        fulfillment: 'Enter the carrier and tracking number before marking an eBay order shipped.',
      }));
      return;
    }
    const lines = order.lineItems
      .filter((line) => line.lineItemId && (line.quantity ?? 0) > 0)
      .map((line) => ({ lineItemId: line.lineItemId, quantity: line.quantity ?? 1 }));
    if (!lines.length) {
      setErrors((current) => ({
        ...current,
        fulfillment: 'This eBay order did not include shippable line-item quantities.',
      }));
      return;
    }
    setWorking(true);
    try {
      await markEbaySellerOrderShipped({
        orderId: order.orderId,
        trackingNumber: value.number.trim(),
        shippingCarrierCode: value.carrier.trim(),
        lineItems: lines,
      });
      await syncOrders();
      setNotice('eBay confirmed the shipping fulfillment.');
    } catch (cause) {
      setErrors((current) => ({ ...current, fulfillment: message(cause) }));
    } finally {
      setWorking(false);
    }
  }

  function trackingFields(key: string) {
    const value = tracking[key] ?? { carrier: '', number: '' };
    return (
      <>
        <Field
          label="Shipping carrier"
          value={value.carrier}
          onChangeText={(carrier) =>
            setTracking((current) => ({
              ...current,
              [key]: { ...value, carrier },
            }))
          }
        />
        <Field
          label="Tracking number"
          value={value.number}
          onChangeText={(number) =>
            setTracking((current) => ({
              ...current,
              [key]: { ...value, number },
            }))
          }
        />
      </>
    );
  }

  const activeListings = inventory.filter((item) => item.isListed).length;
  const saleItems = inventory
    .filter((item) => item.quantityOnHand > 0 || item.isListed)
    .slice(0, 30);

  const content = (
    <>
      <Text accessibilityRole="header" style={[styles.heading, { fontSize: responsiveFont(15), lineHeight: 20 }]}>
        Orders, fulfillment and realized profit
      </Text>
      <Text style={styles.muted}>
        Manual selling stays available on every plan. Serious adds secured eBay
        order, tracking and Money Sync automation.
      </Text>

      {loading ? <ActivityIndicator accessibilityLabel="Loading seller operations" color={theme.colors.scannerCyan} /> : null}
      {Object.entries(errors)
        .filter(([, value]) => value)
        .map(([key, value]) => (
          <Text key={key} accessibilityRole="alert" style={[styles.error, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
            {key}: {value}
          </Text>
        ))}
      {notice ? <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>{notice}</Text> : null}
      <Button
        title={loading ? 'Refreshing…' : 'Refresh seller operations'}
        description="Reload inventory, orders, fulfillment status and realized margin."
        icon="arrow.clockwise"
        accent="cyan"
        actionLabel="REFRESH"
        busy={loading || working}
        disabled={loading || working}
        onPress={() => void loadBase()}
      />

      <Section title="Listing lifecycle">
        <Text style={styles.muted}>
          {listingLimit && listingLimit > 0
            ? `${activeListings} linked live listing${activeListings === 1 ? '' : 's'} of the ${listingLimit} concurrent-listing plan limit.`
            : `${activeListings} linked live listing${activeListings === 1 ? '' : 's'}.`}
        </Text>
        {inventory.filter((item) => item.isListed || item.listedAt).slice(0, 30).map((item) => {
          const listing = listingForItem(item, ebayListings);
          const aging = agingRecommendations({
            listedAt: item.listedAt,
            photoCount: item.photoCount,
            condition: item.condition,
            typicalDays: item.resaleTypicalDays,
            verifiedComparableCents:
              item.estimatedValue == null ? null : Math.round(item.estimatedValue * 100),
            comparableCheckedAt: item.analysisSnapshot ? item.createdAt : null,
            askingPriceCents: listing?.currentPriceCents ?? null,
          });
          const listingStatus = listing?.listingId || item.ebayListingId ? 'LIVE' : 'LINKED';
          return (
            <View key={item.id} style={styles.recordCard}>
              <KeepFlipControlRow
                accent="cyan"
                description={`SKU ${listing?.sku || item.ebaySku || item.sku || 'missing'} · storage ${item.storageLocation || 'missing'} · ${listingStatus.toLowerCase()}`}
                icon="tag.fill"
                label={item.title}
                staticLabel={listingStatus}
                status={{
                  label: listingStatus,
                  tone: listingStatus === 'LIVE' ? 'active' : 'violet',
                }}
              />
              <View style={styles.recordDetails}>
                <Text style={styles.muted}>
                  eBay listing {listing?.listingId || item.ebayListingId || 'not linked'} · qty {listing?.quantityAvailable ?? item.quantityOnHand} · price {money(listing?.currentPriceCents)}
                </Text>
                <Text style={styles.muted}>
                  Listed {dateLabel(item.listedAt)} · last sync {dateLabel(listing?.lastSyncedAt)}
                </Text>
                {aging.recommendations.slice(0, 2).map((recommendation) => (
                  <Text key={recommendation} style={styles.muted}>
                    {aging.checkpoint ? `Day ${aging.checkpoint}: ` : ''}{recommendation}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}
        {!inventory.some((item) => item.isListed || item.listedAt) && !loading ? (
          <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>No linked live listings yet.</Text>
        ) : null}
      </Section>

      <Section title="Record a sale · every plan">
        <Text style={styles.muted}>
          Select the exact inventory item to expand its sale details. This preserves
          SKU/storage context and lets Books calculate realized profit instead of guessing.
        </Text>
        <View style={styles.controlList}>
          {saleItems.map((item) => (
            <Button
              key={item.id}
              title={item.title}
              description={`SKU ${item.sku || 'no SKU'} · storage ${item.storageLocation || 'no bin'} · quantity ${item.quantityOnHand}`}
              icon="shippingbox.fill"
              accent="cyan"
              status={selectedItemId === item.id
                ? { label: 'SELECTED', tone: 'active' }
                : { label: 'AVAILABLE', tone: 'violet' }}
              disabled={working}
              onPress={() => selectSaleItem(item.id)}
            />
          ))}
        </View>
        {selectedItem ? (
          <Animated.View entering={FadeInDown.duration(220)} style={styles.formSurface}>
            <KeepFlipControlRow
              accent="cyan"
              description={`SKU ${selectedItem.sku || 'no SKU'} · stored at ${selectedItem.storageLocation || 'location not set'}`}
              icon="shippingbox.fill"
              label={selectedItem.title}
              staticLabel="SELECTED"
              status={{ label: 'SALE DRAFT', tone: 'active' }}
            />
            <Field label="Sold price" numeric value={draft.soldPrice} onChangeText={(soldPrice) => setDraft((current) => ({ ...current, soldPrice }))} />
            <Field label="Original/list price (optional)" numeric value={draft.listPrice} onChangeText={(listPrice) => setDraft((current) => ({ ...current, listPrice }))} />
            <Field label="Marketplace fees" numeric value={draft.fees} onChangeText={(fees) => setDraft((current) => ({ ...current, fees }))} />
            <Field label="Shipping expense" numeric value={draft.shipping} onChangeText={(shipping) => setDraft((current) => ({ ...current, shipping }))} />
            <Field label="Refund amount" numeric value={draft.refund} onChangeText={(refund) => setDraft((current) => ({ ...current, refund }))} />
            <Field label="Payout received (optional)" numeric value={draft.payout} onChangeText={(payout) => setDraft((current) => ({ ...current, payout }))} />
            <Field label="Quantity sold" numeric value={draft.quantity} onChangeText={(quantity) => setDraft((current) => ({ ...current, quantity }))} />
            <Field label="Sold date" value={draft.soldAt} onChangeText={(soldAt) => setDraft((current) => ({ ...current, soldAt }))} />
            <Field label="Ship-by date (optional)" value={draft.shipBy} onChangeText={(shipBy) => setDraft((current) => ({ ...current, shipBy }))} />
            <Field label="Packing notes" multiline value={draft.packingNotes} onChangeText={(packingNotes) => setDraft((current) => ({ ...current, packingNotes }))} />
            <Button
              title="Save sale and reconcile Books"
              description="Save this sale and connect it to the selected inventory item in Books."
              icon="checkmark.circle.fill"
              accent="gold"
              actionLabel="SAVE"
              busy={working}
              disabled={working}
              onPress={() => void recordManualSale()}
            />
          </Animated.View>
        ) : (
          <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
            {saleItems.length
              ? 'Select an inventory item above to expand sale details.'
              : 'Save an inventory item before recording its sale.'}
          </Text>
        )}
      </Section>

      <Section title="Fulfillment center">
        <Text style={styles.muted}>
          Manual orders are available to everyone. Serious can pull eBay ship-by
          deadlines and submit shipping fulfillment without exposing eBay tokens
          or buyer-sensitive payloads to the app.
        </Text>
        {automaticOrders ? (
          <Button
            title="Sync eBay orders"
            description="Pull the latest eBay orders and ship-by deadlines through KeepFlip."
            icon="arrow.clockwise"
            accent="cyan"
            actionLabel="SYNC"
            busy={working}
            disabled={working}
            onPress={() => void syncOrders()}
          />
        ) : (
          <Text style={styles.muted}>
            Serious adds automatic eBay order sync, ship-by status and tracking updates.
          </Text>
        )}

        {manualOrders.map((order) => (
          <View key={order.id} style={styles.recordCard}>
            <KeepFlipControlRow
              accent={order.fulfillmentStatus === 'shipped' ? 'cyan' : 'gold'}
              description={`Sold ${money(order.soldPriceCents)} · storage ${inventory.find((item) => item.id === order.sourceItemId)?.storageLocation || 'not set'} · ship by ${dateLabel(order.shipBy)}`}
              icon="shippingbox.fill"
              label={order.title}
              staticLabel={order.trackingNumber ? 'TRACKED' : 'MANUAL'}
              status={{
                label: order.fulfillmentStatus.toUpperCase(),
                tone: order.fulfillmentStatus === 'shipped' ? 'active' : 'warning',
              }}
            />
            <View style={styles.recordDetails}>
              <Text style={styles.muted}>
                Tracking {order.trackingNumber || 'not entered'}
              </Text>
              {order.fulfillmentStatus !== 'shipped' ? (
                <>
                  {trackingFields(order.id)}
                  <Button
                    title="Mark manual order shipped"
                    description="Save the tracking details and mark this manual order shipped."
                    icon="shippingbox.fill"
                    accent="gold"
                    actionLabel="SHIP"
                    busy={working}
                    disabled={working}
                    onPress={() => void shipManual(order)}
                  />
                </>
              ) : null}
            </View>
          </View>
        ))}

        {matchedEbayOrders.map((order) => (
          <View key={order.externalOrderKey} style={styles.recordCard}>
            <KeepFlipControlRow
              accent="cyan"
              description={`Ship by ${dateLabel(order.shipBy)} · payment ${order.paymentStatus || 'unknown'}`}
              icon="shippingbox.fill"
              label={`eBay order ${order.orderId}`}
              staticLabel={order.paymentStatus || 'REVIEW'}
              status={{
                label: order.fulfillmentStatus || 'STATUS UNAVAILABLE',
                tone: String(order.fulfillmentStatus || '').toUpperCase().includes('FULFILLED')
                  ? 'active'
                  : 'warning',
              }}
            />
            <View style={styles.recordDetails}>
              {order.lineItems.map((line) => {
                const item = line.itemId ? inventory.find((candidate) => candidate.id === line.itemId) : null;
                return (
                  <Text key={line.externalLineKey} style={line.matchStatus === 'matched' ? styles.muted : styles.error}>
                    {line.title || line.sku || line.lineItemId} · {line.matchStatus === 'matched'
                      ? `stored at ${item?.storageLocation || 'location not set'}`
                      : 'needs an inventory match before financial reconciliation'}
                  </Text>
                );
              })}
              {!String(order.fulfillmentStatus || '').toUpperCase().includes('FULFILLED') ? (
                <>
                  {trackingFields(order.externalOrderKey)}
                  <Button
                    title="Mark shipped on eBay"
                    description="Submit carrier and tracking details to eBay for this order."
                    icon="shippingbox.fill"
                    accent="cyan"
                    actionLabel="SHIP"
                    busy={working}
                    disabled={working}
                    onPress={() => void shipEbay(order)}
                  />
                </>
              ) : null}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Realized margin">
        <Text style={styles.muted}>
          Only posted, item-linked Books entries are counted. Unresolved eBay
          transactions remain in the existing review queue rather than being guessed.
        </Text>
        {automaticBooks ? (
          <Button
            title="Run eBay Money Sync"
            description="Reconcile eBay sales, fees, refunds and payouts into Books."
            icon="dollarsign.circle.fill"
            accent="gold"
            actionLabel="SYNC"
            busy={working}
            disabled={working}
            onPress={() => void syncMoney()}
          />
        ) : (
          <Text style={styles.muted}>
            Serious adds automatic eBay sales, fee, refund and payout reconciliation.
          </Text>
        )}
        <Button
          title="Open Books review queue"
          description="Review unresolved item-linked Books records and reconciliation work."
          icon="chart.bar.fill"
          accent="violet"
          actionLabel="OPEN"
          staticLabel={!basicBooks ? 'LOCKED' : undefined}
          disabled={!basicBooks}
          onPress={() => router.push('/books' as Href)}
        />
        {margins.map((margin) => (
          <View key={margin.itemId} style={styles.recordCard}>
            <KeepFlipControlRow
              accent={margin.reconciliationStatus === 'complete' ? 'cyan' : 'gold'}
              description={`Bought for ${money(margin.acquisitionCostCents)} · sold for ${money(margin.soldProceedsCents)} · net profit ${money(margin.netProfitCents)}`}
              icon="chart.bar.fill"
              label={margin.title}
              staticLabel={margin.reconciliationStatus === 'complete' ? 'POSTED' : 'REVIEW'}
              status={{
                label: margin.reconciliationStatus === 'complete' ? 'RECONCILED' : 'COST REVIEW',
                tone: margin.reconciliationStatus === 'complete' ? 'active' : 'warning',
              }}
            />
            <View style={styles.recordDetails}>
              <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
                Fees {money(margin.marketplaceFeesCents)} · shipping {money(margin.shippingExpenseCents)} · refunds {money(margin.refundCents)}
              </Text>
              <Text style={styles.muted}>
                ROI {percent(margin.roiPercent)} · {margin.reconciliationStatus === 'complete' ? 'reconciled from linked records' : 'item cost still needs review'}
              </Text>
            </View>
          </View>
        ))}
        {!margins.length && !loading ? (
          <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>No item-linked sale proceeds have posted to Books yet.</Text>
        ) : null}
      </Section>

      <Section title="KeepFlip performance">
        {advancedAnalytics ? (
          <>
            <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
              Sell-through {percent(performance.sellThroughPercent)} · average days-to-sale {performance.averageDaysToSale == null ? '—' : performance.averageDaysToSale.toFixed(1)}
            </Text>
            <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
              Realized profit {money(performance.realizedProfitCents)} · realized margin {percent(performance.realizedMarginPercent)} · average ROI {percent(performance.averageRoiPercent)}
            </Text>
            <Text style={[styles.text, { fontSize: responsiveFont(12), lineHeight: 18 }]}>
              Average discount {percent(performance.averageDiscountPercent)} · return rate {percent(performance.returnRatePercent)}
            </Text>
            {performance.bySource.map((row) => (
              <Text key={`source-${row.key}`} style={styles.muted}>
                Source · {row.label}: {row.soldCount} sold · {money(row.netProfitCents)} profit
              </Text>
            ))}
            {performance.byCategory.map((row) => (
              <Text key={`category-${row.key}`} style={styles.muted}>
                Category · {row.label}: {row.soldCount} sold · {money(row.netProfitCents)} profit
              </Text>
            ))}
          </>
        ) : (
          <Text style={styles.muted}>
            Basic item profit history is included. Serious adds aggregate
            sell-through, days-to-sale, ROI, discounts, returns and
            source/category performance.
          </Text>
        )}
      </Section>

      <EbaySellerHealthPanel enabled={advancedAnalytics} />

      <Section title="Plan boundary">
        <Text style={styles.muted}>
          Current plan: {snapshot?.access.plan || 'no active paid plan resolved'}.
          Individual listing guidance, manual sales, manual shipping and basic
          profit remain available without eBay automation.
        </Text>
      </Section>
    </>
  );

  return embedded ? (
    <View style={[styles.content, embeddedStyles.content]}>{content}</View>
  ) : (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  );
}
const embeddedStyles = StyleSheet.create({
  content: {
    gap: 12,
    maxWidth: '100%',
    padding: 0,
    paddingBottom: 0,
  },
});
