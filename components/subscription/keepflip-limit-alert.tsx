import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  subscribeToKeepFlipLimitNotices,
  type KeepFlipLimitNotice,
} from '@/services/keepflip-limit-alert-service';

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
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={styles.card}>
          <Text style={styles.eyebrow}>
            {notice?.plan === 'serious' ? 'SERIOUS PLAN' : 'KEEPFLIP FREE'}
          </Text>
          <Text style={styles.title}>{copy?.title}</Text>
          <Text style={styles.body}>{copy?.body}</Text>
          {notice?.plan === 'free' ? (
            <Text style={styles.price}>Serious is $13/month or $130/year.</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={dismiss}
              style={({ pressed }) => [styles.okButton, pressed && styles.pressed]}
            >
              <Text style={styles.okText}>OK</Text>
            </Pressable>
            {notice?.plan === 'free' ? (
              <Pressable
                accessibilityRole="button"
                onPress={subscribe}
                style={({ pressed }) => [styles.subscribeButton, pressed && styles.pressed]}
              >
                <Text style={styles.subscribeText}>Subscribe</Text>
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
