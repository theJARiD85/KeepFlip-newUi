import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KeepFlipLaunchAuthScreen,
  type AuthSubscriptionSelection,
} from '@/components/intro/keepflip-launch-auth-screen.native';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import KeepFlipIntro from '@/components/intro/keepflip-intro.native';
import { KeepFlipPreAuthScreen } from '@/components/intro/keepflip-preauth-screen.native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  areKeepFlipSubscriptionsConfigured,
  areKeepFlipSubscriptionsEnforced,
} from '@/services/keepflip-subscription-service';
import {
  hasCompletedKeepFlipLaunchExperience,
  markKeepFlipLaunchExperienceCompleted,
} from '@/services/keepflip-launch-state-service';
import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';

type LaunchPhase =
  | 'checking'
  | 'intro'
  | 'choice'
  | 'personalize'
  | 'sign-up'
  | 'sign-in'
  | 'hidden';

type KeepFlipLaunchExperienceProps = {
  onVisibilityChange?: (visible: boolean) => void;
};

const KEEPFLIP_LOGO = require('@/assets/images/icon3.png');
const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');

function selectionHaptic() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

function LaunchAction({
  children,
  onPress,
  secondary = false,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.actionButtonSecondary,
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.actionButtonText,
          secondary && styles.actionButtonTextSecondary,
        ]}>
        {children}
      </Text>
      <IconSymbol
        color={secondary ? theme.colors.goldBright : theme.colors.backgroundDeep}
        name="arrow.right"
        size={19}
      />
    </Pressable>
  );
}

function FeatureSignal({
  detail,
  icon,
  label,
}: {
  detail: string;
  icon: ComponentProps<typeof IconSymbol>['name'];
  label: string;
}) {
  return (
    <View style={styles.featureSignal}>
      <View style={styles.featureIcon}>
        <IconSymbol color={theme.colors.scannerCyan} name={icon} size={17} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function KeepFlipLaunchChoiceScreen({
  onExistingLogin,
  onNewUser,
}: {
  onExistingLogin: () => void;
  onNewUser: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.choiceContent,
          { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 18 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandLockup}>
          <View style={styles.logoHalo}>
            <Image
              accessibilityLabel="KeepFlip logo"
              contentFit="contain"
              source={KEEPFLIP_LOGO}
              style={styles.logo}
            />
          </View>
          <Text style={styles.brandName}>KEEPFLIP</Text>
          <Text style={styles.brandTagline}>THE PULSE OF YOUR RESALE BUSINESS</Text>
        </View>

        <View style={styles.choicePanel}>
          <View style={styles.flipHeader}>
            <Image
              accessibilityLabel="Flip, KeepFlip's resale sidekick"
              contentFit="contain"
              source={FLIP_MASCOT_IMAGE}
              style={styles.mascot}
            />
            <View style={styles.flipCopy}>
              <Text style={styles.panelEyebrow}>FLIP IS READY</Text>
              <Text style={styles.panelTitle}>Let&apos;s set up your edge.</Text>
            </View>
          </View>
          <Text style={styles.panelBody}>
            KeepFlip helps you find better buys, build stronger listings, and
            keep the money side of reselling clear from first scan to sale.
          </Text>

          <View style={styles.featureList}>
            <FeatureSignal
              detail="Scan, identify, and compare visible market evidence."
              icon="viewfinder"
              label="FIND THE FLIP"
            />
            <FeatureSignal
              detail="Turn a good find into a stronger listing and offer plan."
              icon="tag.fill"
              label="LIST & SELL"
            />
            <FeatureSignal
              detail="Track inventory, costs, bookkeeping, and business pulse."
              icon="chart.bar.fill"
              label="RUN THE BUSINESS"
            />
          </View>

          <View style={styles.startPrompt}>
            <Text style={styles.startPromptEyebrow}>WELCOME TO KEEPFLIP</Text>
            <Text style={styles.startPromptTitle}>How should we start?</Text>
          </View>
          <LaunchAction onPress={onNewUser}>I&apos;M NEW — MEET FLIP</LaunchAction>
          <LaunchAction onPress={onExistingLogin} secondary>
            I ALREADY HAVE A LOGIN
          </LaunchAction>
        </View>

        <Text style={styles.choiceFootnote}>
          Existing users keep their current account, inventory, and history.
        </Text>
      </ScrollView>
    </KeepFlipBackground>
  );
}

export default function KeepFlipLaunchExperience({
  onVisibilityChange,
}: KeepFlipLaunchExperienceProps) {
  const router = useRouter();
  const { status } = useKeepFlipAuth();
  const [phase, setPhase] = useState<LaunchPhase>('checking');
  const [storageReady, setStorageReady] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingRules, setPendingRules] = useState<ResellerBuyRules | null>(null);
  const authFlowRef = useRef<'new' | 'existing' | null>(null);

  useEffect(() => {
    let cancelled = false;

    void hasCompletedKeepFlipLaunchExperience().then((completed) => {
      if (cancelled) return;
      setHasCompleted(completed);
      setStorageReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady || status === 'checking') return;

    if (status === 'signed-in') {
      // An existing session goes straight to the command center. A new or
      // returning login flow handles its own destination after authentication.
      if (authFlowRef.current) return;
      if (!hasCompleted) {
        setHasCompleted(true);
        void markKeepFlipLaunchExperienceCompleted();
      }
      setPhase('hidden');
      requestAnimationFrame(() => router.replace('/' as Href));
      return;
    }

    setPhase(hasCompleted ? 'hidden' : 'intro');
  }, [hasCompleted, router, status, storageReady]);

  useEffect(() => {
    onVisibilityChange?.(phase !== 'hidden' && phase !== 'checking');
  }, [onVisibilityChange, phase]);

  const handleExistingLogin = useCallback(() => {
    authFlowRef.current = 'existing';
    setPhase('sign-in');
  }, []);

  const handleNewUser = useCallback(() => {
    authFlowRef.current = 'new';
    setPhase('personalize');
  }, []);

  const handlePreAuthComplete = useCallback(
    (name: string, rules: ResellerBuyRules) => {
      setPendingName(name);
      setPendingRules(rules);
      setPhase('sign-up');
    },
    [],
  );

  const handleAuthenticated = useCallback(
    (selection: AuthSubscriptionSelection) => {
      const flow = authFlowRef.current;
      if (!flow) return;

      if (flow === 'new' && selection.profileSaved === false) {
        setPhase('hidden');
        requestAnimationFrame(() => router.replace('/walkthrough' as Href));
        return;
      }

      setHasCompleted(true);
      void markKeepFlipLaunchExperienceCompleted();
      setPhase('hidden');

      const subscriptionsAvailable =
        areKeepFlipSubscriptionsConfigured() ||
        areKeepFlipSubscriptionsEnforced();
      const source = flow === 'new' ? 'onboarding' : 'migration';
      const destination = subscriptionsAvailable
        ? `/subscription?source=${source}&plan=${selection.plan}&cadence=${selection.cadence}`
        : '/';

      requestAnimationFrame(() => router.replace(destination as Href));
    },
    [router],
  );

  if (phase === 'intro') {
    return <KeepFlipIntro onComplete={() => setPhase('choice')} startupReady />;
  }

  if (phase === 'choice') {
    return (
      <KeepFlipLaunchChoiceScreen
        onExistingLogin={handleExistingLogin}
        onNewUser={handleNewUser}
      />
    );
  }

  if (phase === 'personalize') {
    return (
      <KeepFlipPreAuthScreen
        onBack={() => setPhase('choice')}
        onComplete={handlePreAuthComplete}
      />
    );
  }

  if (phase === 'sign-up') {
    return (
      <KeepFlipLaunchAuthScreen
        initialBuyRules={pendingRules}
        initialMode="create-account"
        initialName={pendingName}
        onAuthenticated={handleAuthenticated}
        onBack={() => setPhase('personalize')}
      />
    );
  }

  if (phase === 'sign-in') {
    return (
      <KeepFlipLaunchAuthScreen
        initialMode="sign-in"
        migrationMode
        onAuthenticated={handleAuthenticated}
        onBack={() => setPhase('choice')}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.goldBright,
    borderCurve: 'continuous',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  actionButtonSecondary: {
    backgroundColor: 'rgba(8, 8, 12, 0.9)',
    borderColor: 'rgba(242, 211, 138, 0.34)',
    borderWidth: 1,
  },
  actionButtonText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 0.75,
  },
  actionButtonTextSecondary: { color: theme.colors.goldBright },
  brandLockup: { alignItems: 'center', gap: 8 },
  brandName: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 33,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,255,255,0.48)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  brandTagline: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.display,
    fontSize: 9,
    letterSpacing: 2.05,
    textAlign: 'center',
  },
  choiceContent: {
    alignItems: 'center',
    gap: 22,
    paddingHorizontal: 18,
  },
  choiceFootnote: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    maxWidth: 520,
    textAlign: 'center',
  },
  choicePanel: {
    backgroundColor: 'rgba(8, 8, 12, 0.9)',
    borderColor: 'rgba(242, 237, 228, 0.14)',
    borderCurve: 'continuous',
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.34)',
    gap: 15,
    maxWidth: 620,
    padding: 20,
    width: '100%',
  },
  featureCopy: { flex: 1, gap: 2 },
  featureDetail: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
    borderColor: 'rgba(0, 255, 255, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  featureLabel: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    letterSpacing: 1.05,
  },
  featureList: { gap: 10 },
  featureSignal: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  flipCopy: { flex: 1, gap: 4 },
  flipHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  logo: { height: 112, width: 112 },
  logoHalo: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 4, 5, 0.44)',
    borderColor: 'rgba(224, 172, 75, 0.22)',
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    boxShadow: '0 0 44px rgba(224, 172, 75, 0.15)',
    height: 126,
    justifyContent: 'center',
    width: 126,
  },
  mascot: { height: 62, width: 62 },
  panelBody: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  panelEyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    letterSpacing: 1.15,
  },
  panelTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 25,
    letterSpacing: -0.45,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  startPrompt: { gap: 3, paddingTop: 2 },
  startPromptEyebrow: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  startPromptTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 23,
  },
});
