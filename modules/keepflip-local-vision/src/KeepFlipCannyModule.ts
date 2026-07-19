import { NativeModule, requireNativeModule } from 'expo';

type KeepFlipCannyEvents = Record<string, never>;

export type KeepFlipCannyEdgeResult = {
  height: number;
  pixels: Uint8Array;
  processingMs: number;
  width: number;
};

declare class KeepFlipCannyNativeModule extends NativeModule<KeepFlipCannyEvents> {
  detectYPlane(
    width: number,
    height: number,
    rowStride: number,
    yPlane: Uint8Array,
    lowThreshold: number,
    highThreshold: number,
  ): Promise<KeepFlipCannyEdgeResult>;
}

export default requireNativeModule<KeepFlipCannyNativeModule>('KeepFlipCanny');
