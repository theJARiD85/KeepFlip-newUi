# @keepflip/expo-appodeal-native-ads

Standalone **Android Expo module** for Appodeal native ads.

It provides:

- Expo Modules autolinking;
- Appodeal SDK initialization;
- native-ad caching and availability APIs;
- a compliant Appodeal `NativeAdView`;
- lifecycle cleanup for virtualized lists;
- an Expo config plugin;
- optional AdMob adapter support;
- TypeScript types.

The package intentionally does **not** modify your Android Gradle Plugin,
Kotlin version, signing configuration, upload key, or release keystore.

## Install the local tarball

Copy the generated `.tgz` file into the KeepFlip project, then run:

```powershell
npm install .\keepflip-expo-appodeal-native-ads-0.1.0.tgz
```

Remove the old ad packages and local modules first:

```powershell
npm uninstall react-native-appodeal react-native-google-mobile-ads
```

Delete old custom folders only after confirming they are no longer imported:

```text
modules/keepflip-appodeal-native
modules/keepflip-native-ads
```

## Configure `app.json`

Add the package to the Expo plugin list:

```json
{
  "expo": {
    "plugins": [
      [
        "@keepflip/expo-appodeal-native-ads",
        {
          "enableAdMob": false,
          "removeLocationPermissions": true
        }
      ]
    ]
  }
}
```

`enableAdMob` defaults to `false`, which is appropriate while the AdMob app
is not approved.

The plugin adds:

- Appodeal Maven repositories;
- `android.minSdkVersion=24` when the app is lower;
- `INTERNET`;
- `ACCESS_NETWORK_STATE`;
- `AD_ID`;
- Appodeal network security configuration;
- optional removal of ad-network location permissions.

It does not edit release signing.

## Add the Appodeal key

In `.env`:

```env
EXPO_PUBLIC_APPODEAL_APP_KEY=YOUR_ANDROID_APPODEAL_APP_KEY
```

The Appodeal key must belong to the same Android package configured in the
Appodeal dashboard.

## Initialize once

Add this near the root of the app:

```tsx
import {
  AppodealNativeAdsInitializer,
} from "@keepflip/expo-appodeal-native-ads";

const appodealKey =
  process.env.EXPO_PUBLIC_APPODEAL_APP_KEY ?? "";

export function AdsInitializer() {
  return (
    <AppodealNativeAdsInitializer
      appKey={appodealKey}
      cacheCount={2}
      testing={__DEV__}
      onInitialized={(result) => {
        // result.initialized
        // result.errors
      }}
      onError={(error) => {
        // Send this to your error reporting service.
      }}
    />
  );
}
```

Test mode is enabled in development by the example above. A release build
receives live ads when `testing={false}` and Appodeal dashboard test mode is
disabled.

## Render a native ad

```tsx
import {
  AppodealNativeAdView,
} from "@keepflip/expo-appodeal-native-ads";

<AppodealNativeAdView
  placement="inventory_feed"
  style={{ height: 380 }}
  onAdReady={({ nativeEvent }) => {
    console.info(
      "Native ad ready",
      nativeEvent.availableCount,
    );
  }}
  onAdFailed={({ nativeEvent }) => {
    console.warn(
      "Native ad failed",
      nativeEvent.code,
    );
  }}
/>
```

The component defaults to:

```tsx
{
  active: true,
  placement: "default",
  refreshKey: 0,
  style: {
    width: "100%",
    height: 380,
  },
}
```

Set `active={false}` while a feed row is off-screen to suspend Appodeal view
tracking. Increment `refreshKey` to release the current ad and request another.

## Manual API

```tsx
import AppodealNativeAds, {
  cacheAppodealNativeAds,
  getAvailableAppodealNativeAdsCount,
  initializeAppodealNativeAds,
  isAppodealNativeAdsInitialized,
} from "@keepflip/expo-appodeal-native-ads";
```

Initialization:

```tsx
const result =
  await initializeAppodealNativeAds({
    appKey:
      process.env.EXPO_PUBLIC_APPODEAL_APP_KEY ?? "",
    testing: __DEV__,
    cacheCount: 2,
  });
```

Cache between one and five ads:

```tsx
await cacheAppodealNativeAds(2);
```

## Enable AdMob later

After the AdMob application is approved:

```json
[
  "@keepflip/expo-appodeal-native-ads",
  {
    "enableAdMob": true,
    "adMobAppId": "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy",
    "removeLocationPermissions": true
  }
]
```

The plugin then adds the Appodeal AdMob adapter and Google Mobile Ads
application metadata. Do not place a native ad-unit ID in `adMobAppId`.

## Rebuild

This package contains native Android code and does not work in Expo Go.

```powershell
npx expo prebuild --clean
npx expo run:android
```

For a signed release bundle:

```powershell
cd android
.\gradlew.bat bundleRelease
```

Your release keystore remains configured in the app's own
`android/app/build.gradle` or build credentials system.

## Included demand adapters

The package includes a compact non-AdMob set:

- BidMachine
- AppLovin MAX
- Meta
- Mintegral
- InMobi
- MobileFuse
- Yandex

Adapter versions are pinned to keep builds reproducible.

## Android-only status

Version `0.1.0` supports Android only. Importing the package on another
platform is safe, but initialization reports `unsupported_platform` and the
native view renders nothing.
