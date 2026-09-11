# KeepFlip Seller Operations Appwrite Schema

This rollout keeps the existing listing, inventory, Books, and eBay services intact and adds the smallest storage surface needed for manual fulfillment and safe marketplace automation.

## 1. Existing `items` table

The current eBay listing flow already writes these columns. Seller Center now reads them so every linked item can show the listing lifecycle beside its physical inventory location.

| Column | Type | Notes |
| --- | --- | --- |
| `sku` | string, nullable | KeepFlip/private seller SKU |
| `storageLocation` | string, nullable | Shelf, bin, tote, rack, etc. |
| `quantityPurchased` | integer | Existing inventory quantity |
| `quantityOnHand` | integer | Existing available quantity |
| `isListed` | boolean | Existing listing flag |
| `resaleStatus` | string, nullable | Existing state such as `listed` |
| `ebaySku` | string, nullable | eBay Inventory API SKU |
| `ebayOfferId` | string, nullable | eBay offer ID |
| `ebayListingId` | string, nullable | Published eBay listing ID |
| `listedAt` | datetime/string, nullable | Actual listing timestamp |
| `sellerProceedsJson` | long string, nullable | Versioned Net Proceeds assumptions |

Do not add a second SKU field just for Seller Center. The UI treats `ebaySku` as the channel SKU and falls back to the existing `sku`.

The eBay seller-listing cache already supplies current price, available quantity, listing status, and last-sync time. Seller Center joins that normalized cache to the item by listing ID, offer ID, or SKU instead of duplicating volatile channel state on the item row.

## 2. New `seller_orders` table

Public build variable:

`EXPO_PUBLIC_APPWRITE_SELLER_ORDERS_TABLE_ID=seller_orders`

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `ownerId` | string(64) | yes | Appwrite user ID |
| `sourceItemId` | string(64) | no | Exact KeepFlip item |
| `channel` | string(32) | yes | `manual` or normalized marketplace |
| `externalOrderId` | string(180) | no | Provider order ID |
| `externalOrderKey` | string(180) | no | Provider-safe idempotent key |
| `externalListingId` | string(180) | no | Listing that produced the sale |
| `sellerSku` | string(120) | no | Seller SKU |
| `title` | string(500) | yes | Seller-safe display title |
| `quantity` | integer | yes | Positive quantity |
| `soldPriceCents` | integer | no | Gross item sale amount |
| `listPriceCents` | integer | no | Original ask, when known |
| `feesCents` | integer | no | Marketplace fees |
| `shippingExpenseCents` | integer | no | Seller shipping/label cost |
| `refundCents` | integer | no | Refund amount |
| `payoutCents` | integer | no | Marketplace payout, for reconciliation only |
| `shipBy` | datetime/string | no | Fulfillment deadline |
| `fulfillmentStatus` | string(40) | yes | Normalized seller status |
| `paymentStatus` | string(64) | no | Seller-safe payment state |
| `trackingNumber` | string(120) | no | Manual order tracking |
| `shippingCarrierCode` | string(100) | no | Manual order carrier |
| `packingNotes` | string(2000) | no | Seller-only packing notes |
| `soldAt` | datetime/string | no | Sale timestamp |
| `lastSyncedAt` | datetime/string | no | Marketplace sync timestamp |
| `syncStatus` | string(40) | yes | `manual`, `current`, or `needs_review` |
| `createdAt` | datetime/string | yes | App timestamp |
| `updatedAt` | datetime/string | yes | App timestamp |

Indexes:
- `ownerId + soldAt`
- `ownerId + sourceItemId`
- unique `externalOrderKey` when non-null, if the Appwrite index strategy supports it

Manual rows should grant read/update/delete only to the owner. Automated marketplace rows should preferably be written by the server function and exposed read-only to the user.

## 3. Server-only `marketplace_events` table

This table is the immutable deduplication/audit surface for webhooks and marketplace polling. It must not be writable from the mobile client.

Recommended columns:

| Column | Type | Notes |
| --- | --- | --- |
| `ownerId` | string(64) | Seller owner |
| `channel` | string(32) | e.g. `ebay` |
| `environment` | string(16) | sandbox/production |
| `eventType` | string(80) | order.created, order.updated, fulfillment.created, refund, payout, etc. |
| `externalEventId` | string(255) | Provider event ID where available |
| `idempotencyKey` | string(255), unique | Hash of provider + seller + event identity |
| `externalOrderKey` | string(180), nullable | Normalized order key |
| `externalRevision` | string(80), nullable | Provider revision/last modified time |
| `receivedAt` | datetime/string | First receipt |
| `payloadHash` | string(64) | Hash only; do not retain buyer-sensitive raw payloads |
| `processedAt` | datetime/string, nullable | Processing completion |
| `processingStatus` | string(40) | pending/processed/review/error |

Permissions: server function only. Do not return these rows to the app.

## 4. Server-only eBay shipment idempotency table

Create a TablesDB table with the exact ID `ebay_shipment_operations` and set this server-only Function variable:

`APPWRITE_EBAY_SHIPMENT_OPERATIONS_TABLE_ID=ebay_shipment_operations`

Create these columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `ownerId` | string(64) | yes | KeepFlip seller user ID |
| `environment` | string(16) or enum | yes | `sandbox` or `production` |
| `requestHash` | string(64) | yes | Hash of the carrier, tracking number, and order lines |
| `createdAt` | datetime | yes | Reservation creation time |

No index is required because the Function uses a deterministic operation ID as the row ID. Rows are created with empty permissions and are readable only through the eBay Function. The Function checks an existing row on retry and deletes it after eBay confirms the fulfillment. A row that remains means the operation needs reconciliation before retrying.

## 5. Server-only seller quota table

Create a TablesDB table with the exact ID `seller_quotas` in the same database as the subscription table. Set this subscription police Function variable:

`APPWRITE_SELLER_QUOTAS_TABLE_ID=seller_quotas`

Create these columns:

| Column | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `revision` | integer | yes | `0` | Optimistic transaction conflict marker |
| `payload` | medium text/text | yes | none | JSON state or idempotency receipt |

No index is required. The Function addresses rows by deterministic row ID. Give the table no mobile permissions.

Before enforcement is enabled, initialize one state row per existing `user_subscription` row. The checked-in operator migration is `backend/functions/keepflip-subscription-police/scripts/initialize-quota-state.mjs`. Run it from `backend/functions/keepflip-subscription-police` with an Appwrite server key that can read `user_subscription` and write `seller_quotas`.

Set these operator-only variables in the PowerShell session:

~~~text
APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1
APPWRITE_FUNCTION_PROJECT_ID=<your project ID>
APPWRITE_API_KEY=<temporary server key>
APPWRITE_DATABASE_ID=keepflip
APPWRITE_USER_SUBSCRIPTIONS_TABLE_ID=user_subscription
APPWRITE_SELLER_QUOTAS_TABLE_ID=seller_quotas
~~~

Then run:

~~~text
node scripts/initialize-quota-state.mjs
~~~

The script is idempotent. It creates missing state rows and skips rows that already exist. The state payload starts with `ready: true`, `activeListings: 0`, `aiValuations: 0`, and the current UTC `month`. If a state row is missing or malformed after deployment, the Function returns `QUOTAS_NOT_INITIALIZED` rather than guessing usage.

The active AI provider is the existing `ebay_sold_comps_v2` Function:

- `SELLER_AI_MARKET_FUNCTION_ID=ebay_sold_comps_v2`
- `EXPO_PUBLIC_APPWRITE_MARKET_COMPS_FUNCTION_ID=ebay_sold_comps_v2`
- `EXPO_PUBLIC_APPWRITE_EBAY_SOLD_COMPS_FUNCTION_ID=ebay_sold_comps_v2`

`keepflip_item_ai` is not part of the active identification flow and is not required for this rollout.

## 6. Listing quota server bridge

The current eBay backend already requires:

- `APPWRITE_SUBSCRIPTION_POLICE_FUNCTION_ID`
- `SELLER_QUOTA_INTERNAL_SECRET`

Publishing reserves `listing.reserve` before any new eBay listing write. Keep concurrent active-listing limits and monthly publish quotas as separate counters. The current plan configuration intentionally leaves `monthlyPublishQuota` null until product policy chooses a monthly number.

## 7. Subscription boundaries

Universal:
- listing readiness for one listing
- target Net Proceeds calculation
- individual/manual publishing
- manual sale and fulfillment tracking
- basic item-linked realized profit
- manual buyer communication

Serious:
- automatic eBay order sync
- eBay shipping-fulfillment writes
- automatic Money Sync
- quick-sale/high-ask scenario comparison
- offer floor guardrails
- bulk listing/revision
- automated repricing/offers
- cross-marketplace synchronization/automatic delisting
- aggregate seller analytics and Schedule C export

All marketplace writes, eBay tokens, buyer-sensitive fields, marketplace event ingestion, quota decisions, and automation entitlement decisions stay inside Appwrite Functions.

## 8. Rollout order

1. Create/verify the item columns above.
2. Create `seller_orders`.
3. Create `ebay_shipment_operations` with the server-only permissions above.
4. Create `seller_quotas` and run `initialize-quota-state.mjs`.
5. Add `marketplace_events` before enabling webhook/order persistence.
6. Deploy the subscription police and eBay Functions with the required table IDs and quota secret.
7. Add `EXPO_PUBLIC_APPWRITE_SELLER_ORDERS_TABLE_ID` to the mobile build.
8. Test Hobbyist manual sale -> manual ship -> Books result.
9. Test Serious eBay order sync -> ship -> Money Sync -> realized-margin result.
10. Only after listing state is reliable, enable automatic cross-channel reservation/delisting.
