import { NativeModule, requireNativeModule } from 'expo';

type KeepFlipImageTraceEvents = Record<string, never>;

export type KeepFlipImageTraceResult = {
  height: number;
  pixels: Uint8Array;
  processingMs: number;
  subjectFound: boolean;
  width: number;
};

declare class KeepFlipImageTraceNativeModule extends NativeModule<KeepFlipImageTraceEvents> {
  traceCenteredSubjectImage(
    sourceUri: string,
    lowThreshold: number,
    highThreshold: number,
  ): Promise<KeepFlipImageTraceResult>;
}

export default requireNativeModule<KeepFlipImageTraceNativeModule>(
  'KeepFlipImageTrace',
);
