import { requireNativeView } from 'expo';
import * as React from 'react';

import { KeepFlipARMeasureViewProps } from './KeepFlipARMeasure.types';

const NativeView: React.ComponentType<KeepFlipARMeasureViewProps> = requireNativeView('KeepFlipARMeasure');

export default function KeepFlipARMeasureView(props: KeepFlipARMeasureViewProps) {
  return <NativeView {...props} />;
}
