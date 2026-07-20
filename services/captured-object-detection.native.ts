export type CapturedObjectTraceResult = {
  contours: { points: number[] }[];
  detections: never[];
  frameHeight: number;
  frameWidth: number;
  sourceUri: string;
};

/**
 * Compatibility shim for the scanner screen.
 *
 * KeepFlip no longer performs local object contour extraction. The captured
 * photo is sent through the normal item-analysis flow, and Tripo generates the
 * actual 3D model in the backend.
 */
export async function detectObjectsInCapturedPhoto(
  source: string,
): Promise<CapturedObjectTraceResult> {
  return {
    contours: [],
    detections: [],
    frameHeight: 1,
    frameWidth: 1,
    sourceUri: source,
  };
}
