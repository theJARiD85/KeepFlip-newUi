import {
  detectObjectsInCapturedPhoto as detectObjectsInCapturedPhotoAndroid,
  type CapturedObjectTraceResult,
} from "./captured-object-detection.android";

export type { CapturedObjectTraceResult };

let latestContours: CapturedObjectTraceResult["contours"] = [];
const contourListeners = new Set<() => void>();

export function getLatestCapturedObjectContours() {
  return latestContours;
}

export function subscribeToCapturedObjectContours(listener: () => void) {
  contourListeners.add(listener);
  return () => contourListeners.delete(listener);
}

export async function detectObjectsInCapturedPhoto(
  source: string,
): Promise<CapturedObjectTraceResult> {
  const result = await detectObjectsInCapturedPhotoAndroid(source);
  latestContours = result.contours;
  contourListeners.forEach((listener) => listener());
  return result;
}
