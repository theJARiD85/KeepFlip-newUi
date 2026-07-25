import type { ComponentProps } from "react";

import { ValueRadarTargetOverlay } from "./value-radar-chrome.native";
import { useValueRadar } from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export { useValueRadar };

export type ValueRadarOverlayProps = ComponentProps<
  typeof ValueRadarTargetOverlay
>;

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  return <ValueRadarTargetOverlay {...props} />;
}
