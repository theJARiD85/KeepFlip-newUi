import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
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
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && styles.buttonPressed,
      ]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
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

const styles = StyleSheet.create({
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
    gap: 10,
    padding: 14,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.16)',
    backgroundColor: 'rgba(11, 10, 14, 0.84)',
  },
  sectionBody: {
    gap: 10,
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
    backgroundColor: 'rgba(3, 3, 6, 0.72)',
    borderColor: 'rgba(242, 211, 138, 0.22)',
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
  button: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radii.small,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.28)',
    backgroundColor: 'rgba(88, 223, 232, 0.045)',
  },
  buttonPressed: {
    backgroundColor: 'rgba(88, 223, 232, 0.10)',
    borderColor: 'rgba(88, 223, 232, 0.48)',
  },
  buttonText: {
    color: theme.colors.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.42,
  },
  row: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(242, 211, 138, 0.14)',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 11,
    lineHeight: 16,
  },
});
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

export function SellerOperationsPanel({ ownerId, embedded = false }: { ownerId: string; embedded?: boolean }) {
  const router = useRouter();
  const { canUse, limitFor, snapshot } = useKeepFlipSubscription();
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

  const automaticOrders = canUse('automatic_order_sync');
  const automaticBooks = canUse('automated_books');
  const advancedAnalytics = canUse('seller_analytics');
  const listingLimit = limitFor('concurrentActiveListings');

  const loadBase = useCallback(async () => {
    setLoading(true);
    setErrors({});
    const [inventoryResult, orderResult, ledgerResult, sellerResult] =
      await Promise.allSettled([
        listInventoryItems(ownerId),
        listManualSellerOrders(ownerId),
        listResellerLedgerEntries(ownerId),
        getEbaySellerAccount(getEbayOAuthEnvironment()),
      ]);

    const nextErrors: Record<string, string> = {};
    if (inventoryResult.status === 'fulfilled') {
      setInventory(inventoryResult.value);
      setSelectedItemId((current) =>
        current || inventoryResult.value.find((item) => item.quantityOnHand > 0)?.id || '',
      );
    } else {
      nextErrors.inventory = message(inventoryResult.reason, 'Inventory could not load.');
    }

    if (orderResult.status === 'fulfilled') setManualOrders(orderResult.value);
    else nextErrors.orders = message(orderResult.reason, 'Manual orders could not load.');

    if (ledgerResult.status === 'fulfilled') setLedger(ledgerResult.value);
    else nextErrors.books = message(ledgerResult.reason, 'Books could not load.');

    if (sellerResult.status === 'fulfilled' && sellerResult.value.connected) {
      setEbayListings(sellerResult.value.listings);
    } else {
      setEbayListings([]);
    }

    setErrors(nextErrors);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

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

      if (isResellerBookkeepingConfigured()) {
        try {
          await postSellerOrderToBooks(order);
          setLedger(await listResellerLedgerEntries(ownerId));
          setNotice('Sale saved and linked to the item in Books.');
        } catch (cause) {
          setNotice(
            `Sale saved. Books still needs review: ${message(cause)} The same reconciliation can be retried safely.`,
          );
        }
      } else {
        setNotice('Sale saved. Configure Books to create the linked financial records.');
      }
    } catch (cause) {
      setErrors((current) => ({ ...current, create: message(cause) }));
    } finally {
      setWorking(false);
    }
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
        `Money Sync posted ${result.posted} event${result.posted === 1 ? '' : 's'}; ${result.needsReview + result.needsItemMatch + result.needsItemCost} remain in review.`,
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

  const content = (
    <>
      <Text accessibilityRole="header" style={styles.heading}>
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
          <Text key={key} accessibilityRole="alert" style={styles.error}>
            {key}: {value}
          </Text>
        ))}
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
      <Button
        title={loading ? 'Refreshing…' : 'Refresh seller operations'}
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
          return (
            <View key={item.id} style={styles.row}>
              <Text style={styles.text}>{item.title}</Text>
              <Text style={styles.muted}>
                SKU {listing?.sku || item.ebaySku || item.sku || 'missing'} · storage {item.storageLocation || 'missing'}
              </Text>
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
          );
        })}
        {!inventory.some((item) => item.isListed || item.listedAt) && !loading ? (
          <Text style={styles.text}>No linked live listings yet.</Text>
        ) : null}
      </Section>

      <Section title="Record a sale · every plan">
        <Text style={styles.muted}>
          Choose the exact inventory item. This preserves SKU/storage context and
          lets Books calculate realized profit instead of guessing.
        </Text>
        <View style={styles.row}>
          {inventory
            .filter((item) => item.quantityOnHand > 0 || item.isListed)
            .slice(0, 30)
            .map((item) => (
              <Button
                key={item.id}
                title={`${selectedItemId === item.id ? 'Selected: ' : ''}${item.title} · ${item.sku || 'no SKU'} · ${item.storageLocation || 'no bin'}`}
                disabled={working}
                onPress={() => setSelectedItemId(item.id)}
              />
            ))}
        </View>
        {selectedItem ? (
          <>
            <Text style={styles.text}>
              {selectedItem.title} · stored at {selectedItem.storageLocation || 'location not set'}
            </Text>
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
            <Button title="Save sale and reconcile Books" disabled={working} onPress={() => void recordManualSale()} />
          </>
        ) : (
          <Text style={styles.text}>Save an inventory item before recording its sale.</Text>
        )}
      </Section>

      <Section title="Fulfillment center">
        <Text style={styles.muted}>
          Manual orders are available to everyone. Serious can pull eBay ship-by
          deadlines and submit shipping fulfillment without exposing eBay tokens
          or buyer-sensitive payloads to the app.
        </Text>
        {automaticOrders ? (
          <Button title="Sync eBay orders" disabled={working} onPress={() => void syncOrders()} />
        ) : (
          <Text style={styles.muted}>
            Serious adds automatic eBay order sync, ship-by status and tracking updates.
          </Text>
        )}

        {manualOrders.map((order) => (
          <View key={order.id} style={styles.row}>
            <Text style={styles.text}>{order.title}</Text>
            <Text style={styles.muted}>
              Sold {money(order.soldPriceCents)} · storage {inventory.find((item) => item.id === order.sourceItemId)?.storageLocation || 'not set'} · ship by {dateLabel(order.shipBy)}
            </Text>
            <Text style={styles.muted}>
              Status {order.fulfillmentStatus} · tracking {order.trackingNumber || 'not entered'}
            </Text>
            {order.fulfillmentStatus !== 'shipped' ? (
              <>
                {trackingFields(order.id)}
                <Button title="Mark manual order shipped" disabled={working} onPress={() => void shipManual(order)} />
              </>
            ) : null}
          </View>
        ))}

        {matchedEbayOrders.map((order) => (
          <View key={order.externalOrderKey} style={styles.row}>
            <Text style={styles.text}>
              eBay order {order.orderId} · {order.fulfillmentStatus || 'status unavailable'}
            </Text>
            <Text style={styles.muted}>
              Ship by {dateLabel(order.shipBy)} · payment {order.paymentStatus || 'unknown'}
            </Text>
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
                <Button title="Mark shipped on eBay" disabled={working} onPress={() => void shipEbay(order)} />
              </>
            ) : null}
          </View>
        ))}
      </Section>

      <Section title="Realized margin">
        <Text style={styles.muted}>
          Only posted, item-linked Books entries are counted. Unresolved eBay
          transactions remain in the existing review queue rather than being guessed.
        </Text>
        {automaticBooks ? (
          <Button title="Run eBay Money Sync" disabled={working} onPress={() => void syncMoney()} />
        ) : (
          <Text style={styles.muted}>
            Serious adds automatic eBay sales, fee, refund and payout reconciliation.
          </Text>
        )}
        <Button title="Open Books review queue" onPress={() => router.push('/books' as Href)} />
        {margins.map((margin) => (
          <View key={margin.itemId} style={styles.row}>
            <Text style={styles.text}>{margin.title}</Text>
            <Text style={styles.text}>
              Bought for {money(margin.acquisitionCostCents)} → sold for {money(margin.soldProceedsCents)} → fees {money(margin.marketplaceFeesCents)} → shipping {money(margin.shippingExpenseCents)} → refunds {money(margin.refundCents)} → net profit {money(margin.netProfitCents)}
            </Text>
            <Text style={styles.muted}>
              ROI {percent(margin.roiPercent)} · {margin.reconciliationStatus === 'complete' ? 'reconciled from linked records' : 'item cost still needs review'}
            </Text>
          </View>
        ))}
        {!margins.length && !loading ? (
          <Text style={styles.text}>No item-linked sale proceeds have posted to Books yet.</Text>
        ) : null}
      </Section>

      <Section title="Seller performance">
        {advancedAnalytics ? (
          <>
            <Text style={styles.text}>
              Sell-through {percent(performance.sellThroughPercent)} · average days-to-sale {performance.averageDaysToSale == null ? '—' : performance.averageDaysToSale.toFixed(1)}
            </Text>
            <Text style={styles.text}>
              Realized profit {money(performance.realizedProfitCents)} · realized margin {percent(performance.realizedMarginPercent)} · average ROI {percent(performance.averageRoiPercent)}
            </Text>
            <Text style={styles.text}>
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