import {
  BlurMask,
  Canvas,
  Circle,
  Line,
  LinearGradient as SkiaLinearGradient,
  RadialGradient,
  Rect,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import React, {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Light,
  ModelInstance,
  ModelRenderer,
  setLogger,
  useModel,
  type Float3,
  type RenderCallback,
} from "react-native-filament";
import {
  useSharedValue,
  type ISharedValue,
} from "react-native-worklets-core";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

const KEEPFLIP_ICON_GLB =
  require("@/assets/models/keepflip_icon.glb");

const INTRO_MINIMUM_DURATION_MS =
  4_600;

const MODEL_LOAD_TIMEOUT_MS =
  12_000;

const MODEL_SCALE =
  0.5;

const MODEL_ROTATION_RADIANS_PER_SECOND =
  0.65;

const MODEL_SCALE_VECTOR: Float3 = [
  MODEL_SCALE,
  MODEL_SCALE,
  MODEL_SCALE,
];

const CYAN =
  theme.colors.scannerCyan;

const VIOLET =
  theme.colors.scannerViolet;

const GOLD =
  theme.colors.goldBright;

/*
 * Disable react-native-filament's internal JavaScript logger globally.
 */
setLogger({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

export type KeepFlipIntroProps = {
  startupReady: boolean;
  onComplete: () => void;
};

type IntroErrorBoundaryProps = {
  children: ReactNode;
  onError: () => void;
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

  componentDidCatch(
    _error: Error,
    _info: ErrorInfo,
  ): void {
    this.props.onError();
  }

  render(): ReactNode {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function IntroBackdrop({
  height,
  width,
}: {
  height: number;
  width: number;
}): React.JSX.Element {
  const baseRadius =
    Math.min(
      width,
      height,
    );

  return (
    <Canvas
      style={
        StyleSheet.absoluteFill
      }
    >
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
      >
        <SkiaLinearGradient
          start={
            vec(0, 0)
          }
          end={
            vec(
              width,
              height,
            )
          }
          colors={[
            "#010102",
            "#090511",
            "#030106",
            "#010102",
          ]}
          positions={[
            0,
            0.42,
            0.76,
            1,
          ]}
        />
      </Rect>

      <Circle
        cx={
          width * 0.82
        }
        cy={
          height * 0.28
        }
        r={
          baseRadius * 0.42
        }
      >
        <RadialGradient
          c={
            vec(
              width * 0.82,
              height * 0.28,
            )
          }
          r={
            baseRadius * 0.42
          }
          colors={[
            "rgba(0,255,255,0.16)",
            "rgba(0,255,255,0)",
          ]}
        />
      </Circle>

      <Circle
        cx={
          width * 0.12
        }
        cy={
          height * 0.68
        }
        r={
          baseRadius * 0.48
        }
      >
        <RadialGradient
          c={
            vec(
              width * 0.12,
              height * 0.68,
            )
          }
          r={
            baseRadius * 0.48
          }
          colors={[
            "rgba(141,114,255,0.15)",
            "rgba(141,114,255,0)",
          ]}
        />
      </Circle>

      <Circle
        cx={
          width * 0.7
        }
        cy={
          height * 0.88
        }
        r={
          baseRadius * 0.25
        }
      >
        <RadialGradient
          c={
            vec(
              width * 0.7,
              height * 0.88,
            )
          }
          r={
            baseRadius * 0.25
          }
          colors={[
            "rgba(242,211,138,0.10)",
            "rgba(242,211,138,0)",
          ]}
        />
      </Circle>
    </Canvas>
  );
}

function SpinRing({
  colors,
  radius,
  size,
  strokeWidth,
}: {
  colors: string[];
  radius: number;
  size: number;
  strokeWidth: number;
}): React.JSX.Element {
  const center =
    size / 2;

  return (
    <Canvas
      style={
        StyleSheet.absoluteFill
      }
    >
      <Circle
        cx={center}
        cy={center}
        r={radius}
        style="stroke"
        strokeWidth={
          strokeWidth + 5
        }
        opacity={0.25}
      >
        <SweepGradient
          c={
            vec(
              center,
              center,
            )
          }
          colors={colors}
        />

        <BlurMask
          blur={8}
          style="solid"
        />
      </Circle>

      <Circle
        cx={center}
        cy={center}
        r={radius}
        style="stroke"
        strokeWidth={
          strokeWidth
        }
      >
        <SweepGradient
          c={
            vec(
              center,
              center,
            )
          }
          colors={colors}
        />
      </Circle>
    </Canvas>
  );
}

function TargetCore({
  frameSize,
  size,
}: {
  frameSize: number;
  size: number;
}): React.JSX.Element {
  const center =
    size / 2;

  const half =
    frameSize / 2;

  const left =
    center - half;

  const right =
    center + half;

  const top =
    center - half;

  const bottom =
    center + half;

  const bracketLength =
    frameSize * 0.17;

  return (
    <Canvas
      style={
        StyleSheet.absoluteFill
      }
    >
      <Circle
        cx={center}
        cy={center}
        r={
          frameSize * 0.43
        }
        color="rgba(0,255,255,0.38)"
        style="stroke"
        strokeWidth={1.1}
      />

      <Circle
        cx={center}
        cy={center}
        r={
          frameSize * 0.31
        }
        color="rgba(141,114,255,0.34)"
        style="stroke"
        strokeWidth={1}
      />

      <Line
        p1={
          vec(
            left,
            top,
          )
        }
        p2={
          vec(
            left +
              bracketLength,
            top,
          )
        }
        color={CYAN}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            left,
            top,
          )
        }
        p2={
          vec(
            left,
            top +
              bracketLength,
          )
        }
        color={CYAN}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            right,
            top,
          )
        }
        p2={
          vec(
            right -
              bracketLength,
            top,
          )
        }
        color={GOLD}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            right,
            top,
          )
        }
        p2={
          vec(
            right,
            top +
              bracketLength,
          )
        }
        color={GOLD}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            left,
            bottom,
          )
        }
        p2={
          vec(
            left +
              bracketLength,
            bottom,
          )
        }
        color={GOLD}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            left,
            bottom,
          )
        }
        p2={
          vec(
            left,
            bottom -
              bracketLength,
          )
        }
        color={GOLD}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            right,
            bottom,
          )
        }
        p2={
          vec(
            right -
              bracketLength,
            bottom,
          )
        }
        color={CYAN}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            right,
            bottom,
          )
        }
        p2={
          vec(
            right,
            bottom -
              bracketLength,
          )
        }
        color={CYAN}
        strokeWidth={2.3}
        strokeCap="round"
      >
        <BlurMask
          blur={5}
          style="solid"
        />
      </Line>

      <Line
        p1={
          vec(
            center - 22,
            center,
          )
        }
        p2={
          vec(
            center + 22,
            center,
          )
        }
        color="rgba(242,211,138,0.78)"
        strokeWidth={1}
      />

      <Line
        p1={
          vec(
            center,
            center - 22,
          )
        }
        p2={
          vec(
            center,
            center + 22,
          )
        }
        color="rgba(0,255,255,0.78)"
        strokeWidth={1}
      />

      <Circle
        cx={center}
        cy={center}
        r={3.2}
        color={GOLD}
      >
        <BlurMask
          blur={8}
          style="solid"
        />
      </Circle>

      <Circle
        cx={center}
        cy={center}
        r={1.6}
        color="#FFF2D2"
      />
    </Canvas>
  );
}

function TargetHud({
  frameSize,
  height,
  pulse,
  reverseSpin,
  scan,
  spin,
  width,
}: {
  frameSize: number;
  height: number;
  pulse: Animated.Value;
  reverseSpin: Animated.Value;
  scan: Animated.Value;
  spin: Animated.Value;
  width: number;
}): React.JSX.Element {
  const size =
    frameSize + 88;

  const left =
    (width - size) / 2;

  const top =
    (height - size) / 2;

  const outerRotation =
    spin.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        "0deg",
        "360deg",
      ],
    });

  const innerRotation =
    reverseSpin.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        "0deg",
        "-360deg",
      ],
    });

  const pulseScale =
    pulse.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        0.985,
        1.025,
      ],
    });

  const pulseOpacity =
    pulse.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        0.7,
        1,
      ],
    });

  const scanTranslateY =
    scan.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        -44,
        frameSize + 4,
      ],
    });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.targetHud,

        {
          height: size,
          left,
          top,
          width: size,

          opacity:
            pulseOpacity,

          transform: [
            {
              scale:
                pulseScale,
            },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,

          {
            transform: [
              {
                rotate:
                  outerRotation,
              },
            ],
          },
        ]}
      >
        <SpinRing
          colors={[
            "rgba(0,255,255,0)",
            "rgba(0,255,255,0.95)",
            "rgba(141,114,255,0.65)",
            "rgba(0,255,255,0)",
          ]}
          radius={
            frameSize * 0.49
          }
          size={size}
          strokeWidth={1.7}
        />
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFill,

          {
            transform: [
              {
                rotate:
                  innerRotation,
              },
            ],
          },
        ]}
      >
        <SpinRing
          colors={[
            "rgba(242,211,138,0)",
            "rgba(242,211,138,0.92)",
            "rgba(141,114,255,0.55)",
            "rgba(242,211,138,0)",
          ]}
          radius={
            frameSize * 0.39
          }
          size={size}
          strokeWidth={1.3}
        />
      </Animated.View>

      <TargetCore
        frameSize={
          frameSize
        }
        size={size}
      />

      <View
        style={[
          styles.scanWindow,

          {
            height:
              frameSize,

            left:
              (
                size -
                frameSize
              ) /
              2,

            top:
              (
                size -
                frameSize
              ) /
              2,

            width:
              frameSize,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.scanBeam,

            {
              transform: [
                {
                  translateY:
                    scanTranslateY,
                },
              ],
            },
          ]}
        >
          <Canvas
            style={
              StyleSheet.absoluteFill
            }
          >
            <Rect
              x={0}
              y={0}
              width={
                frameSize
              }
              height={42}
            >
              <SkiaLinearGradient
                start={
                  vec(
                    0,
                    0,
                  )
                }
                end={
                  vec(
                    0,
                    42,
                  )
                }
                colors={[
                  "rgba(0,255,255,0)",
                  "rgba(0,255,255,0.11)",
                  "rgba(0,255,255,0.75)",
                  "rgba(0,255,255,0)",
                ]}
                positions={[
                  0,
                  0.38,
                  0.5,
                  1,
                ]}
              />
            </Rect>
          </Canvas>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function KeepFlipFilamentModel({
  onReady,
  rotation,
}: {
  onReady: () => void;
  rotation: ISharedValue<Float3>;
}): React.JSX.Element {
  const model =
    useModel(
      KEEPFLIP_ICON_GLB,
    );

  const notifiedRef =
    useRef(false);

  useEffect(() => {
    if (
      model.state !==
        "loaded" ||
      notifiedRef.current
    ) {
      return;
    }

    notifiedRef.current =
      true;

    onReady();
  }, [
    model.state,
    onReady,
  ]);

  return (
    <ModelRenderer
      model={model}
      transformToUnitCube
      scale={MODEL_SCALE_VECTOR}
      castShadow={false}
      receiveShadow={false}
    >
      <ModelInstance
        index={0}
        rotate={rotation}
      />
    </ModelRenderer>
  );
}

function FilamentStage({
  onReady,
  reduceMotion,
}: {
  onReady: () => void;
  reduceMotion: boolean;
}): React.JSX.Element {
  const rotation =
    useSharedValue<Float3>([
      -0.05,
      -0.48,
      0,
    ]);

  const renderCallback:
    RenderCallback =
      useCallback(
        (
          frameInfo,
        ) => {
          "worklet";

          if (
            reduceMotion
          ) {
            return;
          }

          const frameDelta =
            Math.min(
              Math.max(
                frameInfo.timeSinceLastFrame,
                0,
              ),
              0.05,
            );

          // react-native-worklets-core shared values are intentionally mutable.
          // eslint-disable-next-line react-hooks/immutability
          rotation.value = [
            0,
            frameDelta *
              MODEL_ROTATION_RADIANS_PER_SECOND,
            0,
          ];
        },
        [
          reduceMotion,
          rotation,
        ],
      );

  return (
    <FilamentView
      enableTransparentRendering
      renderCallback={
        renderCallback
      }
      style={
        StyleSheet.absoluteFill
      }
    >
      <Camera
        cameraPosition={[
          0,
          0,
          5.25,
        ]}
        cameraTarget={[
          0,
          0,
          0,
        ]}
        cameraUp={[
          0,
          1,
          0,
        ]}
        focalLengthInMillimeters={
          46
        }
        near={0.1}
        far={50}
      />

      <DefaultLight />

      <Light
        type="point"
        colorKelvin={
          9_000
        }
        intensity={
          42_000
        }
        position={[
          2.7,
          1.7,
          3.4,
        ]}
        falloffRadius={8}
        castShadows={false}
      />

      <Light
        type="point"
        colorKelvin={
          3_200
        }
        intensity={
          32_000
        }
        position={[
          -2.5,
          -1.3,
          2.8,
        ]}
        falloffRadius={7}
        castShadows={false}
      />

      <KeepFlipFilamentModel
        onReady={
          onReady
        }
        rotation={
          rotation
        }
      />
    </FilamentView>
  );
}

export default function KeepFlipIntro({
  startupReady,
  onComplete,
}: KeepFlipIntroProps): React.JSX.Element {
  const {
    height,
    width,
  } =
    useWindowDimensions();

  const containerOpacity =
    useRef(
      new Animated.Value(0),
    ).current;

  const hudOpacity =
    useRef(
      new Animated.Value(0),
    ).current;

  const pulse =
    useRef(
      new Animated.Value(0),
    ).current;

  const spin =
    useRef(
      new Animated.Value(0),
    ).current;

  const reverseSpin =
    useRef(
      new Animated.Value(0),
    ).current;

  const scan =
    useRef(
      new Animated.Value(0),
    ).current;

  const completedRef =
    useRef(false);

  const [
    modelReady,
    setModelReady,
  ] =
    useState(false);

  const [
    modelFailed,
    setModelFailed,
  ] =
    useState(false);

  const [
    minimumDurationElapsed,
    setMinimumDurationElapsed,
  ] =
    useState(false);

  const [
    reduceMotion,
    setReduceMotion,
  ] =
    useState(false);

  const frameSize =
    Math.min(
      width * 0.72,
      height * 0.42,
      344,
    );

  const modelSettled =
    modelReady ||
    modelFailed;

  const canComplete =
    startupReady &&
    modelSettled &&
    minimumDurationElapsed;

  const handleModelReady =
    useCallback(() => {
      setModelReady(true);
      setModelFailed(false);
    }, []);

  const handleModelFailure =
    useCallback(() => {
      setModelFailed(true);
    }, []);

  const finish =
    useCallback(() => {
      if (
        completedRef.current
      ) {
        return;
      }

      completedRef.current =
        true;

      Animated.timing(
        containerOpacity,
        {
          toValue: 0,

          duration:
            reduceMotion
              ? 100
              : 480,

          easing:
            Easing.in(
              Easing.cubic,
            ),

          useNativeDriver:
            true,
        },
      ).start(() => {
        onComplete();
      });
    }, [
      containerOpacity,
      onComplete,
      reduceMotion,
    ]);

  useEffect(() => {
    void AccessibilityInfo
      .isReduceMotionEnabled()
      .then(
        setReduceMotion,
      );

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
    const entrance =
      Animated.parallel([
        Animated.timing(
          containerOpacity,
          {
            toValue: 1,

            duration:
              reduceMotion
                ? 100
                : 360,

            easing:
              Easing.out(
                Easing.cubic,
              ),

            useNativeDriver:
              true,
          },
        ),

        Animated.timing(
          hudOpacity,
          {
            toValue: 1,

            duration:
              reduceMotion
                ? 100
                : 760,

            delay:
              reduceMotion
                ? 0
                : 220,

            easing:
              Easing.out(
                Easing.cubic,
              ),

            useNativeDriver:
              true,
          },
        ),
      ]);

    const pulseLoop =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            pulse,
            {
              toValue: 1,
              duration: 950,

              easing:
                Easing.inOut(
                  Easing.sin,
                ),

              useNativeDriver:
                true,
            },
          ),

          Animated.timing(
            pulse,
            {
              toValue: 0,
              duration: 950,

              easing:
                Easing.inOut(
                  Easing.sin,
                ),

              useNativeDriver:
                true,
            },
          ),
        ]),
      );

    const spinLoop =
      Animated.loop(
        Animated.timing(
          spin,
          {
            toValue: 1,
            duration: 5_200,
            easing:
              Easing.linear,
            useNativeDriver:
              true,
          },
        ),
      );

    const reverseSpinLoop =
      Animated.loop(
        Animated.timing(
          reverseSpin,
          {
            toValue: 1,
            duration: 7_400,
            easing:
              Easing.linear,
            useNativeDriver:
              true,
          },
        ),
      );

    const scanLoop =
      Animated.loop(
        Animated.timing(
          scan,
          {
            toValue: 1,
            duration: 1_650,

            easing:
              Easing.inOut(
                Easing.cubic,
              ),

            useNativeDriver:
              true,
          },
        ),
      );

    entrance.start();

    if (!reduceMotion) {
      pulseLoop.start();
      spinLoop.start();
      reverseSpinLoop.start();
      scanLoop.start();
    }

    return () => {
      entrance.stop();
      pulseLoop.stop();
      spinLoop.stop();
      reverseSpinLoop.stop();
      scanLoop.stop();
    };
  }, [
    containerOpacity,
    hudOpacity,
    pulse,
    reduceMotion,
    reverseSpin,
    scan,
    spin,
  ]);

  useEffect(() => {
    const timeout =
      setTimeout(() => {
        setMinimumDurationElapsed(
          true,
        );
      }, INTRO_MINIMUM_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (
      modelReady ||
      modelFailed
    ) {
      return;
    }

    const timeout =
      setTimeout(() => {
        setModelFailed(true);
      }, MODEL_LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    modelFailed,
    modelReady,
  ]);

  useEffect(() => {
    if (!canComplete) {
      return;
    }

    finish();
  }, [
    canComplete,
    finish,
  ]);

  const statusText =
    !startupReady
      ? "INITIALIZING SYSTEMS"
      : modelReady
        ? "TARGET LOCKED"
        : modelFailed
          ? "VISUAL CORE BYPASSED"
          : "ACQUIRING TARGET";

  const loadingText =
    !startupReady
      ? "LOADING STARTUP ASSETS"
      : !modelSettled
        ? "CALIBRATING VISUAL CORE"
        : !minimumDurationElapsed
          ? "FINALIZING STARTUP"
          : "SYSTEM READY";

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
      <View
        pointerEvents="none"
        style={
          StyleSheet.absoluteFill
        }
      >
        <IntroBackdrop
          height={height}
          width={width}
        />
      </View>

      <View
        pointerEvents="none"
        style={
          StyleSheet.absoluteFill
        }
      >
        <IntroErrorBoundary
          onError={
            handleModelFailure
          }
        >
          <FilamentScene>
            <FilamentStage
              onReady={
                handleModelReady
              }
              reduceMotion={
                reduceMotion
              }
            />
          </FilamentScene>
        </IntroErrorBoundary>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.hudLayer,

          {
            opacity:
              hudOpacity,
          },
        ]}
      >
        <View
          style={
            styles.topReadout
          }
        >
          <View
            style={
              styles.statusDot
            }
          />

          <Text
            style={
              styles.topReadoutText
            }
          >
            KEEPFLIP // VALUE INTELLIGENCE
          </Text>
        </View>

        <TargetHud
          frameSize={
            frameSize
          }
          height={height}
          pulse={pulse}
          reverseSpin={
            reverseSpin
          }
          scan={scan}
          spin={spin}
          width={width}
        />

        <View
          style={
            styles.targetStatus
          }
        >
          <Text
            style={
              styles.targetStatusText
            }
          >
            {statusText}
          </Text>
        </View>

        <View
          style={
            styles.bottomBrand
          }
        >
          <Text
            style={
              styles.brandName
            }
          >
            KEEPFLIP
          </Text>

          <View
            style={
              styles.brandDivider
            }
          />

          <Text
            style={
              styles.brandTagline
            }
          >
            SEE VALUE BEFORE OTHERS DO
          </Text>
        </View>

        <Text
          style={
            styles.loadingLabel
          }
        >
          {loadingText}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFill,

      zIndex: 10_000,
      overflow: "hidden",

      backgroundColor:
        theme.colors.backgroundDeep,
    },

    hudLayer: {
      ...StyleSheet.absoluteFill,

      alignItems: "center",
    },

    targetHud: {
      position: "absolute",
    },

    scanWindow: {
      position: "absolute",
      overflow: "hidden",
    },

    scanBeam: {
      position: "absolute",

      top: 0,
      left: 0,

      height: 42,
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
        "rgba(0,255,255,0.26)",

      backgroundColor:
        "rgba(2,5,9,0.56)",

      boxShadow:
        "0 0 18px rgba(0,255,255,0.10)",
    },

    statusDot: {
      width: 5,
      height: 5,

      borderRadius: 999,

      backgroundColor:
        CYAN,

      boxShadow:
        "0 0 9px rgba(0,255,255,0.95)",
    },

    topReadoutText: {
      color:
        "rgba(225,255,255,0.84)",

      fontFamily:
        theme.fonts.radar,

      fontSize: 9,
      letterSpacing: 1.35,
    },

    targetStatus: {
      position: "absolute",
      top: "50%",

      transform: [
        {
          translateY: 196,
        },
      ],

      paddingHorizontal: 12,
      paddingVertical: 6,

      borderRadius: 999,
      borderCurve: "continuous",

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(242,211,138,0.26)",

      backgroundColor:
        "rgba(1,5,8,0.72)",
    },

    targetStatusText: {
      color: GOLD,

      fontFamily:
        theme.fonts.radar,

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

      fontSize: 33,
      letterSpacing: 1,

      textShadowColor:
        "rgba(0,255,255,0.48)",

      textShadowOffset: {
        width: 0,
        height: 0,
      },

      textShadowRadius: 15,
    },

    brandDivider: {
      width: 64,
      height: 1,

      backgroundColor:
        GOLD,

      boxShadow:
        "0 0 10px rgba(242,211,138,0.6)",
    },

    brandTagline: {
      color:
        theme.colors.textMuted,

      fontFamily:
        theme.fonts.display,

      fontSize: 9,
      letterSpacing: 2.05,
    },

    loadingLabel: {
      position: "absolute",
      bottom: 34,

      color:
        "rgba(173,167,178,0.58)",

      fontFamily:
        theme.fonts.radar,

      fontSize: 8,
      letterSpacing: 1.5,
    },
  });
