import { FlipCompanion, useFlipCompanion } from '@/components/flip';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { withAlpha } from '@/lib/withAlpha';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { responsiveWidth } from '@/lib/responsiveFont';
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
  const styles = useResponsiveStyles(createResponsiveStyles);
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
  const styles = useResponsiveStyles(createResponsiveStyles);
  const insets = useSafeAreaInsets();
  const { markActivity, react, state } = useFlipCompanion();
  const { width, height } = useWindowDimensions();
  const {
    scannerWidth, scannerHeight,
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveHeight,
    responsiveWidth,
    responsiveFont
  } = useResponsiveLayout();

  useEffect(() => {
    const wasAsleep = markActivity();
    if (!wasAsleep) {
      react('greeting');
    }
  }, [markActivity, react]);

  return (
    <KeepFlipBackground>
      <View pointerEvents="none" style={styles.authGlow} />

      <View
        style={[styles.content,
        {
          minHeight: scannerHeight,
          minWidth: scannerWidth,
          paddingBottom: insets.bottom,
          marginBottom: insets.bottom,
          marginTop: insets.top,
        }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', justifyContent: 'space-around', paddingHorizontal: pageGutter }]}
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
          <Text style={[styles.brandName, { fontSize: responsiveFont(40) }]}>KEEPFLIP</Text>
          <Text style={styles.brandTagline}>SOURCING SMARTER. FLIPPING BETTER.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(260)} style={styles.flipWelcome}>
          <View style={styles.flipWelcomeAvatar}>
            <Image style={{ height: responsiveHeight(85), width: responsiveWidth(85), zIndex: 0, position: 'absolute', borderRadius: 16, overflow: 'hidden' }} source={require('@/assets/flip/background.jpg')} />
            <FlipCompanion size={85} />
          </View>
          <View style={styles.flipWelcomeCopy}>
            <Text style={[styles.flipWelcomeEyebrow, { fontSize: responsiveFont(11) }]}>FLIP IS READY</Text>
            <Text style={[styles.flipWelcomeText, {}]}>Your resale sidekick is here to tailor KeepFlip to the way you flip.</Text>
          </View>
        </Animated.View>


        <View style={[styles.actions, { paddingBottom: insets.bottom + 25 }]}>
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

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
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
      fontSize: 11,
      lineHeight: 21,
      textAlign: 'center',
    },
    brandLockup: { alignItems: 'center', gap: 8 },
    brandName: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 40,
      letterSpacing: 5,
      textShadowColor: 'rgba(0,255,255,0.48)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 15,
    },
    brandTagline: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.display,
      fontSize: 12,
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
      justifyContent: 'space-evenly',
      paddingHorizontal: 10,
    },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 12,
      letterSpacing: 1.2,
    },
    flipWelcome: {
      alignSelf: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(141, 114, 255, 0.08)',
      borderColor: 'rgba(141, 114, 255, 0.28)',
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 11,

      paddingHorizontal: 8,
      paddingVertical: 9,
      width: '100%',
    },
    flipWelcomeAvatar: {
      alignItems: 'center',
      backgroundColor: 'rgba(8, 8, 12, 0.75)',
      borderColor: 'rgba(242, 211, 138, 0.38)',
      borderRadius: 50,
      borderWidth: 1,
      height: 100,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 100,
    },
    flipWelcomeCopy: { flex: 1, gap: 3 },
    flipWelcomeEyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 11,
      letterSpacing: 1.1,
    },
    flipWelcomeText: { color: theme.colors.cream, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 17 },
    logo: { height: 175, width: 175 },
    logoHalo: {
      alignItems: 'center',
      backgroundColor: 'rgba(5, 4, 5, 0.44)',
      borderColor: 'rgba(224, 172, 75, 0.22)',
      borderRadius: theme.radii.pill,
      borderWidth: 1.5,
      boxShadow: '0 0 44px rgba(224, 172, 75, 0.15)',
      height: 175,
      justifyContent: 'center',
      width: 175,
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
  return {
    ...staticStyles,
    actionButtonText: [
      staticStyles.actionButtonText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    body: [
      staticStyles.body,
      {
        fontSize: responsiveFont(11),
      },
    ],
    brandName: [
      staticStyles.brandName,
      {
        fontSize: responsiveFont(40),
        textShadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
    brandTagline: [
      staticStyles.brandTagline,
      {
        fontSize: responsiveFont(12),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(12),
      },
    ],
    flipWelcomeAvatar: [
      staticStyles.flipWelcomeAvatar,
      {
        height: responsiveHeight(100),
        width: responsiveWidth(100),
      },
    ],
    flipWelcomeEyebrow: [
      staticStyles.flipWelcomeEyebrow,
      {
        fontSize: responsiveFont(11),
      },
    ],
    flipWelcomeText: [
      staticStyles.flipWelcomeText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    logo: [
      staticStyles.logo,
      {
        height: responsiveHeight(175),
        width: responsiveWidth(175),
      },
    ],
    logoHalo: [
      staticStyles.logoHalo,
      {
        height: responsiveHeight(175),
        width: responsiveWidth(175),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(28),
      },
    ],
  };
}
