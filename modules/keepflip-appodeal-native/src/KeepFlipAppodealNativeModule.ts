import { requireNativeModule } from 'expo';

import type { AppodealInitializationResult } from './KeepFlipAppodealNative.types';

type KeepFlipAppodealNativeModuleShape = {
  initialize(appKey: string, testing: boolean): Promise<AppodealInitializationResult>;
  isInitialized(): boolean;
  cache(amount: number): Promise<boolean>;
};

export default requireNativeModule<KeepFlipAppodealNativeModuleShape>(
  'KeepFlipAppodealNative',
);
