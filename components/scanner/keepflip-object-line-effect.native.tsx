import { memo, useSyncExternalStore } from "react";

import { KeepFlipObjectOverlay as KeepFlipObjectOverlayBase } from "@/components/scanner/keepflip-object-line-effect.base";
import type { KeepFlipLiveObjectDetection } from "@/services/live-object-detection";
import {
  getLatestCapturedObjectContours,
  subscribeToCapturedObjectContours,
} from "@/services/captured-object-detection.native";

type KeepFlipObjectOverlayProps = {
  detections: KeepFlipLiveObjectDetection[];
  frameHeight: number;
  frameWidth: number;
  viewHeight: number;
  viewWidth: number;
};

export const KeepFlipObjectOverlay = memo(function KeepFlipObjectOverlay({
  detections,
  frameHeight,
  frameWidth,
  viewHeight,
  viewWidth,
}: KeepFlipObjectOverlayProps) {
  const contours = useSyncExternalStore(
    subscribeToCapturedObjectContours,
    getLatestCapturedObjectContours,
    getLatestCapturedObjectContours,
  );

  return (
    <KeepFlipObjectOverlayBase
      contours={contours}
      detections={detections}
      frameHeight={frameHeight}
      frameWidth={frameWidth}
      viewHeight={viewHeight}
      viewWidth={viewWidth}
    />
  );
});
