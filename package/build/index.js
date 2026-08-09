"use strict";

const React = require("react");
const {
  Platform,
  StyleSheet,
} = require("react-native");
const {
  requireNativeModule,
  requireNativeView,
} = require("expo");

const NativeModule =
  Platform.OS === "android"
    ? requireNativeModule(
        "ExpoAppodealNativeAds",
      )
    : null;

const NativeView =
  Platform.OS === "android"
    ? requireNativeView(
        "ExpoAppodealNativeAds",
      )
    : null;

function defaultTestingMode() {
  return typeof __DEV__ !== "undefined"
    ? __DEV__
    : false;
}

async function initializeAppodealNativeAds(
  options,
) {
  if (!NativeModule) {
    return {
      initialized: false,
      testing:
        options.testing ?? false,
      availableCount: 0,
      errors: ["unsupported_platform"],
    };
  }

  const appKey = String(
    options.appKey ?? "",
  ).trim();

  if (!appKey) {
    throw new Error(
      "initializeAppodealNativeAds requires an Appodeal app key.",
    );
  }

  const cacheCount = Math.max(
    1,
    Math.min(
      5,
      options.cacheCount ?? 2,
    ),
  );

  return NativeModule.initialize(
    appKey,
    options.testing ??
      defaultTestingMode(),
    cacheCount,
  );
}

function isAppodealNativeAdsInitialized() {
  return NativeModule?.isInitialized() ?? false;
}

function getAvailableAppodealNativeAdsCount() {
  return NativeModule?.getAvailableCount() ?? 0;
}

async function cacheAppodealNativeAds(
  amount = 2,
) {
  if (!NativeModule) {
    return false;
  }

  return NativeModule.cache(
    Math.max(
      1,
      Math.min(5, amount),
    ),
  );
}

function AppodealNativeAdView({
  active = true,
  placement = "default",
  refreshKey = 0,
  style,
  ...props
}) {
  if (!NativeView) {
    return null;
  }

  return React.createElement(
    NativeView,
    {
      ...props,
      active,
      placement,
      refreshKey,
      style: [
        styles.nativeAd,
        style,
      ],
    },
  );
}

function AppodealNativeAdsInitializer({
  appKey,
  testing = defaultTestingMode(),
  cacheCount = 2,
  onInitialized,
  onError,
}) {
  React.useEffect(() => {
    let cancelled = false;

    initializeAppodealNativeAds({
      appKey,
      testing,
      cacheCount,
    })
      .then((result) => {
        if (!cancelled) {
          onInitialized?.(result);
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        onError?.(
          caught instanceof Error
            ? caught
            : new Error(
                "Appodeal native ads failed to initialize.",
              ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    appKey,
    cacheCount,
    onError,
    onInitialized,
    testing,
  ]);

  return null;
}

const styles = StyleSheet.create({
  nativeAd: {
    width: "100%",
    height: 380,
  },
});

const AppodealNativeAds = {
  cache: cacheAppodealNativeAds,
  getAvailableCount:
    getAvailableAppodealNativeAdsCount,
  initialize:
    initializeAppodealNativeAds,
  isInitialized:
    isAppodealNativeAdsInitialized,
};

exports.AppodealNativeAdView =
  AppodealNativeAdView;
exports.AppodealNativeAdsInitializer =
  AppodealNativeAdsInitializer;
exports.cacheAppodealNativeAds =
  cacheAppodealNativeAds;
exports.getAvailableAppodealNativeAdsCount =
  getAvailableAppodealNativeAdsCount;
exports.initializeAppodealNativeAds =
  initializeAppodealNativeAds;
exports.isAppodealNativeAdsInitialized =
  isAppodealNativeAdsInitialized;
exports.default = AppodealNativeAds;
