import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import { 
  Canvas, 
  Image, 
  useImage,
  Group, 
  Skia, 
  Rect, 
  LinearGradient, 
  vec, 
  RuntimeShader 
} from '@shopify/react-native-skia';
import { 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  useDerivedValue 
} from 'react-native-reanimated';

// 1. Digital Hologram Glitch Shader (AGSL)
const GLITCH_SHADER = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float time;
  
  half4 main(vec2 pos) {
    // Subtle horizontal wave distortion to simulate a projection transmission signal
    float wave = sin(pos.y * 0.05 + time * 5.0) * 2.0;
    vec2 distortedPos = vec2(pos.x + wave, pos.y);
    
    half4 color = image.eval(distortedPos);
    
    // Add subtle futuristic green-cyan scanlines
    float scanline = sin(pos.y * 0.8) * 0.08 + 0.92;
    color.rgb *= scanline;
    
    // Tint slightly toward the cyberpunk cyan palette from your UI image
    color.r *= 0.6;
    color.g *= 1.2;
    color.b *= 1.3;
    
    return color;
  }
`)!;

interface HologramImageProps {
  imageUri: string;
  width?: number;
  height?: number;
}

export const HologramImage: React.FC<HologramImageProps> = ({ 
  imageUri, 
}) => {
  // Load the target user image into the Skia texture buffer
  const texture = useImage(imageUri);
  const { height, width } = useWindowDimensions();
  
  // Animation driving hooks
  const scanLineY = useSharedValue(-50);
  const shaderTime = useSharedValue(0);

  const shaderUniforms = useDerivedValue(() => ({
    time: shaderTime.value,
  }));

  useEffect(() => {
    // Loop the laser scanline up and down continuously
    scanLineY.value = withRepeat(withTiming(height + 50, { duration: 3000 }), -1, true);
    // Track continuous running time for shader ripples
    shaderTime.value = withRepeat(withTiming(10, { duration: 5000 }), -1, false);
  }, [height]);

  // 2. High-Performance Pseudo-3D Matrix Transform
  const matrix = useDerivedValue(() => {
    const mat3 = Skia.Matrix();
    mat3.identity();
    
    // Move coordinate origin to the center of the asset to rotate perfectly in place
    mat3.translate(width / 2, height / 2);
    
    // Apply a static perspective skew to match your UI's 2.5D angle
    mat3.skew(0, -0.15); // Skew Y (vertical) to create the floating 2.5D parallax effect
    mat3.scale(0.95, 0.85); // Compress vertically slightly for depth illusion
    
    // Reset origin point offset back into position
    mat3.translate(-width / 2, -height / 2);
    return mat3;
  });

  if (!texture) return null;

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Layer 1: Perspective Matrix Controlled Image & Shading */}
        <Group matrix={matrix}>
          
          {/* Main User Image Processed with GPU Shaders */}
          <Rect x={0} y={0} width={width} height={height}>
            <RuntimeShader source={GLITCH_SHADER} uniforms={shaderUniforms}>
              <Image 
                image={texture} 
                x={0} 
                y={0} 
                width={width} 
                height={height} 
                fit="cover" 
              />
            </RuntimeShader>
          </Rect>

          {/* Layer 2: Neon Tech Grid Frame (Cyan outline) */}
          <Rect 
            x={2} 
            y={2} 
            width={width - 4} 
            height={height - 4} 
            style="stroke" 
            strokeWidth={1.5} 
            color="#00f3ff" 
          />

          {/* Layer 3: Moving Laser HUD Scanning Beam */}
          <Group>
            <Rect x={0} y={scanLineY} width={width} height={12}>
              <LinearGradient
                start={vec(0, scanLineY.value)}
                end={vec(0, scanLineY.value + 12)}
                colors={['transparent', '#00f3ff', 'transparent']}
              />
            </Rect>
          </Group>

        </Group>
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
