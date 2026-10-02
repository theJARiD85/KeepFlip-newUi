# KeepFlip Sale Watcher (Chrome MV3)

This local extension watches only an expanded message in an open Gmail tab. It recognizes sale wording from Depop, Poshmark, and Mercari, then extracts a visible listing title, an explicitly labeled SKU, and a labeled sale amount. It stores those extracted fields in `chrome.storage.local`; it never stores or sends the email body.

## Install for local use

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this folder.
3. Open the extension popup and enter the deployed KeepFlip seller operations and eBay OAuth Function IDs under **Appwrite function settings**.
4. Sign in with the KeepFlip account that owns the inventory. The Appwrite session secret stays in `chrome.storage.session` and is cleared when the browser session ends or you sign out.
5. Open a marketplace sale email in Gmail. Open the extension popup, find the detected sale, choose **Find inventory match**, review the exact SKU or exact title match, enter/confirm the sale price, and select **Confirm and record sale**.

The extension does not request the Gmail API or a Gmail OAuth scope. It cannot scan mail while Gmail is closed or while a message body is not open. Gmail's DOM is not a stable API, so marketplace template changes can stop detection. Sender address/domain and sale wording are filters, not cryptographic proof that a message is authentic; review the sale before recording it.

## Appwrite setup

- Deploy the updated `backend/functions/keepflip-seller-operations` Function and allow authenticated users to execute it. The new routes are `/email-sale/match` and `/email-sale/record`.
- Configure the eBay OAuth Function ID in the popup and deploy the updated `backend/functions/ebay-oauth-backend` Function with its existing eBay and Appwrite credentials. It adds `/listing/withdraw` and uses the user's existing eBay connection; no eBay secret is put in the extension.
- Email sale recording follows the existing Serious subscription gate for automation. Matching is owner-scoped and prefers a unique exact SKU; without an SKU it uses an exact normalized title. Ambiguous matches require an explicit inventory choice. Repeated delivery uses an idempotency key.

## Delisting boundary

After the user confirms a sale, KeepFlip records a seller order and reduces on-hand inventory. If no units remain and the item has a linked eBay offer, the extension asks the eBay Function to withdraw that offer. eBay documents the Inventory API withdraw-offer operation as ending the active listing while retaining the offer for later reuse.

This does not automatically remove copies on Depop, Poshmark, or Mercari. The app currently has no server adapters for those marketplaces, so the popup keeps a follow-up item telling the seller to check remaining marketplace copies. For multi-unit inventory, it also leaves eBay quantity synchronization for follow-up instead of ending a still-stocked listing.

Appwrite Function executions consume Appwrite service quota. The extension avoids a scheduled inbox poll and makes no Gmail API requests, but the backend call is not literally server-free.
