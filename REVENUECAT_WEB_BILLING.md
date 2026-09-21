# KeepFlip web payments: RevenueCat Billing with Stripe

KeepFlip's web checkout uses **RevenueCat Web Billing**, with **Stripe connected
inside RevenueCat as the payment gateway**. This keeps Android, iOS, and web
subscriptions on the same RevenueCat customer and entitlement model.

The browser never receives a Stripe secret key and never authorizes KeepFlip
features from a client-side payment response. The access path remains:

```text
Stripe payment through RevenueCat Web Billing
  -> signed RevenueCat webhook
  -> KeepFlip Subscription Police
  -> user_subscription row
  -> authenticated /status check
  -> KeepFlip workspace access
```

The older `components/stripe/stripe-checkout.web.tsx` experiment is not wired
to any KeepFlip route. Do not connect it to the paywall: a raw Stripe payment
intent alone would not create the RevenueCat subscription, recurring billing
state, webhook entitlement, or server-authorized access that KeepFlip needs.

## What the app expects

The web checkout loads the existing `keepflip_default` RevenueCat offering and
chooses a plan from these **custom package identifiers**. Package IDs and Web
Billing product IDs are separate fields in RevenueCat.

| Plan | Billing | RevenueCat package ID | Current KeepFlip price |
| --- | --- | --- | --- |
| Part-Time Hobbyist | Monthly | `hobbyist-monthly` | $10/month |
| Part-Time Hobbyist | Annual | `hobbyist-annual` | $100/year |
| Serious Reseller | Monthly | `serious-monthly` | $25/month |
| Serious Reseller | Annual | `serious-annual` | $250/year |

The client normalizes punctuation when it selects a package, so either a dash
or underscore package ID works for the same plan and cadence. For example,
`serious-annual` and `serious_annual` are treated as the same Serious annual
package. It does not weaken plan matching: `serious_monthly` still cannot be
selected as an annual plan.

Web Billing product IDs are free to use the names created in the dashboard.
Your `serious_monthly` and `serious_annual` products are valid; assign them to
the Serious monthly and annual package slots respectively. The client reads
the product ID and live price from RevenueCat but uses the package slot to make
the plan selection. Entitlement mapping remains the server-side access
contract.

Map the Web Billing products to the existing entitlements:

| Plan | RevenueCat entitlement |
| --- | --- |
| Part-Time Hobbyist | `keepflip_hobbyist` |
| Serious Reseller | `keepflip_serious` |

Do not create a second entitlement just for web. A seller who signs in with the
same KeepFlip/Appwrite user ID must receive the same entitlement on Android and
web.

## One-time dashboard setup

1. In RevenueCat, create or select the KeepFlip project and add a **Web
   Billing** app. This is the RevenueCat Billing route, not a standalone custom
   Stripe Elements integration.

2. Connect the Stripe account from the RevenueCat dashboard's Web Billing or
   payment-gateway setup. If RevenueCat asks for Stripe credentials, enter them
   only in that authenticated dashboard. Do not put either Stripe key in the
   KeepFlip repository, an Expo public environment variable, or chat.

3. Create the four Web Billing subscription products at the prices above. Use
   the actual product IDs you created (for example, `serious_monthly` and
   `serious_annual`), then assign each one to the matching custom package in
   `keepflip_default`, alongside the existing native package mappings. Set that
   offering as the current Web Billing offering if the dashboard requires it.

4. Attach `keepflip_hobbyist` to both Hobbyist web products and
   `keepflip_serious` to both Serious web products.

5. Copy the **public Web Billing SDK key** from the Web Billing app in
   RevenueCat. It is a RevenueCat public key, not a Stripe publishable key.
   Add it locally as:

   ```text
   EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=<RevenueCat public Web Billing SDK key>
   ```

   Put it in the local web environment used for development and production.
   Expo exposes `EXPO_PUBLIC_*` values to the browser by design, so use only the
   public RevenueCat key here. Restart the web dev server or re-export the site
   after adding it.

6. In RevenueCat **Integrations -> Webhooks**, point the webhook at the deployed
   Appwrite Subscription Police function:

   ```text
   https://<your-appwrite-function-domain>/webhook/revenuecat
   ```

   Configure its Authorization header to exactly match the Appwrite Function's
   `REVENUECAT_WEBHOOK_AUTHORIZATION` variable. Enable HMAC signing and place
   RevenueCat's signing secret in the Function's
   `REVENUECAT_WEBHOOK_HMAC_SECRET` variable.

7. For quick post-purchase status confirmation, add a RevenueCat **secret API
   key** (not a Stripe secret key) to the Appwrite Function as
   `REVENUECAT_API_KEY`. This server-only key lets `/status` reconcile a
   customer immediately. The signed webhook remains mandatory and is the
   durable entitlement update.

8. Confirm the Appwrite function has the necessary row read/write scopes and
   is deployed. Its `/health` response reports whether RevenueCat
   reconciliation and HMAC verification are configured, without returning the
   sensitive values.

## Runtime behavior

- Web checkout is only available after the seller signs in. The Appwrite user
  ID is passed to RevenueCat as the app user ID, so a web purchase belongs to
  the same KeepFlip customer as a native purchase.
- A successful browser checkout is intentionally not enough to unlock the app.
  The UI refreshes the server status for a short bounded period and waits for
  the RevenueCat webhook or server reconciliation to update `user_subscription`.
- Plan switching is intentionally directed to the RevenueCat/store management
  page for active subscribers. This prevents a second web subscription from
  being created accidentally while an existing plan is active.
- The app passes KeepFlip's `/terms` URL to Web Billing checkout. Maintain the
  deployed Terms and Privacy pages before production launch.

## Test before enabling live payments

Use a fresh test KeepFlip account and Stripe/RevenueCat test mode first.

1. Open the web subscription screen and verify all four packages and prices
   load from RevenueCat.
2. Complete a test purchase and confirm RevenueCat shows the Appwrite user ID
   as the customer/App User ID.
3. Confirm the RevenueCat webhook succeeds and `user_subscription` receives
   the correct plan, entitlement, product, renewal state, and period end.
4. Confirm the web app opens only after its authenticated `/status` response
   sees that durable row.
5. Sign into Android using the same KeepFlip account and verify the same
   entitlement is honored there; repeat in the reverse direction with an
   Android test subscription.
6. Use the management link to test cancellation, then verify access continues
   to the paid-through date. Test expiration, a billing issue/grace period, and
   refund/revocation separately.
7. Send RevenueCat's test webhook and confirm the Subscription Police returns
   HTTP 200 before enabling production checkout.

Do not enable or advertise live web checkout until the whole chain above has
been verified with a real test transaction and the deployed function.
