import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import responsiveFont from '@/lib/responsiveFont';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
export type KeepFlipAccountTab = 'account' | 'subscription';

export function KeepFlipAccountTabs({
  active,
}: {
  active: KeepFlipAccountTab;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const router = useRouter();

  return (
    <View accessibilityLabel="Account sections" style={styles.tabs}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'account' }}
        onPress={() => router.replace('/account' as Href)}
        style={[
          styles.tab,
          active === 'account' && styles.tabActive,
        ]}>
        <Text
          style={[
            styles.tabText,
            active === 'account' && styles.tabTextActive,
          ]}>
          ACCOUNT
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'subscription' }}
        onPress={() =>
          router.replace('/account?tab=subscription' as Href)
        }
        style={[
          styles.tab,
          active === 'subscription' && styles.tabActive,
        ]}>
        <Text
          style={[
            styles.tabText,
            active === 'subscription' && styles.tabTextActive,
          ]}>
          SUBSCRIPTION
        </Text>
      </Pressable>
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    tab: {
      alignItems: 'center',
      borderRadius: 10,
      flex: 1,
      justifyContent: 'center',
      minHeight: 42,
    },
    tabActive: {
      backgroundColor: 'rgba(215, 168, 74, 0.14)',
      borderColor: 'rgba(242, 211, 138, 0.38)',
      borderWidth: StyleSheet.hairlineWidth,
    },
    tabText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.95,
    },
    tabTextActive: { color: theme.colors.goldBright },
    tabs: {
      backgroundColor: 'rgba(8, 8, 12, 0.78)',
      borderColor: 'rgba(242, 237, 228, 0.14)',
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
  });
  return {
    ...staticStyles,
    tabText: [
      staticStyles.tabText,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}
