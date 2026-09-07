import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withAlpha } from '@/lib/withAlpha';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type KeepFlipLaunchChoiceScreenProps = {
  onExistingLogin: () => void;
  onNewUser: () => void;
};

const KEEPFLIP_LOGO = require('@/assets/images/icon3.png');

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
      pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.actionButtonText,
          secondary && styles.actionButtonTextSecondary,
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function KeepFlipLaunchChoiceScreen({
  onExistingLogin,
  onNewUser,
}: KeepFlipLaunchChoiceScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeepFlipBackground>
      <View pointerEvents="none" style={styles.authGlow} />
      
      <View
        style={[
          styles.content,
          {
            minHeight: '100%',
            paddingBottom: insets.bottom,
            paddingTop: insets.top * 2,
            marginBottom: insets.bottom,
            marginTop: insets.top,
          },
        ]}
      >
        <Animated.View entering={FadeIn.duration(260)} style={styles.brandLockup}>
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
        </Animated.View>


          <View style={[styles.actions, {paddingBottom: insets.bottom + 25}]}>
            <View style={[styles.actionButton, { borderRadius: 17 }]}>
          <LaunchAction onPress={onExistingLogin} secondary>
              LOGIN
            </LaunchAction>
            </View>
            <LaunchAction onPress={onNewUser}>SIGN UP</LaunchAction>
  
          </View>
      </View>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  authGlow: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 50% 16%, rgba(224, 172, 75, 0.13) 0%, transparent 31%),
      radial-gradient(circle at 12% 82%, rgba(88, 223, 232, 0.055) 0%, transparent 32%),
      radial-gradient(circle at 94% 70%, rgba(141, 114, 255, 0.07) 0%, transparent 34%)
    `,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: withAlpha(theme.colors.backgroundRaised, 0.8),
    borderColor: withAlpha(theme.colors.goldMuted, 0.45),
    borderWidth: 1,
    width: '97%',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
  },
  actionButtonSecondary: {
    backgroundColor: 'rgba(8, 8, 12, 0.9)',
    borderColor: 'rgba(242, 211, 138, 0.34)',
    borderWidth: 1,
  },
  actionButtonText: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 3,
  },
  actionButtonTextSecondary: { color: theme.colors.goldBright },
  actions: { justifyContent: 'space-evenly', gap: 20, width: '100%', alignItems: 'center' },
  body: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  brandLockup: { alignItems: 'center', gap: 8 },
  brandName: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 45,
    letterSpacing: 5,
    textShadowColor: 'rgba(0,255,255,0.48)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  brandTagline: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.display,
    fontSize: 10,
    letterSpacing: 2.05,
    textAlign: 'center',
  },
  choiceCard: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 500,
    padding: 22,
    width: '100%',
  },
  content: {
    height: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  logo: { height: 175, width: 175 },
  logoHalo: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 4, 5, 0.44)',
    borderColor: 'rgba(224, 172, 75, 0.22)',
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    boxShadow: '0 0 44px rgba(224, 172, 75, 0.15)',
    height: 200,
    justifyContent: 'center',
    width: 200,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  title: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});
