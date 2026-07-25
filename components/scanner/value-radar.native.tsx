import type { ComponentProps } from "react";

import { ValueRadarCommandHud } from "./value-radar-command-hud.native.android";
import { useValueRadar } from "./value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "./value-radar-visual.native";

export { useValueRadar };

export type ValueRadarOverlayProps = ComponentProps<
  typeof ValueRadarCommandHud
>;

export function ValueRadarOverlay(props: ValueRadarOverlayProps) {
  return <ValueRadarCommandHud {...props} />;
}
