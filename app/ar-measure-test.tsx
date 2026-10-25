import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import * as Haptics from "expo-haptics";
import { requireNativeViewManager } from "expo-modules-core";
import { useCallback, useRef, useState, type Ref } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  releasePhotoBackgroundPreview,
  removePhotoBackgroundWithBiRefNet,
} from "@/services/photo-background-removal.native";
type TrackingEvent = {
  state: string;
  reason?: string;
};

type PointEvent = {
  index: number;
  x: number;
  y: number;
  z: number;
};

type BoxMeasurementEvent = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  lengthInches: number;
  widthInches: number;
  heightInches: number;
};

type ItemMeasurementEvent = BoxMeasurementEvent & {
  kind: "item_extents";
  shapeFamily: "unknown";
  confidence: number;
  sampleCount: number;
  cameraMotionMeters: number;
};

type TargetEvent = {
  state:
  | "searching"
  | "searching_corner"
  | "searching_item"
  | "checking_tap_foreground"
  | "tap_not_foreground"
  | "item_depth_required"
  | "scanning_item"
  | "move_around_item"
  | "corner_no_depth"
  | "stabilizing"
  | "locked"
  | "move_to_next"
  | "third_point_not_perpendicular"
  | "finding_support_plane"
  | "complete";

  progress: number;
};

type ErrorEvent = {
  code: string;
  message: string;
};

type BiRefNetTapFrameEvent = {
  requestId: number;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  tapImageX: number;
  tapImageY: number;
};

type ARMeasureRef = {
  resetMeasurement(): Promise<void>;
};

type ARMeasureProps = ViewProps & {
  ref?: Ref<ARMeasureRef>;
  measurementMode?: "item" | "box";
  biRefNetTapValidation?: boolean;
  tapMaskDecision?: string;
  onTrackingState?: (event: {
    nativeEvent: TrackingEvent;
  }) => void;

  onPointPlaced?: (event: {
    nativeEvent: PointEvent;
  }) => void;

  onTargetState?: (event: {
    nativeEvent: TargetEvent;
  }) => void;

  onBoxMeasurement?: (event: {
    nativeEvent: BoxMeasurementEvent;
  }) => void;

  onItemMeasurement?: (event: {
    nativeEvent: ItemMeasurementEvent;
  }) => void;

  onError?: (event: {
    nativeEvent: ErrorEvent;
  }) => void;

  onBiRefNetTapFrame?: (event: {
    nativeEvent: BiRefNetTapFrameEvent;
  }) => void;
};

const NativeARMeasureView =
  requireNativeViewManager<ARMeasureProps>(
    "KeepFlipARMeasure",
  );

export default function ARMeasureTestScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const arRef = useRef<ARMeasureRef | null>(null);

  const [tracking, setTracking] =
    useState("initializing");

  const [target, setTarget] =
    useState<TargetEvent>({
      state: "searching_item",
      progress: 0,
    });

  const [pointCount, setPointCount] =
    useState(0);

  const [measurement, setMeasurement] =
    useState<ItemMeasurementEvent | null>(null);

  const [error, setError] =
    useState<ErrorEvent | null>(null);

  const [tapMaskDecision, setTapMaskDecision] = useState<string | undefined>();
  const [tapAnalysis, setTapAnalysis] = useState<string | null>(null);
  const [tapAnalysisBusy, setTapAnalysisBusy] = useState(false);
  const activeTapRequestId = useRef<number | null>(null);

  const handleBiRefNetTapFrame = useCallback(async (event: { nativeEvent: BiRefNetTapFrameEvent }) => {
    const { requestId, imageUri, tapImageX, tapImageY } = event.nativeEvent;
    activeTapRequestId.current = requestId;
    setTapAnalysisBusy(true);
    setTapAnalysis("BiRefNet is checking the tap in the background. Keep scanning while ARCore measures the item.");
    let resultUri: string | null = null;
    try {
      const result = await removePhotoBackgroundWithBiRefNet(imageUri, {
        x: tapImageX,
        y: tapImageY,
      });
      resultUri = result.uri;
      if (activeTapRequestId.current !== requestId) return;
      const accepted = result.tapForeground === true;
      if (!accepted) {
        setPointCount(0);
        setMeasurement(null);
      }
      setTapMaskDecision(`${requestId}:${accepted ? "accept" : "reject"}`);
      setTapAnalysis(
        `BiRefNet tap: ${accepted ? "foreground" : "background"} · mask alpha ${result.tapMaskAlpha ?? 0}/255 · ${(result.inferenceMs / 1000).toFixed(1)}s · ${result.delegates.length ? result.delegates.join(", ") : "CPU"}`,
      );
    } catch (tapError) {
      if (activeTapRequestId.current === requestId) {
        setTapMaskDecision(`${requestId}:error`);
        setTapAnalysis(
          `BiRefNet tap check failed: ${tapError instanceof Error ? tapError.message : String(tapError)}`,
        );
      }
    } finally {
      releasePhotoBackgroundPreview(resultUri);
      releasePhotoBackgroundPreview(imageUri);
      if (activeTapRequestId.current === requestId) setTapAnalysisBusy(false);
    }
  }, []);

  const targetLabel = (() => {
    switch (target.state) {
      case "searching_item":
        return "TAP OBJECT TO START";
      case "checking_tap_foreground":
        return "CHECKING TAP WITH BIREFNET";
      case "tap_not_foreground":
        return "TAP THE ITEM FOREGROUND";
      case "item_depth_required":
        return "MOVE CLOSER / ADD LIGHT";
      case "scanning_item":
        return target.progress > 0
          ? `SCANNING ITEM ${Math.round(target.progress * 100)}%`
          : "MOVE SLOWLY AROUND ITEM";
      case "move_around_item":
        return "MOVE SLOWLY AROUND ITEM";
      case "stabilizing":
        return `HOLD STEADY ${Math.round(
          target.progress * 100,
        )}%`;
      case "move_to_next":
        return pointCount === 1
          ? "AIM AT SECOND CORNER"
          : "AIM AT ADJACENT CORNER";
      case "third_point_not_perpendicular":
        return "AIM AT ADJACENT CORNER";
      case "corner_no_depth":
        return "MOVE CLOSER TO CORNER";
      case "finding_support_plane":
        return "FINDING SUPPORT SURFACE";
      case "locked":
        return "POINT LOCKED";
      case "complete":
        return "MEASUREMENT LOCKED";
      default:
        return "AIM AT CORNER";
    }
  })();

  return (
    <View style={styles.container}>
      <NativeARMeasureView
        ref={arRef}
        style={StyleSheet.absoluteFill}
        measurementMode="item"
        biRefNetTapValidation
        tapMaskDecision={tapMaskDecision}
        onBiRefNetTapFrame={handleBiRefNetTapFrame}
        onTrackingState={(event) => {
          const next = event.nativeEvent;
          setTracking(
            next.reason
              ? `${next.state}: ${next.reason}`
              : next.state,
          );
        }}
        onTargetState={(event) => {
          setTarget(event.nativeEvent);
        }}
        onPointPlaced={(event) => {
          const index =
            event.nativeEvent.index;

          setPointCount(
            index + 1,
          );

          void Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Confirm,
          );
        }}
        onItemMeasurement={(event) => {
          setMeasurement(event.nativeEvent);
          void Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Confirm,
          );
        }}
        onError={(event) => {
          setError(
            event.nativeEvent,
          );
        }}
      />
      <View
        
        style={styles.reticleContainer}
      >
        <View
          style={[
            styles.reticle,
            target.state === "stabilizing" &&
            styles.reticleLocking,

            (
              target.state === "locked" ||
              target.state === "complete"
            ) &&
            styles.reticleLocked,
          ]}
        >
          <View style={styles.reticleDot} />
        </View>

        <Text style={[styles.reticleLabel, { fontSize: responsiveFont(12) }]}>
          {targetLabel}
        </Text>
      </View>
      <SafeAreaView
        style={styles.overlay}
      >
        <View style={styles.statusCard}>
          <Text style={[styles.title, { fontSize: responsiveFont(20) }]}>
            KeepFlip AR Measure
          </Text>

          <Text style={[styles.status, { fontSize: responsiveFont(14) }]}>
            Tracking: {tracking}
          </Text>

          <Text style={[styles.status, { fontSize: responsiveFont(14) }]}>
            Mode: silhouette wireframe scan
          </Text>

          <Text style={[styles.status, { fontSize: responsiveFont(13) }]}>
            BiRefNet checks the tap; ARCore depth supplies the dimensions.
          </Text>
          {tapAnalysis ? (
            <Text selectable style={[styles.status, { fontSize: responsiveFont(13) }]}>
              {tapAnalysisBusy ? "CHECKING · " : ""}{tapAnalysis}
            </Text>
          ) : null}

          {measurement ? (
            <>
              <Text style={styles.measurement}>
                {measurement.lengthCm.toFixed(1)} × {measurement.widthCm.toFixed(1)} × {measurement.heightCm.toFixed(1)} cm
              </Text>

              <Text style={styles.secondaryMeasurement}>
                {measurement.lengthInches.toFixed(2)} × {measurement.widthInches.toFixed(2)} × {measurement.heightInches.toFixed(2)} in
              </Text>
              <Text style={styles.secondaryMeasurement}>
                Confidence {Math.round(measurement.confidence * 100)}% · {measurement.sampleCount} depth samples
              </Text>
            </>
          ) : (
            <Text style={styles.instructions}>
              Tap the item, then make a slow, natural arc around it.
            </Text>
          )}

          {error ? (
            <Text style={[styles.error, { fontSize: responsiveFont(13) }]}>
              {error.code}: {error.message}
            </Text>
          ) : null}

          <Pressable
            style={styles.button}
            onPress={async () => {
              await arRef.current?.resetMeasurement();

              setPointCount(0);
              setMeasurement(null);
              setError(null);
              activeTapRequestId.current = null;
              setTapAnalysisBusy(false);
              setTapAnalysis(null);
              setTapMaskDecision(undefined);
            }}
          >
            <Text style={styles.buttonText}>
              Reset measurement
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.backgroundDeep,
    },

    overlay: {
      ...StyleSheet.absoluteFill,
      pointerEvents: "box-none",
      justifyContent: "flex-end",
      padding: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(20) : responsiveLayout.responsiveWidth(20),
    },

    statusCard: {
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.accentGoldBorder,
      borderWidth: 1,
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(20) : responsiveLayout.responsiveWidth(20),
      padding: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(18) : responsiveLayout.responsiveWidth(18),
      gap: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(6) : responsiveLayout.responsiveWidth(6),
    },

    title: {
      color: theme.colors.text,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(20) : responsiveLayout.responsiveFont(20),
      fontWeight: "700",
    },

    status: {
      color: theme.colors.text,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(14) : responsiveLayout.responsiveFont(14),
    },

    instructions: {
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(15) : responsiveLayout.responsiveFont(15),
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(8) : responsiveLayout.responsiveHeight(8),
    },

    measurement: {
      color: theme.colors.goldBright,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(34) : responsiveLayout.responsiveFont(34),
      fontWeight: "700",
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(8) : responsiveLayout.responsiveHeight(8),
    },

    secondaryMeasurement: {
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(18) : responsiveLayout.responsiveFont(18),
    },

    error: {
      color: theme.colors.danger,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(13) : responsiveLayout.responsiveFont(13),
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(8) : responsiveLayout.responsiveHeight(8),
    },

    button: {
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(12) : responsiveLayout.responsiveHeight(12),
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(14) : responsiveLayout.responsiveWidth(14),
      paddingVertical: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(12) : responsiveLayout.responsiveHeight(12),
      alignItems: "center",
    },

    buttonText: {
      color: theme.colors.scannerCyan,
      fontWeight: "600",
    },
    reticleContainer: {
      position: "absolute",
      pointerEvents: "none",
      left: 0,
      right: 0,
      top: "42%",
      alignItems: "center",
    },

    reticle: {
      width: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(58) : responsiveLayout.responsiveWidth(58),
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(58) : responsiveLayout.responsiveHeight(58),
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(29) : responsiveLayout.responsiveWidth(29),
      borderWidth: 2,
      borderColor: theme.colors.scannerCyan,
      alignItems: "center",
      justifyContent: "center",
    },

    reticleLocking: {
      borderWidth: 3,
    },

    reticleLocked: {
      borderWidth: 4,
    },

    reticleDot: {
      width: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(7) : responsiveLayout.responsiveWidth(7),
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(7) : responsiveLayout.responsiveHeight(7),
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(4) : responsiveLayout.responsiveWidth(4),
      backgroundColor: theme.colors.scannerCyan,
    },

    reticleLabel: {
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(12) : responsiveLayout.responsiveHeight(12),
      color: theme.colors.text,
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(12) : responsiveLayout.responsiveFont(12),
      fontWeight: "800",
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(1.4) : responsiveLayout.responsiveFont(1.4),
      backgroundColor: theme.colors.scrim,
      paddingHorizontal: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10),
      paddingVertical: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(6) : responsiveLayout.responsiveHeight(6),
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10),
    }
  });
  return {
    ...staticStyles,
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(20),
      },
    ],
    status: [
      staticStyles.status,
      {
        fontSize: responsiveFont(14),
      },
    ],
    instructions: [
      staticStyles.instructions,
      {
        fontSize: responsiveFont(15),
      },
    ],
    measurement: [
      staticStyles.measurement,
      {
        fontSize: responsiveFont(34),
      },
    ],
    secondaryMeasurement: [
      staticStyles.secondaryMeasurement,
      {
        fontSize: responsiveFont(18),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(13),
      },
    ],
    reticle: [
      staticStyles.reticle,
      {
        width: responsiveWidth(58),
        height: responsiveHeight(58),
      },
    ],
    reticleDot: [
      staticStyles.reticleDot,
      {
        width: responsiveWidth(7),
        height: responsiveHeight(7),
      },
    ],
    reticleLabel: [
      staticStyles.reticleLabel,
      {
        fontSize: responsiveFont(12),
      },
    ],
  };
}
