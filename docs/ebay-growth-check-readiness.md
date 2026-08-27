# eBay Application Growth Check Readiness

Last reviewed: August 24, 2026

This document tracks KeepFlip's readiness for an eBay Developers Program Application Growth Check, including a request for access to restricted APIs such as Marketplace Insights.

## Current recommendation

**Do not submit yet.** The major app-side compliance work is now in place, but credential rotation, the live deletion test, Developer Account Support, and the final API-volume worksheet remain hard pre-submit gates.

## Application purpose

KeepFlip is a mobile resale decision-support application that helps individual resellers identify physical items, research current marketplace supply and historical sales evidence, estimate resale value, and evaluate potential profitability.

KeepFlip does not sell eBay data, provide users with eBay API credentials, expose bulk eBay data downloads, or give users programmatic control over eBay APIs.

### Restricted API request narrative

KeepFlip would like access to Marketplace Insights to improve item-specific comparable-sales research and pricing guidance for the user performing the research. Marketplace Insights data would be used only inside KeepFlip and only for user-facing resale research and decision support. KeepFlip will not expose the restricted API itself, sell the underlying restricted data, or permit bulk extraction.

Because Marketplace Insights data may support pricing tools, KeepFlip should explicitly request eBay's written approval for that use as part of the Growth Check rather than assuming that access alone authorizes every derived pricing feature.

## Readiness matrix

| Requirement | Status | Evidence / action |
| --- | --- | --- |
| Working application eBay can test | PASS | KeepFlip has production application routes, eBay connection UI, Market Research, inventory, and analysis flows. |
| Uses eBay-controlled authentication | PASS | eBay connection uses OAuth authorization-code flow. |
| Does not collect eBay passwords | PASS | KeepFlip opens eBay authorization and stores OAuth credentials rather than passwords. |
| OAuth state / CSRF protection | PASS | Client and backend validate random/one-time state and environment. |
| Protects stored OAuth credentials | PASS IN CODE | eBay OAuth tokens are encrypted before storage. |
| OAuth least privilege | PASS IN CODE | Production/sandbox consent URLs now request only base API scope + `commerce.identity.readonly`. The OAuth backend enforces the same set at runtime even if the deployed environment variable is stale. |
| Previously committed provider/crypto secrets rotated | BLOCKER | A server-side env example previously contained real secrets. The current branch is sanitized, but the affected eBay client secrets and KeepFlip OAuth encryption/state/HMAC keys must be rotated before submission. |
| User agreement covers eBay content sublicense | PASS | Terms updated August 24, 2026 with eBay API sublicense, revocability, and third-party-beneficiary language. |
| Privacy policy identifies eBay data handling | PASS | Privacy Policy updated August 24, 2026 with eBay identity, encrypted token, data-use, disconnect, and deletion language. |
| Marketplace account-deletion subscription | NEEDS LIVE VERIFICATION | Endpoint implementation exists; confirm the production Developer Portal subscription is active and a test notification succeeds. |
| Challenge-code verification | PASS IN CODE | Endpoint computes SHA-256 over challenge code + verification token + exact endpoint URL. |
| Notification signature verification | PASS IN CODE | Endpoint verifies `x-ebay-signature` using eBay's public key and caches the key for one hour. |
| Deletes stored eBay connection data | PASS IN CODE | Valid deletion notice maps immutable eBay user ID to KeepFlip's keyed hash and deletes matching connection rows. |
| Immediate webhook acknowledgement | REVIEW | Current serverless endpoint verifies and deletes before returning success. Do not change to acknowledge-before-processing unless deletion is first durably queued; otherwise the runtime could acknowledge work that is later lost. Validate response time with eBay's live test. |
| Maximum two retries for infrastructure errors | PARTIAL PASS | `ebay-sold-comps-v2` and `ebay-account-deletion` now cap official eBay infrastructure retries at two and do not retry ordinary 4xx failures. OAuth SDK token transport still needs final audit. |
| Reuses application OAuth token | PASS | `ebay-sold-comps-v2` caches successful eBay client-credentials tokens in warm Function memory until shortly before expiry rather than requesting a token for every market lookup. |
| Useful API error messages | PARTIAL | User-facing errors exist. Continue auditing backend logs/returned messages for actionable detail without leaking credentials. |
| Requests only required data | PASS FOR CURRENT USER TOKEN | Connected-account user token is currently used only for Identity `getUser`; unrelated Sell/Buy/Message scopes were removed. Browse market search remains application-token based. |
| Handles page-size changes | PASS FOR CURRENT BROWSE USE | Active-market snapshot uses a bounded sample and the API-returned `total`; it does not infer total inventory from page length. Re-review if pagination is added. |
| Uses current APIs | PASS FOR CURRENT IMPLEMENTATION | Current official calls are OAuth token service, Commerce Identity `getUser`, Browse `item_summary/search`, and Notification `getPublicKey`. |
| Search uses Buy API | PASS | Current official active-market search uses eBay Browse API. |
| Avoids prohibited derived success/activity rates | PASS FOR CURRENT MARKET RESEARCH UI | UI no longer calculates or labels sold/active as a sell-through percentage. Raw sold-observation and active-listing counts are displayed separately. |
| Avoids unauthorized category-wide ASP / GMV | PASS FOR CURRENT COPY | Query-level sold samples are labeled as observations/sample statistics rather than eBay category-wide ASP or GMV. |
| eBay content visually isolated from third-party content | REVIEW / UI | Review Market Research and scanner result screens so official eBay API content is clearly identified and visually separated from SerpApi/other-market evidence. |
| eBay content freshness | REVIEW | Do not persist stale active-listing snapshots for public display; current market search is live-request oriented. |
| No eBay content used to train AI | REVIEW / ARCHITECTURE | Ensure eBay API content is not sent into model-training pipelines. Runtime inference/normalization should be reviewed against the current API License Agreement before submission. |
| Developer account support activated | PORTAL CHECK | eBay requires the appropriate developer-account support setup before Growth Check submission. |
| Estimated peak hourly/daily API volumes prepared | TODO | Required by the Growth Check form for each API operation. |
| Sandbox and production credentials separated | PASS | KeepFlip has separate sandbox/production keysets, URLs, and callback configuration. |

## High-priority work before submission

1. **Rotate exposed secrets.** Rotate both affected eBay client secrets plus KeepFlip's OAuth token-encryption key, OAuth-state secret, and eBay-user-ID HMAC key. Update Appwrite Function variables and reconnect test accounts afterward. Because changing the encryption/HMAC keys invalidates existing encrypted token/hash records, clear/recreate the affected eBay connection test records as part of the rotation.
2. **Run the production deletion test from eBay Developer Portal.** Confirm GET challenge verification, POST test notification acknowledgement, signature verification, and actual deletion of a seeded test connection record. Record response time.
3. **Finish OAuth transport retry audit.** `ebay-sold-comps-v2` and deletion notification eBay calls are bounded to two retries; verify whether `ebay-oauth-nodejs-client` already complies for authorization-code/refresh token traffic or replace/wrap that transport.
4. **Review eBay content isolation.** Official eBay Browse/Marketplace Insights data should be visibly identified and not blended into third-party marketplace rows without separation.
5. **Confirm restricted pricing-tool permission in the application.** Marketplace Insights is a Restricted API and KeepFlip should explicitly request written approval for its item-specific pricing/research use.
6. **Prepare peak call estimates.** Use the operation model below and a realistic launch traffic envelope rather than requesting unnecessarily high limits.

## Current official eBay API inventory

| API / operation | KeepFlip feature | Auth | Calls per triggering action | Notes |
| --- | --- | --- | ---: | --- |
| OAuth token service — authorization code exchange | Connect/reconnect eBay account | User OAuth | 1 | Triggered only by a completed eBay consent flow. |
| Commerce Identity `getUser` | Bind connected eBay identity to KeepFlip | User OAuth | 1 | Called after successful authorization-code exchange. Requires `commerce.identity.readonly`. |
| OAuth token service — refresh token | Refresh connected account token | User OAuth | 0 or 1 | Only when KeepFlip explicitly refreshes an expired/expiring access token. |
| OAuth token service — client credentials | Active-market research | Application OAuth | Amortized | `ebay-sold-comps-v2` caches the application token in warm Function memory until shortly before expiry. |
| Browse `item_summary/search` | Active market snapshot / competitor context | Application token | 1 | Uses a bounded active-listing sample plus eBay's returned `total`. |
| Notification `getPublicKey` | Verify account-deletion signature | Application token | Amortized/event-driven | Public key is cached for one hour. |
| Marketplace Insights search | Requested historical sold-market evidence | Restricted access requested | 0 today | Do not call until eBay grants access/approval. Expected design is one bounded historical query per user research action where needed. |

### Not current production API usage

Messaging, Inventory, Fulfillment, Marketing, Finances, Disputes, Stores, Reputation, VERO, Shipping, Feedback, and other previously requested user scopes are **not current connected-user API usage** and are therefore not included in the consent grant. Add a scope only when the corresponding feature and API operation are actually implemented.

## Market Research presentation rules for Growth Check

Until eBay grants any additional written permission:

- Display raw active-listing counts rather than a derived eBay sell-through percentage.
- Call SerpApi-derived sold results "sold observations" or "sold-comp evidence," not official eBay transaction history.
- Do not present query-level calculations as eBay category-wide average selling price, GMV, conversion rate, or marketplace success rate.
- Clearly label official eBay API information separately from independent research evidence.
- Do not claim that an asking price is the amount actually paid by a buyer.
- Keep any price recommendation based on non-eBay evidence separate from official eBay active-listing context unless eBay expressly approves the restricted-data pricing use.

## Call-volume worksheet

For the Growth Check form, calculate peak volume from user actions rather than multiplying every feature by total installs.

| API / operation | Volume driver | Peak/hour | Peak/day |
| --- | --- | ---: | ---: |
| Authorization-code token exchange | New eBay connections + reconnects | TBD | TBD |
| Identity `getUser` | Same as successful eBay connections | TBD | TBD |
| Refresh-token exchange | Connected users whose access token needs refresh during eBay-account activity | TBD | TBD |
| Client-credentials token | Function cold starts + app-token expiry, not research count | TBD | TBD |
| Browse search | Scanner sold-comp followups + manual Market Research searches that request active context | TBD | TBD |
| Notification `getPublicKey` | Deletion notifications with uncached key IDs | Event-driven | Event-driven |
| Marketplace Insights (requested) | Eligible scanner/manual historical-market searches after approval | TBD | TBD |

Do not list unused API scopes as traffic. For each estimate, keep the assumptions used to derive it so the numbers can be explained during review.

## Suggested Growth Check description

> KeepFlip is a mobile resale decision-support application for individual resellers and thrift/bargain sourcing workflows. Users can identify an item, research market evidence, maintain inventory, and optionally connect their own eBay account through eBay OAuth for eBay-specific features. KeepFlip uses official eBay APIs for authenticated account identity and current eBay marketplace information. We are requesting Marketplace Insights access so item-specific historical sales evidence can be shown to the user performing the research. KeepFlip does not expose eBay APIs, distribute eBay API credentials, sell or bulk-export eBay data, or permit users to programmatically access eBay APIs. Restricted data would remain within KeepFlip's user-facing research workflow and would be handled in accordance with eBay's API License Agreement and any written restrictions provided as part of approval.

## Final pre-submit test

A Growth Check candidate build should pass all of the following in production configuration:

- Rotate the previously exposed provider/crypto secrets and update Appwrite Function variables.
- Sign into KeepFlip.
- Connect an eBay production account through eBay's consent screen and confirm only the intended permissions are requested.
- Confirm connection status without exposing tokens or secrets in logs/UI.
- Exercise every eBay-backed feature included in the Growth Check application.
- Simulate eBay 400/401/403/429/5xx and network failures and verify the app fails gracefully.
- Verify infrastructure retries never exceed two retries.
- Disconnect eBay and verify connection credentials are removed/revoked as designed.
- Send the Developer Portal marketplace account-deletion test notification and verify the endpoint handles it correctly.
- Confirm Market Research does not derive prohibited eBay marketplace success/activity statistics before written approval.
- Confirm official eBay content is clearly identified and current enough for display.
- Confirm Developer Account Support is active and the peak hourly/daily call worksheet is complete.

When every item above is PASS or explicitly covered by written eBay approval, submit the Growth Check.
