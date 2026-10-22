# Listing workspace columns

Create these optional columns in the existing Appwrite TablesDB tables, then wait for each column to show **Available** before testing Listing.

## `user_profiles.marketplaceSelections`

- Type: Enum
- Array: Yes
- Required: No
- Values (exact spelling): `ebay`, `poshmark`, `mercari`, `depop`, `facebookMarketplace`, `offerUp`

Flip saves this choice during the onboarding questionnaire. Sellers can edit it in Listing. The choices preselect the desktop extension or native in-app marketplace listing run; eBay remains available through its connected API flow.

The existing KeepFlip table may also contain the older `offerup` value. Keep it for existing rows, and allow `offerUp` (the ID used by the current Listing UI) before sellers save OfferUp in their marketplace selections.

## `user_profiles` shipping defaults

Add two optional, single-value enum columns to the existing `user_profiles` table:

| Column | Values | Required | Meaning |
| --- | --- | --- | --- |
| `facebookShippingDefault` | `pickupOnly`, `buyerPays`, `sellerPays` | No | Usual Facebook Marketplace delivery and shipping payer. |
| `offerUpShippingDefault` | `pickupOnly`, `buyerPays`, `sellerPays` | No | Usual OfferUp delivery and shipping payer. |

Leave existing rows unset. Listing asks sellers who use either marketplace to save a default, and the listing run asks them to confirm or change that choice for each item. If their first choice is made in a run, it is saved as the default. A later item-specific override does not change the saved default. Keep the existing owner-only row permissions. Facebook's assisted form uses its choice for the delivery step; OfferUp shipping must still be set and checked in OfferUp.

## `items.listingJson`

- Type: large text / longtext string
- Required: No
- Large enough to hold up to 500,000 characters of serialized listing data

KeepFlip saves the generated listing, seller edits, readiness notes, and seller-confirmed marketplace status here as a JSON string. The item is moved to **Listed** when eBay publishing succeeds or the seller confirms a live marketplace post. A filled form or submit-button click alone does not mark the item listed.

These are owner-owned rows. Keep the existing row permissions and `ownerId` boundary on `items`; no marketplace credentials belong in either column.

The Listing route is included in web builds by default. Native builds continue to use `EXPO_PUBLIC_ENABLE_CROSSLISTING_LAB` and the assisted WebView autofill gate from their EAS profiles. The desktop web flow uses the KeepFlip Assistant Chrome extension. Marketplace posting remains contingent on the seller's signed-in marketplace tab and the form accepting the prepared fields and photos.
