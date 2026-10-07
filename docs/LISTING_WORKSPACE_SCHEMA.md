# Listing workspace columns

Create these optional columns in the existing Appwrite TablesDB tables, then wait for each column to show **Available** before testing Listing.

## `user_profiles.marketplaceSelections`

- Type: Enum
- Array: Yes
- Required: No
- Values (exact spelling): `ebay`, `poshmark`, `mercari`, `depop`, `facebookMarketplace`, `offerUp`

Flip saves this choice during the onboarding questionnaire. Sellers can edit it in Listing. The choices preselect the native in-app marketplace listing run; eBay remains available through its connected API flow.

## `items.listingJson`

- Type: large text / longtext string
- Required: No
- Large enough to hold up to 500,000 characters of serialized listing data

KeepFlip saves the generated listing, seller edits, readiness notes, and seller-confirmed marketplace status here as a JSON string. The item is moved to **Listed** when eBay publishing succeeds or the seller confirms a live marketplace post. A filled form or submit-button click alone does not mark the item listed.

These are owner-owned rows. Keep the existing row permissions and `ownerId` boundary on `items`; no marketplace credentials belong in either column.

For an Appwrite Sites web build, also set `EXPO_PUBLIC_ENABLE_CROSSLISTING_LAB=true` in the Site's build environment. The native EAS development, preview, and production profiles already enable the Listing route and assisted autofill. Browser marketplaces run in the native app; web offers eBay publishing without a clipboard handoff.
