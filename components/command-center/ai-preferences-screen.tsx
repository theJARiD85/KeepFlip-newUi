import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { AiPreferencesPanel } from '@/components/command-center/ai-preferences-panel';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
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
      maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(760) : 760,
      alignSelf: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
    },
    topBar: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(34) : 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
    },
    backButton: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(34) : 34,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(34) : 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    backIcon: { transform: [{ rotate: '180deg' }] },
    topLabel: {
      color: theme.colors.goldMuted,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9,
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
