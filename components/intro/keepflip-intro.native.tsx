/* eslint-disable react/no-unknown-property */

import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import {
  Canvas,
  useFrame,
  useLoader,
} from "@react-three/fiber/native";
import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { configureExpoGlForThree } from "@/lib/expo-three-gl-compat";

const CYAN = theme.colors.scannerCyan;
const VIOLET = theme.colors.scannerViolet;
const GOLD = theme.colors.goldBright;
const AMBER = theme.colors.scannerAmber;

const INTRO_DURATION_MS = 4_300;

type KeepFlipIntroProps = {
  onComplete: () => void;
};

type IntroErrorBoundaryProps = {
  children: ReactNode;
  onError: (message: string) => void;
};

type IntroErrorBoundaryState = {
  failed: boolean;
};

class IntroErrorBoundary extends Component<
  IntroErrorBoundaryProps,
  IntroErrorBoundaryState
> {
  state: IntroErrorBoundaryState = {
    failed: false,
  };

  static getDerivedStateFromError(): IntroErrorBoundaryState {
    return {
      failed: true,
    };
  }

  componentDidCatch(caught: Error, _info: ErrorInfo) {
    this.props.onError(
      caught.message || "KeepFlip could not render the intro model.",
    );
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function smoothStep(
  start: number,
  end: number,
  value: number,
): number {
  const progress = THREE.MathUtils.clamp(
    (value - start) / (end - start),
    0,
    1,
  );

  return progress * progress * (3 - 2 * progress);
}

function KeepFlipIconModel({
  modelUri,
  onReady,
  reduceMotion,
}: {
  modelUri: string;
  onReady: () => void;
  reduceMotion: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, modelUri);

  const normalizedModel = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);

    clonedScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          material.envMapIntensity = 1.25;
        }
      }
    });

    const bounds = new THREE.Box3().setFromObject(clonedScene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    const longestSide = Math.max(
      size.x,
      size.y,
      size.z,
      0.001,
    );

    const scale = 2.25 / longestSide;

    const position: [number, number, number] = [
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    ];

    return {
      object: clonedScene,
      position,
      scale,
    };
  }, [gltf.scene]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const elapsed = clock.elapsedTime;

    const reveal = reduceMotion
      ? 1
      : smoothStep(0.15, 1.15, elapsed);

    const desiredScale =
      0.18 +
      reveal * 0.82;

    const pulse = reduceMotion
      ? 1
      : 1 + Math.sin(elapsed * 2.4) * 0.015;

    root.scale.setScalar(
      THREE.MathUtils.damp(
        root.scale.x,
        desiredScale * pulse,
        7,
        delta,
      ),
    );

    root.rotation.y = reduceMotion
      ? 0.2
      : elapsed * 0.48 - 0.62;

    root.rotation.x = reduceMotion
      ? -0.06
      : -0.06 + Math.sin(elapsed * 0.72) * 0.075;

    root.rotation.z = reduceMotion
      ? 0
      : Math.sin(elapsed * 0.44) * 0.035;

    root.position.y = reduceMotion
      ? 0
      : Math.sin(elapsed * 1.15) * 0.07;
  });

  return (
    <group ref={rootRef} scale={0.18}>
      <primitive
        object={normalizedModel.object}
        position={normalizedModel.position}
        scale={normalizedModel.scale}
      />
    </group>
  );
}

function TargetReticle3D({
  reduceMotion,
}: {
  reduceMotion: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const sweepRef = useRef<THREE.Mesh>(null);

  const corners = useMemo(
    () =>
      [
        [-1.4, 1.4, 0.2, 1, 1],
        [1.4, 1.4, 0.2, -1, 1],
        [-1.4, -1.4, 0.2, 1, -1],
        [1.4, -1.4, 0.2, -1, -1],
      ] as const,
    [],
  );

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;

    if (rootRef.current) {
      rootRef.current.rotation.z = reduceMotion
        ? 0
        : Math.sin(elapsed * 0.28) * 0.04;

      const pulse = reduceMotion
        ? 1
        : 1 + Math.sin(elapsed * 2.2) * 0.025;

      rootRef.current.scale.setScalar(pulse);
    }

    if (sweepRef.current) {
      sweepRef.current.rotation.z = reduceMotion
        ? 0
        : elapsed * 1.25;
    }
  });

  return (
    <group ref={rootRef}>
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[1.58, 0.012, 6, 96]} />

        <meshBasicMaterial
          color={CYAN}
          depthWrite={false}
          opacity={0.68}
          toneMapped={false}
          transparent
        />
      </mesh>

      <mesh rotation={[1.08, 0.22, 0.15]}>
        <torusGeometry args={[1.72, 0.009, 6, 96]} />

        <meshBasicMaterial
          color={VIOLET}
          depthWrite={false}
          opacity={0.44}
          toneMapped={false}
          transparent
        />
      </mesh>

      <mesh rotation={[1.36, -0.42, -0.2]}>
        <torusGeometry args={[1.84, 0.008, 6, 96]} />

        <meshBasicMaterial
          color={GOLD}
          depthWrite={false}
          opacity={0.32}
          toneMapped={false}
          transparent
        />
      </mesh>

      <mesh ref={sweepRef} position={[0, 0, 0.22]}>
        <ringGeometry
          args={[
            1.47,
            1.62,
            96,
            1,
            0,
            Math.PI * 0.36,
          ]}
        />

        <meshBasicMaterial
          color={CYAN}
          depthWrite={false}
          opacity={0.24}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>

      {corners.map(
        ([x, y, z, horizontalDirection, verticalDirection], index) => (
          <group
            key={`target-corner-${index}`}
            position={[x, y, z]}
          >
            <mesh
              position={[
                horizontalDirection * 0.17,
                0,
                0,
              ]}
            >
              <boxGeometry args={[0.36, 0.035, 0.035]} />

              <meshBasicMaterial
                color={index % 2 === 0 ? CYAN : GOLD}
                toneMapped={false}
              />
            </mesh>

            <mesh
              position={[
                0,
                verticalDirection * 0.17,
                0,
              ]}
            >
              <boxGeometry args={[0.035, 0.36, 0.035]} />

              <meshBasicMaterial
                color={index % 2 === 0 ? CYAN : GOLD}
                toneMapped={false}
              />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

function EnergyParticles({
  reduceMotion,
}: {
  reduceMotion: boolean;
}) {
  const particlesRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const count = 110;
    const values = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const radius =
        1.7 +
        Math.random() * 2.2;

      const angle =
        Math.random() *
        Math.PI *
        2;

      const elevation =
        (Math.random() - 0.5) *
        3.8;

      values[index * 3] =
        Math.cos(angle) *
        radius;

      values[index * 3 + 1] =
        elevation;

      values[index * 3 + 2] =
        Math.sin(angle) *
        radius;
    }

    return values;
  }, []);

  useFrame(({ clock }) => {
    const particles = particlesRef.current;

    if (!particles || reduceMotion) {
      return;
    }

    const elapsed = clock.elapsedTime;

    particles.rotation.y =
      elapsed * 0.055;

    particles.rotation.x =
      Math.sin(elapsed * 0.18) * 0.08;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>

      <pointsMaterial
        color={CYAN}
        depthWrite={false}
        opacity={0.54}
        size={0.028}
        sizeAttenuation
        toneMapped={false}
        transparent
      />
    </points>
  );
}

function IntroScene({
  modelUri,
  onModelReady,
  reduceMotion,
}: {
  modelUri: string;
  onModelReady: () => void;
  reduceMotion: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.65} />

      <hemisphereLight
        args={[
          0x8defff,
          0x08030d,
          1.1,
        ]}
      />

      <pointLight
        color={CYAN}
        intensity={28}
        position={[3.2, 2.4, 4.5]}
      />

      <pointLight
        color={VIOLET}
        intensity={22}
        position={[-3.2, 0.2, 3]}
      />

      <pointLight
        color={AMBER}
        intensity={16}
        position={[0, -3, 3.2]}
      />

      <EnergyParticles reduceMotion={reduceMotion} />

      <TargetReticle3D reduceMotion={reduceMotion} />

      <KeepFlipIconModel
        modelUri={modelUri}
        onReady={onModelReady}
        reduceMotion={reduceMotion}
      />
    </>
  );
}

export default function KeepFlipIntro({
  onComplete,
}: KeepFlipIntroProps): React.JSX.Element {
  const {
    height,
    width,
  } = useWindowDimensions();

  const containerOpacity =
    useRef(
      new Animated.Value(0),
    ).current;

  const interfaceOpacity =
    useRef(
      new Animated.Value(0),
    ).current;

  const targetPulse =
    useRef(
      new Animated.Value(0),
    ).current;

  const scanProgress =
    useRef(
      new Animated.Value(0),
    ).current;

  const completedRef =
    useRef(false);

  const [modelUri, setModelUri] =
    useState<string | null>(null);

  const [modelReady, setModelReady] =
    useState(false);

  const [modelError, setModelError] =
    useState<string | null>(null);

  const [reduceMotion, setReduceMotion] =
    useState(false);

  const frameSize = Math.min(
    width * 0.72,
    height * 0.42,
    340,
  );

  const finish = useCallback(() => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      try {
        const asset = Asset.fromModule(
          require("../../assets/models/keepflip_icon.glb"),
        );

        await asset.downloadAsync();

        const resolvedUri =
          asset.localUri ??
          asset.uri;

        if (!resolvedUri) {
          throw new Error(
            "The KeepFlip intro model did not resolve to a local URI.",
          );
        }

        if (mounted) {
          setModelUri(resolvedUri);
        }
      } catch (caught) {
        if (!mounted) {
          return;
        }

        setModelError(
          caught instanceof Error
            ? caught.message
            : "The KeepFlip intro model could not be loaded.",
        );
      }
    };

    void loadModel();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo
      .isReduceMotionEnabled()
      .then(setReduceMotion);

    const subscription =
      AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReduceMotion,
      );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(
        containerOpacity,
        {
          toValue: 1,
          duration: reduceMotion
            ? 120
            : 420,
          easing: Easing.out(
            Easing.cubic,
          ),
          useNativeDriver: true,
        },
      ),

      Animated.timing(
        interfaceOpacity,
        {
          toValue: 1,
          duration: reduceMotion
            ? 120
            : 850,
          delay: reduceMotion
            ? 0
            : 360,
          easing: Easing.out(
            Easing.cubic,
          ),
          useNativeDriver: true,
        },
      ),
    ]);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(
          targetPulse,
          {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(
              Easing.sin,
            ),
            useNativeDriver: true,
          },
        ),

        Animated.timing(
          targetPulse,
          {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(
              Easing.sin,
            ),
            useNativeDriver: true,
          },
        ),
      ]),
    );

    const scan = Animated.loop(
      Animated.timing(
        scanProgress,
        {
          toValue: 1,
          duration: 1_700,
          easing: Easing.inOut(
            Easing.cubic,
          ),
          useNativeDriver: true,
        },
      ),
    );

    entrance.start();

    if (!reduceMotion) {
      pulse.start();
      scan.start();
    }

    const exitTimer = setTimeout(() => {
      Animated.timing(
        containerOpacity,
        {
          toValue: 0,
          duration: reduceMotion
            ? 100
            : 520,
          easing: Easing.in(
            Easing.cubic,
          ),
          useNativeDriver: true,
        },
      ).start(({ finished }) => {
        if (finished) {
          finish();
        }
      });
    }, INTRO_DURATION_MS);

    return () => {
      clearTimeout(exitTimer);
      entrance.stop();
      pulse.stop();
      scan.stop();
    };
  }, [
    containerOpacity,
    finish,
    interfaceOpacity,
    reduceMotion,
    scanProgress,
    targetPulse,
  ]);

  const handleSkip = useCallback(() => {
    Animated.timing(
      containerOpacity,
      {
        toValue: 0,
        duration: 220,
        easing: Easing.out(
          Easing.quad,
        ),
        useNativeDriver: true,
      },
    ).start(() => {
      finish();
    });
  }, [
    containerOpacity,
    finish,
  ]);

  const handleModelError =
    useCallback(
      (message: string) => {
        setModelError(message);
      },
      [],
    );

  const handleModelReady =
    useCallback(() => {
      setModelReady(true);
    }, []);

  const targetAnimatedStyle = {
    opacity: targetPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.62, 1],
    }),

    transform: [
      {
        scale: targetPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1.025],
        }),
      },
    ],
  };

  const scanAnimatedStyle = {
    transform: [
      {
        translateY:
          scanProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              -frameSize / 2,
              frameSize / 2,
            ],
          }),
      },
    ],
  };

  const statusText = modelReady
    ? "TARGET LOCKED"
    : modelError
      ? "VISUAL CORE ONLINE"
      : "ACQUIRING TARGET";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity:
            containerOpacity,
        },
      ]}
    >
      <LinearGradient
        colors={[
          "#010102",
          "#080411",
          "#020106",
          "#010102",
        ]}
        locations={[
          0,
          0.37,
          0.72,
          1,
        ]}
        style={StyleSheet.absoluteFill}
      />

      <View
        pointerEvents="none"
        style={styles.cyanGlow}
      />

      <View
        pointerEvents="none"
        style={styles.violetGlow}
      />

      <View
        pointerEvents="none"
        style={styles.goldGlow}
      />

      <Pressable
        accessibilityHint="Skips the KeepFlip intro"
        accessibilityLabel="Skip intro"
        onPress={handleSkip}
        style={StyleSheet.absoluteFill}
      >
        {modelUri ? (
          <IntroErrorBoundary
            onError={handleModelError}
          >
          <Canvas
            camera={{
                far: 100,
                fov: 38,
                near: 0.1,
                position: [0, 0, 6.2],
            }}
            frameloop="always"
            gl={{
                alpha: true,
                antialias: true,
            }}
            onCreated={({ gl }) => {
                configureExpoGlForThree(gl);

                gl.setClearColor(
                0x000000,
                0,
                );
            }}
            style={StyleSheet.absoluteFill}
            >
            <Suspense fallback={null}>
                <IntroScene
                modelUri={modelUri}
                onModelReady={handleModelReady}
                reduceMotion={reduceMotion}
                />
            </Suspense>
            </Canvas>
          </IntroErrorBoundary>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.interfaceLayer,
            {
              opacity:
                interfaceOpacity,
            },
          ]}
        >
          <View style={styles.topReadout}>
            <View style={styles.statusDot} />

            <Text style={styles.topReadoutText}>
              KEEPFLIP // VALUE INTELLIGENCE
            </Text>
          </View>

          <Animated.View
            style={[
              styles.targetFrame,
              targetAnimatedStyle,
              {
                height: frameSize,
                width: frameSize,
              },
            ]}
          >
            <View
              style={[
                styles.targetCircle,
                {
                  borderRadius:
                    frameSize / 2,
                },
              ]}
            />

            <View
              style={[
                styles.targetCircleInner,
                {
                  borderRadius:
                    frameSize / 2,
                },
              ]}
            />

            <View
              style={[
                styles.cornerHorizontal,
                styles.topLeftHorizontal,
              ]}
            />

            <View
              style={[
                styles.cornerVertical,
                styles.topLeftVertical,
              ]}
            />

            <View
              style={[
                styles.cornerHorizontal,
                styles.topRightHorizontal,
              ]}
            />

            <View
              style={[
                styles.cornerVertical,
                styles.topRightVertical,
              ]}
            />

            <View
              style={[
                styles.cornerHorizontal,
                styles.bottomLeftHorizontal,
              ]}
            />

            <View
              style={[
                styles.cornerVertical,
                styles.bottomLeftVertical,
              ]}
            />

            <View
              style={[
                styles.cornerHorizontal,
                styles.bottomRightHorizontal,
              ]}
            />

            <View
              style={[
                styles.cornerVertical,
                styles.bottomRightVertical,
              ]}
            />

            {!reduceMotion ? (
              <Animated.View
                style={[
                  styles.scanLine,
                  scanAnimatedStyle,
                ]}
              />
            ) : null}

            <View style={styles.targetStatus}>
              <Text style={styles.targetStatusText}>
                {statusText}
              </Text>
            </View>
          </Animated.View>

          <View style={styles.bottomBrand}>
            <Text style={styles.brandName}>
              KEEPFLIP
            </Text>

            <View style={styles.brandDivider} />

            <Text style={styles.brandTagline}>
              SEE VALUE BEFORE OTHERS DO
            </Text>
          </View>

          <Text style={styles.skipLabel}>
            TAP TO SKIP
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 10_000,
    overflow: "hidden",
    backgroundColor:
      theme.colors.backgroundDeep,
  },

  interfaceLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },

  cyanGlow: {
    position: "absolute",
    top: "18%",
    right: "-18%",
    width: 310,
    height: 310,
    borderRadius: 999,
    backgroundColor:
      "rgba(0, 255, 255, 0.07)",
    boxShadow:
      "0 0 90px rgba(0, 255, 255, 0.25)",
  },

  violetGlow: {
    position: "absolute",
    bottom: "20%",
    left: "-22%",
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor:
      "rgba(141, 114, 255, 0.07)",
    boxShadow:
      "0 0 100px rgba(141, 114, 255, 0.23)",
  },

  goldGlow: {
    position: "absolute",
    right: "12%",
    bottom: "10%",
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor:
      "rgba(242, 211, 138, 0.045)",
    boxShadow:
      "0 0 70px rgba(242, 211, 138, 0.18)",
  },

  topReadout: {
    position: "absolute",
    top: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(0, 255, 255, 0.24)",
    backgroundColor:
      "rgba(2, 5, 9, 0.52)",
  },

  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: CYAN,
    boxShadow:
      "0 0 9px rgba(0, 255, 255, 0.95)",
  },

  topReadoutText: {
    color:
      "rgba(225, 255, 255, 0.82)",
    fontFamily:
      theme.fonts.analysis,
    fontSize: 9,
    letterSpacing: 1.35,
  },

  targetFrame: {
    alignItems: "center",
    justifyContent: "center",
  },

  targetCircle: {
    position: "absolute",
    width: "87%",
    height: "87%",
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(0, 255, 255, 0.32)",
  },

  targetCircleInner: {
    position: "absolute",
    width: "68%",
    height: "68%",
    borderWidth:
      StyleSheet.hairlineWidth,
    borderColor:
      "rgba(141, 114, 255, 0.24)",
  },

  cornerHorizontal: {
    position: "absolute",
    width: 48,
    height: 2,
    backgroundColor: CYAN,
    boxShadow:
      "0 0 11px rgba(0, 255, 255, 0.9)",
  },

  cornerVertical: {
    position: "absolute",
    width: 2,
    height: 48,
    backgroundColor: CYAN,
    boxShadow:
      "0 0 11px rgba(0, 255, 255, 0.9)",
  },

  topLeftHorizontal: {
    top: 0,
    left: 0,
  },

  topLeftVertical: {
    top: 0,
    left: 0,
  },

  topRightHorizontal: {
    top: 0,
    right: 0,
  },

  topRightVertical: {
    top: 0,
    right: 0,
  },

  bottomLeftHorizontal: {
    bottom: 0,
    left: 0,
  },

  bottomLeftVertical: {
    bottom: 0,
    left: 0,
  },

  bottomRightHorizontal: {
    right: 0,
    bottom: 0,
  },

  bottomRightVertical: {
    right: 0,
    bottom: 0,
  },

  scanLine: {
    position: "absolute",
    right: 8,
    left: 8,
    height: 1,
    backgroundColor: CYAN,
    boxShadow:
      "0 0 13px rgba(0, 255, 255, 0.88), 0 0 28px rgba(141, 114, 255, 0.32)",
  },

  targetStatus: {
    position: "absolute",
    bottom: -34,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor:
      "rgba(1, 5, 8, 0.7)",
  },

  targetStatusText: {
    color: GOLD,
    fontFamily:
      theme.fonts.analysis,
    fontSize: 9,
    letterSpacing: 1.65,
  },

  bottomBrand: {
    position: "absolute",
    bottom: 88,
    alignItems: "center",
    gap: 10,
  },

  brandName: {
    color:
      theme.colors.scannerWhite,
    fontFamily:
      theme.fonts.bold,
    fontSize: 32,
    letterSpacing: 7,
    textShadowColor:
      "rgba(0, 255, 255, 0.48)",
    textShadowOffset: {
      width: 0,
      height: 0,
    },
    textShadowRadius: 15,
  },

  brandDivider: {
    width: 64,
    height: 1,
    backgroundColor: GOLD,
    boxShadow:
      "0 0 10px rgba(242, 211, 138, 0.6)",
  },

  brandTagline: {
    color:
      theme.colors.textMuted,
    fontFamily:
      theme.fonts.analysis,
    fontSize: 9,
    letterSpacing: 2.05,
  },

  skipLabel: {
    position: "absolute",
    bottom: 34,
    color:
      "rgba(173, 167, 178, 0.44)",
    fontFamily:
      theme.fonts.analysis,
    fontSize: 8,
    letterSpacing: 1.5,
  },
});