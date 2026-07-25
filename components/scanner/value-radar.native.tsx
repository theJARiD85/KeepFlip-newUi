import type { ComponentProps } from "react";

import { ValueRadarPresentationOverlay } from "./value-radar-presentation.native.android";
import { useValueRadar } from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export { useValueRadar };

export type ValueRadarOverlayProps = ComponentProps<
  typeof ValueRadarPresentationOverlay
>;

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  return <ValueRadarPresentationOverlay {...props} />;
}
