import { Image, type ImageSource } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import type { InventoryItem } from "@/services/inventory-service";

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "Value pending";

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

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently scanned";

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InventoryCard({
  coverImageSource,
  item,
  onPress,
}: {
  coverImageSource?: ImageSource | number;
  item: InventoryItem;
  onPress: () => void;
}) {
  const meta = [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityHint="Opens the saved KeepFlip analysis and captured item evidence"
      accessibilityLabel={`Open analysis for ${item.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}>
          {coverImageSource ? (
            <Image
              accessibilityLabel={`${item.title} cover photo`}
              contentFit="cover"
              source={coverImageSource}
              style={styles.cardCoverImage}
              transition={160}
            />
          ) : (
            <IconSymbol
              color={theme.colors.goldBright}
              name="shippingbox.fill"
              size={22}
            />
          )}
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
          <IconSymbol
            color={theme.colors.scannerCyan}
            name="photo.on.rectangle.angled"
            size={13}
          />
          <Text style={styles.photoCountText}>{item.photoCount}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 18,
    borderRadius: theme.radii.large,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(215, 168, 74, 0.30)",
    backgroundColor: "rgba(7, 7, 11, 0.92)",
    experimental_backgroundImage: `
      radial-gradient(circle at 88% 8%, rgba(88, 223, 232, 0.08) 0%, transparent 34%),
      linear-gradient(145deg, rgba(18, 15, 22, 0.98) 0%, rgba(5, 5, 8, 0.98) 72%)
    `,
    boxShadow:
      "0 16px 40px rgba(0, 0, 0, 0.44), 0 0 24px rgba(215, 168, 74, 0.08)",
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(242, 211, 138, 0.38)",
    backgroundColor: "rgba(215, 168, 74, 0.12)",
  },
  cardCoverImage: {
    width: "100%",
    height: "100%",
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
    fontWeight: "900",
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  confidencePill: {
    minWidth: 58,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(88, 223, 232, 0.08)",
  },
  confidenceValue: {
    color: theme.colors.scannerCyan,
    fontSize: 15,
    fontWeight: "900",
  },
  confidenceLabel: {
    color: theme.colors.textMuted,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(242, 211, 138, 0.14)",
  },
  metricRow: {
    flexDirection: "row",
    gap: 14,
  },
  metricBlock: {
    flex: 1,
    gap: 4,
  },
  metricBlockRight: {
    flex: 1,
    gap: 4,
    alignItems: "flex-end",
  },
  metricEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  valueText: {
    color: theme.colors.goldBright,
    fontSize: 21,
    fontWeight: "900",
  },
  conditionText: {
    color: theme.colors.scannerViolet,
    fontSize: 16,
    fontWeight: "900",
  },
  notes: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  photoCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  photoCountText: {
    color: theme.colors.scannerCyan,
    fontSize: 11,
    fontWeight: "900",
  },
});
