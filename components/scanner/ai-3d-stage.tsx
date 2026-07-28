/* eslint-disable react/no-unknown-property */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image as NativeImage,
  StyleSheet,
  View,
} from "react-native";
import {
  Canvas,
  useFrame,
} from "@react-three/fiber/native";
import { useReducedMotion } from "react-native-reanimated";
import * as THREE from "three";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { configureExpoGlForThree } from "@/lib/expo-three-gl-compat";

interface Ai3DStageProps {
  active?: boolean;
  imageUri?: string;
  progress?: number;
}

interface PipelineMindProps {
  progress: number;
  reduceMotion: boolean;
  texture?: THREE.Texture;
}

interface TexturedPipelineMindProps
  extends Omit<PipelineMindProps, "texture"> {
  imageUri: string;
}

const CYAN = theme.colors.scannerCyan;
const VIOLET = theme.colors.scannerViolet;
const GOLD = theme.colors.goldBright;

function configureCoverTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

function PipelineMind({
  progress,
  reduceMotion,
  texture,
}: PipelineMindProps) {
  const stackRef = useRef<THREE.Group>(null);
  const rawLayerRef = useRef<THREE.Mesh>(null);
  const matrixLayerRef = useRef<THREE.Mesh>(null);
  const semanticLayerRef = useRef<THREE.Mesh>(null);
  const semanticMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null);
  const resolvedProgress = Math.max(0, Math.min(1, progress));
  const connectorPositions = useMemo(
    () =>
      new Float32Array([
        -1.5, -2, -1.45, -1.5, -2, 0.72,
        1.5, -2, -1.45, 1.5, -2, 0.72,
        -1.5, 2, -1.45, -1.5, 2, 0.72,
        1.5, 2, -1.45, 1.5, 2, 0.72,
      ]),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (reduceMotion) return;

    const elapsed = clock.getElapsedTime();
    const speed = 0.12 + resolvedProgress * 0.18;

    if (stackRef.current) {
      stackRef.current.rotation.x =
        -0.11 + Math.sin(elapsed * 0.28) * 0.04;
      stackRef.current.rotation.y =
        Math.sin(elapsed * speed) * 0.2;
      stackRef.current.rotation.z =
        Math.cos(elapsed * 0.19) * 0.035;
    }

    if (rawLayerRef.current) {
      rawLayerRef.current.position.y =
        Math.sin(elapsed * 0.8) * 0.055;
      rawLayerRef.current.position.z =
        -1.45 - resolvedProgress * 0.22;
    }

    if (matrixLayerRef.current) {
      matrixLayerRef.current.position.y =
        Math.sin(elapsed * 0.92 + 1.4) * 0.065;
      matrixLayerRef.current.rotation.z +=
        delta * (0.025 + resolvedProgress * 0.03);
    }

    if (semanticLayerRef.current) {
      semanticLayerRef.current.position.y =
        Math.sin(elapsed * 1.04 + 2.8) * 0.075;
      semanticLayerRef.current.position.z =
        0.72 + resolvedProgress * 0.28;
    }

    if (semanticMaterialRef.current) {
      semanticMaterialRef.current.opacity =
        0.16 +
        resolvedProgress * 0.13 +
        (Math.sin(elapsed * 2.1) + 1) * 0.035;
    }
  });

  return (
    <group ref={stackRef}>
      <mesh ref={rawLayerRef} position={[0, 0, -1.45]}>
        <planeGeometry args={[3, 4, 12, 16]} />
        <meshBasicMaterial
          blending={
            texture
              ? THREE.NormalBlending
              : THREE.AdditiveBlending
          }
          color={texture ? "#FFFFFF" : VIOLET}
          depthWrite={false}
          map={texture}
          opacity={texture ? 0.3 : 0.14}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>

      <mesh
        ref={matrixLayerRef}
        position={[0, 0, -0.38]}
        rotation={[0, 0, 0.06]}
      >
        <planeGeometry args={[3.08, 4.08, 12, 16]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={CYAN}
          depthWrite={false}
          map={texture}
          opacity={0.34}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          wireframe
        />
      </mesh>

      <mesh ref={semanticLayerRef} position={[0, 0, 0.72]}>
        <planeGeometry args={[2.88, 3.88, 8, 12]} />
        <meshBasicMaterial
          ref={semanticMaterialRef}
          blending={THREE.AdditiveBlending}
          color={GOLD}
          depthWrite={false}
          map={texture}
          opacity={0.2}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          wireframe
        />
      </mesh>

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            args={[connectorPositions, 3]}
            attach="attributes-position"
          />
        </bufferGeometry>
        <lineBasicMaterial
          blending={THREE.AdditiveBlending}
          color={CYAN}
          depthWrite={false}
          opacity={0.22}
          toneMapped={false}
          transparent
        />
      </lineSegments>

      <mesh position={[0, 0, 1.02]} rotation={[0.4, 0.6, 0.2]}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={GOLD}
          depthWrite={false}
          opacity={0.58}
          toneMapped={false}
          transparent
          wireframe
        />
      </mesh>
    </group>
  );
}

function TexturedPipelineMind({
  imageUri,
  progress,
  reduceMotion,
}: TexturedPipelineMindProps) {
  const [texture, setTexture] =
    useState<THREE.Texture>();

  useEffect(() => {
    let cancelled = false;
    const nextTexture = new THREE.Texture();

    try {
      NativeImage.getSize(
        imageUri,
        (width, height) => {
          if (cancelled) {
            nextTexture.dispose();
            return;
          }

          nextTexture.image = {
            data: { localUri: imageUri },
            height,
            width,
          };
          nextTexture.flipY = true;
          (
            nextTexture as THREE.Texture & {
              isDataTexture: boolean;
            }
          ).isDataTexture = true;
          configureCoverTexture(nextTexture);
          setTexture(nextTexture);
        },
        () => {
          nextTexture.dispose();
        },
      );
    } catch {
      nextTexture.dispose();
    }

    return () => {
      cancelled = true;
      nextTexture.dispose();
    };
  }, [imageUri]);

  return (
    <PipelineMind
      progress={progress}
      reduceMotion={reduceMotion}
      texture={texture}
    />
  );
}

export function Ai3DStage({
  active = true,
  imageUri,
  progress = 0,
}: Ai3DStageProps) {
  const reduceMotion = useReducedMotion();
  const resolvedImageUri = imageUri?.trim();

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Canvas
        camera={{ fov: 46, position: [0, 0, 6.2] }}
        frameloop={reduceMotion ? "demand" : "always"}
        gl={{ alpha: true, antialias: false }}
        onCreated={({ gl }) => {
          configureExpoGlForThree(gl);
          gl.setClearColor(new THREE.Color("#000000"), 0);
        }}
        style={styles.canvas}
      >
        {resolvedImageUri ? (
          <TexturedPipelineMind
            key={resolvedImageUri}
            imageUri={resolvedImageUri}
            progress={progress}
            reduceMotion={reduceMotion}
          />
        ) : (
          <PipelineMind
            progress={progress}
            reduceMotion={reduceMotion}
          />
        )}
      </Canvas>
    </View>
  );
}

export default Ai3DStage;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  canvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
});
