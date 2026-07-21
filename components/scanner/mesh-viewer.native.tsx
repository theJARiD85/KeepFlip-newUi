import { fetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Canvas } from "@react-three/fiber/native";
import { OrbitControls, useGLTF } from "@react-three/drei/native";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type MeshViewerProps = {
  jwt: string;
  modelUrl: string;
  projectId: string;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
  onLoad?: () => void;
};

type GeneratedModelProps = {
  uri: string;
  onLoad: () => void;
};

type ModelTransform = {
  position: [number, number, number];
  scale: number;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string | null;
  onError: (message: string) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

function safeDelete(file: File | null) {
  if (!file?.exists) return;

  try {
    file.delete();
  } catch {
    // Cache cleanup is best-effort.
  }
}

function assertGlb(bytes: Uint8Array) {
  const hasGlbHeader =
    bytes.byteLength >= 12 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46;

  if (!hasGlbHeader) {
    throw new Error(
      "The downloaded file is not a valid binary GLB model.",
    );
  }
}

function modelTransform(scene: THREE.Object3D): ModelTransform {
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) {
    return {
      position: [0, 0, 0],
      scale: 1,
    };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z, 0.0001);

  return {
    position: [-center.x, -center.y, -center.z],
    scale: 2.4 / largestDimension,
  };
}

function GeneratedModel({ uri, onLoad }: GeneratedModelProps) {
  const gltf = useGLTF(uri);
  const notifiedRef = useRef(false);

  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const transform = useMemo(() => modelTransform(scene), [scene]);

  useEffect(() => {
    if (notifiedRef.current) return;

    notifiedRef.current = true;
    onLoad();
  }, [onLoad]);

  return (
    <group scale={transform.scale}>
      <primitive object={scene} position={transform.position} />
    </group>
  );
}

class ModelErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(
      error.message || "The generated GLB could not be rendered.",
    );
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

export function MeshViewer({
  jwt,
  modelUrl,
  projectId,
  style,
  onError,
  onLoad,
}: MeshViewerProps) {
  const [localModelUri, setLocalModelUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const modelFileRef = useRef<File | null>(null);
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  const cacheKey = useMemo(() => {
    let hash = 0;
    const value = `${projectId}:${modelUrl}`;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
  }, [modelUrl, projectId]);

  useEffect(() => {
    let cancelled = false;
    let downloadedFile: File | null = null;

    setLocalModelUri(null);
    setLoadError(null);
    setIsModelLoaded(false);

    const downloadModel = async () => {
      try {
        const response = await fetch(modelUrl, {
          headers: {
            "X-Appwrite-JWT": jwt,
            "X-Appwrite-Project": projectId,
          },
        });

        if (!response.ok) {
          throw new Error(
            `Appwrite returned HTTP ${response.status} while downloading the generated model.`,
          );
        }

        const bytes = await response.bytes();
        if (bytes.byteLength === 0) {
          throw new Error("Appwrite returned an empty GLB model.");
        }

        assertGlb(bytes);

        downloadedFile = new File(
          Paths.cache,
          `keepflip-${cacheKey}.glb`,
        );
        downloadedFile.create({
          intermediates: true,
          overwrite: true,
        });
        downloadedFile.write(bytes);

        if (cancelled) {
          safeDelete(downloadedFile);
          return;
        }

        safeDelete(modelFileRef.current);
        modelFileRef.current = downloadedFile;
        setLocalModelUri(downloadedFile.uri);
      } catch (error) {
        safeDelete(downloadedFile);

        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : "The generated 3D model could not be downloaded.";

        setLoadError(message);
        onErrorRef.current?.(message);
      }
    };

    void downloadModel();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, jwt, modelUrl, projectId]);

  useEffect(
    () => () => {
      safeDelete(modelFileRef.current);
      modelFileRef.current = null;
    },
    [],
  );

  const handleModelLoaded = () => {
    setLoadError(null);
    setIsModelLoaded(true);
    onLoadRef.current?.();
  };

  const handleRenderError = (message: string) => {
    setLoadError(message);
    setIsModelLoaded(false);
    onErrorRef.current?.(message);
  };

  return (
    <View style={[styles.container, style]}>
      {localModelUri && !loadError ? (
        <ModelErrorBoundary
          onError={handleRenderError}
          resetKey={localModelUri}
        >
          <Canvas
            camera={{
              far: 100,
              fov: 42,
              near: 0.01,
              position: [0, 0.35, 4],
            }}
            dpr={[1, 1.5]}
            gl={{
              alpha: true,
              antialias: true,
            }}
            style={styles.canvas}
          >
            <ambientLight intensity={1.4} />
            <hemisphereLight
              color="#ffffff"
              groundColor="#202038"
              intensity={1.1}
            />
            <directionalLight
              intensity={2.2}
              position={[4, 6, 5]}
            />
            <directionalLight
              intensity={0.85}
              position={[-4, 2, -3]}
            />

            <Suspense fallback={null}>
              <GeneratedModel
                key={localModelUri}
                onLoad={handleModelLoaded}
                uri={localModelUri}
              />
            </Suspense>

            <OrbitControls
              autoRotate
              autoRotateSpeed={2}
              dampingFactor={0.08}
              enableDamping
              enablePan={false}
              enableZoom
              makeDefault
              maxDistance={8}
              minDistance={1.4}
              target={[0, 0, 0]}
            />
          </Canvas>
        </ModelErrorBoundary>
      ) : null}

      {!isModelLoaded && !loadError ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator
            color={theme.colors.scannerCyan}
            size="small"
          />
          <Text style={styles.loadingText}>
            {localModelUri
              ? "RENDERING 3D MODEL"
              : "DOWNLOADING 3D MODEL"}
          </Text>
        </View>
      ) : null}

      {loadError ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <Text style={styles.errorTitle}>3D VIEW UNAVAILABLE</Text>
          <Text selectable style={styles.errorMessage}>
            {loadError}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "rgba(3, 3, 7, 0.96)",
  },
  canvas: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: "rgba(3, 3, 7, 0.76)",
  },
  loadingText: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  errorTitle: {
    color: theme.colors.cream,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  errorMessage: {
    color: "rgba(255, 248, 231, 0.72)",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});