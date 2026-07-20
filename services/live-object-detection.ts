import type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';

export async function detectLiveObjects(
  _frame: KeepFlipYuvFrame,
): Promise<KeepFlipLiveObjectDetection[]> {
  return [];
}

export type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';
