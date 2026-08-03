import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";

const POINT_COUNT = 1700;
const FIELD_RADIUS = 2.65;
const CONNECTION_COUNT = 320;

const SEARCHING_INDIGO = new THREE.Color("#6F00FF");
const SEARCHING_CYAN = new THREE.Color("#58DFE8");
const SEARCHING_MAGENTA = new THREE.Color("#FF4FD8");
const SEARCHING_GREEN = new THREE.Color("#5CFF9D");
const LOCKED_GOLD = new THREE.Color("#D7A84A");
const HIGHLIGHT_GOLD = new THREE.Color("#F2D38A");

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

type PointField = {
  activations: Float32Array;
  lockThresholds: Float32Array;
  phases: Float32Array;
  positions: Float32Array;
  sizes: Float32Array;
};

type ConnectionField = {
  positions: Float32Array;
};

export type LineProgramController = {
  draw: (
    positionBuffer: GLBuffer,
    vertexCount: number,
    mode: number,
    modelViewProjection: THREE.Matrix4,
    color: THREE.Color,
    opacity: number,
  ) => void;
  dispose: () => void;
};

export type EvidenceFieldController = {
  group: THREE.Group;
  draw: (
    projectionMatrix: THREE.Matrix4,
    viewMatrix: THREE.Matrix4,
  ) => void;
  update: (
    elapsed: number,
    delta: number,
    activityProgress: number,
    lockConfidence: number,
    pixelRatio: number,
  ) => void;
  dispose: () => void;
};

const LINE_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 aPosition;
  uniform mat4 uModelViewProjection;

  void main() {
    gl_Position =
      uModelViewProjection *
      vec4(aPosition, 1.0);
  }
`;

const LINE_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor =
      vec4(uColor, uOpacity);
  }
`;

const POINT_VERTEX_SHADER = `
  precision highp float;

  uniform mat4 uProjectionMatrix;
  uniform mat4 uModelViewMatrix;
  uniform float uTime;
  uniform float uActivityProgress;
  uniform float uLockConfidence;
  uniform float uPixelRatio;

  attribute vec3 aPosition;
  attribute float aSize;
  attribute float aPhase;
  attribute float aActivation;
  attribute float aLockThreshold;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float activity = smoothstep(
      aActivation - 0.14,
      aActivation + 0.04,
      uActivityProgress
    );

    float localLock = smoothstep(
      aLockThreshold - 0.20,
      aLockThreshold + 0.08,
      uLockConfidence
    );

    float radialDistance = length(aPosition);
    float neuralWave = sin(
      uTime * 1.8 +
      aPhase * 8.0 +
      radialDistance * 4.2
    );

    vec3 direction = normalize(aPosition + vec3(0.0001));
    vec3 animatedPosition =
      aPosition +
      direction * neuralWave * 0.045;

    animatedPosition.y +=
      sin(uTime * 0.9 + aPhase * 12.0) * 0.025;

    float verticalScan = sin(
      animatedPosition.y * 5.2 -
      uTime * 2.45 +
      aPhase * 2.4
    ) * 0.5 + 0.5;

    float pulse = sin(
      uTime * 2.7 +
      aPhase * 11.0
    ) * 0.5 + 0.5;

    vec4 mvPosition =
      uModelViewMatrix *
      vec4(animatedPosition, 1.0);

    gl_Position =
      uProjectionMatrix * mvPosition;

    float perspectiveScale =
      21.0 / max(1.0, -mvPosition.z);

    gl_PointSize = clamp(
      aSize *
        uPixelRatio *
        perspectiveScale *
        (0.86 + pulse * 0.52),
      0.0,
      20.0
    );

    gl_PointSize *= activity;

    vec3 indigo = vec3(
      ${SEARCHING_INDIGO.r},
      ${SEARCHING_INDIGO.g},
      ${SEARCHING_INDIGO.b}
    );

    vec3 cyan = vec3(
      ${SEARCHING_CYAN.r},
      ${SEARCHING_CYAN.g},
      ${SEARCHING_CYAN.b}
    );

    vec3 magenta = vec3(
      ${SEARCHING_MAGENTA.r},
      ${SEARCHING_MAGENTA.g},
      ${SEARCHING_MAGENTA.b}
    );

    vec3 green = vec3(
      ${SEARCHING_GREEN.r},
      ${SEARCHING_GREEN.g},
      ${SEARCHING_GREEN.b}
    );

    vec3 gold = vec3(
      ${LOCKED_GOLD.r},
      ${LOCKED_GOLD.g},
      ${LOCKED_GOLD.b}
    );

    vec3 brightGold = vec3(
      ${HIGHLIGHT_GOLD.r},
      ${HIGHLIGHT_GOLD.g},
      ${HIGHLIGHT_GOLD.b}
    );

    float colorBand = fract(
      aPhase +
      verticalScan * 0.28 +
      uTime * 0.025
    );

    vec3 coolColor = mix(
      indigo,
      cyan,
      smoothstep(0.0, 0.42, colorBand)
    );

    vec3 hotColor = mix(
      magenta,
      green,
      smoothstep(0.42, 1.0, colorBand)
    );

    vec3 searchingColor = mix(
      coolColor,
      hotColor,
      smoothstep(0.28, 0.82, colorBand)
    );

    float globalGold = smoothstep(
      0.52,
      1.0,
      uLockConfidence
    );

    float centerLock =
      1.0 -
      smoothstep(
        0.35,
        2.65,
        radialDistance
      );

    float lockWave = smoothstep(
      -0.18,
      0.12,
      uLockConfidence -
        aLockThreshold -
        radialDistance * 0.035
    );

    float goldAmount =
      globalGold *
      (
        0.16 +
        localLock * 0.42 +
        centerLock * 0.20 +
        lockWave * 0.22
      );

    goldAmount = min(0.78, goldAmount);

    vec3 lockedColor = mix(
      gold,
      brightGold,
      pulse * 0.66
    );

    vColor = mix(
      searchingColor,
      lockedColor,
      goldAmount
    );

    vAlpha =
      activity *
      (
        0.34 +
        pulse * 0.38 +
        localLock * 0.20
      );
  }
`;

const POINT_FRAGMENT_SHADER = `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered =
      gl_PointCoord - vec2(0.5);

    float distanceFromCenter =
      length(centered);

    if (distanceFromCenter > 0.5) {
      discard;
    }

    float core =
      1.0 -
      smoothstep(
        0.0,
        0.20,
        distanceFromCenter
      );

    float middle =
      (
        1.0 -
        smoothstep(
          0.08,
          0.38,
          distanceFromCenter
        )
      ) * 0.55;

    float halo =
      (
        1.0 -
        smoothstep(
          0.18,
          0.5,
          distanceFromCenter
        )
      ) * 0.30;

    float alpha =
      (core + middle + halo) *
      vAlpha;

    gl_FragColor =
      vec4(vColor, alpha);
  }
`;

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1,
    );

    value ^=
      value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61,
      );

    return (
      ((value ^ (value >>> 14)) >>> 0) /
      4294967296
    );
  };
}


function signedCurve(
  random: () => number,
) {
  const value =
    random() * 2 - 1;

  return (
    Math.sign(value) *
    Math.pow(
      Math.abs(value),
      0.72,
    )
  );
}

function brainPoint(
  random: () => number,
  scale: number,
  outerBias = 0,
): [number, number, number] {
  const hemisphere =
    random() < 0.5 ? -1 : 1;

  const shell =
    Math.max(
      outerBias,
      Math.pow(random(), 0.52),
    );

  const x =
    hemisphere *
      (0.38 + shell * 1.05) +
    signedCurve(random) * 0.22;

  const y =
    signedCurve(random) *
    (0.45 + shell * 0.92);

  const z =
    signedCurve(random) *
    (0.32 + shell * 0.72);

  const lobeWave =
    Math.sin(
      y * 3.2 +
      z * 2.8,
    ) * 0.12;

  return [
    (x + hemisphere * lobeWave) * scale,
    y * scale,
    z * scale,
  ];
}

function createPointField(
  count: number,
  radius: number,
): PointField {
  const random = seededRandom(0x4b465031);
  const scale = radius / 2.65;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const activations = new Float32Array(count);
  const lockThresholds = new Float32Array(count);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const offset = index * 3;
    const [x, y, z] =
      brainPoint(random, scale);

    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;

    const anchorNode =
      random() > 0.945;

    sizes[index] = anchorNode
      ? 6.4 + random() * 5.8
      : 1.5 + random() * 3.4;

    phases[index] = random();

    const centerDistance =
      Math.min(
        1,
        Math.sqrt(
          x * x +
          y * y +
          z * z,
        ) / radius,
      );

    activations[index] = Math.min(
      0.97,
      anchorNode
        ? 0.02 + random() * 0.24
        : 0.04 +
          centerDistance * 0.30 +
          random() * 0.62,
    );

    lockThresholds[index] =
      0.08 + random() * 0.86;
  }

  return {
    activations,
    lockThresholds,
    phases,
    positions,
    sizes,
  };
}

function randomPointOnSphere(
  random: () => number,
  radius: number,
): [number, number, number] {
  const y = random() * 2 - 1;
  const azimuth =
    random() * Math.PI * 2;

  const horizontalRadius =
    Math.sqrt(
      Math.max(0, 1 - y * y),
    );

  return [
    radius *
      horizontalRadius *
      Math.cos(azimuth),
    radius * y,
    radius *
      horizontalRadius *
      Math.sin(azimuth),
  ];
}

function createConnectionField(
  count: number,
  radius: number,
): ConnectionField {
  const random = seededRandom(0x43455245);
  const scale = radius / 2.65;
  const positions =
    new Float32Array(count * 2 * 3);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const start =
      brainPoint(random, scale, 0.28);

    const hemisphere =
      Math.sign(start[0]) || 1;

    const reach =
      (0.16 + random() * 0.58) *
      scale;

    const end: [
      number,
      number,
      number,
    ] = [
      start[0] +
        hemisphere *
          (random() - 0.42) *
          reach,
      start[1] +
        signedCurve(random) *
          reach,
      start[2] +
        signedCurve(random) *
          reach * 0.78,
    ];

    const offset = index * 6;

    positions[offset] = start[0];
    positions[offset + 1] = start[1];
    positions[offset + 2] = start[2];
    positions[offset + 3] = end[0];
    positions[offset + 4] = end[1];
    positions[offset + 5] = end[2];
  }

  return { positions };
}

function compileShader(
  gl: ExpoWebGLRenderingContext,
  type: number,
  source: string,
): GLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error(
      "Unable to create an Expo GL shader.",
    );
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (
    !gl.getShaderParameter(
      shader,
      gl.COMPILE_STATUS,
    )
  ) {
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

    throw new Error(
      "Unable to create an Expo GL program.",
    );
  }

  gl.attachShader(
    program,
    vertexShader,
  );

  gl.attachShader(
    program,
    fragmentShader,
  );

  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (
    !gl.getProgramParameter(
      program,
      gl.LINK_STATUS,
    )
  ) {
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
  const location =
    gl.getAttribLocation(
      program,
      name,
    );

  if (location < 0) {
    throw new Error(
      `Missing GL attribute ${name}.`,
    );
  }

  return location;
}

function requiredUniform(
  gl: ExpoWebGLRenderingContext,
  program: GLProgram,
  name: string,
): GLUniformLocation {
  const location =
    gl.getUniformLocation(
      program,
      name,
    );

  if (location == null) {
    throw new Error(
      `Missing GL uniform ${name}.`,
    );
  }

  return location;
}

export function createStaticBuffer(
  gl: ExpoWebGLRenderingContext,
  values: Float32Array,
): GLBuffer {
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error(
      "Unable to allocate an Expo GL buffer.",
    );
  }

  gl.bindBuffer(
    gl.ARRAY_BUFFER,
    buffer,
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    values,
    gl.STATIC_DRAW,
  );

  return buffer;
}

function bindFloatAttribute(
  gl: ExpoWebGLRenderingContext,
  buffer: GLBuffer,
  location: number,
  itemSize: number,
) {
  gl.bindBuffer(
    gl.ARRAY_BUFFER,
    buffer,
  );

  gl.enableVertexAttribArray(
    location,
  );

  gl.vertexAttribPointer(
    location,
    itemSize,
    gl.FLOAT,
    false,
    0,
    0,
  );
}

export function createLineProgram(
  gl: ExpoWebGLRenderingContext,
): LineProgramController {
  const program = createProgram(
    gl,
    LINE_VERTEX_SHADER,
    LINE_FRAGMENT_SHADER,
  );

  const positionLocation =
    requiredAttribute(
      gl,
      program,
      "aPosition",
    );

  const matrixLocation =
    requiredUniform(
      gl,
      program,
      "uModelViewProjection",
    );

  const colorLocation =
    requiredUniform(
      gl,
      program,
      "uColor",
    );

  const opacityLocation =
    requiredUniform(
      gl,
      program,
      "uOpacity",
    );

  const matrixValues =
    new Float32Array(16);

  return {
    draw(
      positionBuffer,
      vertexCount,
      mode,
      modelViewProjection,
      color,
      opacity,
    ) {
      if (
        vertexCount <= 0 ||
        opacity <= 0
      ) {
        return;
      }

      gl.useProgram(program);

      bindFloatAttribute(
        gl,
        positionBuffer,
        positionLocation,
        3,
      );

      matrixValues.set(
        modelViewProjection.elements,
      );

      gl.uniformMatrix4fv(
        matrixLocation,
        false,
        matrixValues,
      );

      gl.uniform3f(
        colorLocation,
        color.r,
        color.g,
        color.b,
      );

      gl.uniform1f(
        opacityLocation,
        opacity,
      );

      gl.drawArrays(
        mode,
        0,
        vertexCount,
      );
    },

    dispose() {
      gl.deleteProgram(program);
    },
  };
}

export function createEvidenceField(
  gl: ExpoWebGLRenderingContext,
  lineProgram: LineProgramController,
  initialPixelRatio: number,
): EvidenceFieldController {
  const group = new THREE.Group();

  const connectionObject =
    new THREE.Object3D();

  const pointObject =
    new THREE.Object3D();

  group.add(
    connectionObject,
    pointObject,
  );

  const connectionField =
    createConnectionField(
      CONNECTION_COUNT,
      FIELD_RADIUS,
    );

  const connectionBuffer =
    createStaticBuffer(
      gl,
      connectionField.positions,
    );

  const pointField =
    createPointField(
      POINT_COUNT,
      FIELD_RADIUS,
    );

  const positionBuffer =
    createStaticBuffer(
      gl,
      pointField.positions,
    );

  const sizeBuffer =
    createStaticBuffer(
      gl,
      pointField.sizes,
    );

  const phaseBuffer =
    createStaticBuffer(
      gl,
      pointField.phases,
    );

  const activationBuffer =
    createStaticBuffer(
      gl,
      pointField.activations,
    );

  const lockThresholdBuffer =
    createStaticBuffer(
      gl,
      pointField.lockThresholds,
    );

  const pointProgram = createProgram(
    gl,
    POINT_VERTEX_SHADER,
    POINT_FRAGMENT_SHADER,
  );

  const positionLocation =
    requiredAttribute(
      gl,
      pointProgram,
      "aPosition",
    );

  const sizeLocation =
    requiredAttribute(
      gl,
      pointProgram,
      "aSize",
    );

  const phaseLocation =
    requiredAttribute(
      gl,
      pointProgram,
      "aPhase",
    );

  const activationLocation =
    requiredAttribute(
      gl,
      pointProgram,
      "aActivation",
    );

  const lockThresholdLocation =
    requiredAttribute(
      gl,
      pointProgram,
      "aLockThreshold",
    );

  const projectionLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uProjectionMatrix",
    );

  const modelViewLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uModelViewMatrix",
    );

  const timeLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uTime",
    );

  const activityLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uActivityProgress",
    );

  const lockLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uLockConfidence",
    );

  const pixelRatioLocation =
    requiredUniform(
      gl,
      pointProgram,
      "uPixelRatio",
    );

  const connectionColor =
    SEARCHING_CYAN.clone();

  const connectionBaseColor =
    SEARCHING_CYAN.clone();

  const modelViewProjection =
    new THREE.Matrix4();

  const modelView =
    new THREE.Matrix4();

  const projectionValues =
    new Float32Array(16);

  const modelViewValues =
    new Float32Array(16);

  let currentActivity = 0.04;
  let currentLock = 0;
  let currentPixelRatio =
    initialPixelRatio;
  let currentTime = 0;
  let connectionOpacity = 0.03;
  let disposed = false;

  return {
    group,

    update(
      elapsed,
      delta,
      activityProgress,
      lockConfidence,
      pixelRatio,
    ) {
      if (disposed) return;

      const activity =
        clampUnit(activityProgress);

      const lock =
        clampUnit(lockConfidence);

      connectionObject.rotation.y +=
        delta * 0.028;

      connectionObject.rotation.x =
        Math.sin(elapsed * 0.17) *
        0.08;

      connectionObject.rotation.z =
        Math.cos(elapsed * 0.13) *
        0.05;

      connectionOpacity =
        THREE.MathUtils.lerp(
          connectionOpacity,
          0.018 + activity * 0.12,
          0.065,
        );

      connectionBaseColor.lerpColors(
        SEARCHING_CYAN,
        SEARCHING_MAGENTA,
        Math.sin(elapsed * 0.75) * 0.5 + 0.5,
      );

      connectionBaseColor.lerp(
        SEARCHING_GREEN,
        (
          Math.sin(elapsed * 0.43 + 1.3) +
          1
        ) * 0.16,
      );

      const connectionGold =
        THREE.MathUtils.smoothstep(
          lock,
          0.58,
          1,
        ) * 0.55;

      connectionColor.lerpColors(
        connectionBaseColor,
        LOCKED_GOLD,
        connectionGold,
      );

      pointObject.rotation.y +=
        delta * 0.044;

      pointObject.rotation.x =
        Math.sin(elapsed * 0.21) *
        0.11;

      pointObject.rotation.z =
        Math.cos(elapsed * 0.16) *
        0.07;

      currentTime = elapsed;

      currentActivity =
        THREE.MathUtils.lerp(
          currentActivity,
          Math.max(
            0.045,
            activity,
          ),
          0.055,
        );

      currentLock =
        THREE.MathUtils.lerp(
          currentLock,
          lock,
          0.04,
        );

      currentPixelRatio =
        pixelRatio;
    },

    draw(
      projectionMatrix,
      viewMatrix,
    ) {
      if (disposed) return;

      modelViewProjection
        .multiplyMatrices(
          viewMatrix,
          connectionObject.matrixWorld,
        );

      modelViewProjection
        .premultiply(
          projectionMatrix,
        );

      lineProgram.draw(
        connectionBuffer,
        connectionField.positions.length / 3,
        gl.LINES,
        modelViewProjection,
        connectionColor,
        connectionOpacity,
      );

      gl.useProgram(pointProgram);

      bindFloatAttribute(
        gl,
        positionBuffer,
        positionLocation,
        3,
      );

      bindFloatAttribute(
        gl,
        sizeBuffer,
        sizeLocation,
        1,
      );

      bindFloatAttribute(
        gl,
        phaseBuffer,
        phaseLocation,
        1,
      );

      bindFloatAttribute(
        gl,
        activationBuffer,
        activationLocation,
        1,
      );

      bindFloatAttribute(
        gl,
        lockThresholdBuffer,
        lockThresholdLocation,
        1,
      );

      modelView.multiplyMatrices(
        viewMatrix,
        pointObject.matrixWorld,
      );

      projectionValues.set(
        projectionMatrix.elements,
      );

      modelViewValues.set(
        modelView.elements,
      );

      gl.uniformMatrix4fv(
        projectionLocation,
        false,
        projectionValues,
      );

      gl.uniformMatrix4fv(
        modelViewLocation,
        false,
        modelViewValues,
      );

      gl.uniform1f(
        timeLocation,
        currentTime,
      );

      gl.uniform1f(
        activityLocation,
        currentActivity,
      );

      gl.uniform1f(
        lockLocation,
        currentLock,
      );

      gl.uniform1f(
        pixelRatioLocation,
        currentPixelRatio,
      );

      gl.drawArrays(
        gl.POINTS,
        0,
        POINT_COUNT,
      );
    },

    dispose() {
      if (disposed) return;
      disposed = true;

      group.remove(
        connectionObject,
        pointObject,
      );

      gl.deleteBuffer(
        connectionBuffer,
      );

      gl.deleteBuffer(
        positionBuffer,
      );

      gl.deleteBuffer(
        sizeBuffer,
      );

      gl.deleteBuffer(
        phaseBuffer,
      );

      gl.deleteBuffer(
        activationBuffer,
      );

      gl.deleteBuffer(
        lockThresholdBuffer,
      );

      gl.deleteProgram(
        pointProgram,
      );
    },
  };
}
