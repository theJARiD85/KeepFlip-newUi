import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

// GLSL and palette from the linked Figma Make liquid marbling project.
const vertexShader = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_time;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = turn * p * 2.03 + 9.7;
      amplitude *= 0.5;
    }
    return value;
  }

  vec3 palette(float t) {
    vec3 cyan = vec3(0.014, 0.072, 0.076);
    vec3 sky = vec3(0.018, 0.054, 0.072);
    vec3 violet = vec3(0.038, 0.028, 0.070);
    vec3 lilac = vec3(0.052, 0.038, 0.082);
    vec3 sand = vec3(0.070, 0.052, 0.026);
    if (t < 0.22) return mix(cyan, sky, t / 0.22);
    if (t < 0.48) return mix(sky, lilac, (t - 0.22) / 0.26);
    if (t < 0.74) return mix(lilac, violet, (t - 0.48) / 0.26);
    return mix(violet, sand, (t - 0.74) / 0.26);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.7;
    float t = u_time * 0.012;
    vec2 pointer = (u_pointer - 0.5) * vec2(aspect, 1.0);
    float pull = 0.22 * exp(-5.0 * length(p * 0.45 - pointer));

    vec2 q = vec2(
      fbm(p + vec2(0.0, t)),
      fbm(p + vec2(5.2, -t * 0.7))
    );
    vec2 r = vec2(
      fbm(p + 3.7 * q + vec2(1.7, 8.2) + t),
      fbm(p + 3.1 * q + vec2(8.3, 2.8) - t)
    );

    float field = fbm(p + 4.25 * r + pull * vec2(0.8, -0.65));
    field += 0.12 * sin((p.y + r.x * 2.5) * 3.2);
    field = clamp(field, 0.0, 1.0);

    float stepped = floor(field * 8.0) / 8.0;
    float blend = smoothstep(0.38, 0.62, fract(field * 8.0));
    float bands = mix(stepped, stepped + 1.0 / 8.0, blend * 0.6);
    vec3 color = palette(clamp(bands, 0.0, 1.0));

    float ridge = abs(fract(field * 11.0) - 0.5);
    float fineLine = 1.0 - smoothstep(0.455, 0.495, ridge);
    float hotLine = 1.0 - smoothstep(0.485, 0.499, ridge);
    float burstMap = fbm(p * 0.62 + r * 2.4 + vec2(-t * 2.0, t));
    float goldBurst = smoothstep(0.62, 0.78, burstMap) * fineLine;
    float cyanMap = fbm(p * 0.82 - r * 1.8 + vec2(t, -t * 0.7));
    float cyanPop = smoothstep(0.70, 0.86, cyanMap) * fineLine;
    float violetMap = noise(p * 18.0 + r * 7.0);
    float violetSpeck =
      smoothstep(0.91, 0.975, violetMap) *
      smoothstep(0.60, 0.78, fbm(p * 1.3 + vec2(6.0, -3.0)));

    color = mix(color, vec3(0.00, 0.48, 0.50), fineLine * 0.014);
    color = mix(color, vec3(0.58, 0.42, 0.15), hotLine * 0.009);
    color = mix(color, vec3(0.82, 0.56, 0.18), goldBurst * 0.32);
    color = mix(color, vec3(0.00, 0.78, 0.80), cyanPop * 0.3);
    color = mix(color, vec3(0.46, 0.28, 0.78), violetSpeck * 0.32);
    float glow = 0.08 * fbm(p * 3.0 + r * 2.0);
    color += glow * vec3(0.008, 0.022, 0.024);
    color *= 0.90 + 0.06 * (1.0 - length(uv - 0.5));
    gl_FragColor = vec4(color, 1.0);
  }
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn('[KeepFlip] Background shader compilation failed:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

export default function KeepFlipShader({ isLight = false }: { isLight?: boolean }) {
  const hostRef = useRef<HTMLElement | null>(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isFocused || typeof window === 'undefined') return;

    host.style.background = isLight
      ? 'transparent'
      : 'radial-gradient(ellipse at 25% 8%, #020d0e 0 15%, transparent 42%), radial-gradient(ellipse at 24% 62%, #0e0b13ff 0 18%, transparent 48%), #010302';

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[KeepFlip] Background shader linking failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const pointer = gl.getUniformLocation(program, 'u_pointer');
    const time = gl.getUniformLocation(program, 'u_time');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      opacity: '0',
      filter: 'brightness(0.96) saturate(0.94)',
      mixBlendMode: isLight ? 'multiply' : 'normal',
      transition: 'opacity 500ms ease',
      pointerEvents: 'none',
    });
    host.appendChild(canvas);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cursor = { x: 0.5, y: 0.5 };
    let frame = 0;
    let lastFrameAt = -40;
    let stopped = false;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1_500_000 / Math.max(width * height, 1)));
      const nextWidth = Math.max(1, Math.floor(width * scale));
      const nextHeight = Math.max(1, Math.floor(height * scale));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        gl.viewport(0, 0, nextWidth, nextHeight);
      }
    };

    const render = (now: number) => {
      frame = 0;
      if (stopped || document.visibilityState === 'hidden') return;
      if (!motionQuery.matches && now - lastFrameAt < 40) {
        frame = requestAnimationFrame(render);
        return;
      }
      resize();
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointer, cursor.x, cursor.y);
      gl.uniform1f(time, motionQuery.matches ? 0 : now * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      canvas.style.opacity = isLight ? '0.18' : '1';
      lastFrameAt = now;
      if (!motionQuery.matches) frame = requestAnimationFrame(render);
    };
    const start = () => {
      if (!frame && document.visibilityState !== 'hidden') frame = requestAnimationFrame(render);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(frame);
        frame = 0;
      } else start();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || motionQuery.matches) return;
      const bounds = host.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        cursor.x = 0.5;
        cursor.y = 0.5;
        return;
      }
      cursor.x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      cursor.y = 1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    };
    const onMotionChange = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      start();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(host);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    motionQuery.addEventListener('change', onMotionChange);
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      canvas.remove();
    };
  }, [isFocused, isLight]);

  return <View accessible={false} pointerEvents="none" ref={(node) => { hostRef.current = node as unknown as HTMLElement | null; }} style={styles.layer} />;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
});
