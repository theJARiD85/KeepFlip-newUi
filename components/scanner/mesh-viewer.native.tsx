import { Asset } from "expo-asset";
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
import { OrbitControls, useGLTF } from "@react-three/drei/native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type MeshViewerProps = {
  jwt?: string;
  modelUrl?: string;
  projectId?: string;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
  onLoad?: () => void;
};

type GeneratedModelProps = {
  compact: boolean;
  uri: string;
  onLoad: () => void;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string | null;
  onError: (message: string) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

type ParticleField = {
  baseX: Float32Array;
  baseZ: Float32Array;
  positions: Float32Array;
};

const CYAN = "#53e7ff";
const BLUE = "#138dff";
const DEEP_BLUE = "#06203a";

function modelTransform(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) {
    return {
      position: [0, 0, 0] as [number, number, number],
      scale: 1,
    };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z, 0.0001);

  return {
    position: [-center.x, -center.y, -center.z] as [
      number,
      number,
      number,
    ],
    scale: 2.4 / largestDimension,
  };
}

function createWireframeClone(scene: THREE.Object3D) {
  const clone = scene.clone(true);

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.material = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: CYAN,
      depthWrite: false,
      opacity: 0.38,
      toneMapped: false,
      transparent: true,
      wireframe: true,
    });
  });

  return clone;
}

function createGlowClone(scene: THREE.Object3D) {
  const clone = scene.clone(true);

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.material = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: BLUE,
      depthWrite: false,
      opacity: 0.09,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
    });
  });

  return clone;
}

function HologramModel({
  compact,
  uri,
  onLoad,
}: GeneratedModelProps) {
  const gltf = useGLTF(uri);
  const groupRef = useRef<THREE.Group>(null);
  const wireframeRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Group>(null);
  const notifiedRef = useRef(false);

  const baseScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const wireframeScene = useMemo(
    () => createWireframeClone(gltf.scene),
    [gltf.scene],
  );
  const glowScene = useMemo(
    () => createGlowClone(gltf.scene),
    [gltf.scene],
  );
  const transform = useMemo(() => modelTransform(baseScene), [baseScene]);

  useEffect(() => {
    if (notifiedRef.current) return;

    notifiedRef.current = true;
    onLoad();
  }, [onLoad]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.y =
        0.12 + Math.sin(elapsed * 1.15) * 0.055;
    }

    if (wireframeRef.current) {
      const wireframePulse =
        1.003 + (Math.sin(elapsed * 2.4) + 1) * 0.0018;
      wireframeRef.current.scale.setScalar(wireframePulse);

      wireframeRef.current.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.MeshBasicMaterial;
        material.opacity = 0.28 + (Math.sin(elapsed * 2.4) + 1) * 0.08;
      });
    }

    if (glowRef.current) {
      const pulse = 1.012 + (Math.sin(elapsed * 1.8) + 1) * 0.006;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  const presentationScale = transform.scale * (compact ? 0.5 : 1);

  return (
    <group
      ref={groupRef}
      position={[0, 0.12, 0]}
      scale={presentationScale}
    >
      <primitive object={baseScene} position={transform.position} />

      <group ref={glowRef}>
        <primitive
          object={glowScene}
          position={transform.position}
        />
      </group>

      <group ref={wireframeRef}>
        <primitive
          object={wireframeScene}
          position={transform.position}
        />
      </group>
    </group>
  );
}

function createParticleField(columns = 38, rows = 28): ParticleField {
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const baseX = new Float32Array(count);
  const baseZ = new Float32Array(count);

  let pointIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    const z = THREE.MathUtils.lerp(-5.8, 2.4, row / (rows - 1));

    for (let column = 0; column < columns; column += 1) {
      const x = THREE.MathUtils.lerp(
        -6.4,
        6.4,
        column / (columns - 1),
      );
      const offset = pointIndex * 3;

      baseX[pointIndex] = x;
      baseZ[pointIndex] = z;
      positions[offset] = x;
      positions[offset + 1] = -1.18;
      positions[offset + 2] = z;
      pointIndex += 1;
    }
  }

  return {
    baseX,
    baseZ,
    positions,
  };
}

function AnimatedParticleFloor() {
  const pointsRef = useRef<THREE.Points>(null);
  const field = useMemo(() => createParticleField(), []);

  useFrame(({ clock }) => {
    const points = pointsRef.current;
    if (!points) return;

    const elapsed = clock.getElapsedTime();
    const attribute = points.geometry.attributes
      .position as THREE.BufferAttribute;

    for (let index = 0; index < field.baseX.length; index += 1) {
      const offset = index * 3;
      const x = field.baseX[index];
      const z = field.baseZ[index];

      attribute.array[offset + 1] =
        -1.18 +
        Math.sin(x * 1.05 + elapsed * 1.55) * 0.07 +
        Math.cos(z * 1.4 - elapsed * 1.15) * 0.055;
    }

    attribute.needsUpdate = true;
    points.rotation.y = Math.sin(elapsed * 0.16) * 0.035;
  });

  return (
    <points ref={pointsRef} rotation={[-0.08, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          args={[field.positions, 3]}
          attach="attributes-position"
        />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        color={CYAN}
        depthWrite={false}
        opacity={0.82}
        size={0.035}
        sizeAttenuation
        toneMapped={false}
        transparent
      />
    </points>
  );
}

function PulseRing({
  delay,
  speed,
}: {
  delay: number;
  speed: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const cycle = (clock.getElapsedTime() * speed + delay) % 1;
    const scale = 0.55 + cycle * 2.4;
    mesh.scale.setScalar(scale);

    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = (1 - cycle) * 0.28;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, -1.11, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.72, 0.77, 96]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        color={CYAN}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function HologramBackdrop() {
  return (
    <>
      <AnimatedParticleFloor />
      <PulseRing delay={0} speed={0.34} />
      <PulseRing delay={0.34} speed={0.34} />
      <PulseRing delay={0.68} speed={0.34} />

      <mesh
        position={[0, -1.22, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.18, 96]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={BLUE}
          depthWrite={false}
          opacity={0.2}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>

      <pointLight
        color={CYAN}
        intensity={3.4}
        position={[0, -0.4, 1.4]}
      />
      <pointLight
        color={BLUE}
        intensity={2}
        position={[0, 1.2, -2]}
      />
    </>
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
      error.message || "The bundled GLB could not be rendered.",
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
  const isScannerPreview = Boolean(jwt || modelUrl || projectId);
  const [localModelUri, setLocalModelUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    let cancelled = false;

    const resolveBundledModel = async () => {
      try {
        const asset = Asset.fromModule(
          require("../../assets/models/VisionCamera_8975123418007050576.glb"),
        );

        if (!asset.localUri) {
          await asset.downloadAsync();
        }

        const uri = asset.localUri ?? asset.uri;
        if (!uri) {
          throw new Error(
            "Expo could not resolve the bundled GLB asset URI.",
          );
        }

        if (!cancelled) {
          setLocalModelUri(uri);
        }
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : "The bundled 3D model could not be prepared.";

        setLoadError(message);
        onErrorRef.current?.(message);
      }
    };

    setLocalModelUri(null);
    setLoadError(null);
    setIsModelLoaded(false);
    void resolveBundledModel();

    return () => {
      cancelled = true;
    };
  }, []);

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
      <View pointerEvents="none" style={styles.hologramWash} />
      <View pointerEvents="none" style={styles.horizonGlow} />

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
            <ambientLight intensity={0.75} />
            <hemisphereLight
              color="#dffaff"
              groundColor={DEEP_BLUE}
              intensity={1.25}
            />
            <directionalLight
              color="#ffffff"
              intensity={1.6}
              position={[4, 6, 5]}
            />

            <HologramBackdrop />

            <Suspense fallback={null}>
              <HologramModel
                compact={isScannerPreview}
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
              enableZoom={!isScannerPreview}
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
              ? "FORMING HOLOGRAPHIC MODEL"
              : "LOADING LOCAL 3D MODEL"}
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
    flex: 1,
    overflow: "hidden",
    backgroundColor: "rgba(1, 7, 16, 0.74)",
  },
  canvas: {
    flex: 1,
    backgroundColor: "transparent",
  },
  hologramWash: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 68%, rgba(15, 151, 255, 0.22) 0%, transparent 34%),
      radial-gradient(circle at 50% 45%, rgba(42, 222, 255, 0.10) 0%, transparent 44%),
      linear-gradient(to bottom, rgba(1, 7, 17, 0.90) 0%, rgba(1, 10, 24, 0.46) 58%, rgba(0, 5, 14, 0.88) 100%)
    `,
  },
  horizonGlow: {
    position: "absolute",
    right: "-20%",
    bottom: "15%",
    left: "-20%",
    height: "26%",
    opacity: 0.8,
    experimental_backgroundImage:
      "radial-gradient(ellipse at center, rgba(32, 191, 255, 0.26) 0%, rgba(6, 65, 120, 0.10) 42%, transparent 72%)",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: "rgba(1, 7, 16, 0.72)",
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
