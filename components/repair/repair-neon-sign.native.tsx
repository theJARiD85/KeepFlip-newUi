import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Paint,
  RadialGradient,
  Skia,
  useClock,
  useSVG,
  vec,
  type SkImage,
  type SkSVG,
} from "@shopify/react-native-skia";
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  useDerivedValue,
  useReducedMotion,
} from "react-native-reanimated";

const FIX_SVG = require("@/assets/images/fix.svg");

const ARTBOARD_SIZE = 512;
const STAGE_HEIGHT = 314;
const COLOR_PRESERVING_LIGHT_MATRIX = [
  1.12, 0.02, 0.02, 0, 0.015,
  0.02, 1.12, 0.02, 0, 0.015,
  0.02, 0.02, 1.12, 0, 0.02,
  0, 0, 0, 1, 0,
];

type RepairNeonSignProps = {
  onSignError?: (message: string) => void;
  onSignReady?: () => void;
  style?: StyleProp<ViewStyle>;
};

function rasterizeSvg(svg: SkSVG): SkImage | null {
  const surface = Skia.Surface.MakeOffscreen(
    ARTBOARD_SIZE,
    ARTBOARD_SIZE,
  );

  if (!surface) return null;

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color("#00000000"));
  canvas.drawSvg(svg, ARTBOARD_SIZE, ARTBOARD_SIZE);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  return snapshot.makeNonTextureImage() ?? snapshot;
}

function NeonArtwork({
  onSignError,
  onSignReady,
}: Pick<RepairNeonSignProps, "onSignError" | "onSignReady">): ReactNode {
  const { width } = useWindowDimensions();
  const signSize = Math.min(width * 0.7, 258);
  const signX = (width - signSize) / 2;
  const signY = (STAGE_HEIGHT - signSize) / 2 - 4;
  const center = vec(width / 2, STAGE_HEIGHT / 2);
  const reduceMotion = useReducedMotion();
  const signSvg = useSVG(FIX_SVG, (error) => {
    onSignError?.(error.message || "KeepFlip could not load fix.svg.");
  });
  const signImage = useMemo(
    () => (signSvg ? rasterizeSvg(signSvg) : null),
    [signSvg],
  );
  const notifiedReady = useRef(false);
  const notifiedError = useRef(false);
  const clock = useClock();
  const neonEnergy = useDerivedValue(() => {
    if (reduceMotion) return 0.82;

    const time = clock.get();
    const breathing = (Math.sin(time / 720) + 1) * 0.5;
    const transformerBuzz =
      Math.sin(time / 46) * 0.045 +
      Math.sin(time / 109 + 1.4) * 0.034 +
      Math.sin(time / 23 + 2.3) * 0.026;
    const ignitionFlash =
      Math.pow(Math.max(0, Math.sin(time / 370 + 0.6)), 18) * 0.2;
    const tubeDip =
      Math.pow(Math.max(0, Math.sin(time / 265 - 1.2)), 22) * 0.18;

    return Math.max(
      0.42,
      Math.min(
        1,
        0.62 + breathing * 0.21 + transformerBuzz + ignitionFlash - tubeDip,
      ),
    );
  }, [clock, reduceMotion]);
  const ambientGlowOpacity = useDerivedValue(
    () => 0.05 + neonEnergy.get() * 0.18,
  );
  const wideBloomOpacity = useDerivedValue(
    () => 0.16 + neonEnergy.get() * 0.62,
  );
  const hotGlowOpacity = useDerivedValue(
    () => 0.12 + neonEnergy.get() * 0.73,
  );
  const filamentBloomOpacity = useDerivedValue(
    () => 0.08 + neonEnergy.get() * 0.42,
  );
  const ringOpacity = useDerivedValue(
    () => 0.025 + neonEnergy.get() * 0.14,
  );
  const wideBloomBlur = useDerivedValue(
    () => 22 + neonEnergy.get() * 38,
  );
  const hotBloomBlur = useDerivedValue(
    () => 5 + neonEnergy.get() * 15,
  );
  const filamentBloomBlur = useDerivedValue(
    () => 1.4 + neonEnergy.get() * 3.4,
  );
  const outerOrbitRadius = useDerivedValue(
    () => signSize * 0.55 + neonEnergy.get() * 8,
    [signSize],
  );
  const innerOrbitRadius = useDerivedValue(
    () => signSize * 0.45 + neonEnergy.get() * 5,
    [signSize],
  );
  const goldOrbitRadius = useDerivedValue(
    () => signSize * 0.38 + neonEnergy.get() * 3,
    [signSize],
  );
  const centerGlowRadius = useDerivedValue(
    () => 1.8 + neonEnergy.get() * 2.6,
  );
  const tubeOpacity = useDerivedValue(
    () => 0.58 + neonEnergy.get() * 0.42,
  );
  const energizedCoreOpacity = useDerivedValue(
    () => 0.035 + neonEnergy.get() * 0.22,
  );

  useEffect(() => {
    if (signImage && !notifiedReady.current) {
      notifiedReady.current = true;
      onSignReady?.();
      return;
    }

    if (signSvg && !signImage && !notifiedError.current) {
      notifiedError.current = true;
      onSignError?.("KeepFlip could not prepare the fix.svg neon sign.");
    }
  }, [onSignError, onSignReady, signImage, signSvg]);

  useEffect(() => {
    return () => {
      signImage?.dispose();
    };
  }, [signImage]);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group opacity={ambientGlowOpacity}>
        <Circle c={vec(width * 0.72, STAGE_HEIGHT * 0.33)} r={142}>
          <RadialGradient
            c={vec(width * 0.72, STAGE_HEIGHT * 0.33)}
            colors={[
              "rgba(0, 255, 255, 0.42)",
              "rgba(0, 255, 255, 0)",
            ]}
            r={142}
          />
        </Circle>
        <Circle c={vec(width * 0.25, STAGE_HEIGHT * 0.67)} r={152}>
          <RadialGradient
            c={vec(width * 0.25, STAGE_HEIGHT * 0.67)}
            colors={[
              "rgba(141, 114, 255, 0.38)",
              "rgba(141, 114, 255, 0)",
            ]}
            r={152}
          />
        </Circle>
        <Circle c={center} r={104}>
          <RadialGradient
            c={center}
            colors={[
              "rgba(242, 211, 138, 0.18)",
              "rgba(242, 211, 138, 0)",
            ]}
            r={104}
          />
        </Circle>
      </Group>

      <Group opacity={ringOpacity}>
        <Circle
          c={center}
          color="rgba(0, 255, 255, 0.54)"
          r={outerOrbitRadius}
          strokeWidth={1.2}
          style="stroke"
        >
          <BlurMask blur={hotBloomBlur} style="solid" />
        </Circle>
        <Circle
          c={center}
          color="rgba(141, 114, 255, 0.58)"
          r={innerOrbitRadius}
          strokeWidth={0.8}
          style="stroke"
        />
        <Circle
          c={center}
          color="rgba(242, 211, 138, 0.52)"
          r={goldOrbitRadius}
          strokeWidth={0.7}
          style="stroke"
        />
      </Group>

      {signImage ? (
        <>
          <Group opacity={wideBloomOpacity}>
            <SkiaImage
              fit="contain"
              height={signSize}
              image={signImage}
              width={signSize}
              x={signX}
              y={signY}
            >
              <Paint>
                <Blur blur={wideBloomBlur} mode="decal" />
              </Paint>
            </SkiaImage>
          </Group>
          <Group opacity={hotGlowOpacity}>
            <SkiaImage
              fit="contain"
              height={signSize}
              image={signImage}
              width={signSize}
              x={signX}
              y={signY}
            >
              <Paint>
                <Blur blur={hotBloomBlur} mode="decal" />
              </Paint>
            </SkiaImage>
          </Group>
          <Group opacity={filamentBloomOpacity}>
            <SkiaImage
              fit="contain"
              height={signSize}
              image={signImage}
              width={signSize}
              x={signX}
              y={signY}
            >
              <Paint>
                <Blur blur={filamentBloomBlur} mode="decal" />
              </Paint>
            </SkiaImage>
          </Group>
          <Group opacity={tubeOpacity}>
            <SkiaImage
              fit="contain"
              height={signSize}
              image={signImage}
              width={signSize}
              x={signX}
              y={signY}
            />
          </Group>
          <Group opacity={energizedCoreOpacity}>
            <SkiaImage
              fit="contain"
              height={signSize}
              image={signImage}
              width={signSize}
              x={signX}
              y={signY}
            >
              <Paint>
                <ColorMatrix matrix={COLOR_PRESERVING_LIGHT_MATRIX} />
              </Paint>
            </SkiaImage>
          </Group>
        </>
      ) : null}

      <Circle
        c={center}
        color="rgba(255, 242, 210, 0.54)"
        r={centerGlowRadius}
      >
        <BlurMask blur={hotBloomBlur} style="solid" />
      </Circle>
      <Circle c={center} color="#FFF2D2" r={centerGlowRadius} />
    </Canvas>
  );
}

export function RepairNeonSign({
  onSignError,
  onSignReady,
  style,
}: RepairNeonSignProps): React.JSX.Element {
  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      <NeonArtwork
        onSignError={onSignError}
        onSignReady={onSignReady}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
  },
});
