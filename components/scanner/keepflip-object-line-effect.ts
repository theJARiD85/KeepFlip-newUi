import {
  PaintStyle,
  Skia,
  type SkCanvas,
} from "@shopify/react-native-skia";

import type { KeepFlipLiveObjectDetection } from "@/services/live-object-detection";

const objectGlowPaint = Skia.Paint();
objectGlowPaint.setAntiAlias(true);
objectGlowPaint.setColor(Skia.Color("#28E9FF"));
objectGlowPaint.setAlphaf(0.22);
objectGlowPaint.setStyle(PaintStyle.Stroke);
objectGlowPaint.setStrokeWidth(10);

const objectCorePaint = Skia.Paint();
objectCorePaint.setAntiAlias(true);
objectCorePaint.setColor(Skia.Color("#B8FBFF"));
objectCorePaint.setAlphaf(0.95);
objectCorePaint.setStyle(PaintStyle.Stroke);
objectCorePaint.setStrokeWidth(3.25);

const objectAccentPaint = Skia.Paint();
objectAccentPaint.setAntiAlias(true);
objectAccentPaint.setColor(Skia.Color("#FFBC38"));
objectAccentPaint.setAlphaf(0.88);
objectAccentPaint.setStyle(PaintStyle.Stroke);
objectAccentPaint.setStrokeWidth(1.4);

/**
 * Draws native-detector results in the raw Frame coordinate system.
 * SkiaCamera applies the Frame orientation and mirror transform afterward,
 * keeping the detector geometry attached to the camera image.
 */
export function drawDetectedObjectOutlines(
  canvas: SkCanvas,
  frameWidth: number,
  frameHeight: number,
  detections: KeepFlipLiveObjectDetection[],
) {
  "worklet";

  for (let index = 0; index < detections.length; index += 1) {
    const box = detections[index].boundingBox;
    const x = box.x * frameWidth;
    const y = box.y * frameHeight;
    const width = box.width * frameWidth;
    const height = box.height * frameHeight;

    if (width < 4 || height < 4) continue;

    const inset = Math.min(width, height) * 0.018;
    const radius = Math.max(8, Math.min(width, height) * 0.075);
    const outer = Skia.RRectXY(
      Skia.XYWHRect(x, y, width, height),
      radius,
      radius,
    );
    const inner = Skia.RRectXY(
      Skia.XYWHRect(
        x + inset,
        y + inset,
        Math.max(1, width - inset * 2),
        Math.max(1, height - inset * 2),
      ),
      Math.max(4, radius - inset),
      Math.max(4, radius - inset),
    );

    canvas.drawRRect(outer, objectGlowPaint);
    canvas.drawRRect(outer, objectCorePaint);
    canvas.drawRRect(inner, objectAccentPaint);
  }
}
