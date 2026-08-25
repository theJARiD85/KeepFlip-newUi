# eBay Application Growth Check Readiness

Last reviewed: August 24, 2026

This document tracks KeepFlip's readiness for an eBay Developers Program Application Growth Check, including a request for access to restricted APIs such as Marketplace Insights.

## Current recommendation

**Do not submit yet.** KeepFlip is close, but the remaining items below should be closed first so the application can be tested cleanly and the requested restricted-API use case can be described accurately.

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
| Uses eBay-controlled authentication | PASS | eBay connection uses OAuth authorization flow. |
| Does not collect eBay passwords | PASS | KeepFlip opens eBay authorization and stores OAuth credentials rather than passwords. |
| OAuth state / CSRF protection | PASS | Client and backend validate signed/random state and environment. |
| Protects stored OAuth credentials | PASS | eBay OAuth tokens are encrypted before storage. |
| User agreement covers eBay content sublicense | PASS | Terms updated August 24, 2026 with eBay API sublicense, revocability, and third-party-beneficiary language. |
| Privacy policy identifies eBay data handling | PASS | Privacy Policy updated August 24, 2026 with eBay identity, encrypted token, data-use, disconnect, and deletion language. |
| Marketplace account-deletion subscription | NEEDS LIVE VERIFICATION | Endpoint implementation exists; confirm the production Developer Portal subscription is active and a test notification succeeds. |
| Challenge-code verification | PASS IN CODE | Endpoint computes SHA-256 over challenge code + verification token + exact endpoint URL. |
| Notification signature verification | PASS IN CODE | Endpoint verifies x-ebay-signature using eBay's public key and caches the key for one hour. |
| Deletes stored eBay connection data | PASS IN CODE | Valid deletion notice maps the immutable eBay user ID to the keyed hash used by KeepFlip and deletes matching connection rows. |
| Immediate webhook acknowledgement | REVIEW | Current endpoint verifies and deletes before returning success. eBay guidance says callbacks should acknowledge promptly; evaluate whether queuing/202 acknowledgement is needed for production resilience. |
| Maximum two retries for infrastructure errors | REVIEW / FIX | Audit every outbound eBay API call. Add a shared retry policy capped at two retries for retryable infrastructure failures only. |
| Useful API error messages | PARTIAL | User-facing errors exist. Audit backend logs and returned messages for actionable detail without leaking credentials. |
| Requests only required data | REVIEW | Confirm Browse, OAuth, messaging, and other calls request only fields/pages needed for each KeepFlip feature. |
| Handles page-size changes | REVIEW | Any paginated eBay API consumer must not assume a fixed page length. Active snapshot calls that only require total + a bounded sample should document that behavior. |
| Uses current APIs | REVIEW | Record the exact API name/version/endpoint used by every eBay-backed feature before submission. |
| Search uses Buy API | PASS | Current active-market search uses eBay Browse API. |
| Avoids prohibited derived success/activity rates | PASS FOR CURRENT MARKET RESEARCH UI | The UI no longer calculates or labels sold/active as a sell-through percentage. Raw sold-observation and active-listing counts are displayed separately. |
| Avoids unauthorized category-wide ASP / GMV | REVIEW | Do not describe query-level sold samples as eBay category-wide average selling price or GMV. |
| eBay content visually isolated from third-party content | REVIEW / UI | Review Market Research and scanner result screens so official eBay API content is clearly identified and visually separated from SerpApi/other-market evidence. |
| eBay content freshness | REVIEW / FIX IF NEEDED | Publicly displayed eBay listing content must satisfy current eBay freshness requirements. Do not persist stale active-listing snapshots for display. |
| No eBay content used to train AI | REVIEW / ARCHITECTURE | Ensure eBay API content is not sent into model-training pipelines. Runtime inference/normalization should be reviewed against the current API License Agreement before submission. |
| Developer account support activated | PORTAL CHECK | eBay requires at least one support contact to have developer account support activated before Growth Check submission. |
| Estimated peak hourly/daily API volumes prepared | TODO | Required by the Growth Check form for each API call. |
| Sandbox and production credentials separated | PASS | KeepFlip has separate sandbox/production configuration paths. |

## High-priority work before submission

1. **Run the production deletion test from eBay Developer Portal.** Confirm GET challenge verification, POST test notification acknowledgement, signature verification, and actual deletion of a seeded test connection record.
2. **Add/verify the two-retry infrastructure policy.** eBay's Growth Check guidance calls for no more than two retries for infrastructure errors. Do not retry authorization, validation, or other permanent client errors.
3. **Audit eBay API calls and versions.** Produce a final table of API, operation, purpose, authentication type, fields/page size, and estimated call volume.
4. **Review eBay content isolation.** Official eBay Browse/Marketplace Insights data should be visibly identified and not blended into third-party marketplace rows without separation.
5. **Confirm restricted pricing-tool permission in the application.** Marketplace Insights is a Restricted API and the current eBay API License Agreement requires express prior written consent for restricted-data pricing tools.
6. **Prepare peak call estimates.** Use a realistic launch scenario rather than requesting unnecessarily high limits.

## Market Research presentation rules for Growth Check

Until eBay grants any additional written permission:

- Display raw active-listing counts rather than a derived eBay sell-through percentage.
- Call SerpApi-derived sold results "sold observations" or "sold-comp evidence," not official eBay transaction history.
- Do not present query-level calculations as eBay category-wide average selling price, GMV, conversion rate, or marketplace success rate.
- Clearly label official eBay API information separately from independent research evidence.
- Do not claim that an asking price is the amount actually paid by a buyer.
- Keep any price recommendation based on non-eBay evidence separate from official eBay active-listing context unless eBay expressly approves the restricted-data pricing use.

## Information to collect for the application form

For every eBay API operation KeepFlip uses, record:

| API / operation | KeepFlip feature | Auth | Calls per user action | Estimated peak/hour | Estimated peak/day |
| --- | --- | --- | ---: | ---: | ---: |
| Browse search | Active market snapshot / competitor context | Application token | TBD | TBD | TBD |
| OAuth token exchange / refresh | Connect eBay account | User OAuth | TBD | TBD | TBD |
| Identity operation(s) | Connected-account identity | User OAuth | TBD | TBD | TBD |
| Messaging operation(s) | Buyer/seller messages | User OAuth | TBD | TBD | TBD |
| Marketplace Insights search | Requested sold-history research | Restricted access requested | TBD | TBD | TBD |

Add any Inventory, Account, Fulfillment, Marketing, Notification, or other operations that are actually invoked by the production app. Do not list scopes alone as API usage; list the operations KeepFlip really calls.

## Suggested Growth Check description

> KeepFlip is a mobile resale decision-support application for individual resellers and thrift/bargain sourcing workflows. Users can identify an item, research market evidence, maintain inventory, and optionally connect their own eBay account through eBay OAuth for eBay-specific features. KeepFlip uses official eBay APIs for authenticated account features and current eBay marketplace information. We are requesting Marketplace Insights access so item-specific historical sales evidence can be shown to the user performing the research. KeepFlip does not expose eBay APIs, distribute eBay API credentials, sell or bulk-export eBay data, or permit users to programmatically access eBay APIs. Restricted data would remain within KeepFlip's user-facing research workflow and would be handled in accordance with eBay's API License Agreement and any written restrictions provided as part of approval.

## Final pre-submit test

A Growth Check candidate build should pass all of the following in production configuration:

- Sign into KeepFlip.
- Connect an eBay production account through eBay's consent screen.
- Confirm connection status without exposing tokens or secrets in logs/UI.
- Exercise each eBay-backed feature included in the Growth Check application.
- Simulate eBay API 400/401/403/429/5xx and network failures and verify the app fails gracefully.
- Verify infrastructure retries never exceed two retries.
- Disconnect eBay and verify connection credentials are revoked/removed as designed.
- Send the Developer Portal marketplace account-deletion test notification and verify the endpoint handles it correctly.
- Confirm Market Research does not derive prohibited eBay marketplace success/activity statistics before written approval.
- Confirm official eBay content is clearly identified and current enough for display.

When every item above is PASS or explicitly covered by written eBay approval, submit the Growth Check.