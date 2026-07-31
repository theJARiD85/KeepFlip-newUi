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

const ANIMATION_DURATION_MS = 40_000;
const ANIMATION_TIME_SPAN = 1_000;

const ADVANCED_HOLO_SHADER_SOURCE = `
  uniform float2 iResolution;
  uniform float iTime;

  // 1. High-frequency pseudo-random generator
  float hash(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    float selfDot = dot(p, p + float2(45.32));
    p += float2(selfDot);
    return fract(p.x * p.y);
  }

  // 2. Smooth 2D value noise for procedural displacement maps
  float smoothNoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (float2(3.0) - 2.0 * f);

    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  half4 main(float2 pos) {
    float2 safeResolution = max(iResolution, float2(1.0));
    float2 uv = pos / safeResolution;

    // --- EFFECT 1: PROCEDURAL DISPLACEMENT NOISE (WOBBLE) ---
    float displacementThreshold = smoothNoise(
      float2(iTime * 4.0, uv.y * 8.0)
    );
    float wobbleX = (
      smoothNoise(float2(uv.y * 30.0, iTime * 15.0)) - 0.5
    ) * 0.007;
    wobbleX += (
      hash(float2(iTime, uv.y)) - 0.5
    ) * 0.02 * step(0.97, displacementThreshold);

    float2 distortedUV = uv;
    distortedUV.x += wobbleX;

    // --- EFFECT 2: POWER SUPPLY FLICKER ---
    float baseFlicker = smoothNoise(float2(iTime * 25.0, 0.0));
    float microStutter = step(
      0.94,
      hash(float2(iTime, 12.3))
    );
    float finalFlicker = mix(
      0.88 + 0.12 * baseFlicker,
      0.4,
      microStutter * 0.3
    );

    // --- EFFECT 3: CHROMATIC GLOW & SEPARATION ---
    float staticGrain = (
      hash(distortedUV + float2(iTime)) - 0.5
    ) * 0.15;

    float rChannel = 0.0;
    float gChannel = 0.85 + staticGrain;
    float bChannel = 1.0 + microStutter * 0.2;

    // --- EFFECT 4: COMPRESSED SCANLINES & INTERLACE ---
    float fineGrid = sin(pos.y * 2.0) * 0.08;
    float heavyScanline = sin(pos.y * 0.2 - iTime * 6.0) * 0.15;
    float totalGrid = 0.5 + fineGrid + heavyScanline;

    // --- EFFECT 5: COLOR GRADING & VIGNETTE ---
    float centerDistance = length(uv - float2(0.5));
    float vignette = smoothstep(0.85, 0.2, centerDistance);

    float3 compositeColor = float3(
      rChannel,
      gChannel,
      bChannel
    ) * totalGrid * finalFlicker;

    compositeColor.g = clamp(
      compositeColor.g + centerDistance * 0.15,
      0.0,
      1.0
    );
    compositeColor *= vignette;

    float alpha = 0.25;
    return half4(compositeColor * alpha, alpha);
  }
`;

export interface AdvancedHoloOverlayProps {
  width: number;
  height: number;
}

export function AdvancedHoloOverlay({
  height,
  width,
}: AdvancedHoloOverlayProps) {
  const clock = useClock();
  const reduceMotion = useReducedMotion();
  const effect = useMemo(
    () => Skia.RuntimeEffect.Make(ADVANCED_HOLO_SHADER_SOURCE),
    [],
  );
  const bounds = useMemo(
    () => ({ height, width }),
    [height, width],
  );
  const uniforms = useDerivedValue<Uniforms>(() => ({
    iResolution: [width, height],
    iTime: reduceMotion
      ? 0
      : ((clock.get() % ANIMATION_DURATION_MS) /
          ANIMATION_DURATION_MS) *
        ANIMATION_TIME_SPAN,
  }));

  if (!effect || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.container, bounds]}
    >
      <Canvas
        pointerEvents="none"
        style={bounds}
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
