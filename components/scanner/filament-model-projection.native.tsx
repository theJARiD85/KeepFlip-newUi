import { Directory, File, Paths } from "expo-file-system";
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
  setLogger,
  type BufferSource,
  type Float3,
  type RenderCallback,
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";

const MODEL_CACHE_DIRECTORY = "keepflip-filament-models";
const MODEL_PROJECTION_SCALE = 0.4;
const MODEL_PROJECTION_OFFSET_Y = 0.13;
const MODEL_ROTATION_RADIANS_PER_SECOND = 0.42;
const MODEL_TILT_X = -0.32;

const silentLog = () => {};

/*
 * The result projection is intentionally silent. Filament's load/render loop
 * runs continuously, so debug logging here would contend with the JS thread
 * and flood Logcat without adding actionable runtime information.
 */
setLogger({
  debug: silentLog,
  error: silentLog,
  info: silentLog,
  warn: silentLog,
});

type FilamentModelProjectionProps = {
  modelBytes?: ArrayBuffer | Uint8Array;
  modelUrl?: string;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

type FilamentProjectionErrorBoundaryProps = {
  children: ReactNode;
  onError?: (message: string) => void;
};

type FilamentProjectionErrorBoundaryState = {
  failed: boolean;
};

class FilamentProjectionErrorBoundary extends Component<
  FilamentProjectionErrorBoundaryProps,
  FilamentProjectionErrorBoundaryState
> {
  state: FilamentProjectionErrorBoundaryState = {
    failed: false,
  };

  static getDerivedStateFromError(): FilamentProjectionErrorBoundaryState {
    return {
      failed: true,
    };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(
      error.message ||
        "KeepFlip could not render the generated 3D model.",
    );
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function normalizedModelBytes(
  modelBytes: ArrayBuffer | Uint8Array,
): Uint8Array {
  if (modelBytes instanceof Uint8Array) {
    return modelBytes;
  }

  return new Uint8Array(modelBytes);
}

function sourceFingerprint(
  modelBytes: ArrayBuffer | Uint8Array,
): string {
  const bytes = normalizedModelBytes(modelBytes);
  let hash = 2166136261;
  const sampleCount = Math.min(bytes.byteLength, 96);

  for (let index = 0; index < sampleCount; index += 1) {
    const offset =
      sampleCount === 1
        ? 0
        : Math.floor(
            (index * (bytes.byteLength - 1)) /
              (sampleCount - 1),
          );
    hash ^= bytes[offset] ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return `${bytes.byteLength}-${(hash >>> 0).toString(16)}`;
}

function useFilamentModelSource({
  modelBytes,
  modelUrl,
  onError,
}: Pick<
  FilamentModelProjectionProps,
  "modelBytes" | "modelUrl" | "onError"
>): BufferSource | null {
  const normalizedUrl = modelUrl?.trim() || null;
  const directSource = useMemo<BufferSource | null>(
    () =>
      normalizedUrl
        ? {
            uri: normalizedUrl,
          }
        : null,
    [normalizedUrl],
  );
  const [cachedSource, setCachedSource] =
    useState<BufferSource | null>(null);

  useEffect(() => {
    let active = true;

    if (normalizedUrl) {
      return () => {
        active = false;
      };
    }

    void Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      if (!modelBytes || modelBytes.byteLength === 0) {
        setCachedSource(null);
        return;
      }

      try {
        const bytes = normalizedModelBytes(modelBytes);
        const cacheDirectory = new Directory(
          Paths.cache,
          MODEL_CACHE_DIRECTORY,
        );
        cacheDirectory.create({
          idempotent: true,
          intermediates: true,
        });

        const modelFile = new File(
          cacheDirectory,
          `${sourceFingerprint(bytes)}.glb`,
        );

        if (
          !modelFile.exists ||
          modelFile.size !== bytes.byteLength
        ) {
          modelFile.write(bytes);
        }

        if (active) {
          setCachedSource({
            uri: modelFile.uri,
          });
        }
      } catch (caught: unknown) {
        if (active) {
          setCachedSource(null);
          onError?.(
            caught instanceof Error
              ? caught.message
              : "KeepFlip could not prepare the saved 3D model.",
          );
        }
      }
    });

    return () => {
      active = false;
    };
  }, [
    modelBytes,
    normalizedUrl,
    onError,
  ]);

  return directSource ?? cachedSource;
}

function FilamentProjectionScene({
  source,
}: {
  source: BufferSource;
}) {
  const rotation = useSharedValue<Float3>([
    MODEL_TILT_X,
    0,
    0,
  ]);

  const renderCallback = useCallback<RenderCallback>(
    (frameInfo) => {
      "worklet";

      // react-native-worklets-core shared values are intentionally mutable.
      // eslint-disable-next-line react-hooks/immutability
      rotation.value = [
        MODEL_TILT_X,
        frameInfo.passedSeconds *
          MODEL_ROTATION_RADIANS_PER_SECOND,
        0,
      ];
    },
    [rotation],
  );

  const scale = useMemo<Float3>(
    () => [
      MODEL_PROJECTION_SCALE,
      MODEL_PROJECTION_SCALE,
      MODEL_PROJECTION_SCALE,
    ],
    [],
  );

  const translation = useMemo<Float3>(
    () => [
      0,
      MODEL_PROJECTION_OFFSET_Y,
      0,
    ],
    [],
  );

  return (
    <FilamentView
      renderCallback={renderCallback}
      style={styles.filamentView}
    >
      <Camera
        cameraPosition={[0, 0, 1.55]}
        cameraTarget={[0, 0, 0]}
        far={10}
        focalLengthInMillimeters={35}
        near={0.1}
      />
      <DefaultLight />
      <Model
        castShadow={false}
        receiveShadow={false}
        rotate={rotation}
        scale={scale}
        source={source}
        transformToUnitCube
        translate={translation}
      />
    </FilamentView>
  );
}

export function FilamentModelProjection({
  modelBytes,
  modelUrl,
  onError,
  style,
}: FilamentModelProjectionProps): React.JSX.Element | null {
  const source = useFilamentModelSource({
    modelBytes,
    modelUrl,
    onError,
  });

  if (!source) {
    return null;
  }

  const sourceKey =
    typeof source === "object" &&
    source !== null &&
    "uri" in source
      ? String(source.uri)
      : "bundled-model";

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
    >
      <FilamentProjectionErrorBoundary
        key={sourceKey}
        onError={onError}
      >
        <FilamentScene>
          <FilamentProjectionScene source={source} />
        </FilamentScene>
      </FilamentProjectionErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
  },
  filamentView: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
});
