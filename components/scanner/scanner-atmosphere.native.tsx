/* eslint-disable react/no-unknown-property -- Three.js JSX uses renderer-specific props. */
import { Canvas, useFrame } from '@react-three/fiber/native';
import { Fragment, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { keepFlipTheme } from '@/constants/keepflip-theme';

export type ScannerAtmospherePhase = 'idle' | 'scanning' | 'captured' | 'analyzing';

type ScannerAtmosphereProps = {
  phase?: ScannerAtmospherePhase;
};

type RingSegment = {
  arc: number;
  rotation: number;
};

const RING_SEGMENTS: RingSegment[] = [
  { arc: Math.PI * 0.42, rotation: 0 },
  { arc: Math.PI * 0.26, rotation: Math.PI * 0.58 },
  { arc: Math.PI * 0.38, rotation: Math.PI * 0.98 },
  { arc: Math.PI * 0.24, rotation: Math.PI * 1.52 },
  { arc: Math.PI * 0.2, rotation: Math.PI * 1.84 },
];

function SegmentedRing({
  color,
  radius,
  segments = RING_SEGMENTS,
}: {
  color: string;
  radius: number;
  segments?: RingSegment[];
}) {
  return segments.map((segment, index) => (
    <Fragment key={`${radius}-${index}`}>
      <mesh rotation={[0, 0, segment.rotation]} userData={{ glow: true }}>
        <torusGeometry args={[radius, 0.042, 6, 28, segment.arc]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={color}
          depthWrite={false}
          opacity={0.04}
          transparent
        />
      </mesh>
      <mesh rotation={[0, 0, segment.rotation]} userData={{ glow: false }}>
        <torusGeometry args={[radius, 0.012, 6, 28, segment.arc]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={color}
          depthWrite={false}
          opacity={0.24}
          transparent
        />
      </mesh>
    </Fragment>
  ));
}

function setRingEnergy(group: THREE.Group, lineOpacity: number, glowOpacity: number) {
  group.children.forEach((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial | undefined;

    if (material) {
      material.opacity = child.userData.glow ? glowOpacity : lineOpacity;
    }
  });
}

function damp(current: number, target: number, response: number, delta: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-response * delta));
}

function EnergyField({ phase }: Required<ScannerAtmosphereProps>) {
  const rig = useRef<THREE.Group>(null);
  const goldRing = useRef<THREE.Group>(null);
  const cyanRing = useRef<THREE.Group>(null);
  const violetRing = useRef<THREE.Group>(null);
  const wireframe = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const coreGlow = useRef<THREE.Mesh>(null);
  const motion = useRef({ energy: 0.1, speed: 0.34 });

  const particlePositions = useMemo(() => {
    const count = 128;
    const positions = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const radius = 1.72 + Math.sin(index * 2.17) * 0.22;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle) * radius * 1.32;
      positions[index * 3 + 2] = Math.sin(index * 0.73) * 0.42;
    }

    return positions;
  }, []);

  useFrame(({ clock }, delta) => {
    if (
      !rig.current ||
      !goldRing.current ||
      !cyanRing.current ||
      !violetRing.current ||
      !wireframe.current ||
      !points.current ||
      !coreGlow.current
    ) {
      return;
    }

    const elapsed = clock.elapsedTime;
    const analyzing = phase === 'analyzing';
    const targetSpeed = analyzing ? 8.4 : phase === 'scanning' ? 2.6 : phase === 'captured' ? 1.2 : 0.34;
    const targetEnergy = analyzing ? 1 : phase === 'scanning' ? 0.58 : phase === 'captured' ? 0.7 : 0.1;
    const response = analyzing ? 2.15 : 4.5;

    // The lower response on analysis entry produces a visible, eased turbine-like spin-up.
    motion.current.speed = damp(motion.current.speed, targetSpeed, response, delta);
    motion.current.energy = damp(motion.current.energy, targetEnergy, response, delta);

    const speed = motion.current.speed;
    const energy = motion.current.energy;
    const targetScale = analyzing ? 1.075 : phase === 'captured' ? 1.055 : phase === 'scanning' ? 1.025 : 1;

    rig.current.rotation.z += delta * 0.055 * speed;
    rig.current.rotation.x = Math.sin(elapsed * (0.22 + energy * 0.16)) * (0.045 + energy * 0.025);
    rig.current.rotation.y = Math.cos(elapsed * 0.19) * (0.025 + energy * 0.02);
    rig.current.scale.setScalar(damp(rig.current.scale.x, targetScale, 4.2, delta));

    goldRing.current.rotation.z += delta * 0.3 * speed;
    cyanRing.current.rotation.z -= delta * 0.42 * speed;
    violetRing.current.rotation.z += delta * 0.19 * speed;
    wireframe.current.rotation.z -= delta * 0.09 * speed;
    points.current.rotation.z -= delta * 0.105 * speed;
    points.current.rotation.x = Math.sin(elapsed * 0.31) * 0.04;

    const pulseRate = analyzing ? 9.5 : phase === 'scanning' ? 6.2 : 1.4;
    const pulse = (Math.sin(elapsed * pulseRate) + 1) * 0.5;
    const goldOpacity = 0.18 + energy * 0.5 + pulse * energy * 0.12;
    const cyanOpacity = 0.2 + energy * 0.56 + (1 - pulse) * energy * 0.12;
    const violetOpacity = 0.12 + energy * 0.42 + pulse * energy * 0.09;

    setRingEnergy(goldRing.current, goldOpacity, goldOpacity * 0.23);
    setRingEnergy(cyanRing.current, cyanOpacity, cyanOpacity * 0.25);
    setRingEnergy(violetRing.current, violetOpacity, violetOpacity * 0.28);

    const wireframeMaterial = wireframe.current.material as THREE.MeshBasicMaterial;
    const pointsMaterial = points.current.material as THREE.PointsMaterial;
    const coreMaterial = coreGlow.current.material as THREE.MeshBasicMaterial;

    wireframeMaterial.opacity = 0.04 + energy * 0.19;
    pointsMaterial.opacity = 0.42 + energy * 0.52;
    pointsMaterial.size = 0.025 + energy * 0.018 + pulse * energy * 0.008;
    coreMaterial.opacity = energy * (0.08 + pulse * 0.1);
    coreGlow.current.scale.setScalar(0.72 + energy * 0.44 + pulse * energy * 0.08);
  });

  return (
    <group ref={rig}>
      <mesh ref={wireframe} rotation={[0.42, 0.28, 0]} scale={[1.06, 1.42, 1.06]}>
        <icosahedronGeometry args={[1.28, 1]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={keepFlipTheme.colors.scannerViolet}
          depthWrite={false}
          opacity={0.04}
          transparent
          wireframe
        />
      </mesh>

      <group ref={goldRing} rotation={[0.12, 0.08, Math.PI / 5]} scale={[1, 1.28, 1]}>
        <SegmentedRing color={keepFlipTheme.colors.scannerAmber} radius={1.72} />
      </group>

      <group ref={cyanRing} rotation={[-0.08, -0.12, -Math.PI / 7]} scale={[0.78, 1, 0.78]}>
        <SegmentedRing color={keepFlipTheme.colors.scannerCyan} radius={1.52} />
      </group>

      <group ref={violetRing} rotation={[0.18, -0.16, Math.PI / 9]} scale={[0.68, 0.92, 0.68]}>
        <SegmentedRing color={keepFlipTheme.colors.scannerViolet} radius={1.36} />
      </group>

      <mesh ref={coreGlow} position={[0, 0, -0.08]}>
        <circleGeometry args={[0.58, 48]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={keepFlipTheme.colors.scannerCyan}
          depthWrite={false}
          opacity={0.04}
          transparent
        />
      </mesh>

      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          blending={THREE.AdditiveBlending}
          color={keepFlipTheme.colors.scannerWhite}
          depthWrite={false}
          opacity={0.48}
          size={0.028}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  );
}

export function ScannerAtmosphere({ phase = 'idle' }: ScannerAtmosphereProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas
        camera={{ fov: 48, position: [0, 0, 5.6] }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          scene.background = null;
        }}>
        <EnergyField phase={phase} />
      </Canvas>
    </View>
  );
}
