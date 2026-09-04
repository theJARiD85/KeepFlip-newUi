# RevenueCat subscription setup for KeepFlip

The mobile integration is already wired. Keep subscription enforcement **off** until these store and RevenueCat objects are live and test purchases have succeeded.

## 1. RevenueCat project and app

Create the KeepFlip RevenueCat project and add:

- Android app package: `com.keepflip.app`
- iOS bundle ID: `com.keepflip.app` when iOS billing is enabled

Copy only the **public SDK key** for each store into the app environment:

```text
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=<public Android SDK key>
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<public iOS SDK key>
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=keepflip_default
```

Never put a RevenueCat secret REST API key or webhook secret in an `EXPO_PUBLIC_` variable.

## 2. Entitlements

Create exactly:

```text
keepflip_hobbyist
keepflip_serious
keepflip_power
```

## 3. Products / base plans

The app expects these commercial choices:

| Plan | Cadence | Price |
| --- | --- | ---: |
| Hobbyist | Monthly | $24.99 / month |
| Hobbyist | Annual | $239.88 / year |
| Serious Reseller | Monthly | $44.99 / month |
| Power Seller | Monthly | $89.99 / month |

Store product IDs may be chosen to fit Google Play / App Store conventions. RevenueCat packages are what KeepFlip uses to select them.

## 4. Offering and packages

Create Offering:

```text
keepflip_default
```

Add custom packages with exactly these identifiers:

```text
hobbyist-monthly
hobbyist-annual
serious-monthly
power_monthly
```

Attach each package to its corresponding store product/base plan and entitlement.

## 5. Seven-day trial

Configure a **7-day free trial** as a store introductory offer for eligible new subscribers on every subscription option.

Do not create the trial by writing a timestamp in Appwrite or the mobile client. Google Play / Apple and RevenueCat decide whether the store account is eligible and RevenueCat reports the active period as `TRIAL`.

The app already reads that state and displays the trial expiration.

## 6. Appwrite mirror

Create the `user_subscription` table using:

```text
docs/USER_SUBSCRIPTION_APPWRITE_SCHEMA.md
```

The mobile app reads this table but does not write authoritative subscription status. A RevenueCat webhook Appwrite Function should own writes.

Keep the owner row readable by that signed-in user. Do not grant client create/update permissions.

## 7. Native build

`react-native-purchases` is a native dependency. After pulling the subscription integration:

```bash
npm install
```

Then make a new development/production native build. Expo Go is not the environment for validating real store subscriptions.

## 8. Test before enforcement

Test with Google Play licensed/internal testers (and StoreKit/App Store sandbox when iOS is enabled):

1. New account signs in.
2. KeepFlip plan screen loads live store prices.
3. Starting a plan opens the store purchase sheet.
4. Eligible tester receives the 7-day trial.
5. Account screen displays TRIAL and the selected tier.
6. Restore Purchases restores access on a fresh install/session.
7. Monthly-to-monthly upgrade works.
8. Downgrade is deferred rather than accidentally double-charging.
9. Cancelling in the store updates RevenueCat access.
10. Webhook mirrors the resulting state to `user_subscription`.

## 9. Turn on the paywall

Only after the tests above are clean:

```text
EXPO_PUBLIC_KEEPFLIP_SUBSCRIPTIONS_ENFORCED=true
```

With enforcement enabled, an authenticated account without an active entitlement is routed to the KeepFlip plan screen before normal onboarding/app access.

## App policy identifiers

KeepFlip currently uses these tier rules:

- Hobbyist: 50 active listings/month, 100 AI valuations/month, basic Books.
- Serious: 250 active listings/month, unlimited AI valuations, automated Books, Schedule C export.
- Power: unlimited listings/AI valuations, Serious features plus advanced Books analytics and multi-user capability.

The app exposes these rules through `KEEPFLIP_PLAN_LIMITS`, `keepFlipPlanAllows()`, and `keepFlipPlanLimit()`. Server functions must enforce paid features and metered usage before enforcement is considered complete.
