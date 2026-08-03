/* eslint-disable react/no-unknown-property */

import {
  Canvas,
  useFrame,
  useThree,
} from "@react-three/fiber/native";
import React, {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { configureExpoGlForThree } from "@/lib/expo-three-gl-compat";

const CYAN = theme.colors.scannerCyan;
const VIOLET = theme.colors.scannerViolet;
const GOLD = theme.colors.goldBright;

type ProjectedPhotoStageProps = {
  onError?: (message: string) => void;
  projectionFrame: ProjectionFrame;
  style?: StyleProp<ViewStyle>;
};

type ProjectionFrame = {
  centerYRatio: number;
  heightRatio: number;
  widthRatio: number;
};

type ProjectionSceneProps = {
  onError?: (message: string) => void;
  projectionFrame: ProjectionFrame;
  reduceMotion: boolean;
};

type ProjectionErrorBoundaryProps = {
  children: ReactNode;
  onError?: (message: string) => void;
};

type ProjectionErrorBoundaryState = {
  failed: boolean;
};

class ProjectionErrorBoundary extends Component<
  ProjectionErrorBoundaryProps,
  ProjectionErrorBoundaryState
> {
  state: ProjectionErrorBoundaryState = {
    failed: false,
  };

  static getDerivedStateFromError(): ProjectionErrorBoundaryState {
    return {
      failed: true,
    };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(
      error.message ||
        "KeepFlip could not render the projection field.",
    );
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(
  edgeStart: number,
  edgeEnd: number,
  value: number,
): number {
  const progress = clamp01(
    (value - edgeStart) / (edgeEnd - edgeStart),
  );
  return progress * progress * (3 - 2 * progress);
}

function perimeterPoints(
  width: number,
  height: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const horizontalCount = 8;
  const verticalCount = 8;

  for (let index = 0; index < horizontalCount; index += 1) {
    const x =
      -width / 2 +
      (width * index) / (horizontalCount - 1);
    points.push(new THREE.Vector3(x, -height / 2, 0));
    points.push(new THREE.Vector3(x, height / 2, 0));
  }

  for (let index = 1; index < verticalCount - 1; index += 1) {
    const y =
      -height / 2 +
      (height * index) / (verticalCount - 1);
    points.push(new THREE.Vector3(-width / 2, y, 0));
    points.push(new THREE.Vector3(width / 2, y, 0));
  }

  return points;
}

type AiEyeMaterialKey =
  | "cyan"
  | "cyanGlass"
  | "gold"
  | "pupil"
  | "violet";

type AiEyeVane = {
  material: "cyan" | "gold";
  position: [number, number, number];
  rotation: [number, number, number];
};

function createAiEyeMaterial({
  color,
  emissive,
  emissiveIntensity,
  metalness = 0.2,
  opacity = 1,
  roughness = 0.24,
}: {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  metalness?: number;
  opacity?: number;
  roughness?: number;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    depthWrite: opacity >= 1,
    emissive,
    emissiveIntensity,
    metalness,
    opacity,
    roughness,
    transparent: opacity < 1,
  });
  material.toneMapped = false;
  return material;
}

function aiEyeLidCurve(direction: number) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.28, 0, 0.04),
    new THREE.Vector3(-0.72, 0.48 * direction, 0.12),
    new THREE.Vector3(0, 0.65 * direction, 0.16),
    new THREE.Vector3(0.72, 0.48 * direction, 0.12),
    new THREE.Vector3(1.28, 0, 0.04),
  ]);
}

const AI_EYE_UPPER_LID = aiEyeLidCurve(1);
const AI_EYE_LOWER_LID = aiEyeLidCurve(-1);
const AI_EYE_VANES: AiEyeVane[] = Array.from(
  { length: 12 },
  (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const radius = 0.405;
    return {
      material: index % 3 === 0 ? "gold" : "cyan",
      position: [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.355,
      ],
      rotation: [0, 0, angle],
    };
  },
);

function AnalysisAiEyeEmitter({
  reduceMotion,
}: {
  reduceMotion: boolean;
}) {
  const eyeRef = useRef<THREE.Group>(null);
  const materials = useMemo<Record<
    AiEyeMaterialKey,
    THREE.MeshStandardMaterial
  >>(
    () => ({
      cyan: createAiEyeMaterial({
        color: 0x0a6475,
        emissive: 0x58dfe8,
        emissiveIntensity: 2.4,
      }),
      cyanGlass: createAiEyeMaterial({
        color: 0x041b24,
        emissive: 0x178ca2,
        emissiveIntensity: 1.1,
        metalness: 0.08,
        opacity: 0.34,
        roughness: 0.12,
      }),
      gold: createAiEyeMaterial({
        color: 0x8d5f15,
        emissive: 0xf2d38a,
        emissiveIntensity: 2.1,
        metalness: 0.32,
      }),
      pupil: createAiEyeMaterial({
        color: 0x010306,
        emissive: 0x082531,
        emissiveIntensity: 0.7,
        metalness: 0.12,
        roughness: 0.08,
      }),
      violet: createAiEyeMaterial({
        color: 0x29165c,
        emissive: 0x8d72ff,
        emissiveIntensity: 1.8,
        opacity: 0.82,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => {
        material.dispose();
      });
    },
    [materials],
  );

  useFrame(({ clock }) => {
    if (!eyeRef.current) return;

    const elapsed = clock.elapsedTime;
    const scale = reduceMotion
      ? 0.32
      : 0.32 + Math.sin(elapsed * 2.1) * 0.012;

    eyeRef.current.rotation.x = reduceMotion
      ? -0.04
      : -0.04 + Math.sin(elapsed * 0.72) * 0.035;
    eyeRef.current.rotation.y = reduceMotion
      ? 0
      : Math.sin(elapsed * 0.54) * 0.14;
    eyeRef.current.rotation.z = reduceMotion
      ? 0
      : Math.cos(elapsed * 0.46) * 0.025;
    eyeRef.current.scale.setScalar(scale);
  });

  return (
    <group ref={eyeRef} scale={0.32}>
      <mesh material={materials.cyanGlass} scale={[1.52, 0.76, 0.38]}>
        <sphereGeometry args={[0.76, 36, 20]} />
      </mesh>

      <mesh material={materials.cyan} position={[0, 0, 0.31]}>
        <torusGeometry args={[0.49, 0.055, 8, 56]} />
      </mesh>
      <mesh material={materials.gold} position={[0, 0, 0.345]}>
        <torusGeometry args={[0.3, 0.032, 8, 44]} />
      </mesh>
      <mesh
        material={materials.pupil}
        position={[0, 0, 0.34]}
        scale={[0.54, 1, 0.3]}
      >
        <sphereGeometry args={[0.28, 28, 16]} />
      </mesh>
      <mesh material={materials.gold} position={[0.08, 0.11, 0.44]}>
        <sphereGeometry args={[0.075, 20, 12]} />
      </mesh>

      {AI_EYE_VANES.map((vane, index) => (
        <mesh
          key={`ai-eye-vane-${index}`}
          material={materials[vane.material]}
          position={vane.position}
          rotation={vane.rotation}
        >
          <boxGeometry args={[0.16, 0.018, 0.022]} />
        </mesh>
      ))}

      <mesh material={materials.cyan}>
        <tubeGeometry args={[AI_EYE_UPPER_LID, 52, 0.036, 7, false]} />
      </mesh>
      <mesh material={materials.gold}>
        <tubeGeometry args={[AI_EYE_LOWER_LID, 52, 0.036, 7, false]} />
      </mesh>

      <mesh
        material={materials.violet}
        rotation={[0.42, 0.18, 0.08]}
        scale={[1.24, 0.78, 1]}
      >
        <torusGeometry args={[0.96, 0.023, 7, 64]} />
      </mesh>
      <mesh
        material={materials.cyan}
        rotation={[Math.PI / 2.8, 0.34, Math.PI / 3.8]}
      >
        <torusGeometry args={[0.92, 0.018, 7, 64]} />
      </mesh>
      <mesh
        material={materials.gold}
        rotation={[Math.PI / 2.35, -0.46, -Math.PI / 4.2]}
      >
        <torusGeometry args={[0.87, 0.015, 7, 56]} />
      </mesh>

      <mesh material={materials.violet} position={[-1.31, 0, 0.04]}>
        <octahedronGeometry args={[0.105, 1]} />
      </mesh>
      <mesh material={materials.gold} position={[1.31, 0, 0.04]}>
        <octahedronGeometry args={[0.105, 1]} />
      </mesh>
    </group>
  );
}

function ProjectionScene({
  onError,
  projectionFrame,
  reduceMotion,
}: ProjectionSceneProps) {
  const viewport = useThree((state) => state.viewport);
  const rayMaterialRef =
    useRef<THREE.LineBasicMaterial>(null);
  const beamMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const particleMaterialRef =
    useRef<THREE.PointsMaterial>(null);
  const particleAttributeRef =
    useRef<THREE.BufferAttribute>(null);
  const startedAtRef = useRef<number | null>(null);

  const planeSize = useMemo(
    () => ({
      height:
        viewport.height * projectionFrame.heightRatio,
      width:
        viewport.width * projectionFrame.widthRatio,
    }),
    [
      projectionFrame,
      viewport.height,
      viewport.width,
    ],
  );
  const assemblyCenterY = useMemo(
    () =>
      0.08 +
      (0.5 - projectionFrame.centerYRatio) * viewport.height,
    [
      projectionFrame,
      viewport.height,
    ],
  );
const emitterOrigin = useMemo(
  () => new THREE.Vector3(0, -planeSize.height / 2 - 0.58, -3.6),
  [planeSize.height]
);

const emitterPosition = useMemo<[number, number, number]>(
  () => emitterOrigin.toArray() as [number, number, number],
  [emitterOrigin]
);

const endpoints = useMemo(
  () => perimeterPoints(planeSize.width, planeSize.height),
  [planeSize.height, planeSize.width]
);

const rayPositions = useMemo<Float32Array>(() => {
  const positions = new Float32Array(endpoints.length * 6);
  
  endpoints.forEach((endpoint, index) => {
    const offset = index * 6;
    
    // Start of line (Emitter)
    positions[offset]     = emitterOrigin.x;
    positions[offset + 1] = emitterOrigin.y;
    positions[offset + 2] = emitterOrigin.z;
    
    // End of line (Perimeter)
    positions[offset + 3] = endpoint.x;
    positions[offset + 4] = endpoint.y;
    positions[offset + 5] = endpoint.z;
  });
  
  return positions;
}, [emitterOrigin, endpoints]);


  const particlePositions = useMemo(
    () => new Float32Array(endpoints.length * 3),
    [endpoints.length],
  );
  const beamPositions = useMemo(() => {
    const halfWidth = planeSize.width / 3.25;
    const halfHeight = planeSize.height / 2;
    
    // Define corners relative to center (0,0)
    // We can just use objects or temp variables instead of new THREE.Vector3 to save overhead
    const corners = [
      { x: -halfWidth, y: -halfHeight, z: 0 },
      { x:  halfWidth, y: -halfHeight, z: 0 },
      { x:  halfWidth, y:  halfHeight, z: 0 },
      { x: -halfWidth, y:  halfHeight, z: 0 },
    ];
  
    const positions = new Float32Array(4 * 9); // 4 faces * 3 vertices * 3 coords
  
    for (let i = 0; i < 4; i++) {
      const nextIndex = (i + 1) % 4;
      const offset = i * 9;
      
      const first = corners[i];
      const second = corners[nextIndex];
  
      // Vertex 1: Emitter Tip
      positions[offset]     = emitterOrigin.x;
      positions[offset + 1] = emitterOrigin.y;
      positions[offset + 2] = emitterOrigin.z;
  
      // Vertex 2: Corner A
      positions[offset + 3] = first.x;
      positions[offset + 4] = first.y;
      positions[offset + 5] = first.z;
  
      // Vertex 3: Corner B
      positions[offset + 6] = second.x;
      positions[offset + 7] = second.y;
      positions[offset + 8] = second.z;
    }
    
    return positions;
  }, [emitterOrigin, planeSize.width, planeSize.height]);
  
  
  useFrame(({ clock }) => {
    if (startedAtRef.current === null) {
      startedAtRef.current = clock.elapsedTime;
    }

    const elapsed =
      clock.elapsedTime - startedAtRef.current;
    const power = reduceMotion
      ? 1
      : smoothStep(0.02, 0.48, elapsed);

    if (rayMaterialRef.current) {
      rayMaterialRef.current.opacity =
        0.025 +
        power * 0.14 +
        Math.max(0, Math.sin(elapsed * 2.1)) * 0.045;
    }

    if (beamMaterialRef.current) {
      beamMaterialRef.current.opacity =
        0.006 +
        power * 0.026 +
        Math.max(0, Math.sin(elapsed * 1.4)) * 0.012;
    }

    if (
      particleAttributeRef.current &&
      particleMaterialRef.current
    ) {
      const positions =
        particleAttributeRef.current.array as Float32Array;
      const travelSpeed = 0.34 + power * 0.24;

      endpoints.forEach((endpoint, index) => {
        const phase = index / endpoints.length;
        const travel =
          (elapsed * travelSpeed + phase * 1.63) % 1;
        const easedTravel =
          travel * travel * (3 - 2 * travel);
        const offset = index * 3;
        positions[offset] =
          emitterOrigin.x +
          (endpoint.x - emitterOrigin.x) * easedTravel;
        positions[offset + 1] =
          emitterOrigin.y +
          (endpoint.y - emitterOrigin.y) * easedTravel;
        positions[offset + 2] =
          emitterOrigin.z +
          (endpoint.z - emitterOrigin.z) * easedTravel;
      });

      particleAttributeRef.current.needsUpdate = true;
      particleMaterialRef.current.opacity =
        0.12 + power * 0.66;
    }
  });

  return (
    <group position={[0, assemblyCenterY, 0]}>
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            args={[beamPositions, 3]}
            attach="attributes-position"
            count={beamPositions.length / 3}
            array={beamPositions}
          />
        </bufferGeometry>
        <meshBasicMaterial
          ref={beamMaterialRef}
          blending={THREE.AdditiveBlending}
          color={GOLD}
          depthWrite={false}
          opacity={0.1}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            args={[rayPositions, 3]}
            attach="attributes-position"
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={rayMaterialRef}
          blending={THREE.AdditiveBlending}
          color={CYAN}
          depthWrite={false}
          opacity={0}
          toneMapped={false}
          transparent
        />
      </lineSegments>

      <points>
        <bufferGeometry>
          <bufferAttribute
            ref={particleAttributeRef}
            args={[particlePositions, 3]}
            attach="attributes-position"
            count={particlePositions.length / 3}
            array={particlePositions}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={particleMaterialRef}
          blending={THREE.AdditiveBlending}
          color={VIOLET}
          depthWrite={true}
          opacity={1}
          size={0.013}
          sizeAttenuation={true}
          toneMapped={false}
          transparent
        />
      </points>

      <group position={emitterPosition}>
          <AnalysisAiEyeEmitter reduceMotion={reduceMotion} />
      </group>
    </group>
  );
}

export function ProjectedPhotoStage({
  onError,
  projectionFrame,
  style,
}: ProjectedPhotoStageProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
    >
        <Canvas
          camera={{
            far: 30,
            fov: 42,
            near: 0.1,
            position: [0, 0.08, 7.4],
          }}
          frameloop={reduceMotion ? "demand" : "always"}
          gl={{
            alpha: true,
            antialias: false,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            configureExpoGlForThree(gl);
            gl.setClearColor(new THREE.Color("#000000"), 0);
          }}
          style={styles.canvas}
        >
          <ProjectionScene
            onError={onError}
            projectionFrame={projectionFrame}
            reduceMotion={reduceMotion}
          />
        </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  canvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    top: 15,
  },
});
