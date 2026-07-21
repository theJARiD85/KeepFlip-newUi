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
  colors: Float32Array;
  positions: Float32Array;
};

type SparkField = {
  colors: Float32Array;
  positions: Float32Array;
};

const CYAN = theme.colors.scannerCyan;
const AMBER = theme.colors.goldBright;
const VIOLET = "#8d72ff";
const ELECTRIC_GREEN = "#65ff7a";
const DEEP_VIOLET = "#24104d";
const DEEP_GREEN = "#082819";

const THREE_CYAN = new THREE.Color(CYAN);
const THREE_AMBER = new THREE.Color(AMBER);
const THREE_VIOLET = new THREE.Color(VIOLET);
const THREE_GREEN = new THREE.Color(ELECTRIC_GREEN);

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

function createOverlayClone(
  scene: THREE.Object3D,
  {
    color,
    opacity,
    wireframe = false,
  }: {
    color: string;
    opacity: number;
    wireframe?: boolean;
  },
) {
  const clone = scene.clone(true);

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.material = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      depthWrite: false,
      opacity,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
      wireframe,
    });
  });

  return clone;
}

function ScanSlice() {
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const beam = beamRef.current;
    if (!beam) return;

    const elapsed = clock.getElapsedTime();
    beam.position.y = Math.sin(elapsed * 1.45) * 1.15;

    const material = beam.material as THREE.MeshBasicMaterial;
    material.opacity = 0.11 + (Math.sin(elapsed * 4.4) + 1) * 0.045;
  });

  return (
    <mesh ref={beamRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.5, 3.5]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        color={ELECTRIC_GREEN}
        depthWrite={false}
        opacity={0.14}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function HologramModel({
  compact,
  uri,
  onLoad,
}: GeneratedModelProps) {
  const gltf = useGLTF(uri);
  const groupRef = useRef<THREE.Group>(null);
  const violetWireframeRef = useRef<THREE.Group>(null);
  const cyanWireframeRef = useRef<THREE.Group>(null);
  const amberGlowRef = useRef<THREE.Group>(null);
  const greenGlowRef = useRef<THREE.Group>(null);
  const notifiedRef = useRef(false);

  const baseScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const violetWireframeScene = useMemo(
    () =>
      createOverlayClone(gltf.scene, {
        color: VIOLET,
        opacity: 0.44,
        wireframe: true,
      }),
    [gltf.scene],
  );
  const cyanWireframeScene = useMemo(
    () =>
      createOverlayClone(gltf.scene, {
        color: CYAN,
        opacity: 0.26,
        wireframe: true,
      }),
    [gltf.scene],
  );
  const amberGlowScene = useMemo(
    () =>
      createOverlayClone(gltf.scene, {
        color: AMBER,
        opacity: 0.08,
      }),
    [gltf.scene],
  );
  const greenGlowScene = useMemo(
    () =>
      createOverlayClone(gltf.scene, {
        color: ELECTRIC_GREEN,
        opacity: 0.055,
      }),
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
        0.1 + Math.sin(elapsed * 1.15) * 0.065;
    }

    if (violetWireframeRef.current) {
      const pulse =
        1.004 + (Math.sin(elapsed * 2.5) + 1) * 0.0022;
      violetWireframeRef.current.scale.setScalar(pulse);
      violetWireframeRef.current.rotation.y =
        Math.sin(elapsed * 0.45) * 0.025;
      violetWireframeRef.current.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.MeshBasicMaterial;
        material.opacity =
          0.32 + (Math.sin(elapsed * 2.8) + 1) * 0.09;
      });
    }

    if (cyanWireframeRef.current) {
      const pulse =
        1.011 + (Math.cos(elapsed * 2.1) + 1) * 0.0025;
      cyanWireframeRef.current.scale.setScalar(pulse);
      cyanWireframeRef.current.rotation.y =
        -Math.sin(elapsed * 0.35) * 0.018;
    }

    if (amberGlowRef.current) {
      const pulse =
        1.018 + (Math.sin(elapsed * 1.7) + 1) * 0.007;
      amberGlowRef.current.scale.setScalar(pulse);
    }

    if (greenGlowRef.current) {
      const pulse =
        1.027 + (Math.cos(elapsed * 1.35) + 1) * 0.009;
      greenGlowRef.current.scale.setScalar(pulse);
    }
  });

  const presentationScale = transform.scale * (compact ? 0.5 : 1);

  return (
    <group
      ref={groupRef}
      position={[0, 0.1, 0]}
      scale={presentationScale}
    >
      <primitive object={baseScene} position={transform.position} />

      <group ref={amberGlowRef}>
        <primitive
          object={amberGlowScene}
          position={transform.position}
        />
      </group>

      <group ref={greenGlowRef}>
        <primitive
          object={greenGlowScene}
          position={transform.position}
        />
      </group>

      <group ref={violetWireframeRef}>
        <primitive
          object={violetWireframeScene}
          position={transform.position}
        />
      </group>

      <group ref={cyanWireframeRef}>
        <primitive
          object={cyanWireframeScene}
          position={transform.position}
        />
      </group>

      <ScanSlice />
    </group>
  );
}

function createParticleField(columns = 34, rows = 25): ParticleField {
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const baseX = new Float32Array(count);
  const baseZ = new Float32Array(count);

  const palette = [
    THREE_VIOLET,
    THREE_AMBER,
    THREE_GREEN,
    THREE_CYAN,
  ];

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
      const color =
        palette[(column + row * 2) % palette.length];

      baseX[pointIndex] = x;
      baseZ[pointIndex] = z;
      positions[offset] = x;
      positions[offset + 1] = -1.18;
      positions[offset + 2] = z;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
      pointIndex += 1;
    }
  }

  return {
    baseX,
    baseZ,
    colors,
    positions,
  };
}

function ChromaticParticleFloor() {
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
        Math.sin(x * 1.04 + elapsed * 1.85) * 0.105 +
        Math.cos(z * 1.42 - elapsed * 1.35) * 0.075;
    }

    attribute.needsUpdate = true;
    points.rotation.y = Math.sin(elapsed * 0.2) * 0.055;
    points.rotation.z = Math.sin(elapsed * 0.13) * 0.018;
  });

  return (
    <points ref={pointsRef} rotation={[-0.08, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          args={[field.positions, 3]}
          attach="attributes-position"
        />
        <bufferAttribute
          args={[field.colors, 3]}
          attach="attributes-color"
        />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        opacity={0.95}
        size={0.047}
        sizeAttenuation
        toneMapped={false}
        transparent
        vertexColors
      />
    </points>
  );
}

function createSparkField(count = 180): SparkField {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    THREE_VIOLET,
    THREE_AMBER,
    THREE_GREEN,
    THREE_CYAN,
  ];

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const radius = 1.3 + Math.random() * 2.7;
    const angle = Math.random() * Math.PI * 2;
    const height = -0.7 + Math.random() * 3.8;
    const color = palette[index % palette.length];

    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = height;
    positions[offset + 2] = Math.sin(angle) * radius;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  return { colors, positions };
}

function OrbitingSparks() {
  const pointsRef = useRef<THREE.Points>(null);
  const field = useMemo(() => createSparkField(), []);

  useFrame(({ clock }, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const elapsed = clock.getElapsedTime();
    points.rotation.y += delta * 0.11;
    points.rotation.x = Math.sin(elapsed * 0.22) * 0.08;
    points.position.y = Math.sin(elapsed * 0.75) * 0.06;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          args={[field.positions, 3]}
          attach="attributes-position"
        />
        <bufferAttribute
          args={[field.colors, 3]}
          attach="attributes-color"
        />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        opacity={0.82}
        size={0.044}
        sizeAttenuation
        toneMapped={false}
        transparent
        vertexColors
      />
    </points>
  );
}

function PulseRing({
  color,
  delay,
  speed,
  thickness = 0.055,
}: {
  color: string;
  delay: number;
  speed: number;
  thickness?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const cycle = (clock.getElapsedTime() * speed + delay) % 1;
    const scale = 0.48 + cycle * 2.9;
    mesh.scale.setScalar(scale);

    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = (1 - cycle) * 0.42;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, -1.1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.72, 0.72 + thickness, 96]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        color={color}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function EnergyBand({
  color,
  radius,
  speed,
  tilt,
}: {
  color: string;
  radius: number;
  speed: number;
  tilt: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const elapsed = clock.getElapsedTime();
    group.rotation.y += delta * speed;
    group.rotation.z = tilt[2] + Math.sin(elapsed * 0.55) * 0.08;
  });

  return (
    <group ref={groupRef} rotation={tilt}>
      <mesh>
        <torusGeometry args={[radius, 0.018, 12, 120]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={color}
          depthWrite={false}
          opacity={0.5}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function AnimatedLights() {
  const violetRef = useRef<THREE.PointLight>(null);
  const amberRef = useRef<THREE.PointLight>(null);
  const greenRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (violetRef.current) {
      violetRef.current.position.x = Math.sin(elapsed * 0.7) * 2.5;
      violetRef.current.intensity =
        2.8 + (Math.sin(elapsed * 1.4) + 1) * 1.2;
    }

    if (amberRef.current) {
      amberRef.current.position.z = Math.cos(elapsed * 0.62) * 2.2;
      amberRef.current.intensity =
        2.2 + (Math.cos(elapsed * 1.2) + 1) * 0.9;
    }

    if (greenRef.current) {
      greenRef.current.position.x = Math.cos(elapsed * 0.78) * 2.8;
      greenRef.current.intensity =
        2.5 + (Math.sin(elapsed * 1.65) + 1) * 1.1;
    }
  });

  return (
    <>
      <pointLight
        ref={violetRef}
        color={VIOLET}
        intensity={3.2}
        position={[2, 1.5, -1.8]}
      />
      <pointLight
        ref={amberRef}
        color={AMBER}
        intensity={2.7}
        position={[-2.2, 0.3, 2]}
      />
      <pointLight
        ref={greenRef}
        color={ELECTRIC_GREEN}
        intensity={3}
        position={[0, -0.5, 1.4]}
      />
    </>
  );
}

function HologramBackdrop() {
  return (
    <>
      <ChromaticParticleFloor />
      <OrbitingSparks />

      <PulseRing color={VIOLET} delay={0} speed={0.4} />
      <PulseRing color={AMBER} delay={0.25} speed={0.4} />
      <PulseRing color={ELECTRIC_GREEN} delay={0.5} speed={0.4} />
      <PulseRing color={CYAN} delay={0.75} speed={0.4} />

      <EnergyBand
        color={VIOLET}
        radius={1.55}
        speed={0.2}
        tilt={[0.42, 0, 0.16]}
      />
      <EnergyBand
        color={AMBER}
        radius={1.85}
        speed={-0.14}
        tilt={[-0.32, 0, -0.2]}
      />
      <EnergyBand
        color={ELECTRIC_GREEN}
        radius={2.15}
        speed={0.1}
        tilt={[0.12, 0, 0.34]}
      />

      <mesh
        position={[0, -1.22, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.32, 96]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={VIOLET}
          depthWrite={false}
          opacity={0.28}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>

      <mesh
        position={[0, -1.205, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.45, 1.12, 96]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={ELECTRIC_GREEN}
          depthWrite={false}
          opacity={0.17}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          wireframe
        />
      </mesh>

      <AnimatedLights />
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
      <View pointerEvents="none" style={styles.violetBloom} />
      <View pointerEvents="none" style={styles.amberBloom} />
      <View pointerEvents="none" style={styles.greenBloom} />
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
            gl={{
              alpha: true,
              antialias: true,
            }}
            style={styles.canvas}
          >
            <ambientLight intensity={0.66} />
            <hemisphereLight
              color="#fff6dc"
              groundColor={DEEP_VIOLET}
              intensity={1.35}
            />
            <directionalLight
              color="#ffffff"
              intensity={1.45}
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
            color={ELECTRIC_GREEN}
            size="small"
          />
          <Text style={styles.loadingText}>
            {localModelUri
              ? "FORMING CHROMATIC HOLOGRAM"
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
    backgroundColor: "rgba(3, 1, 12, 0.82)",
  },
  canvas: {
    flex: 1,
    backgroundColor: "transparent",
  },
  hologramWash: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 68%, rgba(101, 255, 122, 0.23) 0%, transparent 25%),
      radial-gradient(circle at 28% 42%, rgba(141, 114, 255, 0.27) 0%, transparent 36%),
      radial-gradient(circle at 74% 35%, rgba(242, 211, 138, 0.24) 0%, transparent 34%),
      radial-gradient(circle at 50% 50%, rgba(83, 231, 255, 0.12) 0%, transparent 48%),
      linear-gradient(145deg, rgba(18, 5, 42, 0.94) 0%, rgba(2, 13, 20, 0.76) 50%, rgba(20, 8, 2, 0.92) 100%)
    `,
  },
  violetBloom: {
    position: "absolute",
    top: "-18%",
    left: "-24%",
    width: "82%",
    aspectRatio: 1,
    opacity: 0.82,
    experimental_backgroundImage:
      "radial-gradient(circle at center, rgba(141, 114, 255, 0.34) 0%, rgba(71, 28, 154, 0.16) 38%, transparent 72%)",
  },
  amberBloom: {
    position: "absolute",
    top: "8%",
    right: "-30%",
    width: "86%",
    aspectRatio: 1,
    opacity: 0.78,
    experimental_backgroundImage:
      "radial-gradient(circle at center, rgba(242, 211, 138, 0.30) 0%, rgba(215, 137, 28, 0.13) 42%, transparent 72%)",
  },
  greenBloom: {
    position: "absolute",
    right: "-18%",
    bottom: "-24%",
    width: "78%",
    aspectRatio: 1,
    opacity: 0.78,
    experimental_backgroundImage:
      "radial-gradient(circle at center, rgba(101, 255, 122, 0.30) 0%, rgba(8, 105, 48, 0.14) 40%, transparent 72%)",
  },
  horizonGlow: {
    position: "absolute",
    right: "-28%",
    bottom: "9%",
    left: "-28%",
    height: "34%",
    opacity: 0.92,
    experimental_backgroundImage:
      "radial-gradient(ellipse at center, rgba(141, 114, 255, 0.32) 0%, rgba(101, 255, 122, 0.17) 34%, rgba(242, 211, 138, 0.09) 52%, transparent 74%)",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: "rgba(5, 2, 16, 0.76)",
  },
  loadingText: {
    color: AMBER,
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
