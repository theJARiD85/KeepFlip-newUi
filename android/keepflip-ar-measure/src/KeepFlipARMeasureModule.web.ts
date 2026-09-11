import { registerWebModule, NativeModule } from 'expo';

// KeepFlipARMeasureModule is not available on the web platform.
class KeepFlipARMeasureModule extends NativeModule<{}> {}

export default registerWebModule(KeepFlipARMeasureModule, 'KeepFlipARMeasureModule');
