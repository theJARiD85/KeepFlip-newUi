# KeepFlip subscriptions: RevenueCat + Appwrite setup

KeepFlip's mobile subscription client is wired for RevenueCat. Subscription enforcement intentionally remains disabled until the store products, trial offers, RevenueCat entitlements/packages, and server webhook mirror are verified.

## 1. Appwrite table

Table ID:

```text
user_subscription
```

Use one row per KeepFlip user and use the Appwrite user ID as the row ID.

Columns:

| Column | Type | Required | Default |
| --- | --- | --- | --- |
| ownerId | string(64) | yes | — |
| provider | string(32) | yes | — |
| revenueCatCustomerId | string(255) | yes | — |
| plan | string(32) | yes | — |
| entitlement | string(64) | yes | — |
| status | string(32) | yes | — |
| isTrial | boolean | yes | false |
| startedAt | datetime | no | null |
| trialEndsAt | datetime | no | null |
| currentPeriodEndsAt | datetime | no | null |
| willRenew | boolean | yes | false |
| productId | string(128) | no | null |
| store | string(32) | no | null |
| lastEventId | string(255) | no | null |
| updatedAt | datetime | yes | — |
| isSandbox | boolean | yes | false |

Allowed KeepFlip plans:

```text
hobbyist
serious
power
```

`power` remains reserved only for backward compatibility/future expansion and is not purchasable at launch.

Expected status values:

```text
trialing
active
grace_period
billing_issue
cancelled
expired
revoked
unknown
```

The mobile client should only receive READ permission on its own row. Creation and updates belong to the subscription webhook/backend function.

Recommended indexes:

- unique: ownerId
- key: revenueCatCustomerId
- key: status
- key: plan
- key: lastEventId

## 2. RevenueCat project

Create these launch entitlements exactly:

```text
keepflip_hobbyist
keepflip_serious
```

`keepflip_power` may remain reserved in RevenueCat for future use, but it should not be attached to the launch offering.

Create an offering:

```text
keepflip_default
```

Add these package identifiers to that offering:

```text
hobbyist_monthly
hobbyist_annual
serious_monthly
serious_annual
```

KeepFlip uses the authenticated Appwrite user ID as the RevenueCat App User ID.
These are RevenueCat package identifiers; the Google Play base-plan IDs may use
hyphens and are configured on the products attached to each package.

## 3. Store products

Configure the products/base plans in Google Play (and App Store when iOS launches) so the RevenueCat packages above resolve to real store subscription products.

Current KeepFlip pricing:

| Plan | Monthly | Annual |
| --- | ---: | ---: |
| Part-Time Hobbyist | $10 | $100 |
| Serious Reseller | $25 | $250 |

Configure the seven-day free trial as a store introductory offer for eligible new subscribers. KeepFlip does not manufacture a client-side trial timer.

## 4. Native app requirements

KeepFlip includes `react-native-purchases` and the Android `com.android.vending.BILLING` permission.

Real RevenueCat purchases require a rebuilt Expo development/production client after the native SDK is installed. Expo Go can preview subscription UI but cannot complete real store purchases.

## 5. Public mobile environment values

Development and production builds accept:

```text
EXPO_PUBLIC_APPWRITE_USER_SUBSCRIPTIONS_COLLECTION_ID=user_subscription
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=keepflip_default
EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED=false
```

Only RevenueCat public SDK keys belong in the app. Never place a RevenueCat secret API key in an `EXPO_PUBLIC_*` variable.

Leave subscription enforcement false until checkout and webhook synchronization have been tested.

## 6. Current app behavior

The app now:

- configures RevenueCat with the Appwrite user ID;
- loads current customer entitlements and localized store pricing;
- exposes Hobbyist and Serious Reseller launch plan cards;
- purchases monthly or annual billing for either launch plan;
- restores purchases;
- opens store subscription management;
- supports Android plan replacement behavior;
- listens for live RevenueCat customer-info changes;
- reads the server-side `user_subscription` mirror when available;
- exposes plan capability/limit helpers to the rest of the app;
- shows Plan & Billing on the Account screen;
- routes newly completed onboarding into required plan selection when RevenueCat is configured;
- can gate users without active access once subscription enforcement is enabled.

## 7. Subscription Police backend

The server-side subscription authority lives in the standalone repository:

```text
theJARiD85/keepflip-subscription-police
```

Create an Appwrite Function with ID:

```text
keepflip_subscription_police
```

using the standalone repository root. Leave Appwrite's Git root directory blank, use `src/main.js` as the entrypoint, and use the repository's npm install/build configuration.

The function receives RevenueCat webhooks, verifies webhook authentication/signatures, mirrors subscription state to `user_subscription`, and exposes authenticated `/status`, `/reconcile`, and `/access/check` routes.

See `appwrite/functions/keepflip-subscription-police/README.md` for the exact environment variables, scopes, webhook configuration, and test sequence.

The mobile app is configured to use:

```text
EXPO_PUBLIC_APPWRITE_SUBSCRIPTION_FUNCTION_ID=keepflip_subscription_police
```

and falls back to its read-only `user_subscription` row if the function is temporarily unavailable.

## 8. Rollout switch

Do not change:

```text
EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED=false
```

to `true` until all of the following are complete:

1. RevenueCat public SDK key is present in the build.
2. Store products/base plans are active for testing.
3. The four launch package identifiers resolve in `keepflip_default`.
4. Both launch entitlements activate correctly.
5. The seven-day store trial is verified.
6. Purchase and restore have been tested with store test accounts.
7. The RevenueCat webhook/Appwrite subscription mirror is deployed and tested.
8. Existing-user migration/grandfathering behavior has been decided.

Backend functions that consume paid resources must enforce subscription access independently. Client UI gating alone is not sufficient protection for AI usage, listing quotas, or automated Books features.
