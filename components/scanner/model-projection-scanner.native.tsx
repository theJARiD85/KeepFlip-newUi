import {
  Canvas as SkiaCanvas,
  BlurMask,
  Path,
  Rect,
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
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as THREE from "three";
import {
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";

const MAX_PROJECTED_TRIANGLES = 6000;
const PROJECTION_UPDATES_PER_SECOND = 6;

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
    svgPathString: string,
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
    onProjectionUpdate("");

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

      const pathParts: string[] = [];

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

            pathParts.push(
              `M ${coordinates[0]} ${coordinates[1]} ` +
                `L ${coordinates[2]} ${coordinates[3]} ` +
                `L ${coordinates[4]} ${coordinates[5]} Z`,
            );
          }
        },
      );

      onProjectionUpdate(
        pathParts.join(" "),
      );
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
    wireframePath,
    setWireframePath,
  ] = useState("");

  const scanProgress =
    useSharedValue(0);

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
              setWireframePath
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
            color="#010702"
            height={layout.height}
            opacity={0.2}
            width={layout.width}
            x={0}
            y={0}
          />

          {wireframePath ? (
            <>
              <Path
                color="#00ff66"
                opacity={0.85}
                path={wireframePath}
                strokeWidth={4}
                style="stroke"
              >
                <BlurMask
                  blur={6}
                  style="outer"
                />
              </Path>

              <Path
                color="#d2ffd9"
                opacity={0.8}
                path={wireframePath}
                strokeWidth={1}
                style="stroke"
              />
            </>
          ) : null}

          <Rect
            color="#00ff66"
            height={2}
            width={layout.width}
            x={0}
            y={scanProgress}
          />
        </SkiaCanvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
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