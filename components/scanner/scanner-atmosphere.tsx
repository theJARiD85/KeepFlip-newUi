import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { keepFlipTheme } from '@/constants/keepflip-theme';

export type ScannerAtmospherePhase = 'idle' | 'scanning' | 'captured' | 'analyzing';

type ScannerAtmosphereProps = {
  phase?: ScannerAtmospherePhase;
};

const IDLE_ROTATION = {
  gold: 11,
  cyan: -9,
  violet: 23,
} as const;

export function ScannerAtmosphere({ phase = 'idle' }: ScannerAtmosphereProps) {
  const goldRotation = useSharedValue<number>(IDLE_ROTATION.gold);
  const cyanRotation = useSharedValue<number>(IDLE_ROTATION.cyan);
  const violetRotation = useSharedValue<number>(IDLE_ROTATION.violet);
  const intensity = useSharedValue(0.12);
  const energySweep = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(goldRotation);
    cancelAnimation(cyanRotation);
    cancelAnimation(violetRotation);
    cancelAnimation(intensity);
    cancelAnimation(energySweep);

    if (phase === 'analyzing') {
      const goldStart = goldRotation.value;
      const cyanStart = cyanRotation.value;
      const violetStart = violetRotation.value;

      goldRotation.value = withSequence(
        withTiming(goldStart + 84, {
          duration: 620,
          easing: Easing.in(Easing.cubic),
        }),
        withRepeat(
          withTiming(goldStart + 444, { duration: 1120, easing: Easing.linear }),
          -1,
          false,
        ),
      );
      cyanRotation.value = withSequence(
        withTiming(cyanStart - 118, {
          duration: 620,
          easing: Easing.in(Easing.cubic),
        }),
        withRepeat(
          withTiming(cyanStart - 478, { duration: 860, easing: Easing.linear }),
          -1,
          false,
        ),
      );
      violetRotation.value = withSequence(
        withTiming(violetStart + 62, {
          duration: 620,
          easing: Easing.in(Easing.cubic),
        }),
        withRepeat(
          withTiming(violetStart + 422, { duration: 1480, easing: Easing.linear }),
          -1,
          false,
        ),
      );
      intensity.value = withSequence(
        withTiming(0.92, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
        withRepeat(
          withSequence(
            withTiming(1, { duration: 460, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.72, { duration: 520, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
      energySweep.value = withSequence(
        withTiming(1, { duration: 620, easing: Easing.in(Easing.cubic) }),
        withRepeat(
          withSequence(
            withTiming(0.18, { duration: 720, easing: Easing.inOut(Easing.cubic) }),
            withTiming(1, { duration: 720, easing: Easing.inOut(Easing.cubic) }),
          ),
          -1,
          false,
        ),
      );
    } else if (phase === 'scanning') {
      const goldStart = goldRotation.value;
      const cyanStart = cyanRotation.value;
      const violetStart = violetRotation.value;

      goldRotation.value = withRepeat(
        withTiming(goldStart + 360, { duration: 7200, easing: Easing.linear }),
        -1,
        false,
      );
      cyanRotation.value = withRepeat(
        withTiming(cyanStart - 360, { duration: 5700, easing: Easing.linear }),
        -1,
        false,
      );
      violetRotation.value = withRepeat(
        withTiming(violetStart + 360, { duration: 9400, easing: Easing.linear }),
        -1,
        false,
      );
      intensity.value = withRepeat(
        withSequence(
          withTiming(0.66, { duration: 760, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.42, { duration: 840, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
      energySweep.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 1050, easing: Easing.inOut(Easing.cubic) }),
          withTiming(0.22, { duration: 1050, easing: Easing.inOut(Easing.cubic) }),
        ),
        -1,
        false,
      );
    } else if (phase === 'captured') {
      goldRotation.value = withTiming(IDLE_ROTATION.gold + 18, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      });
      cyanRotation.value = withTiming(IDLE_ROTATION.cyan - 22, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      });
      violetRotation.value = withTiming(IDLE_ROTATION.violet + 12, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      });
      intensity.value = withSequence(
        withTiming(0.88, { duration: 180, easing: Easing.out(Easing.cubic) }),
        withTiming(0.46, { duration: 520, easing: Easing.out(Easing.cubic) }),
      );
      energySweep.value = withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 520, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      goldRotation.value = withTiming(IDLE_ROTATION.gold, {
        duration: 480,
        easing: Easing.out(Easing.cubic),
      });
      cyanRotation.value = withTiming(IDLE_ROTATION.cyan, {
        duration: 480,
        easing: Easing.out(Easing.cubic),
      });
      violetRotation.value = withTiming(IDLE_ROTATION.violet, {
        duration: 480,
        easing: Easing.out(Easing.cubic),
      });
      intensity.value = withTiming(0.12, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      });
      energySweep.value = withTiming(0, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
      });
    }

    return () => {
      cancelAnimation(goldRotation);
      cancelAnimation(cyanRotation);
      cancelAnimation(violetRotation);
      cancelAnimation(intensity);
      cancelAnimation(energySweep);
    };
  }, [cyanRotation, energySweep, goldRotation, intensity, phase, violetRotation]);

  const goldRingStyle = useAnimatedStyle(() => ({
    opacity: 0.26 + intensity.value * 0.74,
    transform: [{ rotateZ: `${goldRotation.value}deg` }, { scale: 1 + intensity.value * 0.018 }],
  }));
  const cyanRingStyle = useAnimatedStyle(() => ({
    opacity: 0.24 + intensity.value * 0.76,
    transform: [{ rotateZ: `${cyanRotation.value}deg` }, { scale: 0.99 + intensity.value * 0.026 }],
  }));
  const violetRingStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + intensity.value * 0.7,
    transform: [
      { rotateZ: `${violetRotation.value}deg` },
      { scale: 0.98 + intensity.value * 0.035 },
    ],
  }));
  const energyStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + intensity.value * 0.64,
    transform: [
      { scaleX: 0.72 + energySweep.value * 0.3 },
      { scaleY: 0.75 + intensity.value * 0.7 },
    ],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * 0.44,
    transform: [{ scale: 0.76 + intensity.value * 0.38 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.orbit, styles.orbitGold, goldRingStyle]} />
      <Animated.View style={[styles.orbit, styles.orbitCyan, cyanRingStyle]} />
      <Animated.View style={[styles.orbit, styles.orbitViolet, violetRingStyle]} />
      <Animated.View style={[styles.coreGlow, coreStyle]} />
      <Animated.View style={[styles.energy, energyStyle]} />
    </View>
  );
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const scanner = keepFlipTheme.colors;

const styles = StyleSheet.create({
  orbit: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 1.25,
    borderRadius: 999,
  },
  orbitGold: {
    top: '9%',
    width: '85%',
    height: '82%',
    borderTopColor: withAlpha(scanner.scannerAmber, 0.92),
    borderRightColor: 'transparent',
    borderBottomColor: withAlpha(scanner.scannerAmber, 0.48),
    borderLeftColor: 'transparent',
    boxShadow: `0 0 24px ${withAlpha(scanner.scannerAmber, 0.32)}`,
  },
  orbitCyan: {
    top: '16%',
    width: '70%',
    height: '68%',
    borderTopColor: 'transparent',
    borderRightColor: withAlpha(scanner.scannerCyan, 0.84),
    borderBottomColor: 'transparent',
    borderLeftColor: withAlpha(scanner.scannerCyan, 0.42),
    boxShadow: `0 0 22px ${withAlpha(scanner.scannerCyan, 0.3)}`,
  },
  orbitViolet: {
    top: '22%',
    width: '58%',
    height: '56%',
    borderTopColor: withAlpha(scanner.scannerViolet, 0.3),
    borderRightColor: 'transparent',
    borderBottomColor: withAlpha(scanner.scannerViolet, 0.78),
    borderLeftColor: 'transparent',
    boxShadow: `0 0 20px ${withAlpha(scanner.scannerViolet, 0.28)}`,
  },
  coreGlow: {
    position: 'absolute',
    top: '34%',
    bottom: '34%',
    left: '31%',
    right: '31%',
    borderRadius: 999,
    backgroundColor: withAlpha(scanner.scannerCyan, 0.07),
    boxShadow: `0 0 42px ${withAlpha(scanner.scannerViolet, 0.3)}`,
  },
  energy: {
    position: 'absolute',
    top: '48%',
    left: '8%',
    right: '8%',
    height: 2,
    experimental_backgroundImage: `linear-gradient(90deg, transparent 0%, ${withAlpha(scanner.scannerAmber, 0.42)} 20%, ${withAlpha(scanner.scannerCyan, 0.96)} 50%, ${withAlpha(scanner.scannerViolet, 0.48)} 80%, transparent 100%)`,
    boxShadow: `0 0 26px ${withAlpha(scanner.scannerCyan, 0.4)}`,
  },
});
