import type {
  NativeSyntheticEvent,
  StyleProp,
  ViewProps,
  ViewStyle,
} from "react-native";

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

export declare function initializeAppodealNativeAds(
  options: InitializeAppodealNativeAdsOptions,
): Promise<AppodealNativeAdsInitializationResult>;

export declare function isAppodealNativeAdsInitialized(): boolean;

export declare function getAvailableAppodealNativeAdsCount(): number;

export declare function cacheAppodealNativeAds(
  amount?: number,
): Promise<boolean>;

export declare function AppodealNativeAdView(
  props: AppodealNativeAdViewProps,
): import("react").ReactElement | null;

export declare function AppodealNativeAdsInitializer(
  props: AppodealNativeAdsInitializerProps,
): null;

declare const AppodealNativeAds: {
  cache: typeof cacheAppodealNativeAds;
  getAvailableCount:
    typeof getAvailableAppodealNativeAdsCount;
  initialize:
    typeof initializeAppodealNativeAds;
  isInitialized:
    typeof isAppodealNativeAdsInitialized;
};

export default AppodealNativeAds;
