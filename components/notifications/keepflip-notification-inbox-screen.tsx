import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  listKeepFlipNotifications,
  markAllKeepFlipNotificationsRead,
  markKeepFlipNotificationRead,
  subscribeToKeepFlipNotifications,
  type KeepFlipNotification,
} from '@/services/keepflip-notification-inbox-service';

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : 'KeepFlip notifications are unavailable right now.';
}

function notificationColor(notification: KeepFlipNotification) {
  if (notification.severity === 'error') return theme.colors.danger;
  if (notification.severity === 'warning') return theme.colors.goldBright;
  if (notification.severity === 'success') return theme.colors.scannerCyan;
  return theme.colors.textMuted;
}

export function KeepFlipNotificationInboxScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const insets = useSafeAreaInsets();
  const { responsiveFont } = useResponsiveLayout();
  const { status, user } = useKeepFlipAuth();
  const userId = user?.$id ?? null;
  const router = useRouter();
  const [notifications, setNotifications] = useState<KeepFlipNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!userId || status !== 'signed-in') return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setNotifications(await listKeepFlipNotifications(userId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, userId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  useEffect(() => {
    if (status !== 'signed-in' || !userId) return;
    return subscribeToKeepFlipNotifications(
      userId,
      () => void load(true),
      (cause) => setError(errorMessage(cause)),
    );
  }, [load, status, userId]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  async function markRead(notification: KeepFlipNotification) {
    if (!userId || notification.read) return;
    setActionError('');
    try {
      const updated = await markKeepFlipNotificationRead(userId, notification.id);
      if (!updated) return;
      setNotifications((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    setActionError('');
    try {
      await markAllKeepFlipNotificationsRead(userId);
      setNotifications((current) =>
        current.map((entry) => ({ ...entry, read: true })),
      );
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  function openNotification(notification: KeepFlipNotification) {
    void markRead(notification);
    if (notification.url?.startsWith('/') && !notification.url.startsWith('//')) {
      router.push(notification.url as Href);
    }
  }

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 15, paddingBottom: insets.bottom + 30}]}
        style={[styles.page, {marginTop: insets.top, marginBottom: insets.bottom}]}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.scannerCyan]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={theme.colors.scannerCyan}
          />
        }
        >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { fontFamily: theme.fonts.display, fontSize: responsiveFont(10)}]}>KEEPFLIP INBOX</Text>
            <Text style={[styles.title, { fontFamily: theme.fonts.bold, fontSize: responsiveFont(26) }]}>Important updates</Text>
            <Text style={[styles.subtitle, { fontFamily: theme.fonts.body, fontSize: responsiveFont(12) }]}>
              eBay activity, seller alerts, and messages that need your attention.
            </Text>
          </View>

        </View>

        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all KeepFlip notifications as read"
            onPress={() => void markAllRead()}
            style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}>
            <Text style={[styles.markAllText, { fontSize: responsiveFont(12) }]}>Mark all as read</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.scannerCyan} />
            <Text style={[styles.stateText, { fontSize: responsiveFont(14) }]}>Loading your inbox…</Text>
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { fontSize: responsiveFont(13) }]}>{error}</Text> : null}
        {actionError ? <Text style={[styles.error, { fontSize: responsiveFont(13) }]}>{actionError}</Text> : null}

        {!loading && !error && notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <IconSymbol color={theme.colors.goldMuted} name="checkmark.shield.fill" size={30} />
            <Text style={[styles.emptyTitle, { fontSize: responsiveFont(18) }]}>You’re all caught up</Text>
            <Text style={[styles.stateText, { fontSize: responsiveFont(14) }]}>New KeepFlip updates will appear here.</Text>
          </View>
        ) : null}

        {notifications.map((notification) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !notification.read }}
            key={notification.id}
            onPress={() => openNotification(notification)}
            style={({ pressed }) => [
              styles.notification,
              !notification.read && styles.notificationUnread,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.severityRail, { backgroundColor: notificationColor(notification) }]} />
            <View style={styles.notificationCopy}>
              <View style={styles.notificationHeader}>
                <Text numberOfLines={1} style={[styles.notificationTitle, { fontSize: responsiveFont(16) }]}>
                  {notification.title}
                </Text>
                {!notification.read ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={[styles.notificationBody, { fontSize: responsiveFont(13) }]}>{notification.body}</Text>
              <Text style={[styles.notificationMeta, { fontSize: responsiveFont(10) }]}>
                {notification.source.replaceAll('_', ' ')} · {new Date(notification.createdAt).toLocaleString()}
              </Text>
            </View>
            {notification.url ? <IconSymbol color={theme.colors.goldMuted} name="chevron.right" size={18} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  return StyleSheet.create({
    page: { flex: 1},
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: responsiveWidth(18),
      paddingTop: responsiveHeight(74),
      paddingBottom: responsiveHeight(36),
      gap: responsiveHeight(12),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: responsiveWidth(14),
      paddingBottom: responsiveHeight(8),
    },
    headerCopy: { flex: 1, gap: responsiveHeight(6) },
    eyebrow: { color: theme.colors.goldBright, fontSize: responsiveFont(10), fontWeight: '900', letterSpacing: 2.2 },
    title: { color: theme.colors.cream, fontSize: responsiveFont(30), fontWeight: '900' },
    subtitle: { color: theme.colors.textMuted, fontSize: responsiveFont(14), lineHeight: 20 },
    headerIcon: {
      width: responsiveWidth(52),
      height: responsiveWidth(52),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: theme.colors.danger },
    badgeText: { color: theme.colors.cream, fontSize: responsiveFont(9), fontWeight: '900' },
    markAll: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.accentCyanBorder },
    markAllText: { color: theme.colors.scannerCyan, fontSize: responsiveFont(12), fontWeight: '800' },
    stateCard: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120, borderRadius: 18, backgroundColor: theme.colors.surfaceSoft },
    stateText: { color: theme.colors.textMuted, fontSize: responsiveFont(14), lineHeight: 20 },
    emptyCard: { alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 180, padding: 24, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceSoft },
    emptyTitle: { color: theme.colors.cream, fontSize: responsiveFont(18), fontWeight: '800' },
    error: { color: theme.colors.danger, lineHeight: 19 },
    notification: { flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', minHeight: 96, paddingRight: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.divider, backgroundColor: theme.colors.card },
    notificationUnread: { borderColor: theme.colors.accentCyanBorder, backgroundColor: theme.colors.iconSurfaceCyan },
    severityRail: { alignSelf: 'stretch', width: 4 },
    notificationCopy: { flex: 1, gap: 5, paddingVertical: 14 },
    notificationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notificationTitle: { flex: 1, color: theme.colors.cream, fontSize: responsiveFont(16), fontWeight: '800' },
    notificationBody: { color: theme.colors.text, fontSize: responsiveFont(13), lineHeight: 19 },
    notificationMeta: { color: theme.colors.textMuted, fontSize: responsiveFont(10), textTransform: 'capitalize' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.scannerCyan },
    pressed: { opacity: 0.72 },
  });
}
