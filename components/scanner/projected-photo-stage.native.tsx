/* eslint-disable react/no-unknown-property */

import { Directory, File, Paths } from "expo-file-system";
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
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  Image as NativeImage,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { configureExpoGlForThree } from "@/lib/expo-three-gl-compat";

const PROJECTION_CACHE_DIRECTORY = "keepflip-projection-photos";
const CYAN = theme.colors.scannerCyan;
const VIOLET = theme.colors.scannerViolet;
const GOLD = theme.colors.goldBright;
const ORB_GLOW_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position =
    projectionMatrix *
    modelViewMatrix *
    vec4(position, 1.0);
}
`;
const ORB_GLOW_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;

void main() {
  float distanceFromCenter =
    length(vUv - vec2(0.5)) * 2.0;
  float halo =
    pow(max(0.0, 1.0 - distanceFromCenter), 2.6);
  float core =
    pow(max(0.0, 1.0 - distanceFromCenter), 8.0);

  gl_FragColor = vec4(
    uColor,
    (halo * 0.72 + core * 0.38) * uStrength
  );
}
`;

type ProjectedPhotoStageProps = {
  onError?: (message: string) => void;
  photoBytes?: ArrayBuffer | Uint8Array;
  photoUri?: string;
  projectionFrame?: ProjectionFrame;
  style?: StyleProp<ViewStyle>;
};

type ProjectionFrame = {
  centerYRatio: number;
  heightRatio: number;
  widthRatio: number;
};

type ProjectionSceneProps = {
  aspectRatio: number;
  projectionFrame?: ProjectionFrame;
  reduceMotion: boolean;
};

type ProjectionErrorBoundaryProps = {
  children: ReactNode;
  onError?: (message: string) => void;
};

type ProjectionErrorBoundaryState = {
  failed: boolean;
};

type CachedPhoto = {
  fingerprint: string;
  uri: string;
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
        "KeepFlip could not render the projected photo field.",
    );
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function normalizedPhotoBytes(
  photoBytes: ArrayBuffer | Uint8Array,
): Uint8Array {
  return photoBytes instanceof Uint8Array
    ? photoBytes
    : new Uint8Array(photoBytes);
}

function photoFingerprint(
  photoBytes: ArrayBuffer | Uint8Array,
): string {
  const bytes = normalizedPhotoBytes(photoBytes);
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

function photoExtension(bytes: Uint8Array): string {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "webp";
  }

  return "jpg";
}

function useProjectionPhotoUri({
  onError,
  photoBytes,
  photoUri,
}: Pick<
  ProjectedPhotoStageProps,
  "onError" | "photoBytes" | "photoUri"
>): string | null {
  const directUri = photoUri?.trim() || null;
  const fingerprint = useMemo(
    () =>
      photoBytes && photoBytes.byteLength > 0
        ? photoFingerprint(photoBytes)
        : null,
    [photoBytes],
  );
  const [cachedPhoto, setCachedPhoto] =
    useState<CachedPhoto | null>(null);

  useEffect(() => {
    let active = true;

    if (directUri || !photoBytes || !fingerprint) {
      return () => {
        active = false;
      };
    }

    void Promise.resolve().then(() => {
      if (!active) return;

      try {
        const bytes = normalizedPhotoBytes(photoBytes);
        const cacheDirectory = new Directory(
          Paths.cache,
          PROJECTION_CACHE_DIRECTORY,
        );
        cacheDirectory.create({
          idempotent: true,
          intermediates: true,
        });

        const cachedFile = new File(
          cacheDirectory,
          `${fingerprint}.${photoExtension(bytes)}`,
        );

        if (
          !cachedFile.exists ||
          cachedFile.size !== bytes.byteLength
        ) {
          cachedFile.write(bytes);
        }

        if (active) {
          setCachedPhoto({
            fingerprint,
            uri: cachedFile.uri,
          });
        }
      } catch (caught: unknown) {
        if (!active) return;
        onError?.(
          caught instanceof Error
            ? caught.message
            : "KeepFlip could not prepare the photo projection.",
        );
      }
    });

    return () => {
      active = false;
    };
  }, [
    directUri,
    fingerprint,
    onError,
    photoBytes,
  ]);

  if (directUri) return directUri;
  if (cachedPhoto?.fingerprint === fingerprint) {
    return cachedPhoto.uri;
  }
  return null;
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

function projectedPlaneSize(aspectRatio: number): {
  height: number;
  width: number;
} {
  const safeAspect = Math.max(0.35, Math.min(2.8, aspectRatio));
  const maximumWidth = 2.45;
  const maximumHeight = 3.15;
  let width = maximumWidth;
  let height = width / safeAspect;

  if (height > maximumHeight) {
    height = maximumHeight;
    width = height * safeAspect;
  }

  return {
    height,
    width,
  };
}

function perimeterPoints(
  width: number,
  height: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const horizontalCount = 7;
  const verticalCount = 5;

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

function ProjectionSource({
  imageUri,
  onError,
  projectionFrame,
  reduceMotion,
}: {
  imageUri: string;
  onError?: (message: string) => void;
  projectionFrame?: ProjectionFrame;
  reduceMotion: boolean;
}) {
  const [aspectRatio, setAspectRatio] =
    useState<number | null>(null);

  useEffect(() => {
    let active = true;

    try {
      NativeImage.getSize(
        imageUri,
        (width, height) => {
          if (!active) return;
          setAspectRatio(
            width / Math.max(1, height),
          );
        },
        () => {
          if (active) {
            onError?.(
              "KeepFlip could not decode the projected scan image.",
            );
          }
        },
      );
    } catch (caught: unknown) {
      onError?.(
        caught instanceof Error
          ? caught.message
          : "KeepFlip could not decode the projected scan image.",
      );
    }

    return () => {
      active = false;
    };
  }, [imageUri, onError]);

  if (aspectRatio == null) return null;

  return (
    <ProjectionScene
      aspectRatio={aspectRatio}
      projectionFrame={projectionFrame}
      reduceMotion={reduceMotion}
    />
  );
}

function ProjectionScene({
  aspectRatio,
  projectionFrame,
  reduceMotion,
}: ProjectionSceneProps) {
  const viewport = useThree((state) => state.viewport);
  const assemblyRef = useRef<THREE.Group>(null);
  const rayMaterialRef =
    useRef<THREE.LineBasicMaterial>(null);
  const beamMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const particleMaterialRef =
    useRef<THREE.PointsMaterial>(null);
  const particleAttributeRef =
    useRef<THREE.BufferAttribute>(null);
  const scanLineRef = useRef<THREE.Group>(null);
  const scanLineMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const scanGlowMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const emitterRef = useRef<THREE.Mesh>(null);
  const emitterMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const orbGlowMaterialRef =
    useRef<THREE.ShaderMaterial>(null);
  const ringOneRef = useRef<THREE.Mesh>(null);
  const ringTwoRef = useRef<THREE.Mesh>(null);
  const startedAtRef = useRef<number | null>(null);

  const planeSize = useMemo(
    () =>
      projectionFrame
        ? {
            height:
              viewport.height *
              projectionFrame.heightRatio,
            width:
              viewport.width *
              projectionFrame.widthRatio,
          }
        : projectedPlaneSize(aspectRatio),
    [
      aspectRatio,
      projectionFrame,
      viewport.height,
      viewport.width,
    ],
  );
  const assemblyCenterY = useMemo(
    () =>
      projectionFrame
        ? 0.08 +
          (0.5 - projectionFrame.centerYRatio) *
            viewport.height
        : 0.42,
    [
      projectionFrame,
      viewport.height,
    ],
  );
  const emitterOrigin = useMemo(
    () =>
      new THREE.Vector3(
        0,
        -planeSize.height / 2 - 0.58,
        -3.6,
      ),
    [planeSize.height],
  );
  const emitterPosition = useMemo<
    [number, number, number]
  >(
    () => [
      emitterOrigin.x,
      emitterOrigin.y,
      emitterOrigin.z,
    ],
    [emitterOrigin],
  );
  const orbGlowUniforms = useMemo(
    () => ({
      uColor: {
        value: new THREE.Color(CYAN),
      },
      uStrength: {
        value: 0,
      },
    }),
    [],
  );
  const endpoints = useMemo(
    () =>
      perimeterPoints(
        planeSize.width,
        planeSize.height,
      ),
    [
      planeSize.height,
      planeSize.width,
    ],
  );
  const rayPositions = useMemo(() => {
    const positions = new Float32Array(endpoints.length * 6);

    endpoints.forEach((endpoint, index) => {
      const offset = index * 6;
      positions[offset] = emitterOrigin.x;
      positions[offset + 1] = emitterOrigin.y;
      positions[offset + 2] = emitterOrigin.z;
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
    const halfWidth = planeSize.width / 2;
    const halfHeight = planeSize.height / 2;
    const corners = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, halfHeight, 0),
    ];
    const positions = new Float32Array(4 * 9);

    for (let index = 0; index < 4; index += 1) {
      const nextIndex = (index + 1) % 4;
      const offset = index * 9;
      const first = corners[index];
      const second = corners[nextIndex];
      positions.set(
        [
          emitterOrigin.x,
          emitterOrigin.y,
          emitterOrigin.z,
          first.x,
          first.y,
          first.z,
          second.x,
          second.y,
          second.z,
        ],
        offset,
      );
    }

    return positions;
  }, [
    emitterOrigin,
    planeSize.height,
    planeSize.width,
  ]);
  useFrame(({ clock }, delta) => {
    if (startedAtRef.current === null) {
      startedAtRef.current = clock.elapsedTime;
    }

    const elapsed =
      clock.elapsedTime - startedAtRef.current;
    const reveal = reduceMotion
      ? 1
      : smoothStep(0.34, 1.48, elapsed);
    const power = reduceMotion
      ? 1
      : smoothStep(0.02, 0.48, elapsed);
    const introGlitch =
      !reduceMotion && elapsed < 1.82
        ? 1 -
          reveal * 0.2
        : 0;
    const burstPhase = elapsed % 5.2;
    const ambientGlitch =
      !reduceMotion && elapsed >= 1.82 && burstPhase < 0.17
        ? 1 - burstPhase / 0.17
        : 0;
    const glitchStrength = Math.max(
      ambientGlitch,
      introGlitch *
        (0.35 +
          Math.abs(Math.sin(elapsed * 47)) * 0.65),
    );
    if (assemblyRef.current) {
      assemblyRef.current.position.y = assemblyCenterY;
      assemblyRef.current.rotation.x = 0;
      assemblyRef.current.rotation.y = 0;
    }

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

    if (
      scanLineRef.current &&
      scanLineMaterialRef.current &&
      scanGlowMaterialRef.current
    ) {
      const scanProgress =
        (elapsed * 0.29 + 0.12) % 1;
      scanLineRef.current.position.y =
        -planeSize.height / 2 +
        planeSize.height * scanProgress;
      const scanOpacity =
        reveal *
        (0.62 +
          Math.max(0, Math.sin(elapsed * 3.2)) * 0.28) *
        0.7;
      scanLineMaterialRef.current.opacity = scanOpacity;
      scanGlowMaterialRef.current.opacity =
        scanOpacity * 0.18;
    }

    if (
      emitterRef.current &&
      emitterMaterialRef.current
    ) {
      emitterRef.current.rotation.x += delta * 0.24;
      emitterRef.current.rotation.y += delta * 0.42;
      const pulse =
        0.82 +
        Math.sin(elapsed * 3.4) * 0.12 +
        glitchStrength * 0.18;
      emitterRef.current.scale.setScalar(pulse);
      emitterMaterialRef.current.opacity =
        0.22 + power * 0.58;
    }

    if (orbGlowMaterialRef.current) {
      orbGlowMaterialRef.current.uniforms.uStrength.value =
        0.2 +
        power * 0.22 +
        Math.max(0, Math.sin(elapsed * 2.7)) * 0.08;
    }

    if (ringOneRef.current) {
      ringOneRef.current.rotation.z += delta * 0.24;
      ringOneRef.current.scale.setScalar(
        0.9 +
          power * 0.14 +
          Math.sin(elapsed * 2.2) * 0.05,
      );
    }

    if (ringTwoRef.current) {
      ringTwoRef.current.rotation.z -= delta * 0.18;
      ringTwoRef.current.scale.setScalar(
        0.94 +
          power * 0.1 +
          Math.cos(elapsed * 1.8) * 0.04,
      );
    }
  });

  return (
    <group ref={assemblyRef}>
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            args={[beamPositions, 3]}
            attach="attributes-position"
          />
        </bufferGeometry>
        <meshBasicMaterial
          ref={beamMaterialRef}
          blending={THREE.AdditiveBlending}
          color={CYAN}
          depthWrite={false}
          opacity={0}
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
          />
        </bufferGeometry>
        <pointsMaterial
          ref={particleMaterialRef}
          blending={THREE.AdditiveBlending}
          color={GOLD}
          depthWrite={false}
          opacity={0}
          size={0.035}
          sizeAttenuation
          toneMapped={false}
          transparent
        />
      </points>

      <group position={emitterPosition}>
        <mesh position={[0, 0, -0.05]}>
          <planeGeometry args={[1.5, 1.5]} />
          <shaderMaterial
            ref={orbGlowMaterialRef}
            blending={THREE.AdditiveBlending}
            depthTest={false}
            depthWrite={false}
            fragmentShader={ORB_GLOW_FRAGMENT_SHADER}
            toneMapped={false}
            transparent
            uniforms={orbGlowUniforms}
            vertexShader={ORB_GLOW_VERTEX_SHADER}
          />
        </mesh>
        <mesh ref={emitterRef}>
          <icosahedronGeometry args={[0.19, 1]} />
          <meshBasicMaterial
            ref={emitterMaterialRef}
            blending={THREE.AdditiveBlending}
            color={GOLD}
            depthWrite={false}
            opacity={0}
            toneMapped={false}
            transparent
            wireframe
          />
        </mesh>
        <mesh ref={ringOneRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.31, 0.012, 4, 42]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={CYAN}
            depthWrite={false}
            opacity={0.54}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh ref={ringTwoRef} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
          <torusGeometry args={[0.4, 0.008, 4, 42]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={VIOLET}
            depthWrite={false}
            opacity={0.38}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>

      <group ref={scanLineRef} position={[0, 0, 0]}>
        <mesh>
          <planeGeometry
            args={[planeSize.width, 0.018]}
          />
          <meshBasicMaterial
            ref={scanLineMaterialRef}
            blending={THREE.AdditiveBlending}
            color={GOLD}
            depthWrite={false}
            opacity={0}
            toneMapped={false}
            transparent
          />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <planeGeometry
            args={[planeSize.width, 0.11]}
          />
          <meshBasicMaterial
            ref={scanGlowMaterialRef}
            blending={THREE.AdditiveBlending}
            color={CYAN}
            depthWrite={false}
            opacity={0}
            toneMapped={false}
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

export function ProjectedPhotoStage({
  onError,
  photoBytes,
  photoUri,
  projectionFrame,
  style,
}: ProjectedPhotoStageProps): React.JSX.Element | null {
  const reduceMotion = useReducedMotion();
  const resolvedUri = useProjectionPhotoUri({
    onError,
    photoBytes,
    photoUri,
  });

  if (!resolvedUri) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
    >
      <ProjectionErrorBoundary
        key={resolvedUri}
        onError={onError}
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
          <ProjectionSource
            imageUri={resolvedUri}
            onError={onError}
            projectionFrame={projectionFrame}
            reduceMotion={reduceMotion}
          />
        </Canvas>
      </ProjectionErrorBoundary>
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
    top: 15
  },
});
