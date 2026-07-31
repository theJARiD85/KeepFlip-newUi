import {
  Canvas,
  Rect,
  Shader,
  Skia,
  useClock,
  type Uniforms,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  useDerivedValue,
  useReducedMotion,
} from "react-native-reanimated";

// High-performance SkSL Runtime Shader for old school CRT/VHS artifacts
const VHS_SHADER_SOURCE = `
  uniform float2 iResolution;
  uniform float iTime;

  // Pseudo-random noise generation for the fuzzy grain
  float randomNoise(float2 co) {
    return fract(
      sin(dot(co.xy, float2(12.9898, 78.233))) * 43758.5453
    );
  }

  half4 main(float2 pos) {
    float2 uv = pos / iResolution.xy;
    
    // 1. Horizontal tracking glitch bars
    float glitchValue = step(
      0.96,
      randomNoise(float2(iTime * 1.5, uv.y * 2.0))
    );
    float shiftX = sin(uv.y * 40.0 + iTime * 10.0) * 0.005 * glitchValue;
    
    // Apply wave distortion to coordinates
    float2 distortedUV = uv;
    distortedUV.x += shiftX;

    // 2. Rolling VHS Tracking distortion wave
    float rollSpeed = fract(iTime * 0.2);
    float waveY = step(0.0, 1.0 - abs(distortedUV.y - rollSpeed) * 15.0);
    distortedUV.x += sin(distortedUV.y * 100.0) * 0.003 * waveY;

    // 3. Procedural Analog Fuzz / Grain static
    float grain = randomNoise(
      distortedUV + float2(iTime * 0.1, iTime * 0.2)
    ) * 0.12;

    // 4. Moving Scanlines
    float scanline = sin(pos.y * 1.5 + iTime * 5.0) * 0.04;

    // 5. Chromatic Aberration Simulation (Base Cyber/Holo Cyan & Magenta Shift)
    // We sample channels with tiny layout offsets to create the old-school lens separation
    float3 baseColor = float3(0.0, 0.94, 1.0); // Cyan base tint for your holograph
    
    // Shift Red channel slightly left, Blue channel right
    float r = baseColor.r + (glitchValue * 0.4); 
    float g = baseColor.g - scanline - grain;
    float b = baseColor.b + (waveY * 0.35) - scanline - grain;
    
    // Subtle screen vignette (darkened edges)
    float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    vignette = clamp(pow(25.0 * vignette, 0.1), 0.0, 0.85);

    // Composite into a premultiplied low-opacity cyber-fuzz layer.
    float alpha = 0.18;
    float3 rgb = clamp(
      float3(r, g, b) * vignette,
      0.4,
      0.8
    );
    return half4(rgb * alpha, alpha);
  }
`;

interface VhsFuzzOverlayProps {
  width: number;
  height: number;
}

export function VhsFuzzOverlay({
  height,
  width,
}: VhsFuzzOverlayProps) {
  const clock = useClock();
  const reduceMotion = useReducedMotion();
  const effect = useMemo(
    () => Skia.RuntimeEffect.Make(VHS_SHADER_SOURCE),
    [],
  );
  const uniforms = useDerivedValue<Uniforms>(() => ({
    iResolution: [width, height],
    iTime: reduceMotion ? 0 : clock.get() / 1000,
  }));

  if (!effect || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      <Canvas
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={effect} uniforms={uniforms} />
        </Rect>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 3,
    overflow: "hidden",
    mixBlendMode: "screen",
  },
});
