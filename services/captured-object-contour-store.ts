import type { CapturedObjectTraceResult } from "./captured-object-detection";

let latestContours: CapturedObjectTraceResult["contours"] = [];
const contourListeners = new Set<() => void>();

export function getLatestCapturedObjectContours() {
  return latestContours;
}

export function setLatestCapturedObjectContours(
  contours: CapturedObjectTraceResult["contours"],
) {
  latestContours = contours;
  contourListeners.forEach((listener) => listener());
}

export function subscribeToCapturedObjectContours(listener: () => void) {
  contourListeners.add(listener);
  return () => contourListeners.delete(listener);
}
