import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type AppodealInitializationResult = {
  initialized: boolean;
  testing: boolean;
  errors: string[];
};

export type AppodealNativeAdEvent = {
  placement: string;
};

export type AppodealNativeAdReadyEvent = AppodealNativeAdEvent & {
  availableCount: number;
};

export type AppodealNativeAdFailedEvent = AppodealNativeAdEvent & {
  code: string;
};

export type KeepFlipAppodealNativeViewProps = ViewProps & {
  placement?: string;
  onAdReady?: (event: NativeSyntheticEvent<AppodealNativeAdReadyEvent>) => void;
  onAdFailed?: (event: NativeSyntheticEvent<AppodealNativeAdFailedEvent>) => void;
  onAdShown?: (event: NativeSyntheticEvent<AppodealNativeAdEvent>) => void;
  onAdClicked?: (event: NativeSyntheticEvent<AppodealNativeAdEvent>) => void;
  onAdExpired?: (event: NativeSyntheticEvent<AppodealNativeAdEvent>) => void;
};
