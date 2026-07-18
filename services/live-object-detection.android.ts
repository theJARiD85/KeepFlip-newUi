import KeepFlipLocalVisionModule from '@/modules/keepflip-local-vision/src/KeepFlipLocalVisionModule';
import type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';

export async function detectLiveObjects(
  frame: KeepFlipYuvFrame,
): Promise<KeepFlipLiveObjectDetection[]> {
  return KeepFlipLocalVisionModule.detectYuvFrame(frame);
}

export type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';
