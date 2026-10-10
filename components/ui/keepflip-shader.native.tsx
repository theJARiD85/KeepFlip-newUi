import { Canvas, Fill, Shader, Skia, useClock, type Uniforms } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';

// SkSL port of the liquid marbling shader in the linked Figma Make project.
const LIQUID_MARBLING_SOURCE = `
  uniform float2 u_resolution;
  uniform float2 u_pointer;
  uniform float u_time;

  float hash(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    p += float2(dot(p, p + float2(45.32)));
    return fract(p.x * p.y);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (float2(3.0) - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + float2(1.0, 0.0)), f.x),
      mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0)), f.x),
      f.y
    );
  }

  float fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    float2x2 turn = float2x2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = turn * p * 2.03 + float2(9.7);
      amplitude *= 0.5;
    }
    return value;
  }

  float3 palette(float t) {
    float3 cyan = float3(0.014, 0.072, 0.076);
    float3 sky = float3(0.018, 0.054, 0.072);
    float3 violet = float3(0.038, 0.028, 0.070);
    float3 lilac = float3(0.052, 0.038, 0.082);
    float3 sand = float3(0.070, 0.052, 0.026);
    if (t < 0.22) return mix(cyan, sky, t / 0.22);
    if (t < 0.48) return mix(sky, lilac, (t - 0.22) / 0.26);
    if (t < 0.74) return mix(lilac, violet, (t - 0.48) / 0.26);
    return mix(violet, sand, (t - 0.74) / 0.26);
  }

  half4 main(float2 xy) {
    float2 resolution = max(u_resolution, float2(1.0));
    // Skia coordinates start at the top; WebGL fragment coordinates start below.
    float2 uv = float2(xy.x / resolution.x, 1.0 - xy.y / resolution.y);
    float aspect = resolution.x / resolution.y;
    float2 p = float2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.7;
    float t = u_time * 0.012;
    float2 pointer = (u_pointer - float2(0.5)) * float2(aspect, 1.0);
    float pull = 0.22 * exp(-5.0 * length(p * 0.45 - pointer));

    float2 q = float2(
      fbm(p + float2(0.0, t)),
      fbm(p + float2(5.2, -t * 0.7))
    );
    float2 r = float2(
      fbm(p + 3.7 * q + float2(1.7, 8.2) + float2(t)),
      fbm(p + 3.1 * q + float2(8.3, 2.8) - float2(t))
    );

    float field = fbm(p + 4.25 * r + pull * float2(0.8, -0.65));
    field += 0.12 * sin((p.y + r.x * 2.5) * 3.2);
    field = clamp(field, 0.0, 1.0);

    float stepped = floor(field * 8.0) / 8.0;
    float blend = smoothstep(0.38, 0.62, fract(field * 8.0));
    float bands = mix(stepped, stepped + 1.0 / 8.0, blend * 0.6);
    float3 color = palette(clamp(bands, 0.0, 1.0));

    float ridge = abs(fract(field * 11.0) - 0.5);
    float fineLine = 1.0 - smoothstep(0.455, 0.495, ridge);
    float hotLine = 1.0 - smoothstep(0.485, 0.499, ridge);
    float burstMap = fbm(p * 0.62 + r * 2.4 + float2(-t * 2.0, t));
    float goldBurst = smoothstep(0.62, 0.78, burstMap) * fineLine;
    float cyanMap = fbm(p * 0.82 - r * 1.8 + float2(t, -t * 0.7));
    float cyanPop = smoothstep(0.70, 0.86, cyanMap) * fineLine;
    float violetMap = noise(p * 18.0 + r * 7.0);
    float violetSpeck =
      smoothstep(0.91, 0.975, violetMap) *
      smoothstep(0.60, 0.78, fbm(p * 1.3 + float2(6.0, -3.0)));
    color = mix(color, float3(0.00, 0.48, 0.50), fineLine * 0.014);
    color = mix(color, float3(0.58, 0.42, 0.15), hotLine * 0.009);
    color = mix(color, float3(0.82, 0.56, 0.18), goldBurst * 0.32);
    color = mix(color, float3(0.00, 0.78, 0.80), cyanPop * 0.3);
    color = mix(color, float3(0.46, 0.28, 0.78), violetSpeck * 0.32);

    float glow = 0.08 * fbm(p * 3.0 + r * 2.0);
    color += glow * float3(0.008, 0.022, 0.024);
    color *= 0.90 + 0.06 * (1.0 - length(uv - float2(0.5)));
    return half4(color, 1.0);
  }
`;

export default function KeepFlipShader({ isLight = false }: { isLight?: boolean }) {
  const isFocused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const effect = useMemo(() => Skia.RuntimeEffect.Make(LIQUID_MARBLING_SOURCE), []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const uniforms = useDerivedValue<Uniforms>(() => ({
    u_resolution: [size.width, size.height],
    u_pointer: [0.5, 0.5],
    u_time: reduceMotion || !isFocused ? 0 : clock.get() / 1000,
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  };

  return (
    <View pointerEvents="none" onLayout={onLayout} style={styles.layer}>
      {isFocused && effect && size.width > 0 && size.height > 0 ? (
        <Canvas pointerEvents="none" style={[styles.canvas, isLight && styles.lightCanvas]}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  canvas: { ...StyleSheet.absoluteFill },
  lightCanvas: { opacity: 0.18 },
});
