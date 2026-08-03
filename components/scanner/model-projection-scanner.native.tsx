import { Image } from "expo-image";
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
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ProjectedPhotoStage } from "@/components/scanner/projected-photo-stage.native";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const PHOTO_FRAME_WIDTH = 300;
const PHOTO_FRAME_HEIGHT = 220;

export type ProjectionReadiness =
  | "ready"
  | "limited"
  | "not-ready";

type ModelProjectionScannerProps = {
  locked?: boolean;
  onError?: (message: string) => void;
  photoUri?: string | null;
  readiness?: ProjectionReadiness;
  style?: StyleProp<ViewStyle>;
};

type ImageFrame = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function readinessAccent(readiness: ProjectionReadiness) {
  if (readiness === "ready") return theme.colors.scannerCyan;
  if (readiness === "limited") return theme.colors.goldBright;
  return theme.colors.danger;
}

function readinessGlow(readiness: ProjectionReadiness) {
  if (readiness === "ready") {
    return {
      border: "rgba(0, 255, 255, 0.92)",
      boxShadow:
        "0 0 9px rgba(0, 255, 255, 0.78), 0 0 24px rgba(0, 255, 255, 0.38), 0 0 48px rgba(141, 114, 255, 0.16), 0 18px 42px rgba(0, 0, 0, 0.52)",
      horizon: "rgba(88, 223, 232, 0.7)",
      scan: "rgba(88, 223, 232, 0.88)",
    };
  }
  if (readiness === "limited") {
    return {
      border: "rgba(242, 211, 138, 0.88)",
      boxShadow:
        "0 0 9px rgba(242, 211, 138, 0.72), 0 0 24px rgba(215, 168, 74, 0.34), 0 0 48px rgba(141, 114, 255, 0.12), 0 18px 42px rgba(0, 0, 0, 0.52)",
      horizon: "rgba(242, 211, 138, 0.62)",
      scan: "rgba(242, 211, 138, 0.78)",
    };
  }
  return {
    border: "rgba(232, 97, 88, 0.88)",
    boxShadow:
      "0 0 9px rgba(232, 97, 88, 0.68), 0 0 24px rgba(232, 97, 88, 0.28), 0 0 48px rgba(141, 114, 255, 0.10), 0 18px 42px rgba(0, 0, 0, 0.52)",
    horizon: "rgba(232, 97, 88, 0.55)",
    scan: "rgba(232, 97, 88, 0.72)",
  };
}

export default function ModelProjectionScanner({
  locked = false,
  onError,
  photoUri,
  readiness = "ready",
  style,
}: ModelProjectionScannerProps): React.JSX.Element {
  const resolvedPhotoUri = photoUri?.trim() || null;
  const accent = readinessAccent(readiness);
  const glow = readinessGlow(readiness);

  const [layout, setLayout] = useState({
    height: 0,
    width: 0,
  });

  const scanProgress = useSharedValue(0);
  const hasLayout = layout.width > 0 && layout.height > 0;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setLayout({ height, width });
  }, []);

  /**
   * This is the single source of truth for both:
   * 1. The visible scanned-item image
   * 2. The Three.js projection plane
   *
   * Change PHOTO_FRAME_WIDTH and PHOTO_FRAME_HEIGHT above
   * to change both layers together.
   */
  const imageFrame = useMemo<ImageFrame>(() => {
    const left = (layout.width - PHOTO_FRAME_WIDTH) / 2;
    const top = Math.max(126, layout.height * 0.17) + 15;

    return {
      height: PHOTO_FRAME_HEIGHT,
      left,
      top,
      width: PHOTO_FRAME_WIDTH,
    };
  }, [layout.height, layout.width]);

  useEffect(() => {
    if (!hasLayout) return;

    const duration = locked ? 7200 : 3000;
    scanProgress.set(0);
    scanProgress.set(
      withRepeat(
        withTiming(layout.height, {
          duration,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(scanProgress);
    };
  }, [hasLayout, layout.height, locked, scanProgress]);

  const scanLineStyle = useAnimatedStyle(() => ({
    opacity: locked ? 0.34 : 0.82,
    transform: [{ translateY: scanProgress.get() }],
  }));

  const projectionFrame = useMemo(() => {
    if (!hasLayout) return undefined;

    return {
      centerYRatio:
        (imageFrame.top + imageFrame.height / 2) / layout.height,
      heightRatio: imageFrame.height / layout.height,
      widthRatio: imageFrame.width / layout.width,
    };
  }, [
    hasLayout,
    imageFrame.height,
    imageFrame.top,
    imageFrame.width,
    layout.height,
    layout.width,
  ]);

  return (
    <View onLayout={handleLayout} style={[styles.container, style]}>
      <View pointerEvents="none" style={styles.background} />

      <View
        pointerEvents="none"
        style={[
          styles.horizonGlow,
          { boxShadow: `0 0 42px ${glow.horizon}` },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.horizonLine,
          {
            backgroundColor: accent,
            boxShadow: `0 0 12px ${glow.horizon}`,
            opacity: locked ? 0.58 : 0.45,
          },
        ]}
      />

      {projectionFrame ? (
        <ProjectedPhotoStage
          onError={onError}
          projectionFrame={projectionFrame}
          style={styles.projectionLayer}
        />
      ) : null}

      {hasLayout && resolvedPhotoUri ? (
        <View
          style={[
            styles.photoProjectionFrame,
            {
              borderColor: glow.border,
              boxShadow: glow.boxShadow,
              height: imageFrame.height,
              left: imageFrame.left,
              top: imageFrame.top,
              width: imageFrame.width,
            },
          ]}
        >
          <Image
            accessibilityLabel="Scanned item"
            contentFit="cover"
            contentPosition="center"
            pointerEvents="none"
            source={{ uri: resolvedPhotoUri }}
            style={styles.photoOverlay}
            transition={180}
          />
          <View
            pointerEvents="none"
            style={[
              styles.photoInnerGlow,
              {
                borderColor:
                  readiness === "ready"
                    ? "rgba(220, 255, 255, 0.42)"
                    : readiness === "limited"
                      ? "rgba(255, 236, 196, 0.42)"
                      : "rgba(255, 210, 206, 0.42)",
              },
            ]}
          />
        </View>
      ) : null}

      {hasLayout ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { backgroundColor: accent, boxShadow: `0 0 12px ${glow.scan}` },
            scanLineStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
    top: 20,
  },

  background: {
    ...StyleSheet.absoluteFill,

    experimental_backgroundImage: `
      radial-gradient(
        circle at 76% 32%,
        rgba(88, 223, 232, 0.17) 0%,
        rgba(88, 223, 232, 0.045) 38%,
        rgba(88, 223, 232, 0) 72%
      ),
      radial-gradient(
        circle at 16% 58%,
        rgba(141, 114, 255, 0.15) 0%,
        rgba(141, 114, 255, 0.04) 42%,
        rgba(141, 114, 255, 0) 68%
      ),
      radial-gradient(
        circle at 54% 80%,
        rgba(215, 168, 74, 0.13) 0%,
        rgba(215, 168, 74, 0.025) 35%,
        rgba(215, 168, 74, 0) 56%
      ),
      linear-gradient(
        145deg,
        #0C0912 0%,
        ${theme.colors.backgroundDeep} 52%,
        #06040A 100%
      )
    `,
  },

  horizonGlow: {
    position: "absolute",
    right: "12%",
    bottom: "18%",
    left: "12%",
    height: 70,
    borderRadius: 999,
    backgroundColor: "rgba(88, 223, 232, 0.055)",
  },

  horizonLine: {
    position: "absolute",
    top: "66%",
    right: 0,
    left: 0,
    height: 1,
  },

  projectionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },

  photoProjectionFrame: {
    position: "absolute",
    zIndex: 2,
    overflow: "hidden",
    borderRadius: theme.radii.small,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "rgba(1, 6, 10, 0.74)",
  },

  photoOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: theme.radii.small,
    opacity: 0.6,
  },

  photoInnerGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: theme.radii.small,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow:
      "inset 0 0 16px rgba(0, 255, 255, 0.20), inset 0 -8px 22px rgba(141, 114, 255, 0.10)",
  },

  scanLine: {
    position: "absolute",
    zIndex: 3,
    top: 0,
    right: 0,
    left: 0,
    height: 2,
  },
});
