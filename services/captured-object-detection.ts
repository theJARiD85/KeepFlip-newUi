import type { KeepFlipLiveObjectDetection } from "@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types";

export type CapturedObjectTraceResult = {
  contours: { points: number[] }[];
  detections: KeepFlipLiveObjectDetection[];
  frameHeight: number;
  frameWidth: number;
  sourceUri: string;
};

function toFileUri(source: string) {
  const trimmed = source.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `file://${trimmed.replaceAll("\\", "/")}`;
}

export async function detectObjectsInCapturedPhoto(
  source: string,
): Promise<CapturedObjectTraceResult> {
  return {
    contours: [],
    detections: [],
    frameHeight: 1,
    frameWidth: 1,
    sourceUri: toFileUri(source),
  };
}
