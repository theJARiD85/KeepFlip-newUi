import {
  KeepFlipAppodealNativeModule,
  type AppodealInitializationResult,
} from '@/modules/keepflip-appodeal-native';

let initializationPromise: Promise<AppodealInitializationResult> | null = null;

function readTestingMode() {
  const configured = process.env.EXPO_PUBLIC_APPODEAL_TESTING?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return __DEV__;
}

export function isAppodealNativeAdsConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_APPODEAL_APP_KEY?.trim());
}

export function initializeAppodealNativeAds() {
  const appKey = process.env.EXPO_PUBLIC_APPODEAL_APP_KEY?.trim();
  if (!appKey) {
    return Promise.resolve<AppodealInitializationResult>({
      errors: ['missing_appodeal_app_key'],
      initialized: false,
      testing: readTestingMode(),
    });
  }

  initializationPromise ??= KeepFlipAppodealNativeModule.initialize(
    appKey,
    readTestingMode(),
  ).then((result) => {
    if (result.initialized) {
      void KeepFlipAppodealNativeModule.cache(2).catch(() => undefined);
    }
    return result;
  });

  return initializationPromise;
}
