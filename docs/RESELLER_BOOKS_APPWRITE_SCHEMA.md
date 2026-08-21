# KeepFlip Books Appwrite schema

`reseller_ledger_entries` is a private, cash-basis reseller ledger. Each row
represents one actual money event. It deliberately does **not** treat AI market
estimates, desired prices, or marketplace asking prices as recorded income.

The table declaration lives in `appwrite.config.json` with the stable ID
`reseller_ledger_entries`.

## Setup

1. Apply the updated `appwrite.config.json` through the project’s normal
   Appwrite configuration deployment flow, or create an equivalent table in
   the Appwrite Console.
2. Confirm that every column and index for `reseller_ledger_entries` reports
   **Available**.
3. Add its public table ID to the local `.env` file:

   ```text
   EXPO_PUBLIC_APPWRITE_LEDGER_ENTRIES_TABLE_ID=reseller_ledger_entries
   ```

4. Restart Expo so the app receives the new public resource ID.

The table grants authenticated users table-level **create** access only.
Every app-created row receives read, update, and delete permissions for its
own KeepFlip user ID. Do not add `read("any")` or other broad read permissions
to financial entries.

## Money model

| Field | Required | Purpose |
| --- | --- | --- |
| `ownerId` | yes | Private-row owner and reporting scope |
| `entryType` | yes | The kind of real money event |
| `direction` | yes | `income` or `expense`; derived by the app from `entryType` |
| `amountCents` | yes | Positive integer money amount; the app never stores money as a float |
| `currency` | yes | Currently USD in the mobile Books interface |
| `occurredAt` | yes | The actual business date, not the date it was entered |
| `itemId` | no | Optional inventory-item link for item-level profit |
| `channel` | no | eBay, local sale, thrift store, shipping provider, and similar context |
| `notes` | no | User-entered business context, such as an order or lot note |
| `source` | yes | `manual` today; reserved values support a future eBay import or migration |
| `saleGroupId` / `externalId` | no | Reserved for future marketplace-import idempotency and multi-line sale grouping |
| `receiptFileId` | no | Reserved for a future private receipt vault; no receipt bucket is enabled yet |
| `createdAt`, `updatedAt`, `voidedAt` | mixed | Audit dates; `voidedAt` is reserved for a correction flow instead of silent deletion |

The screen records one manual money event at a time. This makes a sale,
marketplace fee, refund, shipping label, inventory purchase, repair cost,
supplies, software, advertising, storage, mileage, or other business amount
explicit instead of hiding it inside a guessed “profit” number.

## Reports in the first release

- **Current-month cash movement:** recorded USD income minus recorded USD
  expenses in the current calendar month.
- **Inventory basis:** recorded inventory purchases for unsold, linked items;
  it falls back to the existing `items.acquisitionCostCents` value only when
  there is no Books purchase entry for that item.
- **Realized item profit:** current-month linked sale proceeds minus linked
  purchase and expense entries. An unlinked sale is intentionally excluded
  from the item-level calculation rather than being guessed.
- **CSV export:** a complete ledger export with dates, directions, entry types,
  amounts, item links, channels, source labels, notes, and stable entry IDs.

The output is a business-record export, not a tax return, a deduction claim,
or a filing recommendation.

## Existing inventory cost: do not backfill blindly

Some existing items may have `items.acquisitionCostCents` but no reliable
purchase date, source, receipt, or item-level allocation. Do not automatically
create historical Books rows from those values. KeepFlip only uses the legacy
value as a display/reporting fallback until the seller records or confirms an
actual money event.

## eBay is a later import phase

The current eBay connection authenticates the account only. It does not yet
import orders, payouts, fees, refunds, or shipping-label charges. A future
Finances API import should write immutable source-labelled entries, use an
eBay transaction ID plus transaction type as an idempotency key, and keep
payouts separate from their underlying sale and fee lines. Do not turn on a
“Sync books” control until the required seller-finance OAuth scope, backend
token storage, import function, and reconciliation UI are all in place.
