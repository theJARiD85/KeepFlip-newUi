import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  subscribeToKeepFlipLimitNotices,
  type KeepFlipLimitNotice,
} from '@/services/keepflip-limit-alert-service';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

function noticeCopy(notice: KeepFlipLimitNotice) {
  switch (notice.category) {
    case 'scan':
      if (notice.plan === 'serious') {
        return {
          title: 'You’ve used your monthly scans',
          body: `Serious includes ${notice.limit} AI scans each month. Your scan limit resets next month. Your other Serious features are still available.`,
        };
      }
      return {
        title: 'You’ve reached your scan limit',
        body: `You’ve used all ${notice.limit} AI scans included this month. You can keep using your inventory, Books, and insights.`,
      };
    case 'inventory':
      return {
        title: 'Your active item limit is reached',
        body: `Free includes up to ${notice.limit} active items at a time. You can keep using your current items and the rest of your workspace.`,
      };
    case 'listing_generation':
      return {
        title: 'You’ve reached your listing limit',
        body: `You’ve used all ${notice.limit} listing generations included this month. You can still view and manage your existing items.`,
      };
  }
}

export function KeepFlipLimitAlert() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const router = useRouter();
  const [notice, setNotice] = useState<KeepFlipLimitNotice | null>(null);

  useEffect(
    () => subscribeToKeepFlipLimitNotices(setNotice),
    [],
  );

  const copy = notice ? noticeCopy(notice) : null;
  const dismiss = () => setNotice(null);
  const subscribe = () => {
    dismiss();
    router.push('/subscription' as Href);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={dismiss}
      transparent
      visible={notice !== null}
    >
      <View style={responsiveStyles.backdrop}>
        <View accessibilityRole="alert" style={responsiveStyles.card}>
          <Text style={responsiveStyles.eyebrow}>
            {notice?.plan === 'serious' ? 'SERIOUS PLAN' : 'KEEPFLIP FREE'}
          </Text>
          <Text style={responsiveStyles.title}>{copy?.title}</Text>
          <Text style={responsiveStyles.body}>{copy?.body}</Text>
          {notice?.plan === 'free' ? (
            <Text style={responsiveStyles.price}>Serious is $13/month or $130/year.</Text>
          ) : null}
          <View style={responsiveStyles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={dismiss}
              style={({ pressed }) => [responsiveStyles.okButton, pressed && responsiveStyles.pressed]}
            >
              <Text style={responsiveStyles.okText}>OK</Text>
            </Pressable>
            {notice?.plan === 'free' ? (
              <Pressable
                accessibilityRole="button"
                onPress={subscribe}
                style={({ pressed }) => [responsiveStyles.subscribeButton, pressed && responsiveStyles.pressed]}
              >
                <Text style={responsiveStyles.subscribeText}>Subscribe</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 10, 16, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: theme.colors.backgroundRaised,
    borderColor: theme.colors.accentGoldBorder,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    maxWidth: 440,
    padding: 22,
    width: '100%',
  },
  eyebrow: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.display,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 21,
    fontWeight: '900',
  },
  body: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  price: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  okButton: {
    alignItems: 'center',
    borderColor: theme.colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  okText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    fontWeight: '800',
  },
  subscribeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.gold,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  subscribeText: {
    color: theme.colors.textOnAccent,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: { opacity: 0.78 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    card: {
      ...styles["card"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(20) : 20,
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      maxWidth: layout.isWeb ? layout.webResponsiveWidth(440) : 440,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(11) : 11,
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(21) : 21,
    },
    body: {
      ...styles["body"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(22) : 22,
    },
    price: {
      ...styles["price"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    actions: {
      ...styles["actions"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(6) : 6,
    },
    okButton: {
      ...styles["okButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
    },
    okText: {
      ...styles["okText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
    },
    subscribeButton: {
      ...styles["subscribeButton"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(12) : 12,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(48) : 48,
    },
    subscribeText: {
      ...styles["subscribeText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(15) : 15,
    },
  });
}
