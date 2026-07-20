import KeepFlipLocalVisionModule from '@/modules/keepflip-local-vision/src/KeepFlipLocalVisionModule';
import type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';

let detectionCallCount = 0;
let lastDiagnosticAt = 0;

if (__DEV__) {
  console.info('[KeepFlip live vision] Android native backend loaded.');
}

export async function detectLiveObjects(
  frame: KeepFlipYuvFrame,
): Promise<KeepFlipLiveObjectDetection[]> {
  const call = ++detectionCallCount;
  const startedAt = Date.now();

  if (__DEV__ && call <= 3) {
    const describePlane = (plane: ArrayBuffer) => ({
      byteLength: plane?.byteLength,
      constructor: plane?.constructor?.name,
      firstByte: plane instanceof ArrayBuffer ? new Uint8Array(plane)[0] : undefined,
      isArrayBuffer: plane instanceof ArrayBuffer,
      tag: Object.prototype.toString.call(plane),
    });

    console.info('[KeepFlip live vision] Native frame payload.', {
      u: describePlane(frame.u),
      v: describePlane(frame.v),
      y: describePlane(frame.y),
    });
  }

  try {
    const detections = await KeepFlipLocalVisionModule.detectYuvFrame(frame);
    const now = Date.now();

    if (__DEV__ && (call <= 3 || now - lastDiagnosticAt >= 5000)) {
      lastDiagnosticAt = now;
      console.info('[KeepFlip live vision] Native frame processed.', {
        call,
        detections: detections.length,
        frame: `${frame.width}x${frame.height}`,
        processingMs: now - startedAt,
        rotationDegrees: frame.rotationDegrees,
      });
    }

    return detections;
  } catch (error) {
    if (__DEV__) {
      console.error('[KeepFlip live vision] Native frame failed.', {
        call,
        error,
        frame: `${frame.width}x${frame.height}`,
        processingMs: Date.now() - startedAt,
        rotationDegrees: frame.rotationDegrees,
      });
    }
    throw error;
  }
}

export type {
  KeepFlipLiveObjectDetection,
  KeepFlipYuvFrame,
} from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';
