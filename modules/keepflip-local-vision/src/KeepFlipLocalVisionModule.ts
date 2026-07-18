import { NativeModule, requireNativeModule } from 'expo';

import type {
  KeepFlipLocalVisionModuleEvents,
  KeepFlipLocalVisionResult,
} from './KeepFlipLocalVision.types';

declare class KeepFlipLocalVisionModule extends NativeModule<KeepFlipLocalVisionModuleEvents> {
  analyzeImage(sourceUri: string): Promise<KeepFlipLocalVisionResult>;
}

export default requireNativeModule<KeepFlipLocalVisionModule>('KeepFlipLocalVision');
