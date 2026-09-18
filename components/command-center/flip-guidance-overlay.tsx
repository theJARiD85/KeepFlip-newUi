import { type Href, usePathname, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipCompanion, useFlipCompanion } from '@/components/flip';
import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  getFlipGuide,
  isFlipGuideId,
  type FlipGuide,
  type FlipGuideId,
} from '@/services/keepflip-guide-service';

type FlipGuidanceState = {
  guideId: FlipGuideId;
  stepIndex: number;
};

type FlipGuidanceContextValue = {
  activeGuide: FlipGuide | null;
  closeGuide: () => void;
  nextStep: () => void;
  previousStep: () => void;
  startGuide: (guideId: FlipGuideId) => void;
  stepIndex: number;
};

const FlipGuidanceContext = createContext<FlipGuidanceContextValue | null>(null);

export function FlipGuidanceProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<FlipGuidanceState | null>(null);
  const activeGuide = state ? getFlipGuide(state.guideId) : null;

  const closeGuide = useCallback(() => {
    setState(null);
  }, []);

  const nextStep = useCallback(() => {
    setState((current) => {
      if (!current) return null;
      const guide = getFlipGuide(current.guideId);
      if (current.stepIndex >= guide.steps.length - 1) return null;
      return { ...current, stepIndex: current.stepIndex + 1 };
    });
  }, []);

  const previousStep = useCallback(() => {
    setState((current) => {
      if (!current) return null;
      return {
        ...current,
        stepIndex: Math.max(0, current.stepIndex - 1),
      };
    });
  }, []);

  const startGuide = useCallback((guideId: FlipGuideId) => {
    if (!isFlipGuideId(guideId)) return;
    setState({ guideId, stepIndex: 0 });
  }, []);

  const value = useMemo<FlipGuidanceContextValue>(
    () => ({
      activeGuide,
      closeGuide,
      nextStep,
      previousStep,
      startGuide,
      stepIndex: state?.stepIndex ?? 0,
    }),
    [activeGuide, closeGuide, nextStep, previousStep, startGuide, state?.stepIndex],
  );

  return (
    <FlipGuidanceContext.Provider value={value}>
      {children}
    </FlipGuidanceContext.Provider>
  );
}

export function useFlipGuidance() {
  const context = useContext(FlipGuidanceContext);
  if (!context) {
    throw new Error('useFlipGuidance must be used inside FlipGuidanceProvider.');
  }
  return context;
}

function routeWithoutQuery(route: string) {
  return route.split(/[?#]/, 1)[0] || route;
}

export function FlipGuidanceOverlay() {
  const { user } = useKeepFlipAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();
  const { appliedColorScheme } = useKeepFlipAppearance();
  const styles = useMemo(() => {
    void appliedColorScheme;
    return createStyles();
  }, [appliedColorScheme]);
  const { react } = useFlipCompanion();
  const {
    activeGuide,
    closeGuide,
    nextStep,
    previousStep,
    stepIndex,
  } = useFlipGuidance();

  useEffect(() => {
    if (!user && activeGuide) closeGuide();
  }, [activeGuide, closeGuide, user]);

  if (!user || !activeGuide) return null;

  const step = activeGuide.steps[stepIndex] ?? activeGuide.steps[0];
  if (!step) return null;

  const isLastStep = stepIndex >= activeGuide.steps.length - 1;
  const stepRoute = routeWithoutQuery(step.route);
  const isOnStepScreen = pathname === stepRoute;
  const progress = ((stepIndex + 1) / activeGuide.steps.length) * 100;

  const openStep = () => {
    react('aha');
    if (!isOnStepScreen || step.route.includes('?')) {
      router.push(step.route as Href);
    }
  };

  const finishOrAdvance = () => {
    if (isLastStep) {
      closeGuide();
      react('celebrate');
      return;
    }
    nextStep();
    react('aha');
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View
        pointerEvents="box-none"
        style={[styles.dock, { bottom: Math.max(insets.bottom, 12) + 14 }]}
      >
        <View accessibilityViewIsModal={false} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <FlipCompanion size={44} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP / GUIDED HELP</Text>
              <Text numberOfLines={2} style={[styles.title, { fontSize: responsiveFont(17), lineHeight: 21 }]}>
                {activeGuide.title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close Flip guided help"
              accessibilityRole="button"
              hitSlop={8}
              onPress={closeGuide}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={[styles.closeText, { fontSize: responsiveFont(17) }]}>×</Text>
            </Pressable>
          </View>

          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { fontSize: responsiveFont(8) }]}>
              STEP {stepIndex + 1} OF {activeGuide.steps.length}
            </Text>
            <Text numberOfLines={1} style={[styles.routeLabel, { fontSize: responsiveFont(8) }]}>
              {isOnStepScreen ? 'YOU ARE HERE' : step.route.replace(/^\//, '').split('?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={[styles.stepTitle, { fontSize: responsiveFont(14), lineHeight: 18 }]}>
            {step.title}
          </Text>
          <Text selectable style={[styles.body, { fontSize: responsiveFont(10), lineHeight: 15 }]}>
            {step.body}
          </Text>

          <View style={styles.actions}>
            {stepIndex > 0 ? (
              <Pressable
                accessibilityLabel="Previous Flip help step"
                accessibilityRole="button"
                onPress={previousStep}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={[styles.secondaryButtonText, { fontSize: responsiveFont(8) }]}>BACK</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={isOnStepScreen ? 'Stay on this screen' : step.buttonLabel}
              accessibilityRole="button"
              onPress={openStep}
              style={({ pressed }) => [styles.screenButton, pressed && styles.pressed]}
            >
              <Text style={[styles.screenButtonText, { fontSize: responsiveFont(8) }]}>
                {isOnStepScreen ? 'THIS SCREEN' : step.buttonLabel.toUpperCase()}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={isLastStep ? 'Finish Flip guided help' : 'Next Flip help step'}
              accessibilityRole="button"
              onPress={finishOrAdvance}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={[styles.primaryButtonText, { fontSize: responsiveFont(8) }]}>
                {isLastStep ? 'DONE' : 'NEXT'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
  root: {
    bottom: 0,
    elevation: 9100,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 9100,
  },
  dock: {
    alignItems: 'center',
    left: 12,
    position: 'absolute',
    right: 12,
  },
  card: {
    backgroundColor: theme.colors.surfaceOverlay,
    borderColor: theme.colors.accentCyanBorder,
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: '0 14px 34px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 255, 0.08)',
    gap: 10,
    maxWidth: 560,
    padding: 14,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceCyan,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 13,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  headingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontWeight: '900',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: theme.colors.dividerStrong,
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  closeText: {
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  routeLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.6,
    maxWidth: '56%',
  },
  progressTrack: {
    backgroundColor: theme.colors.cardSoft,
    borderRadius: 999,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    backgroundColor: theme.colors.scannerCyan,
    borderRadius: 999,
    height: '100%',
  },
  stepTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.semibold,
    fontWeight: '900',
  },
  body: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: theme.colors.dividerStrong,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 11,
  },
  secondaryButtonText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  screenButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.iconSurfaceCyan,
    borderColor: theme.colors.accentCyanBorder,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 11,
  },
  screenButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.goldBright,
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 15,
  },
  primaryButtonText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.72,
  },
  });
}
