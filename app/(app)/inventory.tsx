import { useFocusEffect } from "expo-router";
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { KeepFlipNativeAdCard } from '@/components/ads/keepflip-native-ad-card';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';

function formatMoney(value: number | null, currency: string) {
  if (value == null) return 'Value pending';
  try {
    return new Intl.NumberFormat('en-US', {
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
      style: 'currency',
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently scanned';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function InventoryCard({ item }: { item: InventoryItem }) {
  const meta = [item.brand, item.model, item.category].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}>
          <IconSymbol color={theme.colors.goldBright} name="shippingbox.fill" size={22} />
        </View>
        <View style={styles.cardTitleCopy}>
          <Text numberOfLines={2} selectable style={styles.cardTitle}>
            {item.title}
          </Text>
          {meta ? (
            <Text numberOfLines={2} selectable style={styles.cardMeta}>
              {meta}
            </Text>
          ) : null}
        </View>
        {item.aiConfidence != null ? (
          <View style={styles.confidencePill}>
            <Text style={styles.confidenceValue}>{item.aiConfidence}%</Text>
            <Text style={styles.confidenceLabel}>CONFIDENCE</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.metricRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricEyebrow}>ESTIMATED VALUE</Text>
          <Text selectable style={styles.valueText}>
            {formatMoney(item.estimatedValue, item.currency)}
          </Text>
        </View>
        <View style={styles.metricBlockRight}>
          <Text style={styles.metricEyebrow}>OBSERVED CONDITION</Text>
          <Text selectable style={styles.conditionText}>
            {item.condition}
          </Text>
        </View>
      </View>

      {item.conditionNotes ? (
        <Text numberOfLines={3} selectable style={styles.notes}>
          {item.conditionNotes}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>{formatDate(item.createdAt)}</Text>
        <View style={styles.photoCount}>
          <IconSymbol color={theme.colors.scannerCyan} name="photo.on.rectangle.angled" size={13} />
          <Text style={styles.photoCountText}>{item.photoCount}</Text>
        </View>
      </View>
    </View>
  );
}

type InventoryFeedRow =
  | { id: string; item: InventoryItem; kind: 'item' }
  | { id: string; kind: 'native-ad' };

function buildInventoryFeed(items: InventoryItem[]): InventoryFeedRow[] {
  return items.flatMap((item, index) => {
    const rows: InventoryFeedRow[] = [
      { id: item.id, item, kind: 'item' },
    ];

    if ((index + 1) % 5 === 0) {
      rows.push({
        id: 'inventory-native-ad-' + Math.floor((index + 1) / 5),
        kind: 'native-ad',
      });
    }

    return rows;
  });
}

export default function InventoryScreen() {
  const { user } = useKeepFlipAuth();
  const { contentWidth, insets, pageGutter, responsiveFont } = useResponsiveLayout();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRows = useMemo(() => buildInventoryFeed(items), [items]);

  const loadItems = useCallback(
    async (refresh = false) => {
      if (!user?.$id) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setItems(await listInventoryItems(user.$id));
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'KeepFlip could not load your inventory.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.$id],
  );

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  return (
    <KeepFlipBackground>
      <FlatList
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: pageGutter,
            paddingTop: insets.top + 24,
          },
        ]}
        data={feedRows}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={
          <View style={[styles.header, { width: contentWidth }]}> 
            <Text style={styles.eyebrow}>YOUR ITEMS</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(31) }]}>Inventory</Text>
            <Text style={styles.subtitle}>
              Every saved scan, observed condition, and current market estimate in one place.
            </Text>
            {error ? (
              <View style={styles.errorCard}>
                <Text selectable style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void loadItems()} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={[styles.emptyState, { width: contentWidth }]}> 
              <ActivityIndicator color={theme.colors.scannerCyan} />
              <Text style={styles.emptyTitle}>Loading inventory</Text>
            </View>
          ) : !error ? (
            <View style={[styles.emptyState, { width: contentWidth }]}> 
              <View style={styles.emptyIcon}>
                <IconSymbol color={theme.colors.goldBright} name="viewfinder" size={34} />
              </View>
              <Text style={styles.emptyTitle}>No saved scans yet</Text>
              <Text style={styles.emptyBody}>
                Complete an item analysis and choose Save to Inventory.
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadItems(true)}
            refreshing={refreshing}
            tintColor={theme.colors.goldBright}
          />
        }
        renderItem={({ item: row }) =>
          row.kind === 'native-ad' ? (
            <View style={{ width: contentWidth }}>
              <KeepFlipNativeAdCard placement="inventory_feed" />
            </View>
          ) : (
            <View style={[styles.feedItem, { width: contentWidth }]}>
              <InventoryCard item={row.item} />
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  header: {
    gap: 7,
    marginBottom: 22,
  },
  feedItem: {
    marginBottom: 14,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  title: {
    color: theme.colors.cream,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    maxWidth: 560,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  errorCard: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.34)',
    backgroundColor: 'rgba(90, 18, 26, 0.32)',
  },
  errorText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.gold,
  },
  retryText: {
    color: theme.colors.backgroundDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  card: {
    gap: 14,
    padding: 18,
    borderRadius: theme.radii.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(215, 168, 74, 0.30)',
    backgroundColor: 'rgba(7, 7, 11, 0.92)',
    experimental_backgroundImage: `
      radial-gradient(circle at 88% 8%, rgba(88, 223, 232, 0.08) 0%, transparent 34%),
      linear-gradient(145deg, rgba(18, 15, 22, 0.98) 0%, rgba(5, 5, 8, 0.98) 72%)
    `,
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.44), 0 0 24px rgba(215, 168, 74, 0.08)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.38)',
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
  },
  cardTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.cream,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  confidencePill: {
    minWidth: 58,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.34)',
    backgroundColor: 'rgba(88, 223, 232, 0.08)',
  },
  confidenceValue: {
    color: theme.colors.scannerCyan,
    fontSize: 15,
    fontWeight: '900',
  },
  confidenceLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(242, 211, 138, 0.14)',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 14,
  },
  metricBlock: {
    flex: 1,
    gap: 4,
  },
  metricBlockRight: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-end',
  },
  metricEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  valueText: {
    color: theme.colors.goldBright,
    fontSize: 21,
    fontWeight: '900',
  },
  conditionText: {
    color: theme.colors.scannerViolet,
    fontSize: 16,
    fontWeight: '900',
  },
  notes: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  photoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photoCountText: {
    color: theme.colors.scannerCyan,
    fontSize: 11,
    fontWeight: '900',
  },
  emptyState: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  emptyIcon: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.42)',
    backgroundColor: 'rgba(215, 168, 74, 0.10)',
    boxShadow: '0 0 28px rgba(215, 168, 74, 0.12)',
  },
  emptyTitle: {
    color: theme.colors.cream,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyBody: {
    maxWidth: 330,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
