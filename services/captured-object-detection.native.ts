import {
  detectObjectsInCapturedPhoto as detectObjectsInCapturedPhotoAndroid,
  type CapturedObjectTraceResult,
} from "./captured-object-detection.android";
import { setLatestCapturedObjectContours } from "./captured-object-contour-store";

export type { CapturedObjectTraceResult };

export async function detectObjectsInCapturedPhoto(
  source: string,
): Promise<CapturedObjectTraceResult> {
  const result = await detectObjectsInCapturedPhotoAndroid(source);
  setLatestCapturedObjectContours(result.contours);
  return result;
}
