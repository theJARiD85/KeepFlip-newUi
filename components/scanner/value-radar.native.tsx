import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ValueRadarOverlay as ValueRadarVisualOverlay,
  useValueRadar,
} from "@/components/scanner/value-radar-visual.native";

export type {
  ValueRadarMarker,
  ValueRadarStatus,
  ValueRadarViewport,
} from "@/components/scanner/value-radar-visual.native";

export { useValueRadar }; 

type ValueRadarOverlayProps = ComponentProps<
  typeof ValueRadarVisualOverlay
> & {
  flashButton?: ReactNode;
};

export function ValueRadarOverlay({
  flashButton,
  focusBounds,
  ...overlayProps
}: ValueRadarOverlayProps) {
  const insets = useSafeAreaInsets();
  const flashTop = focusBounds?.y != null ? focusBounds.y + 20 : insets.top + 20;
  const flashLeft = focusBounds?.x != null ? focusBounds.x + 20 : 20;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <ValueRadarVisualOverlay
        {...overlayProps}
        focusBounds={focusBounds}
      />

      {flashButton ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.flashButtonHost,
            {
              left: flashLeft,
              top: flashTop,
            },
          ]}
        >
          {flashButton}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flashButtonHost: {
    position: "absolute",
    zIndex: 80,
    elevation: 80,
  },
});
