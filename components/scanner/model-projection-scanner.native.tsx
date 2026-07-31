import {
  BlurMask,
  Group,
  Line,
  LinearGradient,
  Oval,
  RadialGradient,
  Rect,
  Canvas as SkiaCanvas,
  vec,
} from "@shopify/react-native-skia";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { PhotoDepthWireframe } from "@/components/scanner/photo-depth-wireframe.native";
import { ProjectedPhotoStage } from "@/components/scanner/projected-photo-stage.native";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type PerspectiveGridLine = {
  color: string;
  key: string;
  opacity: number;
  p1: {
    x: number;
    y: number;
  };
  p2: {
    x: number;
    y: number;
  };
  strokeWidth: number;
};

type ModelProjectionScannerProps = {
  /**
   * Legacy experiment inputs remain accepted so archived scanner snapshots
   * continue to type-check. The active renderer intentionally ignores them.
   */
  modelBytes?: ArrayBuffer | Uint8Array;
  modelUrl?: string;
  photoBytes?: ArrayBuffer | Uint8Array;
  photoUri?: string;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

type HologramFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function ProjectionPhotoHologram({
  frame,
  onError,
  photoBytes,
  photoUri,
}: {
  frame: HologramFrame;
  onError?: (message: string) => void;
  photoBytes?: ArrayBuffer | Uint8Array;
  photoUri?: string;
}) {
  const frameInset = 5;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.hologramLayer,
        {
          height: frame.height,
          left: frame.x,
          top: frame.y,
          width: frame.width,
        },
      ]}
    >
      <SkiaCanvas
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <Rect
          color="rgba(88, 223, 232, 0.09)"
          height={frame.height - frameInset * 2}
          width={frame.width - frameInset * 2}
          x={frameInset}
          y={frameInset}
        >
          <BlurMask
            blur={20}
            style="normal"
          />
        </Rect>
        <Rect
          height={frame.height}
          width={frame.width}
          x={0}
          y={0}
        >
          <RadialGradient
            c={vec(
              frame.width * 0.5,
              frame.height * 0.48,
            )}
            colors={[
              "rgba(88, 223, 232, 0.05)",
              "rgba(141, 114, 255, 0.023)",
              "rgba(0, 0, 0, 0)",
            ]}
            positions={[0, 0.58, 1]}
            r={frame.width * 0.72}
          />
        </Rect>
      </SkiaCanvas>

      <PhotoDepthWireframe
        height={frame.height}
        onError={onError}
        photoBytes={photoBytes}
        photoUri={photoUri}
        style={styles.photoHologram}
        width={frame.width}
      />
    </View>
  );
}

function ProjectionBackground({
  height,
  perspectiveGridLines,
  width,
}: {
  height: number;
  perspectiveGridLines: PerspectiveGridLine[];
  width: number;
}) {
  return (
    <SkiaCanvas
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Rect
        height={height}
        width={width}
        x={0}
        y={0}
      >
        <LinearGradient
          colors={[
            "#0C0912",
            theme.colors.backgroundDeep,
            "#06040A",
          ]}
          end={vec(width, height)}
          positions={[0, 0.52, 1]}
          start={vec(0, 0)}
        />
      </Rect>

      <Rect
        height={height}
        width={width}
        x={0}
        y={0}
      >
        <RadialGradient
          c={vec(
            width * 0.76,
            height * 0.32,
          )}
          colors={[
            "rgba(88, 223, 232, 0.17)",
            "rgba(88, 223, 232, 0.045)",
            "rgba(88, 223, 232, 0)",
          ]}
          positions={[0, 0.38, 1]}
          r={Math.max(width, height) * 0.72}
        />
      </Rect>

      <Rect
        height={height}
        width={width}
        x={0}
        y={0}
      >
        <RadialGradient
          c={vec(
            width * 0.16,
            height * 0.58,
          )}
          colors={[
            "rgba(141, 114, 255, 0.15)",
            "rgba(141, 114, 255, 0.04)",
            "rgba(141, 114, 255, 0)",
          ]}
          positions={[0, 0.42, 1]}
          r={Math.max(width, height) * 0.68}
        />
      </Rect>

      <Rect
        height={height}
        width={width}
        x={0}
        y={0}
      >
        <RadialGradient
          c={vec(
            width * 0.54,
            height * 0.8,
          )}
          colors={[
            "rgba(215, 168, 74, 0.13)",
            "rgba(215, 168, 74, 0.025)",
            "rgba(215, 168, 74, 0)",
          ]}
          positions={[0, 0.35, 1]}
          r={Math.max(width, height) * 0.56}
        />
      </Rect>

      <Group>
        {perspectiveGridLines.map((line) => (
          <Line
            key={line.key}
            color={line.color}
            opacity={line.opacity}
            p1={line.p1}
            p2={line.p2}
            strokeWidth={line.strokeWidth}
          />
        ))}
      </Group>

      <Rect
        height={2}
        opacity={0.2}
        width={width}
        x={0}
        y={height * 0.66 - 1}
      >
        <LinearGradient
          colors={[
            "rgba(88, 223, 232, 0)",
            theme.colors.scannerCyan,
            theme.colors.goldBright,
            theme.colors.scannerViolet,
            "rgba(141, 114, 255, 0)",
          ]}
          end={vec(
            width,
            height * 0.66,
          )}
          positions={[
            0,
            0.28,
            0.52,
            0.72,
            1,
          ]}
          start={vec(
            0,
            height * 0.66,
          )}
        />
        <BlurMask
          blur={6}
          style="normal"
        />
      </Rect>

      <Oval
        color="rgba(0, 0, 0, 0.72)"
        height={height * 0.11}
        width={width * 0.66}
        x={width * 0.17}
        y={height * 0.755}
      >
        <BlurMask
          blur={22}
          style="normal"
        />
      </Oval>

      <Oval
        color="rgba(88, 223, 232, 0.11)"
        height={height * 0.055}
        width={width * 0.48}
        x={width * 0.26}
        y={height * 0.78}
      >
        <BlurMask
          blur={16}
          style="normal"
        />
      </Oval>
    </SkiaCanvas>
  );
}

function ProjectionForeground({
  height,
  scanGlowY,
  scanProgress,
  width,
}: {
  height: number;
  scanGlowY: ReturnType<typeof useDerivedValue<number>>;
  scanProgress: ReturnType<typeof useSharedValue<number>>;
  width: number;
}) {
  return (
    <SkiaCanvas
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Oval
        color="rgba(88, 223, 232, 0.08)"
        height={height * 0.34}
        width={width * 0.76}
        x={width * 0.12}
        y={height * 0.25}
      >
        <BlurMask
          blur={28}
          style="normal"
        />
      </Oval>

      <Rect
        height={16}
        opacity={0.22}
        width={width}
        x={0}
        y={scanGlowY}
      >
        <LinearGradient
          colors={[
            "rgba(88, 223, 232, 0)",
            theme.colors.scannerCyan,
            theme.colors.goldBright,
            theme.colors.scannerViolet,
            "rgba(141, 114, 255, 0)",
          ]}
          end={vec(width, 0)}
          positions={[
            0,
            0.24,
            0.5,
            0.76,
            1,
          ]}
          start={vec(0, 0)}
        />
        <BlurMask
          blur={6}
          style="normal"
        />
      </Rect>

      <Rect
        height={1.5}
        opacity={0.94}
        width={width}
        x={0}
        y={scanProgress}
      >
        <LinearGradient
          colors={[
            "rgba(88, 223, 232, 0)",
            theme.colors.scannerCyan,
            theme.colors.goldBright,
            theme.colors.scannerViolet,
            "rgba(141, 114, 255, 0)",
          ]}
          end={vec(width, 0)}
          positions={[
            0,
            0.26,
            0.5,
            0.74,
            1,
          ]}
          start={vec(0, 0)}
        />
      </Rect>
    </SkiaCanvas>
  );
}

export default function ModelProjectionScanner({
  photoBytes,
  photoUri,
  onError,
  style,
}: ModelProjectionScannerProps): React.JSX.Element {
  const hasPhotoSource = Boolean(
    photoUri?.trim() ||
      (photoBytes && photoBytes.byteLength > 0),
  );
  const [layout, setLayout] = useState({
    height: 0,
    width: 0,
  });

  const scanProgress = useSharedValue(0);
  const scanGlowY = useDerivedValue(
    () => scanProgress.get() - 8,
  );

  const perspectiveGridLines =
    useMemo<PerspectiveGridLine[]>(() => {
      if (
        layout.width <= 0 ||
        layout.height <= 0
      ) {
        return [];
      }

      const lines: PerspectiveGridLine[] = [];
      const horizonY = layout.height * 0.66;
      const vanishingX = layout.width * 0.52;

      for (let index = 0; index < 7; index += 1) {
        const progress = (index + 1) / 7;
        const y =
          horizonY +
          (layout.height - horizonY) *
            progress *
            progress;

        lines.push({
          color:
            index % 2 === 0
              ? theme.colors.scannerCyan
              : theme.colors.scannerViolet,
          key: `floor-horizontal-${index}`,
          opacity: 0.025 + progress * 0.075,
          p1: vec(0, y),
          p2: vec(layout.width, y),
          strokeWidth: 0.4 + progress * 0.35,
        });
      }

      for (let index = 0; index < 7; index += 1) {
        const progress = index / 6;

        lines.push({
          color:
            index === 3
              ? theme.colors.gold
              : theme.colors.scannerViolet,
          key: `floor-ray-${index}`,
          opacity: index === 3 ? 0.07 : 0.045,
          p1: vec(
            layout.width * progress,
            layout.height,
          ),
          p2: vec(vanishingX, horizonY),
          strokeWidth: index === 3 ? 0.75 : 0.55,
        });
      }

      return lines;
    }, [
      layout.height,
      layout.width,
    ]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, width } =
        event.nativeEvent.layout;

      setLayout({
        height,
        width,
      });
    },
    [],
  );

  useEffect(() => {
    if (layout.height <= 0) {
      return;
    }

    scanProgress.set(0);
    scanProgress.set(withRepeat(
      withTiming(layout.height, {
        duration: 3000,
        easing: Easing.bezier(
          0.42,
          0,
          0.58,
          1,
        ),
      }),
      -1,
      true,
    ));

    return () => {
      cancelAnimation(scanProgress);
    };
  }, [
    layout.height,
    scanProgress,
  ]);

  const hasLayout =
    layout.width > 0 &&
    layout.height > 0;
  const hologramFrame = useMemo<HologramFrame>(() => {
    const frameWidth = Math.min(
      layout.width * 0.8,
      420,
    );
    const heightReferenceWidth = Math.min(
      layout.width * 0.68,
      360,
    );
    const frameHeight = Math.max(
      190,
      Math.min(
        layout.height * 0.44 - 25,
        heightReferenceWidth * 1.22,
      ),
    );

    return {
      height: frameHeight,
      width: frameWidth,
      x: (layout.width - frameWidth) / 2,
      y: Math.max(
        126,
        layout.height * 0.17,
      ) + 15,
    };
  }, [
    layout.height,
    layout.width,
  ]);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        style,
      ]}
    >
      {hasLayout ? (
        <ProjectionBackground
          height={layout.height}
          perspectiveGridLines={perspectiveGridLines}
          width={layout.width}
        />
      ) : null}

      {hasLayout && hasPhotoSource ? (
        <ProjectedPhotoStage
          onError={onError}
          photoBytes={photoBytes}
          photoUri={photoUri}
          projectionFrame={{
            centerYRatio:
              (hologramFrame.y +
                hologramFrame.height / 2) /
              layout.height,
            heightRatio:
              hologramFrame.height /
              layout.height,
            widthRatio:
              hologramFrame.width /
              layout.width,
          }}
          style={styles.projectionLayer}
        />
      ) : null}

      {hasLayout && hasPhotoSource ? (
        <ProjectionPhotoHologram
          frame={hologramFrame}
          onError={onError}
          photoBytes={photoBytes}
          photoUri={photoUri}
        />
      ) : null}

      {hasLayout ? (
        <ProjectionForeground
          height={layout.height}
          scanGlowY={scanGlowY}
          scanProgress={scanProgress}
          width={layout.width}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.backgroundDeep,
    opacity: 1,
  },
  projectionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  hologramLayer: {
    position: "absolute",
    zIndex: 2,
    overflow: "hidden",
  },
  photoHologram: {
    ...StyleSheet.absoluteFill,
  },
});
