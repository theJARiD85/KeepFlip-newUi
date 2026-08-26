import { requireNativeViewManager } from "expo-modules-core";
import { useRef, useState, type Ref } from "react";
import * as Haptics from "expo-haptics";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
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

type ARMeasureRef = {
  resetMeasurement(): Promise<void>;
};

type ARMeasureProps = ViewProps & {
  ref?: Ref<ARMeasureRef>;
  measurementMode?: "item" | "box";
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
};

const NativeARMeasureView =
  requireNativeViewManager<ARMeasureProps>(
    "KeepFlipARMeasure",
  );

export default function ARMeasureTestScreen() {
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

  const targetLabel = (() => {
    switch (target.state) {
      case "searching_item":
        return "AIM AT ITEM";
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
    pointerEvents="none"
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

    <Text style={styles.reticleLabel}>
        {targetLabel}
    </Text>
    </View>
      <SafeAreaView
        pointerEvents="box-none"
        style={styles.overlay}
      >
        <View style={styles.statusCard}>
          <Text style={styles.title}>
            KeepFlip AR Measure
          </Text>

          <Text style={styles.status}>
            Tracking: {tracking}
          </Text>

          <Text style={styles.status}>
            Mode: item extent scan
          </Text>

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
              Keep the item centered and make a slow, natural arc around it.
            </Text>
          )}

          {error ? (
            <Text style={styles.error}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    padding: 20,
  },

  statusCard: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },

  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },

  status: {
    color: "#fff",
    fontSize: 14,
  },

  instructions: {
    color: "#ddd",
    fontSize: 15,
    marginTop: 8,
  },

  measurement: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "700",
    marginTop: 8,
  },

  secondaryMeasurement: {
    color: "#ddd",
    fontSize: 18,
  },

  error: {
    color: "#ffb4b4",
    fontSize: 13,
    marginTop: 8,
  },

  button: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  reticleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "42%",
    alignItems: "center",
  },
  
  reticle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
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
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  
  reticleLabel: {
    marginTop: 12,
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  }
});