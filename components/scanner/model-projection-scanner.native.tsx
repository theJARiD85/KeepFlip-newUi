import {
  Canvas as SkiaCanvas,
  BlurMask,
  Group,
  LinearGradient,
  Line,
  Oval,
  Path,
  RadialGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import {
  Canvas as ThreeCanvas,
  useFrame,
} from "@react-three/fiber/native";
import { fetch } from "expo/fetch";
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as THREE from "three";
import {
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const MAX_PROJECTED_TRIANGLES = 3000;
const PROJECTION_UPDATES_PER_SECOND = 6;

type WireframeDepthPaths = {
  far: string;
  mid: string;
  near: string;
};

type ProjectedTriangle = {
  depth: number;
  path: string;
};

type PerspectiveGridLine = {
  color: string;
  key: string;
  opacity: number;
  p1: {
    x: number;
    y: number;
  };
  p2: {
    x: number;
    y: number;
  };
  strokeWidth: number;
};

const EMPTY_WIREFRAME_DEPTH_PATHS: WireframeDepthPaths = {
  far: "",
  mid: "",
  near: "",
};

type ModelProjectionScannerProps = {
  modelUrl: string;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

type ModelProjectorProps = Pick<
  ModelProjectionScannerProps,
  "modelUrl" | "onError"
> & {
  onProjectionUpdate: (
    depthPaths: WireframeDepthPaths,
  ) => void;
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

  componentDidCatch(
    error: Error,
    _info: ErrorInfo,
  ) {
    this.props.onError?.(
      error.message ||
        "KeepFlip could not render the projected 3D model.",
    );
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function ModelProjector({
  modelUrl,
  onError,
  onProjectionUpdate,
}: ModelProjectorProps): React.JSX.Element | null {
  const modelRef =
    useRef<THREE.Group>(null);

  const projectionElapsedRef =
    useRef(0);

  const onErrorRef =
    useRef(onError);

  const [
    loadedScene,
    setLoadedScene,
  ] = useState<THREE.Group | null>(
    null,
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const controller =
      new AbortController();

    let cancelled = false;

    setLoadedScene(null);
    onProjectionUpdate(
      EMPTY_WIREFRAME_DEPTH_PATHS,
    );

    async function loadModel() {
      try {
        const response = await fetch(
          modelUrl,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Tripo model download failed with HTTP ${response.status}.`,
          );
        }

        const modelBytes =
          await response.arrayBuffer();

        if (modelBytes.byteLength < 12) {
          throw new Error(
            "Tripo returned an empty or incomplete GLB file.",
          );
        }

        /*
         * A binary GLB must begin with the
         * four-byte ASCII signature "glTF".
         */
        const glbHeader =
          new DataView(
            modelBytes,
            0,
            12,
          );

        const glbMagic =
          glbHeader.getUint32(
            0,
            true,
          );

        if (glbMagic !== 0x46546c67) {
          const contentType =
            response.headers.get(
              "content-type",
            );

          throw new Error(
            `The Tripo URL did not return a valid GLB file${
              contentType
                ? `; received ${contentType}`
                : ""
            }.`,
          );
        }

        /*
        * Three.js r172 expects navigator.userAgent,
        * but React Native may leave it undefined.
        */
       const runtimeNavigator = (
         globalThis as typeof globalThis & {
           navigator?: {
             userAgent?: string;
           };
         }
       ).navigator;
       
       if (
         runtimeNavigator &&
         typeof runtimeNavigator.userAgent !== "string"
       ) {
         Object.defineProperty(
           runtimeNavigator,
           "userAgent",
           {
             configurable: true,
             value: "ReactNative",
           },
         );
       }
       
       const loader =
         new GLTFLoader();
       
       const gltf =
         await loader.parseAsync(
           modelBytes,
           "",
         );
          
         const countTriangleMeshes = (
          root: THREE.Object3D,
        ): number => {
          let count = 0;
        
          root.traverse((child) => {
            const candidate =
              child as THREE.Mesh;
        
            const position =
              candidate.geometry?.getAttribute?.(
                "position",
              );
        
            if (
              candidate.isMesh === true &&
              position &&
              position.count >= 3
            ) {
              count += 1;
            }
          });
        
          return count;
        };
        
        const parserJson = (
          gltf.parser as unknown as {
            json?: {
              meshes?: unknown[];
              nodes?: unknown[];
              scenes?: unknown[];
            };
          }
        ).json;
        
        const declaredMeshCount =
          parserJson?.meshes?.length ?? 0;
        
        const candidateScenes =
          gltf.scenes?.length > 0
            ? gltf.scenes
            : [gltf.scene];
        
        let selectedScene =
          candidateScenes.find(
            (scene) =>
              countTriangleMeshes(scene) > 0,
          ) ?? null;
        
        /*
         * Some GLBs declare meshes without attaching
         * them to the default scene. Recover those
         * definitions directly from GLTFLoader.
         */
        if (
          !selectedScene &&
          declaredMeshCount > 0
        ) {
          const parserWithDependencies =
            gltf.parser as unknown as {
              getDependencies: (
                type: string,
              ) => Promise<THREE.Object3D[]>;
            };
        
          const meshDependencies =
            await parserWithDependencies.getDependencies(
              "mesh",
            );
        
          const recoveredScene =
            new THREE.Group();
        
          for (
            const dependency of
            meshDependencies
          ) {
            if (
              dependency?.isObject3D === true
            ) {
              recoveredScene.add(
                dependency.clone(true),
              );
            }
          }
        
          if (
            countTriangleMeshes(
              recoveredScene,
            ) > 0
          ) {
            selectedScene =
              recoveredScene;
          }
        }
        
        const selectedMeshCount =
          selectedScene
            ? countTriangleMeshes(
                selectedScene,
              )
            : 0;
        
        console.log(
          "[KeepFlip Tripo3D] GLB parsed:",
          {
            bytes:
              modelBytes.byteLength,
            declaredMeshes:
              declaredMeshCount,
            declaredNodes:
              parserJson?.nodes?.length ??
              0,
            returnedScenes:
              candidateScenes.length,
            selectedMeshes:
              selectedMeshCount,
          },
        );
        
        if (!selectedScene) {
          if (declaredMeshCount === 0) {
            throw new Error(
              "Tripo returned a valid but empty GLB containing zero mesh definitions.",
            );
          }
        
          throw new Error(
            `The GLB declares ${declaredMeshCount} mesh definition(s), but none could be attached to a renderable scene.`,
          );
        }
        
        if (!cancelled) {
          setLoadedScene(
            selectedScene.clone(true),
          );
        }
      } catch (caught: unknown) {
        const wasAborted =
          caught instanceof Error &&
          caught.name === "AbortError";
      
        if (cancelled || wasAborted) {
          return;
        }
      
        console.error(
          "[KeepFlip Tripo3D] GLB load/parse error:",
          caught,
        );
      
        const message =
          caught instanceof Error
            ? caught.message
            : "KeepFlip could not download or parse the generated 3D model.";
      
        onErrorRef.current?.(message);
      }
    }

    void loadModel();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    modelUrl,
    onProjectionUpdate,
  ]);

  const preparedModel =
    useMemo(() => {
      if (!loadedScene) {
        return null;
      }

      const scene =
        loadedScene.clone(true);

      scene.updateMatrixWorld(
        true,
      );

      const bounds =
        new THREE.Box3().setFromObject(
          scene,
        );

      const center =
        bounds.getCenter(
          new THREE.Vector3(),
        );

      const size =
        bounds.getSize(
          new THREE.Vector3(),
        );

      const largestDimension =
        Math.max(
          size.x,
          size.y,
          size.z,
          0.001,
        );

      return {
        center,
        scale:
          2.4 /
          largestDimension,
        scene,
      };
    }, [loadedScene]);

  useFrame(
    (
      { camera, size },
      delta,
    ) => {
      if (!modelRef.current) {
        return;
      }

      modelRef.current.rotation.y +=
        delta * 0.42;

      modelRef.current.updateMatrixWorld(
        true,
      );

      projectionElapsedRef.current +=
        delta;

      if (
        projectionElapsedRef.current <
        1 /
          PROJECTION_UPDATES_PER_SECOND
      ) {
        return;
      }

      projectionElapsedRef.current = 0;

      const projectedTriangles:
        ProjectedTriangle[] = [];

      const projectedVertex =
        new THREE.Vector3();

      modelRef.current.traverse(
        (child) => {
if (
  (child as THREE.Mesh).isMesh !== true
) {
  return;
}

const mesh =
  child as THREE.Mesh;

          const geometry =
            mesh.geometry;

          const position =
            geometry.attributes.position;

          if (!position) {
            return;
          }

          const triangleCount =
            Math.floor(
              (geometry.index?.count ??
                position.count) /
                3,
            );

          const triangleStep =
            Math.max(
              1,
              Math.ceil(
                triangleCount /
                  MAX_PROJECTED_TRIANGLES,
              ),
            );

          for (
            let triangle = 0;
            triangle <
            triangleCount;
            triangle += triangleStep
          ) {
            const coordinates: number[] =
              [];
            let depth = 0;

            for (
              let corner = 0;
              corner < 3;
              corner += 1
            ) {
              const indexedOffset =
                triangle * 3 +
                corner;

              const vertexIndex =
                geometry.index?.getX(
                  indexedOffset,
                ) ??
                indexedOffset;

              projectedVertex.fromBufferAttribute(
                position,
                vertexIndex,
              );

              mesh.localToWorld(
                projectedVertex,
              );

              projectedVertex.project(
                camera,
              );

              depth +=
                projectedVertex.z;

              coordinates.push(
                (projectedVertex.x *
                  0.5 +
                  0.5) *
                  size.width,
                (projectedVertex.y *
                  -0.5 +
                  0.5) *
                  size.height,
              );
            }

            projectedTriangles.push({
              depth: depth / 3,
              path:
                `M ${coordinates[0]} ${coordinates[1]} ` +
                `L ${coordinates[2]} ${coordinates[3]} ` +
                `L ${coordinates[4]} ${coordinates[5]} Z`,
            });
          }
        },
      );

      if (
        projectedTriangles.length === 0
      ) {
        onProjectionUpdate(
          EMPTY_WIREFRAME_DEPTH_PATHS,
        );
        return;
      }

      let minimumDepth =
        Number.POSITIVE_INFINITY;
      let maximumDepth =
        Number.NEGATIVE_INFINITY;

      for (
        const triangle of
        projectedTriangles
      ) {
        minimumDepth = Math.min(
          minimumDepth,
          triangle.depth,
        );
        maximumDepth = Math.max(
          maximumDepth,
          triangle.depth,
        );
      }

      const depthRange = Math.max(
        maximumDepth - minimumDepth,
        0.0001,
      );

      const farPaths: string[] = [];
      const midPaths: string[] = [];
      const nearPaths: string[] = [];

      for (
        const triangle of
        projectedTriangles
      ) {
        const normalizedDepth =
          (triangle.depth -
            minimumDepth) /
          depthRange;

        /*
         * Projected NDC depth increases
         * away from the camera. Separating
         * the mesh here lets Skia express
         * real atmospheric perspective.
         */
        if (normalizedDepth < 0.34) {
          nearPaths.push(
            triangle.path,
          );
        } else if (
          normalizedDepth < 0.7
        ) {
          midPaths.push(
            triangle.path,
          );
        } else {
          farPaths.push(
            triangle.path,
          );
        }
      }

      onProjectionUpdate({
        far: farPaths.join(" "),
        mid: midPaths.join(" "),
        near: nearPaths.join(" "),
      });
    },
  );

  if (!preparedModel) {
    return null;
  }

  return (
    <group
      ref={modelRef}
      rotation={[-0.32, 0, 0]}
      scale={preparedModel.scale}
    >
      <primitive
        object={
          preparedModel.scene
        }
        position={[
          -preparedModel.center.x,
          -preparedModel.center.y,
          -preparedModel.center.z,
        ]}
      />
    </group>
  );
}

export default function ModelProjectionScanner({
  modelUrl,
  onError,
  style,
}: ModelProjectionScannerProps): React.JSX.Element {
  const [layout, setLayout] =
    useState({
      height: 0,
      width: 0,
    });

  const [
    wireframeDepthPaths,
    setWireframeDepthPaths,
  ] = useState<WireframeDepthPaths>(
    EMPTY_WIREFRAME_DEPTH_PATHS,
  );

  const scanProgress =
    useSharedValue(0);

  const scanGlowY =
    useDerivedValue(
      () => scanProgress.value - 8,
    );

  const perspectiveGridLines =
    useMemo<PerspectiveGridLine[]>(
      () => {
        if (
          layout.width <= 0 ||
          layout.height <= 0
        ) {
          return [];
        }

        const lines:
          PerspectiveGridLine[] = [];
        const horizonY =
          layout.height * 0.66;
        const vanishingX =
          layout.width * 0.52;

        for (
          let index = 0;
          index < 7;
          index += 1
        ) {
          const progress =
            (index + 1) / 7;
          const y =
            horizonY +
            (layout.height -
              horizonY) *
              progress *
              progress;

          lines.push({
            color:
              index % 2 === 0
                ? theme.colors
                    .scannerCyan
                : theme.colors
                    .scannerViolet,
            key: `floor-horizontal-${index}`,
            opacity:
              0.025 +
              progress * 0.075,
            p1: vec(0, y),
            p2: vec(
              layout.width,
              y,
            ),
            strokeWidth:
              0.4 +
              progress * 0.35,
          });
        }

        for (
          let index = 0;
          index < 7;
          index += 1
        ) {
          const progress =
            index / 6;

          lines.push({
            color:
              index === 3
                ? theme.colors.gold
                : theme.colors
                    .scannerViolet,
            key: `floor-ray-${index}`,
            opacity:
              index === 3
                ? 0.07
                : 0.045,
            p1: vec(
              layout.width *
                progress,
              layout.height,
            ),
            p2: vec(
              vanishingX,
              horizonY,
            ),
            strokeWidth:
              index === 3
                ? 0.75
                : 0.55,
          });
        }

        return lines;
      },
      [
        layout.height,
        layout.width,
      ],
    );

  const hasWireframe =
    Boolean(
      wireframeDepthPaths.far ||
        wireframeDepthPaths.mid ||
        wireframeDepthPaths.near,
    );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, width } =
        event.nativeEvent.layout;

      console.log(
        "[KeepFlip Tripo3D] Projection layout:",
        {
          height,
          width,
        },
      );

      setLayout({
        height,
        width,
      });
    },
    [],
  );

  useEffect(() => {
    if (layout.height <= 0) {
      return;
    }

    scanProgress.value = 0;

    scanProgress.value = withRepeat(
      withTiming(layout.height, {
        duration: 3000,
        easing: Easing.bezier(
          0.42,
          0,
          0.58,
          1,
        ),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(
        scanProgress,
      );
    };
  }, [
    layout.height,
    scanProgress,
  ]);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        style,
      ]}
    >
      <ProjectionErrorBoundary
        key={modelUrl}
        onError={onError}
      >
        <View
          pointerEvents="none"
          style={
            styles.hiddenThreeContainer
          }
        >
          <ThreeCanvas
            frameloop="always"
            camera={{
              far: 100,
              fov: 45,
              near: 0.1,
              position: [0, 0, 4],
            }}
          >
            <ModelProjector
              modelUrl={modelUrl}
              onError={onError}
              onProjectionUpdate={
                setWireframeDepthPaths
              }
            />
          </ThreeCanvas>
        </View>
      </ProjectionErrorBoundary>

      {layout.width > 0 &&
      layout.height > 0 ? (
        <SkiaCanvas
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 1002,
            },
          ]}
        >
          <Rect
            height={layout.height}
            width={layout.width}
            x={0}
            y={0}
          >
            <LinearGradient
              colors={[
                "#0C0912",
                theme.colors
                  .backgroundDeep,
                "#06040A",
              ]}
              end={vec(
                layout.width,
                layout.height,
              )}
              positions={[
                0,
                0.52,
                1,
              ]}
              start={vec(0, 0)}
            />
          </Rect>

          <Rect
            height={layout.height}
            width={layout.width}
            x={0}
            y={0}
          >
            <RadialGradient
              c={vec(
                layout.width * 0.76,
                layout.height * 0.32,
              )}
              colors={[
                "rgba(88, 223, 232, 0.17)",
                "rgba(88, 223, 232, 0.045)",
                "rgba(88, 223, 232, 0)",
              ]}
              positions={[
                0,
                0.38,
                1,
              ]}
              r={
                Math.max(
                  layout.width,
                  layout.height,
                ) * 0.72
              }
            />
          </Rect>

          <Rect
            height={layout.height}
            width={layout.width}
            x={0}
            y={0}
          >
            <RadialGradient
              c={vec(
                layout.width * 0.16,
                layout.height * 0.58,
              )}
              colors={[
                "rgba(141, 114, 255, 0.15)",
                "rgba(141, 114, 255, 0.04)",
                "rgba(141, 114, 255, 0)",
              ]}
              positions={[
                0,
                0.42,
                1,
              ]}
              r={
                Math.max(
                  layout.width,
                  layout.height,
                ) * 0.68
              }
            />
          </Rect>

          <Rect
            height={layout.height}
            width={layout.width}
            x={0}
            y={0}
          >
            <RadialGradient
              c={vec(
                layout.width * 0.54,
                layout.height * 0.8,
              )}
              colors={[
                "rgba(215, 168, 74, 0.13)",
                "rgba(215, 168, 74, 0.025)",
                "rgba(215, 168, 74, 0)",
              ]}
              positions={[
                0,
                0.35,
                1,
              ]}
              r={
                Math.max(
                  layout.width,
                  layout.height,
                ) * 0.56
              }
            />
          </Rect>

          <Group>
            {perspectiveGridLines.map(
              (line) => (
                <Line
                  key={line.key}
                  color={line.color}
                  opacity={
                    line.opacity
                  }
                  p1={line.p1}
                  p2={line.p2}
                  strokeWidth={
                    line.strokeWidth
                  }
                />
              ),
            )}
          </Group>

          <Rect
            height={2}
            opacity={0.2}
            width={layout.width}
            x={0}
            y={
              layout.height * 0.66 -
              1
            }
          >
            <LinearGradient
              colors={[
                "rgba(88, 223, 232, 0)",
                theme.colors
                  .scannerCyan,
                theme.colors.goldBright,
                theme.colors
                  .scannerViolet,
                "rgba(141, 114, 255, 0)",
              ]}
              end={vec(
                layout.width,
                layout.height * 0.66,
              )}
              positions={[
                0,
                0.28,
                0.52,
                0.72,
                1,
              ]}
              start={vec(
                0,
                layout.height * 0.66,
              )}
            />
            <BlurMask
              blur={6}
              style="normal"
            />
          </Rect>

          <Oval
            color="rgba(0, 0, 0, 0.72)"
            height={
              layout.height * 0.11
            }
            width={
              layout.width * 0.66
            }
            x={
              layout.width * 0.17
            }
            y={
              layout.height * 0.755
            }
          >
            <BlurMask
              blur={22}
              style="normal"
            />
          </Oval>

          <Oval
            color="rgba(88, 223, 232, 0.11)"
            height={
              layout.height * 0.055
            }
            width={
              layout.width * 0.48
            }
            x={
              layout.width * 0.26
            }
            y={
              layout.height * 0.78
            }
          >
            <BlurMask
              blur={16}
              style="normal"
            />
          </Oval>

          {hasWireframe ? (
            <>
              {wireframeDepthPaths.far ? (
                <Path
                  color={
                    theme.colors
                      .scannerViolet
                  }
                  opacity={0.28}
                  path={
                    wireframeDepthPaths.far
                  }
                  strokeCap="round"
                  strokeJoin="round"
                  strokeWidth={0.6}
                  style="stroke"
                />
              ) : null}

              {wireframeDepthPaths.mid ? (
                <Path
                  color={
                    theme.colors
                      .scannerCyan
                  }
                  opacity={0.54}
                  path={
                    wireframeDepthPaths.mid
                  }
                  strokeCap="round"
                  strokeJoin="round"
                  strokeWidth={0.84}
                  style="stroke"
                />
              ) : null}

              {wireframeDepthPaths.near ? (
                <>
                  <Path
                    color={
                      theme.colors.gold
                    }
                    opacity={0.24}
                    path={
                      wireframeDepthPaths.near
                    }
                    strokeWidth={3.6}
                    style="stroke"
                  >
                    <BlurMask
                      blur={5.5}
                      style="outer"
                    />
                  </Path>

                  <Path
                    color={
                      theme.colors
                        .goldBright
                    }
                    opacity={0.9}
                    path={
                      wireframeDepthPaths.near
                    }
                    strokeCap="round"
                    strokeJoin="round"
                    strokeWidth={1.2}
                    style="stroke"
                  />
                </>
              ) : null}
            </>
          ) : null}

          <Rect
            height={16}
            opacity={0.22}
            width={layout.width}
            x={0}
            y={scanGlowY}
          >
            <LinearGradient
              colors={[
                "rgba(88, 223, 232, 0)",
                theme.colors
                  .scannerCyan,
                theme.colors.goldBright,
                theme.colors
                  .scannerViolet,
                "rgba(141, 114, 255, 0)",
              ]}
              end={vec(
                layout.width,
                0,
              )}
              positions={[
                0,
                0.24,
                0.5,
                0.76,
                1,
              ]}
              start={vec(0, 0)}
            />
            <BlurMask
              blur={6}
              style="normal"
            />
          </Rect>

          <Rect
            height={1.5}
            opacity={0.94}
            width={layout.width}
            x={0}
            y={scanProgress}
          >
            <LinearGradient
              colors={[
                "rgba(88, 223, 232, 0)",
                theme.colors
                  .scannerCyan,
                theme.colors.goldBright,
                theme.colors
                  .scannerViolet,
                "rgba(141, 114, 255, 0)",
              ]}
              end={vec(
                layout.width,
                0,
              )}
              positions={[
                0,
                0.26,
                0.5,
                0.74,
                1,
              ]}
              start={vec(0, 0)}
            />
          </Rect>
        </SkiaCanvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor:
      theme.colors.backgroundDeep,
    opacity: 1,
  },
  hiddenThreeContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1001,
  },
});
