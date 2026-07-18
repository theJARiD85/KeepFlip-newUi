import { requireNativeView } from 'expo';

import type { KeepFlipAppodealNativeViewProps } from './KeepFlipAppodealNative.types';

const NativeView = requireNativeView<KeepFlipAppodealNativeViewProps>(
  'KeepFlipAppodealNative',
);

export function KeepFlipAppodealNativeView(
  props: KeepFlipAppodealNativeViewProps,
) {
  return <NativeView {...props} />;
}
