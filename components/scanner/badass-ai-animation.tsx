import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Ai3DStage } from "@/components/scanner/ai-3d-stage";
import { ScanAiOverlay } from "@/components/scanner/scan-ai-overlay";

interface BadassAiAnimationProps {
  active?: boolean;
  height?: number;
  imageUri?: string;
  progress?: number;
  width?: number;
}

export function BadassAiAnimation({
  active = true,
  height,
  imageUri,
  progress = 0,
  width,
}: BadassAiAnimationProps) {
  const window = useWindowDimensions();
  const resolvedWidth = width ?? window.width;
  const resolvedHeight = height ?? window.height;
  const stageSize = Math.min(
    resolvedWidth,
    resolvedHeight * 0.58,
    420,
  );

  if (!active || resolvedWidth <= 0 || resolvedHeight <= 0) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.container}
    >
      <View style={styles.cyanBloom} />
      <View style={styles.violetBloom} />
      <View
        style={[
          styles.stageHost,
          { width: stageSize, height: stageSize },
        ]}
      >
        {false && (
          <Ai3DStage
            active
            imageUri={imageUri}
            progress={progress}
          />
        )}
      </View>
      <View style={styles.vignette} />
      <ScanAiOverlay
        active
        height={resolvedHeight}
        progress={progress}
        width={resolvedWidth}
      />
    </View>
  );
}

export default BadassAiAnimation;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(3, 2, 10, 0.26)",
  },
  stageHost: {
    position: "relative",
    overflow: "visible",
  },
  cyanBloom: {
    position: "absolute",
    top: "25%",
    left: "18%",
    width: "64%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(88, 223, 232, 0.045)",
    boxShadow: "0 0 74px rgba(88, 223, 232, 0.22)",
  },
  violetBloom: {
    position: "absolute",
    top: "32%",
    left: "27%",
    width: "48%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(141, 114, 255, 0.05)",
    boxShadow: "0 0 68px rgba(141, 114, 255, 0.22)",
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 45%, transparent 0%, rgba(1, 1, 3, 0.08) 42%, rgba(1, 1, 3, 0.68) 100%),
      linear-gradient(to bottom, rgba(1, 1, 3, 0.46) 0%, transparent 24%, transparent 70%, rgba(1, 1, 3, 0.74) 100%)
    `,
  },
});
