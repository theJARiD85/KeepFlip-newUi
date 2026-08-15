import { AdvancedHoloOverlay } from '@/components/scanner/advanced-holo-overlay';
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

type HudImageFrameProps = {
  confidence?: number;
  height?: number;
  onError?: (message: string) => void;
  photoBytes?: ArrayBuffer | Uint8Array;
  photoUri?: string;
  statusText?: string;
  width?: number;
};


function percentage(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

export function HudImageFrame({
  confidence,
  height = 330,
  onError,
  photoBytes,
  photoUri,
  statusText = "CAPTURED EVIDENCE",
  width = 330,
}: HudImageFrameProps) {
  const confidenceLabel = percentage(confidence);

  // The current result flow normally supplies a local URI. Accepting photoBytes
  // keeps this component API-compatible with older result-screen code without
  // mounting another Three.js or Filament renderer.
  useEffect(() => {
    if (!photoUri && photoBytes) {
      onError?.(
        "The result image was provided as bytes without a local URI. The result data remains available.",
      );
    }
  }, [onError, photoBytes, photoUri]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.frame,
        {
          height,
          width,
        },
      ]}
    >
      <AdvancedHoloOverlay
        width={width}
        height={height}
      />
      {photoUri ? (
        <Image
          contentFit="contain"
          onError={() => onError?.("KeepFlip could not display the captured image.")}
          source={{ uri: photoUri }}
          style={styles.image}
          transition={160}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>PHOTO SIGNAL UNAVAILABLE</Text>
        </View>
      )}
      <View style={styles.statusBar}>
        <View style={styles.liveDot} />
        <Text numberOfLines={1} style={styles.statusText}>
          {statusText}
        </Text>
        {confidenceLabel != null ? (
          <Text style={styles.confidence}>{confidenceLabel}%</Text>
        ) : null}
      </View>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />


    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: 50,

    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(215, 168, 74, 0.32)",
    backgroundColor: "rgba(3, 3, 7, 0.84)",
    boxShadow:
      "0 16px 34px rgba(0, 0, 0, 0.48), 0 0 24px rgba(88, 223, 232, 0.12)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  emptyState: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
  },
  topLeft: {
    top: 10,
    left: 10,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.scannerCyan,
  },
  topRight: {
    top: 10,
    right: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: theme.colors.scannerAmber,
  },
  bottomLeft: {
    bottom: 10,
    left: 10,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: theme.colors.scannerViolet,
  },
  bottomRight: {
    right: 10,
    bottom: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.colors.scannerCyan,
  },
  statusBar: {
    position: "absolute",
    right: 16,
    top: 14,
    left: 16,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 9px rgba(88, 223, 232, 0.92)",
  },
  statusText: {
    flex: 1,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  confidence: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
});
