import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { AnalysisCallout } from "@/components/scanner/analysis-visual-types";
import { ValueRadarTargetGraphic } from "@/components/scanner/value-radar-target-graphic";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type AnalysisBiometricTargetProps = {
  active: boolean;
  callouts?: AnalysisCallout[];
  photoUri?: string;
  progress?: number;
  topInset: number;
  viewportHeight: number;
  viewportWidth: number;
};

export function AnalysisBiometricTarget({
  active,
  callouts = [],
  photoUri,
  progress = 0.1,
  topInset,
  viewportHeight,
  viewportWidth,
}: AnalysisBiometricTargetProps) {
  if (!active) return null;

  const width = Math.min(382, Math.max(284, viewportWidth - 28));
  const height = Math.min(390, Math.max(278, viewportHeight * 0.48));
  const targetSize = Math.min(176, width * 0.48);
  const resolvedPhotoUri = photoUri?.trim();

  return (
    <View pointerEvents="none" style={styles.container}>
      <View
        style={[
          styles.frame,
          {
            height,
            top: Math.max(topInset + 72, viewportHeight * 0.115),
            width,
          },
        ]}
      >
        {resolvedPhotoUri ? (
          <View style={[StyleSheet.absoluteFill, styles.image]}>
            <Image
              contentFit="cover"
              source={{ uri: resolvedPhotoUri }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}
        <View style={styles.wash} />
        <ValueRadarTargetGraphic
          animationKey="analysis"
          height={targetSize}
          label="valuation target"
          scoreText={`${Math.round(Math.max(0, Math.min(1, progress)) * 100)}% SCAN`}
          style={{
            left: (width - targetSize) / 2,
            top: height * 0.26,
          }}
          width={targetSize}
        />
        {callouts.slice(0, 3).map((callout, index) => (
          <View key={callout.id} style={[styles.callout, { top: 54 + index * 72 }]}>
            <Text style={styles.calloutLabel}>{callout.label}</Text>
            <Text numberOfLines={1} style={styles.calloutValue}>{callout.value}</Text>
          </View>
        ))}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(2, Math.min(100, progress * 100))}%` }]} />
        </View>
      </View>
    </View>
  );
}

const monoFont = Platform.OS === "ios" ? "Courier New" : "monospace";

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#01040A",
  },
  frame: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    backgroundColor: "#05070A",
  },
  image: { filter: "grayscale(1) contrast(1.24)" },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 12, 20, 0.25)" },
  callout: {
    position: "absolute",
    right: 10,
    maxWidth: "55%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.goldBright,
    backgroundColor: "rgba(0, 4, 11, 0.8)",
  },
  calloutLabel: { color: theme.colors.goldBright, fontFamily: monoFont, fontSize: 6, fontWeight: "900", letterSpacing: 1 },
  calloutValue: { color: "#FFFFFF", fontFamily: monoFont, fontSize: 9, fontWeight: "900" },
  progressTrack: { position: "absolute", right: 10, bottom: 9, left: 10, height: 3, backgroundColor: "rgba(0, 255, 255, 0.12)" },
  progressFill: { height: "100%", backgroundColor: theme.colors.goldBright },
});
