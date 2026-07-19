import { NativeModule, requireNativeModule } from 'expo';

import type {
  KeepFlipLocalVisionModuleEvents,
  KeepFlipLiveObjectDetection,
  KeepFlipLocalVisionResult,
  KeepFlipYuvFrame,
} from './KeepFlipLocalVision.types';

declare class KeepFlipLocalVisionNativeModule extends NativeModule<KeepFlipLocalVisionModuleEvents> {
  analyzeImage(sourceUri: string): Promise<KeepFlipLocalVisionResult>;
  detectYuvFrame(
    width: number,
    height: number,
    rotationDegrees: number,
    y: Uint8Array,
    u: Uint8Array,
    v: Uint8Array,
  ): Promise<KeepFlipLiveObjectDetection[]>;
}

const nativeModule = requireNativeModule<KeepFlipLocalVisionNativeModule>(
  'KeepFlipLocalVision',
);

const KeepFlipLocalVisionModule = {
  analyzeImage(sourceUri: string) {
    return nativeModule.analyzeImage(sourceUri);
  },
  detectYuvFrame(frame: KeepFlipYuvFrame) {
    return nativeModule.detectYuvFrame(
      frame.width,
      frame.height,
      frame.rotationDegrees,
      new Uint8Array(frame.y),
      new Uint8Array(frame.u),
      new Uint8Array(frame.v),
    );
  },
};

export default KeepFlipLocalVisionModule;
