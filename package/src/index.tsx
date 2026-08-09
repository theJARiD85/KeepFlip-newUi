import React, { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import {
  requireNativeModule,
  requireNativeView,
} from "expo";

export type AppodealNativeAdsInitializationResult = {
  initialized: boolean;
  testing: boolean;
  availableCount: number;
  errors: string[];
};

export type AppodealNativeAdEvent = {
  placement: string;
};

export type AppodealNativeAdReadyEvent =
  AppodealNativeAdEvent & {
    availableCount: number;
  };

export type AppodealNativeAdFailedEvent =
  AppodealNativeAdEvent & {
    code: string;
  };

export type InitializeAppodealNativeAdsOptions = {
  appKey: string;
  testing?: boolean;
  cacheCount?: number;
};

export type AppodealNativeAdViewProps =
  ViewProps & {
    active?: boolean;
    placement?: string;
    refreshKey?: number;
    style?: StyleProp<ViewStyle>;
    onAdReady?: (
      event: NativeSyntheticEvent<AppodealNativeAdReadyEvent>,
    ) => void;
    onAdFailed?: (
      event: NativeSyntheticEvent<AppodealNativeAdFailedEvent>,
    ) => void;
    onAdShown?: (
      event: NativeSyntheticEvent<AppodealNativeAdEvent>,
    ) => void;
    onAdClicked?: (
      event: NativeSyntheticEvent<AppodealNativeAdEvent>,
    ) => void;
    onAdExpired?: (
      event: NativeSyntheticEvent<AppodealNativeAdEvent>,
    ) => void;
  };

export type AppodealNativeAdsInitializerProps =
  InitializeAppodealNativeAdsOptions & {
    onInitialized?: (
      result: AppodealNativeAdsInitializationResult,
    ) => void;
    onError?: (error: Error) => void;
  };

type NativeModuleShape = {
  initialize(
    appKey: string,
    testing: boolean,
    cacheCount: number,
  ): Promise<AppodealNativeAdsInitializationResult>;
  isInitialized(): boolean;
  getAvailableCount(): number;
  cache(amount: number): Promise<boolean>;
};

const NativeModule =
  Platform.OS === "android"
    ? requireNativeModule<NativeModuleShape>(
        "ExpoAppodealNativeAds",
      )
    : null;

const NativeView =
  Platform.OS === "android"
    ? requireNativeView<AppodealNativeAdViewProps>(
        "ExpoAppodealNativeAds",
      )
    : null;

export async function initializeAppodealNativeAds(
  options: InitializeAppodealNativeAdsOptions,
): Promise<AppodealNativeAdsInitializationResult> {
  if (!NativeModule) {
    return {
      initialized: false,
      testing: options.testing ?? false,
      availableCount: 0,
      errors: ["unsupported_platform"],
    };
  }

  const appKey = options.appKey.trim();
  if (!appKey) {
    throw new Error(
      "initializeAppodealNativeAds requires an Appodeal app key.",
    );
  }

  return NativeModule.initialize(
    appKey,
    options.testing ?? __DEV__,
    Math.max(
      1,
      Math.min(5, options.cacheCount ?? 2),
    ),
  );
}

export function isAppodealNativeAdsInitialized() {
  return NativeModule?.isInitialized() ?? false;
}

export function getAvailableAppodealNativeAdsCount() {
  return NativeModule?.getAvailableCount() ?? 0;
}

export async function cacheAppodealNativeAds(
  amount = 2,
) {
  if (!NativeModule) {
    return false;
  }

  return NativeModule.cache(
    Math.max(1, Math.min(5, amount)),
  );
}

export function AppodealNativeAdView({
  active = true,
  placement = "default",
  refreshKey = 0,
  style,
  ...props
}: AppodealNativeAdViewProps) {
  if (!NativeView) {
    return null;
  }

  return (
    <NativeView
      {...props}
      active={active}
      placement={placement}
      refreshKey={refreshKey}
      style={[styles.nativeAd, style]}
    />
  );
}

export function AppodealNativeAdsInitializer({
  appKey,
  testing = __DEV__,
  cacheCount = 2,
  onInitialized,
  onError,
}: AppodealNativeAdsInitializerProps) {
  useEffect(() => {
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
  initialize: initializeAppodealNativeAds,
  isInitialized:
    isAppodealNativeAdsInitialized,
};

export default AppodealNativeAds;
