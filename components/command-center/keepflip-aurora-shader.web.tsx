import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

type KeepFlipAuroraShaderProps = {
  isLight?: boolean;
};

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  varying vec2 vUv;

  float sdEllipsoid(vec3 p, vec3 radius) {
    float k0 = length(p / radius);
    float k1 = length(p / (radius * radius));
    return k0 * (k0 - 1.0) / max(k1, 0.0001);
  }

  float smoothUnion(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }

  float sceneDistance(vec3 point, float time) {
    vec3 p = point;
    float angle = time * 0.085 + p.y * 0.11;
    float cs = cos(angle);
    float sn = sin(angle);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;
    p.x += 0.10 * sin(p.y * 2.6 + time * 0.16);

    float cyanMass = sdEllipsoid(p - vec3(-0.43, 0.09, 0.0), vec3(0.94, 0.68, 0.58));
    float violetMass = sdEllipsoid(p - vec3(0.63, -0.12, -0.16), vec3(0.70, 0.82, 0.58));
    float lightRibbon = sdEllipsoid(p - vec3(0.02, 0.02, 0.04), vec3(1.23, 0.15, 0.23));
    return smoothUnion(smoothUnion(cyanMass, violetMass, 0.62), lightRibbon, 0.25);
  }

  vec3 sceneNormal(vec3 point, float time) {
    float e = 0.003;
    return normalize(vec3(
      sceneDistance(point + vec3(e, 0.0, 0.0), time) - sceneDistance(point - vec3(e, 0.0, 0.0), time),
      sceneDistance(point + vec3(0.0, e, 0.0), time) - sceneDistance(point - vec3(0.0, e, 0.0), time),
      sceneDistance(point + vec3(0.0, 0.0, e), time) - sceneDistance(point - vec3(0.0, 0.0, e), time)
    ));
  }

  void main() {
    vec2 centered = vUv - 0.5;
    vec2 screen = centered * vec2(uResolution.x / max(uResolution.y, 1.0) * 1.72, 1.18);
    screen.x += (uPointer.x - 0.5) * 0.10;
    screen.y += (uPointer.y - 0.5) * 0.07;

    vec3 rayOrigin = vec3(0.0, 0.0, 4.0);
    vec3 rayDirection = normalize(vec3(screen, -1.68));
    vec3 cyan = vec3(0.02, 0.84, 0.91);
    vec3 violet = vec3(0.56, 0.43, 1.0);
    float distanceAlongRay = 0.0;
    vec3 volume = vec3(0.0);
    vec3 surface = vec3(0.0);
    float surfaceAmount = 0.0;

    for (int i = 0; i < 52; i++) {
      vec3 point = rayOrigin + rayDirection * distanceAlongRay;
      float distanceToSurface = sceneDistance(point, uTime);
      float colorBlend = clamp(0.48 + point.y * 0.36 + 0.13 * sin(point.x * 2.0 + uTime * 0.14), 0.0, 1.0);
      vec3 tint = mix(cyan, violet, colorBlend);
      volume += tint * exp(-abs(distanceToSurface) * 5.4) * 0.014;

      if (distanceToSurface < 0.003) {
        vec3 normal = sceneNormal(point, uTime);
        vec3 lightDirection = normalize(vec3(-0.45, 0.72, 0.55));
        float diffuse = max(dot(normal, lightDirection), 0.0);
        float rim = pow(1.0 - max(dot(normal, -rayDirection), 0.0), 3.0);
        surface = tint * (0.18 + diffuse * 0.65) + mix(cyan, violet, 0.62) * rim * 0.82;
        surfaceAmount = 1.0;
        break;
      }

      distanceAlongRay += max(abs(distanceToSurface) * 0.78, 0.018);
      if (distanceAlongRay > 7.8) break;
    }

    float cyanHalo = exp(-dot(vUv - vec2(0.18, 0.75), vUv - vec2(0.18, 0.75)) * 8.5);
    float violetHalo = exp(-dot(vUv - vec2(0.82, 0.27), vUv - vec2(0.82, 0.27)) * 9.0);
    float pointerHalo = exp(-distance(vUv, uPointer) * 11.0) * 0.045;
    vec3 radiance = volume * 1.9 + surface * surfaceAmount * 0.64;
    radiance += cyan * (cyanHalo * 0.20 + pointerHalo * 0.34);
    radiance += violet * (violetHalo * 0.17 + pointerHalo * 0.16);

    float vignette = 1.0 - smoothstep(0.26, 0.84, length(centered * vec2(0.95, 1.0)));
    radiance *= 0.72 + 0.28 * vignette;
    float alpha = clamp(max(max(radiance.r, radiance.g), radiance.b) * 0.54, 0.0, 0.36);
    gl_FragColor = vec4(clamp(radiance, 0.0, 1.0), alpha);
  }
`;

export function KeepFlipAuroraShader({ isLight = false }: KeepFlipAuroraShaderProps) {
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === 'undefined' || typeof document === 'undefined') return;

    host.style.background =
      'radial-gradient(ellipse at 12% 12%, rgba(0, 226, 239, 0.12), transparent 39%), radial-gradient(ellipse at 88% 24%, rgba(141, 114, 255, 0.14), transparent 42%)';
    host.style.opacity = isLight ? '0.48' : '1';

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      return;
    }

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.72));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.mixBlendMode = 'screen';
    host.appendChild(renderer.domElement);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || window.innerWidth));
      const height = Math.max(1, Math.round(rect.height || window.innerHeight));
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };
    resize();

    let frameId = 0;
    let lastFrameAt = 0;
    let disposed = false;
    let targetPointer = new THREE.Vector2(0.5, 0.5);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const isReducedMotion = () => reducedMotion?.matches ?? false;

    const render = (now: number) => {
      if (disposed || document.visibilityState === 'hidden') {
        frameId = 0;
        return;
      }
      if (!isReducedMotion() && now - lastFrameAt < 40) {
        frameId = window.requestAnimationFrame(render);
        return;
      }
      const time = isReducedMotion() ? 0 : now * 0.00011;
      uniforms.uTime.value = time;
      uniforms.uPointer.value.lerp(targetPointer, 0.065);
      renderer.render(scene, camera);
      lastFrameAt = now;
      if (isReducedMotion()) frameId = 0;
      else frameId = window.requestAnimationFrame(render);
    };
    const start = () => {
      if (frameId || disposed || document.visibilityState === 'hidden') return;
      frameId = window.requestAnimationFrame(render);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else {
        lastFrameAt = 0;
        start();
      }
    };
    const onMotionPreferenceChange = () => {
      if (reducedMotion?.matches) {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
        uniforms.uTime.value = 0;
        targetPointer.set(0.5, 0.5);
        renderer.render(scene, camera);
      } else {
        lastFrameAt = 0;
        start();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || isReducedMotion()) return;
      const rect = host.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        targetPointer.set(0.5, 0.5);
        return;
      }
      targetPointer.set((event.clientX - rect.left) / Math.max(rect.width, 1), 1 - (event.clientY - rect.top) / Math.max(rect.height, 1));
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(host);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion?.addEventListener?.('change', onMotionPreferenceChange);
    start();

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion?.removeEventListener?.('change', onMotionPreferenceChange);
      plane.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [isLight]);

  return (
    <View
      ref={(node) => {
        hostRef.current = node as unknown as HTMLElement | null;
      }}
      accessible={false}
      style={styles.layer}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
});
