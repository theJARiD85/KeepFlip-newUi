/* eslint-disable react/no-unknown-property */

import {
  Component,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import { useReducedMotion } from "react-native-reanimated";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type ScannerAtmosphereProps = {
  active?: boolean;
  height?: number;
  phase?: ScannerAtmospherePhase;
  progress?: number;
  width?: number;
};

export type ScannerAtmospherePhase =
  | "idle"
  | "scanning"
  | "captured"
  | "analyzing";

type CognitionSceneProps = {
  progress: number;
  reduceMotion: boolean;
};

type CognitionBoundaryProps = {
  children: ReactNode;
};

type CognitionBoundaryState = {
  failed: boolean;
};

type NeuralGeometry = {
  edgePositions: Float32Array;
  fieldPositions: Float32Array;
  nodePositions: Float32Array;
};

const CYAN = theme.colors.scannerCyan;
const VIOLET = theme.colors.scannerViolet;
const GOLD = theme.colors.goldBright;

function createNeuralGeometry(nodeCount = 34): NeuralGeometry {
  const nodePositions = new Float32Array(nodeCount * 3);
  const nodeVectors: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < nodeCount; index += 1) {
    const y = 1 - (index / Math.max(1, nodeCount - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index;
    const vector = new THREE.Vector3(
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    ).multiplyScalar(1.24 + (index % 4) * 0.035);
    const offset = index * 3;

    nodeVectors.push(vector);
    nodePositions[offset] = vector.x;
    nodePositions[offset + 1] = vector.y;
    nodePositions[offset + 2] = vector.z;
  }

  const edgeOffsets = [1, 5, 11];
  const edgePositions = new Float32Array(
    nodeCount * edgeOffsets.length * 2 * 3,
  );
  let edgeCursor = 0;

  for (let index = 0; index < nodeCount; index += 1) {
    edgeOffsets.forEach((edgeOffset) => {
      const start = nodeVectors[index];
      const end = nodeVectors[(index + edgeOffset) % nodeCount];
      edgePositions[edgeCursor] = start.x;
      edgePositions[edgeCursor + 1] = start.y;
      edgePositions[edgeCursor + 2] = start.z;
      edgePositions[edgeCursor + 3] = end.x;
      edgePositions[edgeCursor + 4] = end.y;
      edgePositions[edgeCursor + 5] = end.z;
      edgeCursor += 6;
    });
  }

  const fieldCount = 88;
  const fieldPositions = new Float32Array(fieldCount * 3);
  let randomState = 0x6d2b79f5;
  const random = () => {
    randomState |= 0;
    randomState = (randomState + 0x6d2b79f5) | 0;
    let value = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
    value =
      (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = 0; index < fieldCount; index += 1) {
    const offset = index * 3;
    const radius = 2 + random() * 2.4;
    const angle = random() * Math.PI * 2;
    const elevation = (random() - 0.5) * 4.8;
    fieldPositions[offset] = Math.cos(angle) * radius;
    fieldPositions[offset + 1] = elevation;
    fieldPositions[offset + 2] = Math.sin(angle) * radius - 0.8;
  }

  return {
    edgePositions,
    fieldPositions,
    nodePositions,
  };
}

function CognitionScene({
  progress,
  reduceMotion,
}: CognitionSceneProps) {
  const coreRef = useRef<THREE.Group>(null);
  const latticeRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const fieldRef = useRef<THREE.Points>(null);
  const pulseMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useMemo(() => createNeuralGeometry(), []);
  const resolvedProgress = Math.max(0, Math.min(1, progress));

  useFrame(({ clock }, delta) => {
    if (reduceMotion) return;

    const elapsed = clock.getElapsedTime();
    const speed = 0.22 + resolvedProgress * 0.24;

    if (coreRef.current) {
      coreRef.current.rotation.x =
        Math.sin(elapsed * 0.34) * 0.18;
      coreRef.current.rotation.y += delta * speed;
      const pulse =
        0.96 +
        (Math.sin(elapsed * (1.5 + resolvedProgress)) + 1) * 0.025;
      coreRef.current.scale.setScalar(pulse);
    }

    if (latticeRef.current) {
      latticeRef.current.rotation.y -= delta * (speed * 0.62);
      latticeRef.current.rotation.z =
        Math.sin(elapsed * 0.27) * 0.16;
    }

    if (orbitRef.current) {
      orbitRef.current.rotation.x += delta * 0.08;
      orbitRef.current.rotation.y -= delta * (0.12 + resolvedProgress * 0.1);
      orbitRef.current.rotation.z =
        Math.cos(elapsed * 0.21) * 0.22;
    }

    if (fieldRef.current) {
      fieldRef.current.rotation.y += delta * 0.025;
      fieldRef.current.position.y =
        Math.sin(elapsed * 0.38) * 0.09;
    }

    if (pulseMaterialRef.current) {
      pulseMaterialRef.current.opacity =
        0.12 +
        (Math.sin(elapsed * 2.3) + 1) * 0.07 +
        resolvedProgress * 0.08;
    }
  });

  return (
    <group position={[0, -0.05, 0]}>
      <points ref={fieldRef}>
        <bufferGeometry>
          <bufferAttribute
            args={[geometry.fieldPositions, 3]}
            attach="attributes-position"
          />
        </bufferGeometry>
        <pointsMaterial
          blending={THREE.AdditiveBlending}
          color={VIOLET}
          depthWrite={false}
          opacity={0.42}
          size={0.035}
          sizeAttenuation
          toneMapped={false}
          transparent
        />
      </points>

      <group ref={orbitRef}>
        <mesh rotation={[0.42, 0.18, 0.1]}>
          <torusGeometry args={[1.7, 0.012, 8, 96]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={CYAN}
            depthWrite={false}
            opacity={0.38}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh rotation={[-0.74, 0.32, 0.24]}>
          <torusGeometry args={[1.94, 0.009, 8, 96]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={VIOLET}
            depthWrite={false}
            opacity={0.31}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh rotation={[1.1, -0.2, -0.36]}>
          <torusGeometry args={[2.18, 0.008, 8, 96]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={GOLD}
            depthWrite={false}
            opacity={0.22 + resolvedProgress * 0.12}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>

      <group ref={latticeRef}>
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              args={[geometry.edgePositions, 3]}
              attach="attributes-position"
            />
          </bufferGeometry>
          <lineBasicMaterial
            blending={THREE.AdditiveBlending}
            color={CYAN}
            depthWrite={false}
            opacity={0.19 + resolvedProgress * 0.12}
            toneMapped={false}
            transparent
          />
        </lineSegments>
        <points>
          <bufferGeometry>
            <bufferAttribute
              args={[geometry.nodePositions, 3]}
              attach="attributes-position"
            />
          </bufferGeometry>
          <pointsMaterial
            blending={THREE.AdditiveBlending}
            color={GOLD}
            depthWrite={false}
            opacity={0.72}
            size={0.06}
            sizeAttenuation
            toneMapped={false}
            transparent
          />
        </points>
      </group>

      <group ref={coreRef}>
        <mesh>
          <icosahedronGeometry args={[0.78, 2]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={CYAN}
            depthWrite={false}
            opacity={0.34}
            toneMapped={false}
            transparent
            wireframe
          />
        </mesh>
        <mesh rotation={[0.34, 0.72, 0.12]}>
          <icosahedronGeometry args={[0.58, 1]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={VIOLET}
            depthWrite={false}
            opacity={0.54}
            toneMapped={false}
            transparent
            wireframe
          />
        </mesh>
        <mesh scale={0.7}>
          <octahedronGeometry args={[0.46, 0]} />
          <meshBasicMaterial
            ref={pulseMaterialRef}
            blending={THREE.AdditiveBlending}
            color={GOLD}
            depthWrite={false}
            opacity={0.2}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

function FallbackCore() {
  return (
    <View pointerEvents="none" style={styles.fallback}>
      <View style={[styles.fallbackRing, styles.fallbackRingOuter]} />
      <View style={[styles.fallbackRing, styles.fallbackRingMiddle]} />
      <View style={[styles.fallbackRing, styles.fallbackRingInner]} />
      <View style={styles.fallbackCore} />
    </View>
  );
}

class CognitionBoundary extends Component<
  CognitionBoundaryProps,
  CognitionBoundaryState
> {
  state: CognitionBoundaryState = {
    failed: false,
  };

  static getDerivedStateFromError(): CognitionBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <FallbackCore />;
    return this.props.children;
  }
}

export function ScannerAtmosphere({
  active = true,
  height = 1,
  phase,
  progress = 0,
  width = 1,
}: ScannerAtmosphereProps) {
  const reduceMotion = useReducedMotion();
  const phaseProgress =
    phase === "analyzing"
      ? 0.72
      : phase === "captured"
        ? 0.5
        : phase === "scanning"
          ? 0.28
          : 0.08;
  const resolvedProgress = progress > 0 ? progress : phaseProgress;

  if (!active || width <= 0 || height <= 0) return null;
  const sceneSize = Math.min(width, height * 0.55, 420);

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.cyanBloom} />
      <View style={styles.violetBloom} />
      <View style={styles.goldBloom} />
      <View
        style={[
          styles.sceneHost,
          { width: sceneSize, height: sceneSize },
        ]}
      >
        <CognitionBoundary>
          <Canvas
            camera={{ fov: 42, position: [0, 0, 5.4] }}
            frameloop={reduceMotion ? "demand" : "always"}
            gl={{ alpha: true, antialias: false }}
            onCreated={({ gl }) => {
              gl.setClearColor(new THREE.Color("#000000"), 0);
            }}
            style={styles.canvas}
          >
            <CognitionScene
              progress={resolvedProgress}
              reduceMotion={reduceMotion}
            />
          </Canvas>
        </CognitionBoundary>
      </View>
      <View style={styles.vignette} />
      <View style={styles.scanLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1, 1, 2, 0.18)",
  },
  sceneHost: {
    position: "relative",
    overflow: "visible",
  },
  canvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  cyanBloom: {
    position: "absolute",
    top: "20%",
    left: "14%",
    width: "72%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(88, 223, 232, 0.055)",
    boxShadow: "0 0 74px rgba(88, 223, 232, 0.22)",
  },
  violetBloom: {
    position: "absolute",
    top: "30%",
    left: "25%",
    width: "54%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(141, 114, 255, 0.05)",
    boxShadow: "0 0 68px rgba(141, 114, 255, 0.24)",
  },
  goldBloom: {
    position: "absolute",
    top: "38%",
    left: "37%",
    width: "28%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(242, 211, 138, 0.045)",
    boxShadow: "0 0 54px rgba(242, 211, 138, 0.22)",
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 44%, transparent 0%, rgba(1, 1, 3, 0.08) 35%, rgba(1, 1, 3, 0.76) 100%),
      linear-gradient(to bottom, rgba(1, 1, 3, 0.62) 0%, transparent 24%, transparent 68%, rgba(1, 1, 3, 0.82) 100%)
    `,
  },
  scanLine: {
    position: "absolute",
    top: "48%",
    left: "8%",
    right: "8%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(88, 223, 232, 0.32)",
    boxShadow: "0 0 14px rgba(88, 223, 232, 0.42)",
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackRing: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
  },
  fallbackRingOuter: {
    width: 230,
    height: 230,
    borderColor: "rgba(141, 114, 255, 0.34)",
  },
  fallbackRingMiddle: {
    width: 170,
    height: 170,
    borderColor: "rgba(88, 223, 232, 0.5)",
  },
  fallbackRingInner: {
    width: 108,
    height: 108,
    borderColor: "rgba(242, 211, 138, 0.56)",
  },
  fallbackCore: {
    width: 34,
    height: 34,
    transform: [{ rotateZ: "45deg" }],
    borderWidth: 1,
    borderColor: theme.colors.goldBright,
    backgroundColor: "rgba(242, 211, 138, 0.08)",
    boxShadow: "0 0 24px rgba(242, 211, 138, 0.38)",
  },
});
