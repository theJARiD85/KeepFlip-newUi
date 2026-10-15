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

export type BiRefNetTapFrameEvent = {
  requestId: number;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  tapImageX: number;
  tapImageY: number;
};

export type KeepFlipARMeasureViewProps = ViewProps & {
  measurementMode?: MeasurementMode;
  biRefNetTapValidation?: boolean;
  tapMaskDecision?: string;
  style?: StyleProp<ViewStyle>;
  onItemMeasurement?: (event: {
    nativeEvent: ItemMeasurementEvent;
  }) => void;
  onBiRefNetTapFrame?: (event: {
    nativeEvent: BiRefNetTapFrameEvent;
  }) => void;
};
