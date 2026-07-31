import {
  BlurMask,
  Canvas,
  Fill,
  Image as SkiaImage,
  ImageShader,
  Shader,
  Skia,
  useClock,
  useImage,
  type DataSourceParam,
  type Uniforms,
} from "@shopify/react-native-skia";
import React, {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AdvancedHoloOverlay } from "@/components/scanner/advanced-holo-overlay";

const PHOTO_DEPTH_EFFECT = `
uniform shader photo;
uniform float2 resolution;
uniform float time;

float luminanceAt(float2 point) {
  half3 color = photo.eval(point).rgb;
  return dot(float3(color), float3(0.2126, 0.7152, 0.0722));
}

float edgeAt(float2 point) {
  float spread = 1.8;
  float topLeft = luminanceAt(point + float2(-spread, -spread));
  float top = luminanceAt(point + float2(0.0, -spread));
  float topRight = luminanceAt(point + float2(spread, -spread));
  float left = luminanceAt(point + float2(-spread, 0.0));
  float right = luminanceAt(point + float2(spread, 0.0));
  float bottomLeft = luminanceAt(point + float2(-spread, spread));
  float bottom = luminanceAt(point + float2(0.0, spread));
  float bottomRight = luminanceAt(point + float2(spread, spread));

  float gradientX =
    -topLeft - 2.0 * left - bottomLeft +
    topRight + 2.0 * right + bottomRight;
  float gradientY =
    -topLeft - 2.0 * top - topRight +
    bottomLeft + 2.0 * bottom + bottomRight;

  return clamp(length(float2(gradientX, gradientY)) * 0.72, 0.0, 1.0);
}

half4 main(float2 point) {
  float2 safeResolution = max(resolution, float2(1.0));
  float2 uv = point / safeResolution;
  float edge = edgeAt(point);
  float luminance = luminanceAt(point);
  float centerField = clamp(
    1.0 - length((uv - float2(0.5)) * float2(1.12, 0.86)),
    0.0,
    1.0
  );
  float depth = clamp(
    luminance * 0.32 + edge * 0.82 + centerField * 0.18,
    0.0,
    1.0
  );

  float contourCell = abs(
    fract(depth * 8.0 + time * 0.022) - 0.5
  );
  float contour = smoothstep(0.468, 0.497, contourCell);
  float edgeMask = smoothstep(0.07, 0.34, edge);
  float contourSignal = contour * edgeMask * 0.10;

  float2 sampledPoint = clamp(
    point,
    float2(0.0),
    safeResolution
  );
  half3 original = photo.eval(sampledPoint).rgb;
  float monochrome = dot(
    float3(original),
    float3(0.2126, 0.7152, 0.0722)
  );
  half3 imageBleed = mix(
    half3(monochrome),
    original,
    0.18
  ) * 0.10;

  half3 violet = half3(0.553, 0.447, 1.0);
  half3 cyan = half3(0.0, 0.949, 0.996);
  half3 gold = half3(0.949, 0.827, 0.541);

  float scanBand = exp(
    -pow(
      (uv.y - fract(time * 0.075)) * 56.0,
      2.0
    )
  );
  half3 wireColor = mix(
    cyan,
    gold,
    scanBand * 0.20 +
      smoothstep(0.84, 1.0, depth) * 0.10
  );
  float vignette = smoothstep(
    0.92,
    0.20,
    length((uv - float2(0.5)) * float2(0.88, 0.72))
  );
  half3 color =
    imageBleed +
    wireColor * edgeMask * (0.90 + scanBand * 0.42) +
    violet * contourSignal * 0.38;
  color *= 0.48 + vignette * 0.52;

  float scanLines =
    0.78 +
    smoothstep(
      0.42,
      0.50,
      abs(fract(uv.y * safeResolution.y * 0.46) - 0.5)
    ) * 0.22;
  float signalFlicker =
    0.94 +
    sin(time * 24.0) * 0.025 +
    sin(time * 41.0) * 0.012;
  float sourceAlpha = photo.eval(sampledPoint).a;
  float alpha = clamp(
    (
      edgeMask * 0.78 +
      monochrome * 0.10 +
      scanBand * edgeMask * 0.10
    ) *
      sourceAlpha *
      (0.48 + vignette * 0.52) *
      signalFlicker,
    0.0,
    0.90
  );

  return half4(color * scanLines * 0.95, alpha);
}
`;

type PhotoDepthWireframeProps = {
  height: number;
  onError?: (message: string) => void;
  photoBytes?: ArrayBuffer | Uint8Array;
  photoUri?: string;
  style?: StyleProp<ViewStyle>;
  width: number;
};

function normalizedPhotoSource(
  photoBytes: ArrayBuffer | Uint8Array | undefined,
  photoUri: string | undefined,
): DataSourceParam {
  if (photoBytes) {
    return photoBytes instanceof Uint8Array
      ? photoBytes
      : new Uint8Array(photoBytes);
  }

  return photoUri?.trim() || null;
}

export function PhotoDepthWireframe({
  height,
  onError,
  photoBytes,
  photoUri,
  style,
  width,
}: PhotoDepthWireframeProps): React.JSX.Element | null {
  const source = useMemo(
    () => normalizedPhotoSource(photoBytes, photoUri),
    [photoBytes, photoUri],
  );
  const reportImageError = useCallback(
    (error: Error) => {
      onError?.(
        error.message ||
          "KeepFlip could not decode the captured photo depth field.",
      );
    },
    [onError],
  );
  const image = useImage(source, reportImageError);
  const clock = useClock();
  const reduceMotion = useReducedMotion();
  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  const signalGlitch = useSharedValue(0);
  const effect = useMemo(
    () => Skia.RuntimeEffect.Make(PHOTO_DEPTH_EFFECT),
    [],
  );
  const imageRect = useMemo(
    () => Skia.XYWHRect(0, 0, width, height),
    [height, width],
  );
  const uniforms = useDerivedValue<Uniforms>(() => ({
    resolution: [width, height],
    time: clock.get() / 1000,
  }));
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + reveal.get() * 0.78,
    transform: [
      { translateX: signalGlitch.get() * 2.4 },
      { scaleY: 0.06 + reveal.get() * 0.94 },
    ],
  }));

  useEffect(() => {
    if (!image) {
      return;
    }

    if (reduceMotion) {
      reveal.set(1);
      signalGlitch.set(0);
      return;
    }

    reveal.set(0);
    reveal.set(
      withSequence(
        withTiming(0.08, {
          duration: 90,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0.7, {
          duration: 260,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0.3, {
          duration: 80,
          easing: Easing.linear,
        }),
        withTiming(1, {
          duration: 480,
          easing: Easing.out(Easing.cubic),
        }),
      ),
    );
    signalGlitch.set(
      withRepeat(
        withSequence(
          withDelay(1700, withTiming(1, { duration: 45 })),
          withTiming(-0.8, { duration: 55 }),
          withTiming(0.35, { duration: 45 }),
          withTiming(0, { duration: 70 }),
          withDelay(920, withTiming(0, { duration: 1 })),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(reveal);
      cancelAnimation(signalGlitch);
    };
  }, [
    image,
    reduceMotion,
    reveal,
    signalGlitch,
  ]);

  if (
    !source ||
    !image ||
    !effect ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        style,
        animatedStyle,
      ]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <SkiaImage
          fit="cover"
          height={height}
          image={image}
          opacity={0.18}
          width={width}
          x={0}
          y={0}
        />
        <Fill
          blendMode="screen"
          opacity={0.42}
        >
          <Shader source={effect} uniforms={uniforms}>
            <ImageShader
              fit="cover"
              image={image}
              rect={imageRect}
              tx="decal"
              ty="decal"
            />
          </Shader>
          <BlurMask
            blur={10}
            style="normal"
          />
        </Fill>
        <Fill>
          <Shader source={effect} uniforms={uniforms}>
            <ImageShader
              fit="cover"
              image={image}
              rect={imageRect}
              tx="decal"
              ty="decal"
            />
          </Shader>
        </Fill>
      </Canvas>

      <AdvancedHoloOverlay
        height={height}
        width={width}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
});
