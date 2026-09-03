# KeepFlip Subscription Police

Appwrite Function that acts as KeepFlip's server-side subscription authority.

## What it does

- receives RevenueCat lifecycle webhooks;
- verifies the configured RevenueCat authorization header;
- optionally verifies RevenueCat HMAC signatures against the raw webhook body;
- mirrors the current subscription into `user_subscription`;
- keeps webhook handling idempotent with `lastEventId`;
- ignores stale out-of-order webhook events using the RevenueCat event timestamp;
- preserves access after cancellation until the paid/trial period actually ends;
- handles trials, renewals, cancellations, uncancellations, billing issues, grace periods, expiration, refunds, refund reversals, product changes, subscription extensions, pauses, and transfers;
- can optionally reconcile a customer against RevenueCat's subscriber API;
- exposes authenticated status and plan-policy endpoints to the KeepFlip app.

## Appwrite Function configuration

Create an Appwrite Function with:

```text
Function ID: keepflip_subscription_police
Runtime: Node.js
Production branch: master
Root directory: appwrite/functions/keepflip-subscription-police
Entrypoint: src/main.js
Build command: npm install
```

The root-directory setting is important because this function lives inside the KeepFlip app repository.

### Execute access

RevenueCat must be able to reach the function URL, so the function/domain endpoint must allow the webhook request through. KeepFlip's user-facing routes still require Appwrite to inject an authenticated `x-appwrite-user-id`.

Do not expose any privileged secret in the mobile app.

### Function scopes

The Appwrite dynamic function key must have permission to read and write rows used by `user_subscription`.

Enable the row/data scopes required by the current Appwrite Console for:

```text
rows.read
rows.write
```

If the console presents legacy database/document scope names instead, grant the equivalent database row read/write scopes.

## Required environment variables

```text
APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1
APPWRITE_DATABASE_ID=keepflip
APPWRITE_USER_SUBSCRIPTIONS_TABLE_ID=user_subscription

REVENUECAT_WEBHOOK_AUTHORIZATION=Bearer <random-long-webhook-secret>
```

`APPWRITE_FUNCTION_PROJECT_ID` and `x-appwrite-key` are supplied by Appwrite's function runtime.

### Recommended environment variables

```text
REVENUECAT_WEBHOOK_HMAC_SECRET=<RevenueCat webhook signing secret>
REVENUECAT_API_KEY=<RevenueCat API key allowed to GET /v1/subscribers/{app_user_id}>
REVENUECAT_ALLOW_SANDBOX=true
REVENUECAT_ALLOWED_APP_ID=<RevenueCat app id, optional>
REVENUECAT_HMAC_TOLERANCE_SECONDS=300
```

`REVENUECAT_API_KEY` is optional. When present, each webhook can reconcile the mirrored row against RevenueCat's current Customer Info, and authenticated clients can explicitly call `/reconcile`. Keep this key server-side only.

## RevenueCat webhook

In RevenueCat:

1. Open **Integrations → Webhooks**.
2. Add the Appwrite Function domain URL with:

```text
/webhook/revenuecat
```

3. Set the Authorization header to the exact same value as `REVENUECAT_WEBHOOK_AUTHORIZATION`.
4. Enable HMAC signing and copy its signing secret into `REVENUECAT_WEBHOOK_HMAC_SECRET`.
5. While testing Google Play subscriptions, allow Sandbox events.
6. Send the RevenueCat test webhook and verify the function returns HTTP 200.

RevenueCat retries non-2xx webhook deliveries, so the function deliberately returns failures for authentication/configuration/database errors that should be retried.

## Routes

### GET `/health`

Health/configuration summary. No subscription secrets are returned.

### POST `/webhook/revenuecat`

RevenueCat-only lifecycle webhook.

### POST `/status`

Authenticated Appwrite user. Returns the server subscription row plus calculated access.

Optional body:

```json
{
  "refresh": true
}
```

When `refresh` is true and `REVENUECAT_API_KEY` is configured, KeepFlip reconciles against RevenueCat before responding.

### POST `/reconcile`

Authenticated Appwrite user. Forces RevenueCat reconciliation. Requires `REVENUECAT_API_KEY`.

### POST `/access/check`

Authenticated Appwrite user. Checks the plan policy.

Examples:

```json
{
  "capability": "automated_books"
}
```

```json
{
  "capability": "ai_valuation",
  "usage": 99
}
```

Supported capability values:

```text
basic_books
automated_books
schedule_c_export
advanced_bookkeeping_analytics
multi_user
ai_valuation
active_listing
```

The usage value is supplied by the calling backend/service. This function defines the policy and limit; resource-owning backends must still count their own usage and call/enforce the policy before doing paid work.

## KeepFlip policy

```text
Hobbyist
- 50 active listings/month
- 100 AI valuation scans/month
- basic Books

Serious
- 250 active listings/month
- unlimited AI valuation scans
- automated Books
- Schedule C export

Power
- unlimited listings
- unlimited AI valuation scans
- automated Books
- Schedule C export
- advanced bookkeeping analytics
- multi-user access
```

## Security model

The mobile app is never trusted to set `plan`, `status`, `isTrial`, or billing dates.

The authoritative direction is:

```text
Google Play
   ↓
RevenueCat
   ↓
signed/authenticated webhook
   ↓
KeepFlip Subscription Police
   ↓
user_subscription
   ↓
KeepFlip backend access checks
```

Rows are upserted with user READ permission only. The function key performs writes.

## Before enabling subscription enforcement

Do not switch the app's `EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED` to `true` until:

- the function is deployed;
- RevenueCat test webhook succeeds;
- a Google Play test subscription activates the expected entitlement;
- `user_subscription` receives the correct row;
- cancellation retains access until period end;
- expiration removes access;
- restore purchases works;
- existing-user rollout/grandfathering is decided.
