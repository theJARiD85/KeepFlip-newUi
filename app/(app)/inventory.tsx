import { MetricsAnalyticsScreen } from "@/components/analytics/metrics-analytics-screen";
import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { InventoryCard } from "@/components/inventory/inventory-card";
import { ManualInventoryItemDialog } from "@/components/inventory/manual-inventory-item-dialog";
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipControlRow } from "@/components/ui/keepflip-control-row";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from "@/hooks/use-responsive-layout";
import {
  deleteInventoryItem,
  listInventoryItems,
  type InventoryFlipDecision,
  type InventoryItem,
  type InventoryListSort,
  type InventoryResaleVelocity,
} from "@/services/inventory-service";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

const CARDS_BETWEEN_ADS = 0;
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

type InventoryView = "items" | "analytics";

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
  const responsiveLayout2 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [activeView, setActiveView] = useState<InventoryView>(
    requestedTab === "analytics" ? "analytics" : "items",
  );
  const { user } = useKeepFlipAuth();
  const userId = user?.$id;
  const {
    contentWidth, insets, pageGutter, responsiveFont: scaleResponsiveFont,
    contentMaxWidth,
    webContentWidth,
    webContentMaxWidth,
    webPageGutter,
    webGridColumns,
    isTablet,
  } =
    useResponsiveLayout();
  const inventoryColumns =
    Platform.OS === "web"
      ? isTablet
        ? webGridColumns
        : 2
      : 2;
  const inventoryColumnGap = Platform.OS === "web" && isTablet ? 50 : 12;
  const inventoryCardWidth =
    Platform.OS === "web" && isTablet
      ? (contentWidth - inventoryColumnGap * inventoryColumns) /
      inventoryColumns
      : (contentWidth - pageGutter * 2 - inventoryColumnGap * (inventoryColumns - 1)) /
      inventoryColumns;
  const webContentSizing =
    Platform.OS === "web"
      ? {
        width: webContentWidth,
        maxWidth: webContentMaxWidth,
        alignSelf: "center" as const,
        paddingHorizontal: webPageGutter,
      }
      : undefined;
  const responsiveFont = (size: number, factor?: number) =>
    scaleResponsiveFont(Math.max(size, 11), factor);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);

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

  useEffect(() => {
    setActiveView(requestedTab === "analytics" ? "analytics" : "items");
  }, [requestedTab]);

  const switchView = useCallback(
    (nextView: InventoryView) => {
      setActiveView(nextView);
      setFiltersOpen(false);
      router.replace(nextView === "analytics" ? "/inventory?tab=analytics" : "/inventory");
    },
    [router],
  );

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
      if (activeView !== "items") return undefined;
      void loadItems();
      return undefined;
    }, [activeView, loadItems]),
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

  const performDelete = useCallback(
    async (item: InventoryItem) => {
      if (!userId || deletingItemId) return;

      setDeletingItemId(item.id);
      setError(null);

      try {
        const result = await deleteInventoryItem(userId, item.id);
        setItems((currentItems) =>
          currentItems.filter((currentItem) => currentItem.id !== item.id),
        );

        if (result.photoFileDeleteFailures > 0) {
          Alert.alert(
            "Item deleted",
            `The inventory record was deleted, but ${result.photoFileDeleteFailures} saved photo file${result.photoFileDeleteFailures === 1 ? "" : "s"} could not be cleaned up.`,
          );
        }
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "KeepFlip could not delete this inventory item.",
        );
      } finally {
        setDeletingItemId(null);
      }
    },
    [deletingItemId, userId],
  );

  const confirmDelete = useCallback(
    (item: InventoryItem) => {
      if (!userId || deletingItemId) return;

      const hasExternalListing =
        item.isListed ||
        Boolean(item.externalListingId || item.externalOfferId || item.ebayListingId || item.ebayOfferId);

      Alert.alert(
        "Delete inventory item?",
        hasExternalListing
          ? `“${item.title}” will be removed from KeepFlip inventory. Its existing eBay listing will not be changed.`
          : `“${item.title}” and its saved item photos will be removed from KeepFlip.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            onPress: () => void performDelete(item),
            style: "destructive",
          },
        ],
      );
    },
    [deletingItemId, performDelete, userId],
  );

  return (
    <KeepFlipBackground>
      <View style={[styles.screen, webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center' }]}>
        <View style={[styles.header, { paddingTop: insets.top + 15, paddingLeft: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveWidth(15) : 15, width: contentWidth }]}>
          <Text style={[styles.eyebrow, { fontFamily: theme.fonts.display, fontSize: responsiveFont(10) }]}>YOUR ITEMS</Text>
          <Text
            style={[styles.title, { fontFamily: theme.fonts.bold, fontSize: responsiveFont(26) }]}
          >
            Inventory
          </Text>
          <Text style={[styles.subtitle, { maxWidth: '90%', fontSize: responsiveFont(12), fontFamily: theme.fonts.body }]}>
            Scanned and manually added items, purchase costs, and market
            estimates in one place.
          </Text>
          <View style={{ marginTop: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveHeight(14) : 14 }}>
            <KeepFlipControlRow
              accent="cyan"
              actionLabel="ADD ITEM"
              accessibilityHint="Add inventory without a scan or resale valuation."
              description="Add an item manually and record what you paid for Books and COGS."
              icon="cube-outline"
              label="Add inventory item manually"
              onPress={() => setManualAddOpen(true)}
            />
          </View>
        </View>
        <View
          style={[
            styles.viewTabs,
            { marginHorizontal: pageGutter, marginTop: insets.top + 10 },
          ]}
        >
          {([
            ["items", "INVENTORY"],
            ["analytics", "ANALYTICS"],
          ] as const).map(([view, label]) => {
            const selected = activeView === view;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={view}
                onPress={() => switchView(view)}
                style={({ pressed }) => [
                  styles.viewTab,
                  selected && styles.viewTabActive,
                  pressed && styles.viewTabPressed,
                ]}
              >
                <Text
                  style={[
                    styles.viewTabText,
                    { fontSize: responsiveFont(9) },
                    selected && styles.viewTabTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeView === "analytics" ? (
          <MetricsAnalyticsScreen embedded />
        ) : (
          <FlatList
            key={`inventory-${inventoryColumns}`}
            contentContainerStyle={[styles.content,
            {
              paddingBottom: insets.bottom + 30,
              paddingHorizontal: Platform.OS === "web" ? 0 : pageGutter,
              paddingTop: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveHeight(15) : 15,
            },
              webContentSizing, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
            style={[
              styles.list,
              Platform.OS === "web" && {
                alignSelf: "center",
                width: contentWidth,
                maxWidth: contentMaxWidth,
                paddingHorizontal: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveWidth(30) : 30,
              },
              { marginBottom: insets.bottom },
            ]}
            data={feedRows}
            numColumns={inventoryColumns}
            columnWrapperStyle={
              inventoryColumns > 1 ? styles.gridRow : undefined
            }
            keyExtractor={(row) => row.id}
            ListHeaderComponent={
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
                  <Ionicons
                    color={theme.colors.scannerCyan}
                    name="menu"
                    size={16}
                  />
                  <Text style={[styles.filterTriggerLabel, { fontSize: responsiveFont(7) }]}>
                    FILTER &amp; SORT
                  </Text>
                </View>

                <Text numberOfLines={1} style={[styles.filterTriggerSummary, { fontSize: responsiveFont(7) }]}>
                  {appliedSelectionSummary}
                </Text>
              </Pressable>
            }
            ListEmptyComponent={
              loading ? (
                <View style={[styles.emptyState, { width: contentWidth }]}>
                  <ActivityIndicator color={theme.colors.scannerCyan} />
                  <Text style={[styles.emptyTitle, { fontSize: responsiveFont(20) }]}>Loading inventory</Text>
                </View>
              ) : !error ? (
                <View style={[styles.emptyState, { width: contentWidth }]}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      color={theme.colors.goldBright}
                      name="scan-outline"
                      size={34}
                    />
                  </View>
                  <Text style={[styles.emptyTitle, { fontSize: responsiveFont(20) }]}>No inventory items yet</Text>
                  <Text style={[styles.emptyBody, { fontSize: responsiveFont(13) }]}>
                    Add an item manually and enter what you paid, or scan it if you also want an estimated resale value.
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
                null
              ) : (
                <View style={[styles.feedItem, { width: inventoryCardWidth }]}>
                  <InventoryCard
                    compact={Platform.OS !== "web" || inventoryCardWidth < 320}
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
                    onAddPhotosPress={() =>
                      router.push({
                        pathname: "/listing-guide",
                        params: { focus: "photos", itemId: row.item.id },
                      })
                    }
                    onRemoveBackgroundPress={
                      Platform.OS !== "web" && row.item.photoCount > 0
                        ? () =>
                          router.push({
                            pathname: "/listing-guide",
                            params: { focus: "background", itemId: row.item.id },
                          })
                        : undefined
                    }
                    onMarkSoldPress={
                      row.item.quantityOnHand > 0 || row.item.isListed
                        ? () =>
                          router.push({
                            pathname: "/command-center",
                            params: {
                              openSellerOperations: "1",
                              saleItemId: row.item.id,
                            },
                          })
                        : undefined
                    }
                    onDeletePress={() => confirmDelete(row.item)}
                    isDeleting={deletingItemId === row.item.id}
                  />
                </View>
              )
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        <ManualInventoryItemDialog
          onCancel={() => setManualAddOpen(false)}
          onSaved={() => {
            void loadItems(true);
          }}
          ownerId={userId ?? ""}
          visible={manualAddOpen}
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
                  <Text style={[styles.filterSheetEyebrow, { fontSize: responsiveFont(8) }]}>
                    INVENTORY TOOLS
                  </Text>
                  <Text style={[styles.filterSheetTitle, { fontSize: responsiveFont(24) }]}>Filter &amp; Sort</Text>
                </View>

                <Pressable
                  accessibilityLabel="Close filters and sorting"
                  accessibilityRole="button"
                  onPress={() => setFiltersOpen(false)}
                  style={styles.filterCloseButton}
                >
                  <Ionicons
                    color={theme.colors.cream}
                    name="close"
                    size={18}
                  />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.filterSheetContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.filterSection}>
                  <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>FLIP DECISION</Text>

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
                  <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>RESALE VELOCITY</Text>

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
                  <Text style={[styles.controlLabel, { fontSize: responsiveFont(8) }]}>SORT INVENTORY</Text>

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
                    <Text style={[styles.clearFiltersText, { fontSize: responsiveFont(10) }]}>CLEAR</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={applyFilters}
                    style={styles.applyFiltersButton}
                  >
                    <Text style={[styles.applyFiltersText, { fontSize: responsiveFont(10) }]}>APPLY</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight } = responsiveLayout;
  const responsiveFont = (size: number, factor?: number) =>
    responsiveLayout.responsiveFont(Math.max(size, 11), factor);
  const staticStyles = StyleSheet.create({
    screen: {
      flex: 1,
    },
    list: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      alignItems: "stretch",
      justifyContent: "flex-start"
    },
    gridRow: {
      justifyContent: "space-between",
    },
    viewTabs: {
      backgroundColor: theme.colors.surfaceOverlay,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4,
      padding: 4,
    },
    viewTab: {
      alignItems: "center",
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      flex: 1,
      justifyContent: "center",
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(40) : 40,
    },
    viewTabActive: {
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    viewTabPressed: {
      opacity: 0.78,
    },
    viewTabText: {
      color: theme.colors.textMuted,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    viewTabTextActive: {
      color: theme.colors.scannerCyan,
    },
    header: {
    },
    feedItem: {
      marginBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(14) : 14,
    },
    eyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.display,
      fontWeight: "900",
      letterSpacing: 2.4,
    },
    title: {
      color: theme.colors.cream,
      fontWeight: "900",
      letterSpacing: -0.6,
    },
    subtitle: {
      maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(560) : 560,
      fontFamily: theme.fonts.body,
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15,
    },
    filterTrigger: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: theme.radii.medium,
      borderWidth: StyleSheet.hairlineWidth,
      width: '100%',
      flexDirection: "row",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
      marginBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
      backgroundColor: theme.colors.surfaceInset,
    },
    filterTriggerPressed: {
      opacity: 0.72,
    },
    filterTriggerTitle: {
      alignItems: "center",
      flexDirection: "row",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7,
    },
    filterTriggerLabel: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    filterTriggerSummary: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11,
      fontWeight: "900",
      letterSpacing: 0.5,
      maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(190) : 190,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.colors.scrim,
    },
    modalDismiss: {
      ...StyleSheet.absoluteFill,
    },
    filterSheet: {
      maxHeight: "82%",
      borderTopLeftRadius: theme.radii.large,
      borderTopRightRadius: theme.radii.large,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentVioletBorder,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(18) : 18,
      paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(18) : 18,
      backgroundColor: theme.colors.surfaceOverlay,
      boxShadow: "0 -12px 36px rgba(0, 0, 0, 0.36)",
    },
    filterSheetHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(16) : 16,
    },
    filterSheetEyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    filterSheetTitle: {
      color: theme.colors.cream,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(24) : 24,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    filterCloseButton: {
      alignItems: "center",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(38) : 38,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(38) : 38,
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentVioletBorder,
      backgroundColor: theme.colors.iconSurfaceViolet,
    },
    filterSheetContent: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(20) : 20,
      paddingBottom: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(12) : 12,
    },
    filterSection: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
    },
    controlLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    controlOptions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7,
    },
    controlChip: {
      borderColor: theme.colors.accentVioletBorder,
      borderRadius: theme.radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6,
      backgroundColor: theme.colors.surfaceInset,
    },
    controlChipSelected: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    controlChipText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    controlChipTextSelected: {
      color: theme.colors.scannerCyan,
    },
    filterActions: {
      flexDirection: "row",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(4) : 4,
    },
    clearFiltersButton: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(46) : 46,
      borderRadius: theme.radii.medium,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentVioletBorder,
      backgroundColor: theme.colors.iconSurfaceViolet,
    },
    clearFiltersText: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    applyFiltersButton: {
      alignItems: "center",
      flex: 1.4,
      justifyContent: "center",
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(46) : 46,
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.scannerCyan,
    },
    applyFiltersText: {
      color: theme.colors.textOnAccent,
      fontFamily: theme.fonts.body,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    errorCard: {
      marginTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      padding: 14,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
    },
    errorText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(18) : 18,
    },
    retryButton: {
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.gold,
    },
    retryText: {
      color: theme.colors.textOnAccent,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12,
      fontWeight: "900",
    },
    emptyState: {
      flex: 1,
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(360) : 360,
      alignItems: "center",
      justifyContent: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      padding: 24,
    },
    emptyIcon: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(74) : 74,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(74) : 74,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
      boxShadow: "0 0 28px rgba(215, 168, 74, 0.12)",
    },
    emptyTitle: {
      color: theme.colors.cream,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(20) : 20,
      fontWeight: "900",
    },
    emptyBody: {
      maxWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(330) : 330,
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : 13,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(19) : 19,
      textAlign: "center",
    },
  });
  return {
    ...staticStyles,
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    filterTriggerLabel: [
      staticStyles.filterTriggerLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    filterTriggerSummary: [
      staticStyles.filterTriggerSummary,
      {
        fontSize: responsiveFont(8),
      },
    ],
    filterSheetEyebrow: [
      staticStyles.filterSheetEyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    filterSheetTitle: [
      staticStyles.filterSheetTitle,
      {
        fontSize: responsiveFont(24),
      },
    ],
    filterCloseButton: [
      staticStyles.filterCloseButton,
      {
        width: responsiveWidth(38),
        height: responsiveHeight(38),
      },
    ],
    controlLabel: [
      staticStyles.controlLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    controlChipText: [
      staticStyles.controlChipText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    clearFiltersText: [
      staticStyles.clearFiltersText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    applyFiltersText: [
      staticStyles.applyFiltersText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    retryText: [
      staticStyles.retryText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    emptyIcon: [
      staticStyles.emptyIcon,
      {
        width: responsiveWidth(74),
        height: responsiveHeight(74),
      },
    ],
    emptyTitle: [
      staticStyles.emptyTitle,
      {
        fontSize: responsiveFont(20),
      },
    ],
    emptyBody: [
      staticStyles.emptyBody,
      {
        fontSize: responsiveFont(13),
      },
    ],
  };
}
