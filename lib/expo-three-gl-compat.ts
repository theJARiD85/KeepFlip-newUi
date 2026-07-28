type ThreeRenderer = {
  getContext: () => NativeGlContext;
};

type NativeGlContext = {
  UNPACK_COLORSPACE_CONVERSION_WEBGL: number;
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: number;
  pixelStorei: (parameter: number, value: boolean | number) => void;
};

const configuredContexts = new WeakSet<object>();

/**
 * Three.js configures four WebGL unpack flags before every texture upload.
 * Expo GL supports flip-y and alignment, but its native implementation logs
 * warnings for premultiplied-alpha and browser color-space conversion before
 * ignoring them. Preserve Expo GL's behavior while preventing repeated
 * warnings for those two known no-op flags.
 */
export function configureExpoGlForThree(renderer: ThreeRenderer) {
  const context = renderer.getContext();
  if (configuredContexts.has(context)) return;

  const originalPixelStore = context.pixelStorei.bind(context);
  const unsupportedParameters = new Set([
    context.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
  ]);

  context.pixelStorei = (parameter, value) => {
    if (unsupportedParameters.has(parameter)) return;
    originalPixelStore(parameter, value);
  };

  configuredContexts.add(context);
}
