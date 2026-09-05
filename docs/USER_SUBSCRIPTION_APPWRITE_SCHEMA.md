# KeepFlip user_subscription Appwrite schema

The mobile app treats `user_subscription` as a **read-only server mirror** of RevenueCat. The mobile client must never be allowed to write authoritative subscription status.

## Table

- Database: KeepFlip's existing database (normally `keepflip`)
- Table ID: `user_subscription`
- Row ID: the Appwrite user ID whenever possible
- Client permissions: signed-in owner may **read only**
- Server/Appwrite Function: may create and update rows

## Columns

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `ownerId` | string(64) | yes | Appwrite user ID. Add a unique index. |
| `provider` | string(32) | yes | Use `revenuecat`. |
| `revenueCatCustomerId` | string(255) | yes | KeepFlip uses the Appwrite user ID as RevenueCat App User ID. |
| `plan` | enum/string | no | `hobbyist` or `serious`. |
| `entitlement` | string(64) | no | `keepflip_hobbyist` or `keepflip_serious`. |
| `status` | enum/string | yes | `trialing`, `active`, `grace_period`, `billing_issue`, `cancelled`, `expired`, `revoked`, `unknown`. |
| `isTrial` | boolean | yes | True only while RevenueCat reports the active period as a trial. |
| `startedAt` | datetime | no | First subscription/trial start. |
| `trialEndsAt` | datetime | no | First/most recent trial expiration. Keep this value after the trial converts or expires so the app can recognize that the store account has already used its trial. |
| `currentPeriodEndsAt` | datetime | no | Current entitlement expiration/renewal boundary. |
| `willRenew` | boolean | yes | RevenueCat/store renewal state. |
| `productId` | string(128) | no | Store product that unlocked the entitlement. |
| `store` | string(32) | no | For example `PLAY_STORE` or `APP_STORE`. |
| `lastEventId` | string(255) | no | Last RevenueCat webhook event applied. Use for idempotency. |
| `updatedAt` | datetime | yes | Server update timestamp. |
| `isSandbox` | boolean | yes | RevenueCat sandbox/test state. |

## Indexes

1. Unique index on `ownerId`.
2. Optional index on `status` for admin/support queries.
3. Optional index on `currentPeriodEndsAt` for subscription maintenance jobs.

## RevenueCat identifiers expected by the app

Offering:

```text
keepflip_default
```

Entitlements:

```text
keepflip_hobbyist
keepflip_serious
```

Packages:

```text
hobbyist_monthly
hobbyist_annual
serious_monthly
serious_annual
```

The prices themselves come from Google Play / App Store through RevenueCat. The values shown in code are only display fallbacks while store products are unavailable.

## Trial rule

Configure the 7-day free trial in the store subscription offer/base plan and RevenueCat. Do not generate trial dates in the mobile client. The Subscription Police Function should write `isTrial: true` and the trial expiration on the trial-start event, then set `isTrial: false` on paid renewal while preserving `trialEndsAt`. RevenueCat/store receipts remain the billing authority.

## Security

The app reads this table only as a secondary server mirror. Subscription writes should come from a RevenueCat webhook Appwrite Function after validating the webhook authorization header. The webhook should be idempotent using `lastEventId` and must never trust a plan/status value sent by the mobile app.
