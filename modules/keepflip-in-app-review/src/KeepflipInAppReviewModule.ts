import { NativeModule, requireNativeModule } from 'expo';

declare class KeepflipInAppReviewModule extends NativeModule<{}> {
  requestReview(): Promise<boolean>;
}

export default requireNativeModule<KeepflipInAppReviewModule>('KeepflipInAppReview');
