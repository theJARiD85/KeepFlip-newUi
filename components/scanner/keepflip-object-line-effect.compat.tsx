type KeepFlipObjectOverlayProps = {
  detections: readonly unknown[];
  frameHeight: number;
  frameWidth: number;
  viewHeight: number;
  viewWidth: number;
};

/**
 * Compatibility shim retained until the scanner screen is next refactored.
 * Tripo now provides the generated 3D model, so KeepFlip no longer draws a
 * locally inferred contour or wireframe over the captured photo.
 */
export function KeepFlipObjectOverlay(
  _props: KeepFlipObjectOverlayProps,
): null {
  return null;
}
