import { responsiveWidth } from '@/lib/responsiveFont';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
export interface HolographOverlayProps {
  width: number;
  height: number;
}

export function HolographOverlay({
  width,
  height,
}: HolographOverlayProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
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

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
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
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(40) : responsiveLayout.responsiveHeight(40),
      backgroundColor: 'rgba(0, 240, 255, 0.15)',
      shadowColor: '#00f0ff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 15,
    },
    laserCore: {
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(2) : responsiveLayout.responsiveHeight(2),
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
      width: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(15) : responsiveLayout.responsiveWidth(15),
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(15) : responsiveLayout.responsiveHeight(15),
      borderColor: '#00f0ff',
      shadowColor: '#00f0ff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 4,
    },
    topLeft: { top: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10), left: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10), borderTopWidth: 3, borderLeftWidth: 3 },
    topRight: { top: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10), right: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10), borderTopWidth: 3, borderRightWidth: 3 },
    bottomLeft: { bottom: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10), left: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10), borderBottomWidth: 3, borderLeftWidth: 3 },
    bottomRight: { bottom: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10), right: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10), borderBottomWidth: 3, borderRightWidth: 3 },
  });
  return {
    ...staticStyles,
    laserBeam: [
      staticStyles.laserBeam,
      {
        height: responsiveHeight(40),
        shadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
    laserCore: [
      staticStyles.laserCore,
      {
        height: responsiveHeight(2),
        shadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
    corner: [
      staticStyles.corner,
      {
        width: responsiveWidth(15),
        height: responsiveHeight(15),
        shadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
  };
}
