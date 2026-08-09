# Migration from the old KeepFlip module

## Remove imports

Replace:

```tsx
import {
  KeepFlipAppodealNativeModule,
  KeepFlipAppodealNativeView,
} from "@/modules/keepflip-appodeal-native";
```

with:

```tsx
import {
  AppodealNativeAdView,
  AppodealNativeAdsInitializer,
} from "@keepflip/expo-appodeal-native-ads";
```

## Replace initialization

Old:

```tsx
KeepFlipAppodealNativeModule.initialize(
  appKey,
  __DEV__,
);
```

New:

```tsx
<AppodealNativeAdsInitializer
  appKey={appKey}
  testing={__DEV__}
/>
```

or:

```tsx
await initializeAppodealNativeAds({
  appKey,
  testing: __DEV__,
});
```

## Replace the native view

Old:

```tsx
<KeepFlipAppodealNativeView
  placement="inventory_feed"
/>
```

New:

```tsx
<AppodealNativeAdView
  placement="inventory_feed"
  style={{ height: 380 }}
/>
```

## Delete old native configuration

Remove any app-level dependency that duplicates the package:

```gradle
implementation("com.appodeal.ads.sdk:core:...")
```

Remove old custom Appodeal Kotlin files and the obsolete Appodeal repository
config plugin. Keep signing and release-keystore configuration.
