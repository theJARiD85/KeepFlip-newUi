import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  listDealShelfItems,
  markDealShelfPromoted,
  removeDealShelfItem,
  type DealShelfItem,
} from "@/services/deal-shelf-service";
import { resolveInventoryCoverImageUri } from "@/services/inventory-cover-image";
import { saveAnalyzedItemToInventory } from "@/services/inventory-service";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";

function formatMoney(value: number | null, currency: string) {
  if (value == null || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
      style: "currency",
    }).format(value);
  } catch {
    return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
  }
}

function formatDecision(value: DealShelfItem["decision"]) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hoursRemaining(expiresAt: string) {
  const remaining = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours >= 48) return `${Math.ceil(hours / 24)} days left`;
  return `${hours} hr left`;
}

function DealCard({
  deal,
  onPromote,
  onRemove,
  promoting,
}: {
  deal: DealShelfItem;
  onPromote: (deal: DealShelfItem) => void;
  onRemove: (deal: DealShelfItem) => void;
  promoting: boolean;
}) {
  const quickSale = formatMoney(deal.quickSale, deal.currency);
  const targetSale = formatMoney(deal.targetSale, deal.currency);
  const maxBuyPrice = formatMoney(deal.maxBuyPrice, deal.currency);
  const condition = deal.state.data.condition?.label;
  const coverPhotoId = deal.coverPhotoId;
  const coverKey = `${deal.id}:${coverPhotoId ?? ""}`;
  const [coverState, setCoverState] = useState({
    key: "",
    unavailable: false,
    uri: null as string | null,
  });
  const summary =
    deal.state.data.decisionCard?.summary ??
    deal.state.data.valuationReadiness.reason;

  useEffect(() => {
    let active = true;

    void (coverPhotoId
      ? resolveInventoryCoverImageUri(coverPhotoId)
      : Promise.resolve(null))
      .then((uri) => {
        if (!active) return;
        setCoverState({
          key: coverKey,
          unavailable: !uri,
          uri,
        });
      })
      .catch(() => {
        if (!active) return;
        setCoverState({
          key: coverKey,
          unavailable: true,
          uri: null,
        });
      });

    return () => {
      active = false;
    };
  }, [coverKey, coverPhotoId]);

  const imageUri = coverState.key === coverKey ? coverState.uri : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.imageFrame}>
          {imageUri && !coverState.unavailable ? (
            <Image
              accessibilityLabel={`${deal.title} scan photo`}
              contentFit="cover"
              source={{ uri: imageUri }}
              style={styles.image}
            />
          ) : (
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="viewfinder"
              size={30}
            />
          )}
        </View>

        <View style={styles.cardCopy}>
          <Text numberOfLines={2} style={styles.title}>
            {deal.title}
          </Text>
          <View style={styles.metaRow}>
            {deal.ladderLevel ? (
              <Text style={styles.metaPill}>{deal.ladderLevel}</Text>
            ) : null}
            <Text style={styles.metaPill}>{formatDecision(deal.decision)}</Text>
            {condition ? <Text style={styles.metaPill}>{condition}</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.valueGrid}>
        {quickSale ? (
          <View style={styles.valueCell}>
            <Text style={styles.valueLabel}>QUICK SALE</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.valueText}>
              {quickSale}
            </Text>
          </View>
        ) : null}
        {targetSale ? (
          <View style={styles.valueCell}>
            <Text style={styles.valueLabel}>TARGET</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.valueTextGold}>
              {targetSale}
            </Text>
          </View>
        ) : null}
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel}>DECIDE BY</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.valueText}>
            {hoursRemaining(deal.expiresAt)}
          </Text>
        </View>
      </View>

      {maxBuyPrice != null ? (
        <View style={styles.buyCeilingRow}>
          <View>
            <Text style={styles.buyCeilingLabel}>TOP DOLLAR TO PAY</Text>
            <Text style={styles.buyCeilingHint}>Before buyer-side costs</Text>
          </View>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.buyCeilingValue}>
            {maxBuyPrice}
          </Text>
        </View>
      ) : null}

      {summary ? (
        <Text numberOfLines={3} style={styles.summary}>
          {summary}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={promoting}
          onPress={() => onPromote(deal)}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.pressed,
            promoting && styles.disabled,
          ]}
        >
          <IconSymbol
            color={theme.colors.backgroundDeep}
            name="shippingbox.fill"
            size={15}
          />
          <Text style={styles.primaryActionText}>
            {promoting ? "ADDING..." : "ADD TO INVENTORY"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={promoting}
          onPress={() => onRemove(deal)}
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.pressed,
            promoting && styles.disabled,
          ]}
        >
          <IconSymbol color={theme.colors.goldBright} name="xmark" size={15} />
        </Pressable>
      </View>
    </View>
  );
}

export default function DealShelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useKeepFlipAuth();
  const userId = user?.$id ?? "";
  const [deals, setDeals] = useState<DealShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    if (!userId) {
      setDeals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setDeals(await listDealShelfItems(userId));
    } catch (caught) {
      Alert.alert(
        "Could not open Deal Shelf",
        caught instanceof Error
          ? neutralizeMarketplaceBrand(caught.message)
          : "KeepFlip could not load your saved deal queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadDeals();
    }, [loadDeals]),
  );

  const headerStats = useMemo(() => {
    const targetTotal = deals.reduce(
      (total, deal) => total + (deal.targetSale ?? 0),
      0,
    );
    return {
      count: deals.length,
      targetTotal: formatMoney(targetTotal || null, "USD"),
    };
  }, [deals]);

  const handlePromote = useCallback(
    async (deal: DealShelfItem) => {
      if (!userId || promotingId) return;
      setPromotingId(deal.id);
      try {
        const saved = await saveAnalyzedItemToInventory({
          analysis: deal.analysis,
          modelFile: deal.modelFile,
          ownerId: userId,
          scanId: deal.scanId,
        });
        await markDealShelfPromoted({
          dealId: deal.id,
          itemId: saved.item.id,
          ownerId: userId,
        });
        router.replace("/inventory");
      } catch (caught) {
        Alert.alert(
          "Could not add to inventory",
          caught instanceof Error
            ? neutralizeMarketplaceBrand(caught.message)
            : "KeepFlip could not move this deal into inventory.",
        );
      } finally {
        setPromotingId(null);
      }
    },
    [promotingId, router, userId],
  );

  const handleRemove = useCallback(
    async (deal: DealShelfItem) => {
      if (!userId) return;
      await removeDealShelfItem(userId, deal.id);
      setDeals((current) => current.filter((item) => item.id !== deal.id));
    },
    [userId],
  );

  return (
    <KeepFlipBackground>
      <View style={[styles.screen, { paddingTop: insets.top + 72 }]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DEAL SHELF</Text>
          <Text style={styles.heading}>Deals to decide</Text>
          <Text style={styles.headerBody}>
            Park scans here before you buy. KeepFlip keeps the resale signal,
            deadline, and next action separate from owned inventory.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{headerStats.count}</Text>
              <Text style={styles.statLabel}>ACTIVE DEALS</Text>
            </View>
            {headerStats.targetTotal ? (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{headerStats.targetTotal}</Text>
                <Text style={styles.statLabel}>TARGET VALUE</Text>
              </View>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.scannerCyan} />
            <Text style={styles.centerText}>Loading deal shelf</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={[
              styles.listContent,
              deals.length === 0 && styles.emptyListContent,
              { paddingBottom: insets.bottom + 28 },
            ]}
            data={deals}
            keyExtractor={(deal) => deal.id}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="tag.fill"
                  size={34}
                />
                <Text style={styles.emptyTitle}>No parked deals yet</Text>
                <Text style={styles.emptyBody}>
                  After a scan, choose Park on Deal Shelf to hold a buy decision
                  without adding it to Inventory.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace("/")}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <IconSymbol
                    color={theme.colors.backgroundDeep}
                    name="viewfinder"
                    size={15}
                  />
                  <Text style={styles.primaryActionText}>SCAN A DEAL</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <DealCard
                deal={item}
                onPromote={handlePromote}
                onRemove={handleRemove}
                promoting={promotingId === item.id}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  heading: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    fontWeight: "900",
  },
  headerBody: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 18,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  stat: {
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.22)",
    backgroundColor: "rgba(4, 5, 9, 0.58)",
  },
  statValue: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.numbers,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.numbers,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  listContent: {
    gap: 14,
    paddingTop: 18,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
    gap: 13,
    padding: 13,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.24)",
    backgroundColor: "rgba(5, 5, 10, 0.86)",
  },
  cardTop: {
    flexDirection: "row",
    gap: 12,
  },
  imageFrame: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.24)",
    backgroundColor: "rgba(88, 223, 232, 0.06)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  cardCopy: {
    flex: 1,
    gap: 8,
  },
  title: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaPill: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 8,
    fontWeight: "900",
    backgroundColor: "rgba(88, 223, 232, 0.08)",
  },
  valueGrid: {
    flexDirection: "row",
    gap: 8,
  },
  valueCell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    padding: 9,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.16)",
    backgroundColor: "rgba(242, 211, 138, 0.04)",
  },
  valueLabel: {
    color: theme.colors.goldMuted,
    fontFamily: theme.fonts.numbers,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  valueText: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.numbers,
    fontSize: 14,
    fontWeight: "900",
  },
  valueTextGold: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.numbers,
    fontSize: 14,
    fontWeight: "900",
  },
  buyCeilingRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.38)",
    backgroundColor: "rgba(88, 223, 232, 0.065)",
  },
  buyCeilingLabel: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  buyCeilingHint: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    marginTop: 2,
  },
  buyCeilingValue: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.numbers,
    fontSize: 20,
    fontWeight: "900",
  },
  summary: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.goldBright,
  },
  primaryActionText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.numbers,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  secondaryAction: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.38)",
    backgroundColor: "rgba(4, 4, 8, 0.70)",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  centerText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 12,
  },
  emptyCard: {
    alignItems: "center",
    gap: 12,
    padding: 22,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.24)",
    backgroundColor: "rgba(5, 5, 10, 0.80)",
  },
  emptyTitle: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 21,
    fontWeight: "900",
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.radar,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.48,
  },
});
