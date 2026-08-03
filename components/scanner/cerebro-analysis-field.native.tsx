import { Image } from "expo-image";
import {
  type ExpoWebGLRenderingContext,
  GLView,
} from "expo-gl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  Animated,
  Easing,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as THREE from "three";

import {
  createLineProgram,
  createStaticBuffer,
  type LineProgramController,
} from "@/components/scanner/evidence-field.native";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

export type CerebroValuation = {
  confidence?: number | null;
  currency?: string;
  high?: number | null;
  low?: number | null;
  median: number;
};

type CerebroAnalysisFieldProps = {
  active: boolean;
  activityProgress?: number;
  isValuating?: boolean;
  lockConfidence?: number;
  onError?: (message: string) => void;
  photoUri?: string;
  style?: StyleProp<ViewStyle>;
  valuation?: CerebroValuation | null;
};

type MutableSceneInput = {
  active: boolean;
  activityProgress: number;
  isValuating: boolean;
  lockConfidence: number;
  pixelRatio: number;
};

type SceneController = {
  dispose: () => void;
  renderOnce: () => void;
  setBackdropAlpha: (alpha: number) => void;
  start: () => void;
  stop: () => void;
};

type GLBuffer = NonNullable<
  ReturnType<ExpoWebGLRenderingContext["createBuffer"]>
>;

type GLProgram = NonNullable<
  ReturnType<ExpoWebGLRenderingContext["createProgram"]>
>;

type GLShader = NonNullable<
  ReturnType<ExpoWebGLRenderingContext["createShader"]>
>;

type GLUniformLocation = NonNullable<
  ReturnType<ExpoWebGLRenderingContext["getUniformLocation"]>
>;

type Particle = {
  currentX: number;
  currentY: number;
  currentZ: number;
  phi: number;
  radius: number;
  speed: number;
  theta: number;
};

const PARTICLE_COUNT = 2500;
const CORE_RADIUS = 2;
const CAMERA_Z = 34;

const BACKGROUND = new THREE.Color("#030308");
const CYAN = new THREE.Color("#00F3FF");
const VIOLET = new THREE.Color("#8A2BE2");
const MAGENTA = new THREE.Color("#FF3CC7");
const GREEN = new THREE.Color("#00FF88");
const GOLD = new THREE.Color("#F2D38A");

const PARTICLE_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 aPosition;
  attribute float aPhase;
  attribute float aSize;

  uniform mat4 uProjectionMatrix;
  uniform mat4 uViewMatrix;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uIsValuating;
  uniform float uSuccessProgress;
  uniform float uActivityProgress;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 viewPosition =
      uViewMatrix * vec4(aPosition, 1.0);

    gl_Position =
      uProjectionMatrix * viewPosition;

    float pulse =
      sin(uTime * (1.2 + aPhase * 2.8) + aPhase * 18.0) * 0.5 + 0.5;

    float perspective =
      34.0 / max(5.0, -viewPosition.z);

    float collapseScale =
      mix(1.0, 0.08, uSuccessProgress);

    gl_PointSize = clamp(
      aSize *
        uPixelRatio *
        perspective *
        (0.72 + pulse * 0.62) *
        collapseScale,
      1.0,
      18.0
    );

    vec3 thinkingA = vec3(0.0, 0.953, 1.0);
    vec3 thinkingB = vec3(0.541, 0.169, 0.886);
    vec3 thinkingC = vec3(1.0, 0.235, 0.780);
    vec3 successA = vec3(0.0, 1.0, 0.533);
    vec3 successB = vec3(0.949, 0.827, 0.541);

    float colorTravel =
      fract(aPhase + uTime * 0.045 + pulse * 0.14);

    vec3 activeColor = mix(
      mix(thinkingA, thinkingB, smoothstep(0.0, 0.55, colorTravel)),
      thinkingC,
      smoothstep(0.55, 1.0, colorTravel)
    );

    vec3 successColor = mix(
      successA,
      successB,
      pulse * 0.45 + aPhase * 0.25
    );

    vColor = mix(
      activeColor,
      successColor,
      uSuccessProgress
    );

    vAlpha =
      (0.38 + pulse * 0.48) *
      (0.58 + uActivityProgress * 0.42) *
      mix(1.0, 0.42, uSuccessProgress);
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered =
      abs(gl_PointCoord - vec2(0.5));

    float edge = max(centered.x, centered.y);

    if (edge > 0.5) {
      discard;
    }

    float core =
      1.0 - smoothstep(0.22, 0.5, edge);

    float border =
      1.0 - smoothstep(0.43, 0.5, edge);

    float alpha =
      (core * 0.78 + border * 0.34) * vAlpha;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

function clampUnit(value?: number) {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }

  const normalized = value > 1 ? value / 100 : value;

  return Math.max(0, Math.min(1, normalized));
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
      style: "currency",
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticles(count: number) {
  const random = seededRandom(0x4b465053);
  const particles: Particle[] = [];
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const u = random();
    const v = random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const radius = 12 + random() * 10;

    const currentX =
      radius * Math.sin(phi) * Math.cos(theta);
    const currentY =
      radius * Math.sin(phi) * Math.sin(theta);
    const currentZ = radius * Math.cos(phi);

    particles.push({
      currentX,
      currentY,
      currentZ,
      phi,
      radius,
      speed: 0.4 + random() * 1.2,
      theta,
    });

    const offset = index * 3;
    positions[offset] = currentX;
    positions[offset + 1] = currentY;
    positions[offset + 2] = currentZ;
    phases[index] = random();
    sizes[index] = random() > 0.94
      ? 5.2 + random() * 4.8
      : 1.7 + random() * 3.1;
  }

  return {
    particles,
    phases,
    positions,
    sizes,
  };
}

function compileShader(
  gl: ExpoWebGLRenderingContext,
  type: number,
  source: string,
): GLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create an Expo GL shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const details =
      gl.getShaderInfoLog(shader) ||
      "Unknown shader compilation error.";

    gl.deleteShader(shader);
    throw new Error(details);
  }

  return shader;
}

function createProgram(
  gl: ExpoWebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): GLProgram {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
  );

  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
  );

  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Unable to create an Expo GL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const details =
      gl.getProgramInfoLog(program) ||
      "Unknown shader link error.";

    gl.deleteProgram(program);
    throw new Error(details);
  }

  return program;
}

function requiredAttribute(
  gl: ExpoWebGLRenderingContext,
  program: GLProgram,
  name: string,
) {
  const location = gl.getAttribLocation(program, name);

  if (location < 0) {
    throw new Error(`Missing GL attribute ${name}.`);
  }

  return location;
}

function requiredUniform(
  gl: ExpoWebGLRenderingContext,
  program: GLProgram,
  name: string,
): GLUniformLocation {
  const location = gl.getUniformLocation(program, name);

  if (!location) {
    throw new Error(`Missing GL uniform ${name}.`);
  }

  return location;
}

function bindFloatAttribute(
  gl: ExpoWebGLRenderingContext,
  buffer: GLBuffer,
  location: number,
  itemSize: number,
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(
    location,
    itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
}

function createDynamicBuffer(
  gl: ExpoWebGLRenderingContext,
  values: Float32Array,
) {
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error("Unable to allocate the particle buffer.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
  return buffer;
}

function floatPositions(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  return Float32Array.from(position.array as ArrayLike<number>);
}

function createCirclePositions(radius: number, segments: number) {
  const positions = new Float32Array(segments * 3);

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = Math.sin(angle) * radius;
    positions[offset + 2] = 0;
  }

  return positions;
}

function makeSceneController(
  gl: ExpoWebGLRenderingContext,
  inputRef: MutableRefObject<MutableSceneInput>,
  initialBackdropAlpha: number,
  reportError: (message: string, cause: unknown) => void,
): SceneController {
  const width = Math.max(1, gl.drawingBufferWidth);
  const height = Math.max(1, gl.drawingBufferHeight);

  gl.viewport(0, 0, width, height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);

  const camera = new THREE.PerspectiveCamera(
    60,
    width / height,
    0.1,
    100,
  );
  camera.position.set(0, 0, CAMERA_Z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const particleData = createParticles(PARTICLE_COUNT);
  const particleProgram = createProgram(
    gl,
    PARTICLE_VERTEX_SHADER,
    PARTICLE_FRAGMENT_SHADER,
  );

  const positionLocation = requiredAttribute(
    gl,
    particleProgram,
    "aPosition",
  );
  const phaseLocation = requiredAttribute(
    gl,
    particleProgram,
    "aPhase",
  );
  const sizeLocation = requiredAttribute(
    gl,
    particleProgram,
    "aSize",
  );

  const projectionLocation = requiredUniform(
    gl,
    particleProgram,
    "uProjectionMatrix",
  );
  const viewLocation = requiredUniform(
    gl,
    particleProgram,
    "uViewMatrix",
  );
  const timeLocation = requiredUniform(
    gl,
    particleProgram,
    "uTime",
  );
  const pixelRatioLocation = requiredUniform(
    gl,
    particleProgram,
    "uPixelRatio",
  );
  const valuatingLocation = requiredUniform(
    gl,
    particleProgram,
    "uIsValuating",
  );
  const successLocation = requiredUniform(
    gl,
    particleProgram,
    "uSuccessProgress",
  );
  const activityLocation = requiredUniform(
    gl,
    particleProgram,
    "uActivityProgress",
  );

  const particlePositionBuffer = createDynamicBuffer(
    gl,
    particleData.positions,
  );
  const particlePhaseBuffer = createStaticBuffer(
    gl,
    particleData.phases,
  );
  const particleSizeBuffer = createStaticBuffer(
    gl,
    particleData.sizes,
  );

  const lineProgram: LineProgramController = createLineProgram(gl);

  const coreGeometry = new THREE.IcosahedronGeometry(CORE_RADIUS, 1);
  const coreEdges = new THREE.EdgesGeometry(coreGeometry, 15);
  const corePositions = floatPositions(coreEdges);
  const coreBuffer = createStaticBuffer(gl, corePositions);
  coreGeometry.dispose();
  coreEdges.dispose();

  const shockwavePositions = createCirclePositions(2.7, 160);
  const shockwaveBuffer = createStaticBuffer(gl, shockwavePositions);

  const coreObject = new THREE.Object3D();
  const innerCoreObject = new THREE.Object3D();
  const shockwaveA = new THREE.Object3D();
  const shockwaveB = new THREE.Object3D();

  shockwaveA.rotation.set(1.1, 0.2, 0.4);
  shockwaveB.rotation.set(0.3, 1.0, -0.5);

  const coreMatrix = new THREE.Matrix4();
  const innerCoreMatrix = new THREE.Matrix4();
  const shockwaveMatrix = new THREE.Matrix4();

  const coreColor = VIOLET.clone();
  const innerCoreColor = CYAN.clone();

  const clock = new THREE.Clock();
  let backdropAlpha = initialBackdropAlpha;
  let successProgress = 0;
  let coreScale = 1;
  let globalRotation = 0;
  let disposed = false;
  let frameId: number | null = null;

  const renderLine = (
    object: THREE.Object3D,
    matrix: THREE.Matrix4,
    buffer: GLBuffer,
    vertexCount: number,
    mode: number,
    color: THREE.Color,
    opacity: number,
  ) => {
    object.updateMatrixWorld(true);
    matrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    matrix.premultiply(camera.projectionMatrix);
    lineProgram.draw(
      buffer,
      vertexCount,
      mode,
      matrix,
      color,
      opacity,
    );
  };

  const renderFrame = () => {
    if (disposed) {
      return;
    }

    const input = inputRef.current;
    const delta = Math.min(0.05, clock.getDelta());
    const elapsed = clock.elapsedTime;
    const valuating = input.isValuating;
    const frameFactor = Math.min(3, delta * 60);

    successProgress = THREE.MathUtils.lerp(
      successProgress,
      valuating ? 0 : 1,
      1 - Math.pow(0.93, frameFactor),
    );

    globalRotation += delta * (valuating ? 0.18 : 0.045);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const particle = particleData.particles[index];
      const offset = index * 3;

      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;

      if (valuating) {
        particle.theta += delta * 0.18 * particle.speed;

        const waveRadius =
          particle.radius +
          Math.sin(elapsed * 1.15 + index * 0.73) * 1.5;

        const theta = particle.theta + globalRotation;

        targetX =
          waveRadius *
          Math.sin(particle.phi) *
          Math.cos(theta);
        targetY =
          waveRadius *
          Math.sin(particle.phi) *
          Math.sin(theta);
        targetZ = waveRadius * Math.cos(particle.phi);
      }

      const lerpAmount = valuating
        ? 1 - Math.pow(0.90, frameFactor)
        : 1 - Math.pow(0.82, frameFactor);

      particle.currentX = THREE.MathUtils.lerp(
        particle.currentX,
        targetX,
        lerpAmount,
      );
      particle.currentY = THREE.MathUtils.lerp(
        particle.currentY,
        targetY,
        lerpAmount,
      );
      particle.currentZ = THREE.MathUtils.lerp(
        particle.currentZ,
        targetZ,
        lerpAmount,
      );

      particleData.positions[offset] = particle.currentX;
      particleData.positions[offset + 1] = particle.currentY;
      particleData.positions[offset + 2] = particle.currentZ;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, particlePositionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, particleData.positions);

    coreScale = THREE.MathUtils.lerp(
      coreScale,
      valuating ? 1 : 3.2,
      1 - Math.pow(0.95, frameFactor),
    );

    if (valuating) {
      coreObject.rotation.y = elapsed * 1.5;
      coreObject.rotation.x = elapsed * 0.8;
      coreObject.rotation.z = elapsed * 0.42;
    } else {
      coreObject.rotation.y = elapsed * 0.2;
      coreObject.rotation.x = Math.sin(elapsed * 0.24) * 0.18;
      coreObject.rotation.z = Math.cos(elapsed * 0.18) * 0.12;
    }

    coreObject.scale.setScalar(coreScale);
    innerCoreObject.rotation.copy(coreObject.rotation);
    innerCoreObject.rotation.y *= -1.25;
    innerCoreObject.scale.setScalar(
      coreScale * (valuating ? 0.72 : 0.46),
    );

    coreColor.lerp(
      valuating ? VIOLET : GREEN,
      1 - Math.pow(0.88, frameFactor),
    );
    innerCoreColor.lerp(
      valuating ? MAGENTA : GOLD,
      1 - Math.pow(0.90, frameFactor),
    );

    const shockCycleA = (elapsed * 0.35) % 1;
    const shockCycleB = (elapsed * 0.35 + 0.5) % 1;

    shockwaveA.scale.setScalar(
      0.75 + shockCycleA * (2.4 + successProgress * 2.8),
    );
    shockwaveB.scale.setScalar(
      0.75 + shockCycleB * (2.4 + successProgress * 2.8),
    );
    shockwaveA.rotation.z += delta * 0.11;
    shockwaveB.rotation.z -= delta * 0.09;

    camera.updateMatrixWorld(true);

    gl.clearColor(
      BACKGROUND.r,
      BACKGROUND.g,
      BACKGROUND.b,
      backdropAlpha,
    );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(particleProgram);
    bindFloatAttribute(
      gl,
      particlePositionBuffer,
      positionLocation,
      3,
    );
    bindFloatAttribute(gl, particlePhaseBuffer, phaseLocation, 1);
    bindFloatAttribute(gl, particleSizeBuffer, sizeLocation, 1);

    gl.uniformMatrix4fv(
      projectionLocation,
      false,
      camera.projectionMatrix.elements,
    );
    gl.uniformMatrix4fv(
      viewLocation,
      false,
      camera.matrixWorldInverse.elements,
    );
    gl.uniform1f(timeLocation, elapsed);
    gl.uniform1f(pixelRatioLocation, input.pixelRatio);
    gl.uniform1f(valuatingLocation, valuating ? 1 : 0);
    gl.uniform1f(successLocation, successProgress);
    gl.uniform1f(
      activityLocation,
      Math.max(0.08, input.activityProgress),
    );
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

    const coreVertexCount = corePositions.length / 3;
    renderLine(
      coreObject,
      coreMatrix,
      coreBuffer,
      coreVertexCount,
      gl.LINES,
      coreColor,
      valuating ? 0.72 : 0.88,
    );
    renderLine(
      innerCoreObject,
      innerCoreMatrix,
      coreBuffer,
      coreVertexCount,
      gl.LINES,
      innerCoreColor,
      valuating ? 0.42 : 0.72,
    );

    const ringCount = shockwavePositions.length / 3;
    const shockOpacity = valuating ? 0.09 : 0.20;
    renderLine(
      shockwaveA,
      shockwaveMatrix,
      shockwaveBuffer,
      ringCount,
      gl.LINE_LOOP,
      valuating ? CYAN : GREEN,
      shockOpacity * (1 - shockCycleA),
    );
    renderLine(
      shockwaveB,
      shockwaveMatrix,
      shockwaveBuffer,
      ringCount,
      gl.LINE_LOOP,
      valuating ? MAGENTA : GOLD,
      shockOpacity * (1 - shockCycleB),
    );

    gl.flush();
    gl.endFrameEXP();
  };

  const stop = () => {
    if (frameId == null) {
      return;
    }

    cancelAnimationFrame(frameId);
    frameId = null;
  };

  const tick = () => {
    frameId = null;

    const shouldContinue =
      inputRef.current.active ||
      (!inputRef.current.isValuating && successProgress < 0.995);

    if (disposed || !shouldContinue) {
      return;
    }

    try {
      renderFrame();
    } catch (caught) {
      stop();
      reportError(
        "KeepFlip could not render the valuation scene.",
        caught,
      );
      return;
    }

    const continueAfterFrame =
      inputRef.current.active ||
      (!inputRef.current.isValuating && successProgress < 0.995);

    if (continueAfterFrame) {
      frameId = requestAnimationFrame(tick);
    }
  };

  const start = () => {
    if (disposed || frameId != null) {
      return;
    }

    clock.getDelta();
    frameId = requestAnimationFrame(tick);
  };

  const renderOnce = () => {
    if (disposed) {
      return;
    }

    try {
      renderFrame();
    } catch (caught) {
      reportError(
        "KeepFlip could not render the valuation scene.",
        caught,
      );
    }
  };

  renderFrame();

  if (
    inputRef.current.active ||
    !inputRef.current.isValuating
  ) {
    start();
  }

  return {
    start,
    stop,
    renderOnce,

    setBackdropAlpha(alpha) {
      backdropAlpha = clampUnit(alpha);

      if (!inputRef.current.active) {
        renderOnce();
      }
    },

    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      stop();

      gl.deleteBuffer(particlePositionBuffer);
      gl.deleteBuffer(particlePhaseBuffer);
      gl.deleteBuffer(particleSizeBuffer);
      gl.deleteBuffer(coreBuffer);
      gl.deleteBuffer(shockwaveBuffer);
      gl.deleteProgram(particleProgram);
      lineProgram.dispose();
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);
    },
  };
}

function valuationPosition(valuation: CerebroValuation) {
  if (
    finiteNumber(valuation.low) &&
    finiteNumber(valuation.high) &&
    valuation.high! > valuation.low!
  ) {
    return Math.max(
      0.05,
      Math.min(
        0.95,
        (valuation.median - valuation.low!) /
          (valuation.high! - valuation.low!),
      ),
    );
  }

  return Math.max(
    0.18,
    Math.min(
      0.9,
      0.48 + clampUnit(valuation.confidence ?? 0.72) * 0.36,
    ),
  );
}

function ValuationGauge({ valuation }: { valuation: CerebroValuation }) {
  const reveal = useRef(new Animated.Value(0)).current;
  const position = valuationPosition(valuation);
  const currency = valuation.currency || "USD";
  const valuationKey = [
    valuation.median,
    valuation.low,
    valuation.high,
    valuation.currency,
  ].join(":");

  useEffect(() => {
    reveal.stopAnimation();
    reveal.setValue(0);

    const animation = Animated.sequence([
      Animated.delay(220),
      Animated.timing(reveal, {
        duration: 880,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [reveal, valuationKey]);

  const panelStyle = {
    opacity: reveal,
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
      {
        scale: reveal.interpolate({
          inputRange: [0, 0.72, 1],
          outputRange: [0.84, 1.04, 1],
        }),
      },
    ],
  };

  const needleRotation = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: ["-108deg", `${-108 + position * 216}deg`],
  });

  const segments = Array.from({ length: 25 });

  return (
    <Animated.View pointerEvents="none" style={[styles.gauge, panelStyle]}>
      <View style={styles.gaugeHeader}>
        <View style={styles.successSignal} />
        <Text style={styles.gaugeEyebrow}>VALUATION SIGNAL ACQUIRED</Text>
      </View>

      <View style={styles.arc}>
        {segments.map((_, index) => {
          const progress = index / Math.max(1, segments.length - 1);
          const angle = -108 + progress * 216;
          const lit = progress <= position;

          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  backgroundColor: lit
                    ? index < 9
                      ? "#00F3FF"
                      : index < 17
                        ? "#8A2BE2"
                        : "#00FF88"
                    : "rgba(255,255,255,0.08)",
                  opacity: lit ? 0.95 : 0.38,
                  transform: [
                    { rotate: `${angle}deg` },
                    { translateY: -44 },
                  ],
                },
              ]}
            />
          );
        })}

        <Animated.View
          style={[
            styles.needle,
            { transform: [{ rotate: needleRotation }] },
          ]}
        >
          <View style={styles.needleLine} />
        </Animated.View>
        <View style={styles.needleHub} />
      </View>

      <Text style={styles.valueLabel}>ESTIMATED RESALE VALUE</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.valueText}>
        {formatMoney(valuation.median, currency)}
      </Text>

      {finiteNumber(valuation.low) && finiteNumber(valuation.high) ? (
        <Text style={styles.rangeText}>
          {formatMoney(valuation.low!, currency)} — {formatMoney(valuation.high!, currency)}
        </Text>
      ) : null}
    </Animated.View>
  );
}

export function CerebroAnalysisField({
  active,
  activityProgress = 0.08,
  isValuating,
  lockConfidence = 0,
  onError,
  photoUri,
  style,
  valuation,
}: CerebroAnalysisFieldProps) {
  const pixelRatio = useMemo(
    () => Math.min(1.75, Math.max(1, PixelRatio.get())),
    [],
  );

  const resolvedIsValuating =
    isValuating ?? !(valuation && finiteNumber(valuation.median));

  const inputRef = useRef<MutableSceneInput>({
    active,
    activityProgress: Math.max(0.08, clampUnit(activityProgress)),
    isValuating: resolvedIsValuating,
    lockConfidence: clampUnit(lockConfidence),
    pixelRatio,
  });

  inputRef.current.active = active;
  inputRef.current.activityProgress = Math.max(
    0.08,
    clampUnit(activityProgress),
  );
  inputRef.current.isValuating = resolvedIsValuating;
  inputRef.current.lockConfidence = clampUnit(lockConfidence);
  inputRef.current.pixelRatio = pixelRatio;

  const controllerRef = useRef<SceneController | null>(null);

  const reportError = useCallback(
    (message: string, cause: unknown) => {
      console.error("[KeepFlip ValuationScene]", message, cause);
      onError?.(message);
    },
    [onError],
  );

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      controllerRef.current?.dispose();

      try {
        controllerRef.current = makeSceneController(
          gl,
          inputRef,
          photoUri ? 0.56 : 1,
          reportError,
        );
      } catch (caught) {
        reportError(
          "KeepFlip could not initialize the valuation scene.",
          caught,
        );
      }
    },
    [photoUri, reportError],
  );

  useEffect(() => {
    const controller = controllerRef.current;

    if (!controller) {
      return;
    }

    if (active || !resolvedIsValuating) {
      controller.start();
    } else {
      controller.stop();
      controller.renderOnce();
    }
  }, [active, resolvedIsValuating]);

  useEffect(() => {
    if (!active) {
      controllerRef.current?.renderOnce();
    }
  }, [active, activityProgress, lockConfidence, resolvedIsValuating]);

  useEffect(() => {
    controllerRef.current?.setBackdropAlpha(photoUri ? 0.56 : 1);
  }, [photoUri]);

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    [],
  );

  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      {photoUri ? (
        <Image
          blurRadius={9}
          contentFit="cover"
          source={{ uri: photoUri }}
          style={styles.photo}
          transition={120}
        />
      ) : null}

      <View style={styles.backdrop} />

      <GLView
        onContextCreate={handleContextCreate}
        style={styles.canvas}
      />

      <View style={styles.statusPanel}>
        <View
          style={[
            styles.statusSignal,
            resolvedIsValuating
              ? styles.statusSignalThinking
              : styles.statusSignalSuccess,
          ]}
        />
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>KEEPFLIP VALUATION CORE</Text>
          <Text style={styles.statusSubtitle}>
            {resolvedIsValuating
              ? "SCOURING MARKET DATA"
              : "VALUATION LOCKED"}
          </Text>
        </View>
      </View>

      {valuation && finiteNumber(valuation.median) ? (
        <ValuationGauge valuation={valuation} />
      ) : null}

      <View style={styles.edgeFade} />
    </View>
  );
}

export default CerebroAnalysisField;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundDeep,
  },
  photo: {
    ...StyleSheet.absoluteFill,
    opacity: 0.18,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(3, 3, 8, 0.46)",
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 45%, rgba(138, 43, 226, 0.14) 0%, transparent 34%),
      radial-gradient(circle at 18% 58%, rgba(0, 243, 255, 0.10) 0%, transparent 42%),
      radial-gradient(circle at 82% 62%, rgba(255, 60, 199, 0.08) 0%, transparent 40%),
      linear-gradient(to bottom, rgba(3, 3, 8, 0.72) 0%, rgba(3, 3, 8, 0.10) 48%, rgba(3, 3, 8, 0.82) 100%)
    `,
  },
  canvas: {
    ...StyleSheet.absoluteFill,
  },
  statusPanel: {
    position: "absolute",
    top: 72,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(138, 43, 226, 0.30)",
    backgroundColor: "rgba(3, 3, 8, 0.68)",
  },
  statusSignal: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusSignalThinking: {
    backgroundColor: "#00F3FF",
    boxShadow: "0 0 10px rgba(0, 243, 255, 0.92)",
  },
  statusSignalSuccess: {
    backgroundColor: "#00FF88",
    boxShadow: "0 0 12px rgba(0, 255, 136, 0.92)",
  },
  statusCopy: {
    gap: 1,
  },
  statusTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  statusSubtitle: {
    color: "#8A2BE2",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  gauge: {
    position: "absolute",
    right: 18,
    bottom: 42,
    left: 18,
    minHeight: 210,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 16,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 136, 0.38)",
    backgroundColor: "rgba(4, 3, 8, 0.88)",
    boxShadow:
      "0 18px 44px rgba(0,0,0,0.54), 0 0 24px rgba(0,255,136,0.10)",
  },
  gaugeHeader: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  successSignal: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#00FF88",
    boxShadow: "0 0 10px rgba(0,255,136,0.90)",
  },
  gaugeEyebrow: {
    color: "#00FF88",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  arc: {
    width: 138,
    height: 82,
    marginTop: 7,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  segment: {
    position: "absolute",
    bottom: 5,
    width: 3,
    height: 13,
    borderRadius: 2,
    transformOrigin: "50% 49px",
  },
  needle: {
    position: "absolute",
    bottom: 6,
    width: 4,
    height: 48,
    alignItems: "center",
    transformOrigin: "50% 100%",
  },
  needleLine: {
    width: 3,
    height: 43,
    borderRadius: 2,
    backgroundColor: "#F2D38A",
    boxShadow: "0 0 10px rgba(242,211,138,0.90)",
  },
  needleHub: {
    position: "absolute",
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#F2D38A",
    backgroundColor: "#05040A",
  },
  valueLabel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  valueText: {
    maxWidth: "100%",
    color: "#FFFFFF",
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,255,136,0.44)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  rangeText: {
    color: "rgba(242,211,138,0.82)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.35,
  },
  edgeFade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 47%, transparent 0%, transparent 44%, rgba(3,3,8,0.20) 72%, rgba(3,3,8,0.72) 100%)
    `,
  },
});
