import type { AppodealInitializationResult } from '@/modules/keepflip-appodeal-native';

export function isAppodealNativeAdsConfigured() {
  return false;
}

export function initializeAppodealNativeAds() {
  return Promise.resolve<AppodealInitializationResult>({
    errors: ['native_ads_android_only'],
    initialized: false,
    testing: false,
  });
}
