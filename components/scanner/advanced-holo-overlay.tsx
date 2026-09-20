import { StyleSheet, View } from 'react-native';

export interface AdvancedHoloOverlayProps {
  width: number;
  height: number;
}

/**
 * Browser-safe version of the inventory holographic effect. The native
 * sibling keeps the original Skia shader; web uses CSS gradients so the
 * inventory workspace never loads a native TurboModule.
 */
export function AdvancedHoloOverlay({
  height,
  width,
}: AdvancedHoloOverlayProps) {
  if (width <= 0 || height <= 0) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { height, width }]}>
      <View style={styles.vignette} />
      <View style={styles.scanlines} />
      <View style={styles.glow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 3,
    overflow: 'hidden',
    mixBlendMode: 'screen',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 224, 238, 0.055)',
    experimental_backgroundImage:
      'radial-gradient(circle at 50% 44%, rgba(106, 236, 247, 0.24) 0%, rgba(0, 178, 196, 0.09) 42%, rgba(0, 0, 0, 0) 78%)',
  },
  scanlines: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
    experimental_backgroundImage:
      'repeating-linear-gradient(0deg, rgba(100, 240, 250, 0.24) 0px, rgba(100, 240, 250, 0.24) 1px, transparent 1px, transparent 5px)',
  },
  glow: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(236, 255, 255, 0.86)',
    boxShadow:
      '0 0 18px rgba(75, 235, 246, 0.94), 0 0 42px rgba(75, 235, 246, 0.55)',
  },
});
