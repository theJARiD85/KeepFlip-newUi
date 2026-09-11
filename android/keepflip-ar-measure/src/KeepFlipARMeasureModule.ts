import { NativeModule, requireNativeModule } from 'expo';

declare class KeepFlipARMeasureModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<KeepFlipARMeasureModule>('KeepFlipARMeasure');
