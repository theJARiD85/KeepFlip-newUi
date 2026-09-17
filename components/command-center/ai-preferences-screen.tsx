import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { AiPreferencesPanel } from '@/components/command-center/ai-preferences-panel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

export function AiPreferencesScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { contentMaxWidth, contentWidth, pageGutter, responsiveFont } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useKeepFlipAuth();

  if (!user) return null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 28,
            paddingTop: insets.top / 2,
            width: contentWidth,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: pageGutter,
          },
        ]}
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(220)} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to Command Center"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              hapticSelection();
              router.back();
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="chevron.right"
              size={22}
              style={styles.backIcon}
            />
          </Pressable>
          <Text style={[styles.topLabel, { fontSize: responsiveFont(9) }]}>COMMAND CENTER</Text>
          <View style={styles.topSpacer} />
        </Animated.View>

        <AiPreferencesPanel key={user.$id} ownerId={user.$id} />
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      gap: 12,
    },
    topBar: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.22)',
      backgroundColor: 'rgba(242, 211, 138, 0.06)',
    },
    backIcon: { transform: [{ rotate: '180deg' }] },
    topLabel: {
      color: theme.colors.goldMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.25,
    },
    topSpacer: { flex: 1 },
    pressed: { opacity: 0.72 },
  });

  return {
    ...staticStyles,
    topLabel: [staticStyles.topLabel, { fontSize: responsiveFont(9) }],
  };
}
