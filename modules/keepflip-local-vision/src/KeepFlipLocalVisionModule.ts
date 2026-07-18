import { NativeModule, requireNativeModule } from 'expo';

import type {
  KeepFlipLocalVisionModuleEvents,
  KeepFlipLiveObjectDetection,
  KeepFlipLocalVisionResult,
  KeepFlipYuvFrame,
} from './KeepFlipLocalVision.types';

declare class KeepFlipLocalVisionModule extends NativeModule<KeepFlipLocalVisionModuleEvents> {
  analyzeImage(sourceUri: string): Promise<KeepFlipLocalVisionResult>;
  detectYuvFrame(frame: KeepFlipYuvFrame): Promise<KeepFlipLiveObjectDetection[]>;
}

export default requireNativeModule<KeepFlipLocalVisionModule>('KeepFlipLocalVision');
