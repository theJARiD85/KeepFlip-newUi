import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, LinearGradient, vec } from '@shopify/react-native-skia';
import Animated, { 
  cancelAnimation,
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

export interface HolographOverlayProps {
  width: number;
  height: number;
}

export function HolographOverlay({
  width,
  height,
}: HolographOverlayProps) {
  const scanlineY = useSharedValue(-60);

  useEffect(() => {
    cancelAnimation(scanlineY);
    scanlineY.set(-60);

    // Smoothly loops the glowing bar from top to bottom
    scanlineY.set(withRepeat(
      withTiming(height + 60, {
        duration: 3000,
        easing: Easing.linear,
      }),
      -1, // Infinite loops
      false,
    ));

    return () => {
      cancelAnimation(scanlineY);
    };
  }, [height, scanlineY]);

  // Animated styles for the moving glow beam
  const animatedBeamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanlineY.get() }],
  }));

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* Background Static Repeating Scanlines */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} opacity={0.15}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={['#00f0ff', 'transparent', '#00f0ff']}
            positions={[0, 0.5, 1]}
            mode="repeat"
          />
        </Rect>
      </Canvas>

      {/* Moving Laser Beam */}
      <Animated.View style={[styles.laserBeam, { width }, animatedBeamStyle]}>
        <View style={styles.laserCore} />
      </Animated.View>

      {/* Futuristic Corner Tech Accents */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 240, 255, 0.03)', // Subtle cyber tint
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.2)',
  },
  laserBeam: {
    position: 'absolute',
    height: 40,
    backgroundColor: 'rgba(0, 240, 255, 0.15)',
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  laserCore: {
    height: 2,
    backgroundColor: '#ffffff',
    width: '100%',
    position: 'absolute',
    bottom: '50%',
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  corner: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderColor: '#00f0ff',
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  topLeft: { top: 10, left: 10, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 10, right: 10, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 10, left: 10, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 10, right: 10, borderBottomWidth: 3, borderRightWidth: 3 },
});
