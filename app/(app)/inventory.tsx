import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  AppodealNativeAdView,
} from "@keepflip/expo-appodeal-native-ads";
import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { InventoryCard } from "@/components/inventory/inventory-card";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import {
  listInventoryItems,
  type InventoryFlipDecision,
  type InventoryItem,
  type InventoryListSort,
  type InventoryResaleVelocity,
} from "@/services/inventory-service";

const CARDS_BETWEEN_ADS = 4;
const HEADER_BOTTOM_SPACING = 22;

const INVENTORY_FEED_PLACEMENTS = [
  "inventory_feed",
  "inventory_feed_1",
  "inventory_feed_2",
  "inventory_feed_3",
  "inventory_feed_4",
  "27824954287146084_27824996457141867",
  "27824954287146084_27824999867141526",
  "27824954287146084_27825000287141484",
  "27824954287146084_27825000503808129",
  "27824954287146084_27825000743808105",  
] as const;

const NATIVE_ADS_SUPPORTED = Platform.OS === "android";

type InventoryFeedPlacement =
  (typeof INVENTORY_FEED_PLACEMENTS)[number];

const DECISION_FILTERS: Array<{
  label: string;
  value?: InventoryFlipDecision;
}> = [
  { label: "ALL" },
  { label: "FLIP", value: "flip" },
  { label: "CONDITIONAL", value: "conditional_flip" },
  { label: "AS IS", value: "sell_as_is" },
  { label: "PART OUT", value: "part_out" },
  { label: "SKIP", value: "skip" },
];

const VELOCITY_FILTERS: Array<{
  label: string;
  value?: InventoryResaleVelocity;
}> = [
  { label: "ANY SPEED" },
  { label: "FAST", value: "fast" },
  { label: "MODERATE", value: "moderate" },
  { label: "SLOW", value: "slow" },
];

const SORT_OPTIONS: Array<{ label: string; value: InventoryListSort }> = [
  { label: "NEWEST", value: "newest" },
  { label: "FASTEST TURN", value: "resale_speed" },
  { label: "HIGHEST CONF.", value: "decision_confidence" },
];

type InventoryFeedRow =
  | { id: string; item: InventoryItem; kind: "item" }
  | {
      id: string;
      kind: "native-ad";
      placement: InventoryFeedPlacement;
    };

function buildInventoryFeed(
  items: InventoryItem[],
  includeNativeAds: boolean,
): InventoryFeedRow[] {
  const feed: InventoryFeedRow[] = [];
  let nextPlacementIndex = 0;

  const appendAd = () => {
    const placement = INVENTORY_FEED_PLACEMENTS[nextPlacementIndex];

    if (!placement) {
      return;
    }

    feed.push({
      id: `inventory-feed-${nextPlacementIndex}`,
      kind: "native-ad",
      placement,
    });

    nextPlacementIndex += 1;
  };

  items.forEach((item, index) => {
    feed.push({ id: item.id, item, kind: "item" });

    if (includeNativeAds && (index + 1) % CARDS_BETWEEN_ADS === 0) {
      appendAd();
    }
  });

  if (
    includeNativeAds &&
    items.length > 0 &&
    items.length < CARDS_BETWEEN_ADS
  ) {
    appendAd();
  }

  return feed;
}

export default function InventoryScreen() {
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const userId = user?.$id;
  const { contentWidth, insets, pageGutter, responsiveFont } =
    useResponsiveLayout();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flipDecision, setFlipDecision] = useState<
    InventoryFlipDecision | undefined
  >();
  const [resaleVelocity, setResaleVelocity] = useState<
    InventoryResaleVelocity | undefined
  >();
  const [sort, setSort] = useState<InventoryListSort>("newest");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFlipDecision, setDraftFlipDecision] = useState<
    InventoryFlipDecision | undefined
  >();
  const [draftResaleVelocity, setDraftResaleVelocity] = useState<
    InventoryResaleVelocity | undefined
  >();
  const [draftSort, setDraftSort] = useState<InventoryListSort>("newest");

  const feedRows = useMemo(
    () => buildInventoryFeed(items, NATIVE_ADS_SUPPORTED),
    [items],
  );

  const appliedSelectionSummary = useMemo(() => {
    const decision = DECISION_FILTERS.find(
      (option) => option.value === flipDecision,
    )?.label;
    const velocity = VELOCITY_FILTERS.find(
      (option) => option.value === resaleVelocity,
    )?.label;
    const sortLabel = SORT_OPTIONS.find(
      (option) => option.value === sort,
    )?.label;

    return [decision, velocity, sortLabel].filter(Boolean).join("  ·  ");
  }, [flipDecision, resaleVelocity, sort]);

  const loadItems = useCallback(
    async (refresh = false) => {
      if (!userId) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        setItems(
          await listInventoryItems(userId, {
            flipDecision,
            resaleVelocity,
            sort,
          }),
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "KeepFlip could not load your inventory.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [flipDecision, resaleVelocity, sort, userId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  const openFilters = useCallback(() => {
    setDraftFlipDecision(flipDecision);
    setDraftResaleVelocity(resaleVelocity);
    setDraftSort(sort);
    setFiltersOpen(true);
  }, [flipDecision, resaleVelocity, sort]);

  const applyFilters = useCallback(() => {
    setFlipDecision(draftFlipDecision);
    setResaleVelocity(draftResaleVelocity);
    setSort(draftSort);
    setFiltersOpen(false);
  }, [draftFlipDecision, draftResaleVelocity, draftSort]);

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
            <Text
              style={[styles.title, { fontSize: responsiveFont(31) }]}
            >
              Inventory
            </Text>
            <Text style={styles.subtitle}>
              Every saved scan, observed condition, and current market estimate
              in one place.
            </Text>

            <Pressable
              accessibilityHint="Opens inventory filters and sorting options"
              accessibilityRole="button"
              onPress={openFilters}
              style={({ pressed }) => [
                styles.filterTrigger,
                pressed && styles.filterTriggerPressed,
              ]}
            >
              <View style={styles.filterTriggerTitle}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="line.3.horizontal"
                  size={16}
                />
                <Text style={styles.filterTriggerLabel}>
                  FILTER &amp; SORT
                </Text>
              </View>

              <Text numberOfLines={1} style={styles.filterTriggerSummary}>
                {appliedSelectionSummary}
              </Text>
            </Pressable>

            {error ? (
              <View style={styles.errorCard}>
                <Text selectable style={styles.errorText}>
                  {error}
                </Text>
                <Pressable
                  onPress={() => void loadItems()}
                  style={styles.retryButton}
                >
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
                <IconSymbol
                  color={theme.colors.goldBright}
                  name="viewfinder"
                  size={34}
                />
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
          row.kind === "native-ad" ? (
            <View style={{ width: contentWidth }}>
            <AppodealNativeAdView
                placement="inventory_feed"
                style={{ height: 380 }}
                onAdReady={({ nativeEvent }) => {
                  console.info(
                    "Native ad ready",
                    nativeEvent.availableCount,
                  );
                }}
                onAdFailed={({ nativeEvent }) => {
                  console.warn(
                    "Native ad failed",
                    nativeEvent.code,
                  );
                }}
              />
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
                onListingGuidePress={() =>
                  router.push({
                    pathname: "/listing-guide",
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

      <Modal
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
        transparent
        visible={filtersOpen}
      >
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="Close filters and sorting"
            accessibilityRole="button"
            onPress={() => setFiltersOpen(false)}
            style={styles.modalDismiss}
          />

          <View
            style={[
              styles.filterSheet,
              { paddingBottom: insets.bottom + 20 },
            ]}
          >
            <View style={styles.filterSheetHeader}>
              <View>
                <Text style={styles.filterSheetEyebrow}>
                  INVENTORY TOOLS
                </Text>
                <Text style={styles.filterSheetTitle}>Filter &amp; Sort</Text>
              </View>

              <Pressable
                accessibilityLabel="Close filters and sorting"
                accessibilityRole="button"
                onPress={() => setFiltersOpen(false)}
                style={styles.filterCloseButton}
              >
                <IconSymbol
                  color={theme.colors.cream}
                  name="xmark"
                  size={18}
                />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.filterSheetContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.filterSection}>
                <Text style={styles.controlLabel}>FLIP DECISION</Text>

                <View style={styles.controlOptions}>
                  {DECISION_FILTERS.map((option) => {
                    const selected = option.value === draftFlipDecision;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.label}
                        onPress={() => setDraftFlipDecision(option.value)}
                        style={[
                          styles.controlChip,
                          selected && styles.controlChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.controlChipText,
                            selected && styles.controlChipTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.controlLabel}>RESALE VELOCITY</Text>

                <View style={styles.controlOptions}>
                  {VELOCITY_FILTERS.map((option) => {
                    const selected = option.value === draftResaleVelocity;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.label}
                        onPress={() => setDraftResaleVelocity(option.value)}
                        style={[
                          styles.controlChip,
                          selected && styles.controlChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.controlChipText,
                            selected && styles.controlChipTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.controlLabel}>SORT INVENTORY</Text>

                <View style={styles.controlOptions}>
                  {SORT_OPTIONS.map((option) => {
                    const selected = option.value === draftSort;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.value}
                        onPress={() => setDraftSort(option.value)}
                        style={[
                          styles.controlChip,
                          selected && styles.controlChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.controlChipText,
                            selected && styles.controlChipTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDraftFlipDecision(undefined);
                    setDraftResaleVelocity(undefined);
                    setDraftSort("newest");
                  }}
                  style={styles.clearFiltersButton}
                >
                  <Text style={styles.clearFiltersText}>CLEAR</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={applyFilters}
                  style={styles.applyFiltersButton}
                >
                  <Text style={styles.applyFiltersText}>APPLY</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
  },
  header: {
    gap: 7,
    marginBottom: HEADER_BOTTOM_SPACING,
  },
  feedItem: {
    marginBottom: 14,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  title: {
    color: theme.colors.cream,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    maxWidth: 560,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  filterTrigger: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "rgba(101, 235, 255, 0.38)",
    borderRadius: theme.radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(7, 5, 10, 0.56)",
  },
  filterTriggerPressed: {
    opacity: 0.72,
  },
  filterTriggerTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  filterTriggerLabel: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  filterTriggerSummary: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    maxWidth: 190,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 1, 5, 0.72)",
  },
  modalDismiss: {
    ...StyleSheet.absoluteFill,
  },
  filterSheet: {
    maxHeight: "82%",
    borderTopLeftRadius: theme.radii.large,
    borderTopRightRadius: theme.radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(184, 168, 255, 0.32)",
    paddingHorizontal: 18,
    paddingTop: 18,
    backgroundColor: "rgba(15, 11, 24, 0.98)",
    boxShadow: "0 -12px 36px rgba(0, 0, 0, 0.36)",
  },
  filterSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  filterSheetEyebrow: {
    color: theme.colors.gold,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  filterSheetTitle: {
    color: theme.colors.cream,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  filterCloseButton: {
    alignItems: "center",
    width: 38,
    height: 38,
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(184, 168, 255, 0.28)",
    backgroundColor: "rgba(184, 168, 255, 0.08)",
  },
  filterSheetContent: {
    gap: 20,
    paddingBottom: 12,
  },
  filterSection: {
    gap: 8,
  },
  controlLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  controlOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  controlChip: {
    borderColor: "rgba(184, 168, 255, 0.23)",
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(7, 5, 10, 0.52)",
  },
  controlChipSelected: {
    borderColor: "rgba(101, 235, 255, 0.65)",
    backgroundColor: "rgba(40, 205, 229, 0.14)",
  },
  controlChipText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  controlChipTextSelected: {
    color: theme.colors.scannerCyan,
  },
  filterActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  clearFiltersButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    borderRadius: theme.radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(184, 168, 255, 0.3)",
    backgroundColor: "rgba(184, 168, 255, 0.08)",
  },
  clearFiltersText: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  applyFiltersButton: {
    alignItems: "center",
    flex: 1.4,
    justifyContent: "center",
    minHeight: 46,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.scannerCyan,
  },
  applyFiltersText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  errorCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.34)",
    backgroundColor: "rgba(90, 18, 26, 0.32)",
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
    fontWeight: "900",
  },
  emptyState: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  emptyIcon: {
    width: 74,
    height: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.42)",
    backgroundColor: "rgba(215, 168, 74, 0.10)",
    boxShadow: "0 0 28px rgba(215, 168, 74, 0.12)",
  },
  emptyTitle: {
    color: theme.colors.cream,
    fontSize: 20,
    fontWeight: "900",
  },
  emptyBody: {
    maxWidth: 330,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
