import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

export type MeasurementMode = 'item' | 'box';

export type ItemMeasurementEvent = {
  kind: 'item_extents';
  shapeFamily: 'unknown';
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  lengthInches: number;
  widthInches: number;
  heightInches: number;
  confidence: number;
  sampleCount: number;
  cameraMotionMeters: number;
};

export type KeepFlipARMeasureViewProps = ViewProps & {
  measurementMode?: MeasurementMode;
  style?: StyleProp<ViewStyle>;
  onItemMeasurement?: (event: {
    nativeEvent: ItemMeasurementEvent;
  }) => void;
};
