import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { Canvas, Rect, LinearGradient, vec } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  useDerivedValue,
  interpolateColor,
} from 'react-native-reanimated';

export interface ActionTabGradienceProps extends ViewProps {
  width?: number;
  height?: number;
  children?: React.ReactNode;
}

export default function ActionTabGradience({
  width: propWidth,
  height: propHeight,
  children,
  style,
  onLayout: propOnLayout,
  ...viewProps
}: ActionTabGradienceProps) {
  const [measuredSize, setMeasuredSize] = useState({ width: 0, height: 0 });

  const width = propWidth ?? measuredSize.width;
  const height = propHeight ?? measuredSize.height;

  const handleLayout = (event: LayoutChangeEvent) => {
    propOnLayout?.(event);
    if (propWidth !== undefined && propHeight !== undefined) return;
    const { width: w, height: h } = event.nativeEvent.layout;
    setMeasuredSize((prev) =>
      prev.width === w && prev.height === h ? prev : { width: w, height: h }
    );
  };

  // 1. Create a shared timing value that loops from 0 to 1 indefinitely
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 6000 }), // Smooth 6-second cycle
      -1, // Infinitely repeat
      true // Reverse direction on loop completion (yoyo effect)
    );
  }, [progress]);

  // 2. Interpolate the colors smoothly on the UI thread based on the progress timer
  const colors = useDerivedValue(() => {
    const leftColor = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['#7c60f9ff', '#a693fbff', '#f8d79a'] // Vibrant Magenta -> Deep Violet -> Cyan Blue
    );
    const rightColor = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['#ffcd70ff', '#00ffff', '#01c2c2ff']
    );

    return [leftColor, rightColor];
  });

  return (
    <View
      onLayout={handleLayout}
      style={[styles.container, style]}
      {...viewProps}
    >
      {/* 3. The Skia Canvas operates directly on the native rendering context */}
      {width > 0 && height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={width} height={height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(width, height)}
              colors={colors}
            />
          </Rect>
        </Canvas>
      ) : null}

      {/* 4. Content layer to cleanly render UI elements above the canvas */}
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
});
