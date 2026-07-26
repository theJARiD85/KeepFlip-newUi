import React from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';

// 1. Define your camera tools configuration
const TOOLS = [
  { id: 'single', label: 'SINGLE SHOT', icon: '📸' },
  { id: 'multi', label: 'MULTI SCAN', icon: '♊' },
  { id: 'upload', label: 'UPLOAD PHOTO', icon: '📤' },
];

const SWIPE_THRESHOLD = 60; // Pixels required to trigger a tool change
const RADIUS = 140; // Matches the physical radius of your HUD telemetry ring

export default function CameraToolWheel({ onToolChange }: { onToolChange?: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const activeIndex = useSharedValue(1); // Default to middle tool ("multi")
  const translateX = useSharedValue(0);

  // 2. Gesture Handling Logic
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Allow fluid real-time scrubbing preview between items
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      const drag = event.translationX;

      // Determine if swipe velocity or distance warrants an item shift
      if (drag < -SWIPE_THRESHOLD || velocity < -500) {
        if (activeIndex.value < TOOLS.length - 1) {
          activeIndex.value += 1;
          if (onToolChange) runOnJS(onToolChange)(TOOLS[activeIndex.value].id);
        }
      } else if (drag > SWIPE_THRESHOLD || velocity > 500) {
        if (activeIndex.value > 0) {
          activeIndex.value -= 1;
          if (onToolChange) runOnJS(onToolChange)(TOOLS[activeIndex.value].id);
        }
      }
      
      // Snap cleanly back to origin anchor point after gesture ends
      translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
    });

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.wheelContainer, { width }]}>
          
          {/* Active Tool Text Display Indicator */}
          <ActiveToolLabel activeIndex={activeIndex} translateX={translateX} />

          {/* Invisible Track Rendering the Tool Nodes */}
          {TOOLS.map((tool, index) => (
            <ToolNode
              key={tool.id}
              index={index}
              tool={tool}
              activeIndex={activeIndex}
              translateX={translateX}
            />
          ))}
          
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

// 3. Animated Component for Each Individual Tool Node
function ToolNode({ index, tool, activeIndex, translateX }: any) {
  const animatedStyle = useAnimatedStyle(() => {
    // Determine how far this specific index currently is from the center focus pointer
    const offset = index - activeIndex.value;
    const currentProgress = offset - translateX.value / SWIPE_THRESHOLD;

    // Map linear swipe progression directly to a 90-degree radial curved angle
    const angle = currentProgress * (Math.PI / 4.5); 

    // Polar-to-Cartesian layout mapping for bottom-arc navigation
    const tx = RADIUS * Math.sin(angle);
    const ty = RADIUS * (1 - Math.cos(angle)) * 0.4; // Weighted flat skew

    // Dynamic scale, opacity fading, and 3D angle distortion matching your HUD boundary edges
    const scale = interpolate(currentProgress, [-1, 0, 1], [0.75, 1.2, 0.75], Extrapolation.CLAMP);
    const opacity = interpolate(currentProgress, [-1.2, -0.7, 0, 0.7, 1.2], [0, 0.5, 1, 0.5, 0], Extrapolation.CLAMP);
    const rotateY = `${interpolate(currentProgress, [-1, 0, 1], [45, 0, -45], Extrapolation.CLAMP)}deg`;

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: scale },
        { rotateY: rotateY },
      ],
      opacity: opacity,
    };
  });

  return (
    <Animated.View style={[styles.toolItem, animatedStyle]}>
      <Text style={styles.toolIcon}>{tool.icon}</Text>
    </Animated.View>
  );
}

// 4. Smoothly Crossfading Text Labels Above Shutter Area
function ActiveToolLabel({ activeIndex, translateX }: any) {
  const labelStyle = useAnimatedStyle(() => {
    const currentProgress = activeIndex.value - translateX.value / SWIPE_THRESHOLD;
    return {
      opacity: interpolate(currentProgress % 1, [-0.2, 0, 0.2], [0, 1, 0], Extrapolation.CLAMP),
    };
  });

  // Rough estimation of current string to prevent raw indexing layout flashes
  const nearestIndex = Math.round(activeIndex.value);
  const currentLabel = TOOLS[nearestIndex] ? TOOLS[nearestIndex].label : '';

  return (
    <Animated.View style={[styles.labelContainer, labelStyle]}>
      <Text style={styles.hudText}>{currentLabel}</Text>
    </Animated.View>
  );
}

// 5. Styles Structuring HUD Bounds
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  wheelContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  labelContainer: {
    position: 'absolute',
    top: 10,
    alignItems: 'center',
  },
  hudText: {
    color: '#FF7A00', // Matches your orange diagnostic display color accent
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'Platform-Specific-Monospace', // fallback to monospace for HUD data look
  },
  toolItem: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 242, 254, 0.15)', // Neon Cyan accent glow backdrop 
    borderWidth: 1.5,
    borderColor: '#00F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  toolIcon: {
    fontSize: 24,
    color: '#00F2FE',
  },
});
