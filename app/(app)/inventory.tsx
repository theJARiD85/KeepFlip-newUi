import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { KeepFlipNativeAdCard } from '@/components/ads/keepflip-native-ad-card';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { InventoryCard } from '@/components/inventory/inventory-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  listInventoryItems,
  type InventoryItem,
} from '@/services/inventory-service';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";

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
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const userId = user?.$id;
  const { contentWidth, insets, pageGutter, responsiveFont } = useResponsiveLayout();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRows = useMemo(() => buildInventoryFeed(items), [items]);

  const loadItems = useCallback(
    async (refresh = false) => {
      if (!userId) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setItems(await listInventoryItems(userId));
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
    [userId],
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
              <InventoryCard
                item={row.item}
                onPress={() =>
                  router.push({
                    pathname: "/analysis-result",
                    params: { itemId: row.item.id },
                  })
                }
              />
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
