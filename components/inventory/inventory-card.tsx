import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AdvancedHoloOverlay } from '@/components/scanner/advanced-holo-overlay';
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { resolveInventoryCoverImageUri } from "@/services/inventory-cover-image";
import type { InventoryItem } from "@/services/inventory-service";
import { withAlpha } from '@/lib/withAlpha';

type CoverImageSource = ImageSource | number | string;

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "—";

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
  if (Number.isNaN(parsed.getTime())) return "RECENT SCAN";

  return parsed
    .toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })
    .toUpperCase();
}

function displaySignal(value: string | null) {
  return value?.replace(/_/g, " ").toUpperCase() || null;
}

export function InventoryCard({
  coverImageSource,
  item,
  onPress,
  onListingGuidePress,
}: {
  coverImageSource?: CoverImageSource;
  item: InventoryItem;
  onPress: () => void;
  onListingGuidePress?: () => void;
}) {
  const coverPhotoId = item.coverPhotoId;
  const coverKey = coverPhotoId ?? "";
  const [coverState, setCoverState] = useState({
    key: "",
    uri: null as string | null,
    unavailable: false,
  });
  const meta = [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" / ");
  const resolvedSource =
    coverImageSource ??
    (coverState.key === coverKey && coverState.uri
      ? { uri: coverState.uri }
      : null);
  const imageUnavailable =
    !coverImageSource &&
    coverState.key === coverKey &&
    coverState.unavailable;
  const hasValuation = item.estimatedValue != null;
  const flipDecision = displaySignal(item.flipDecision ?? item.flipVerdict);
  const resaleVelocity = displaySignal(item.resaleVelocity);

  useEffect(() => {
    let active = true;

    if (coverImageSource) {
      return () => {
        active = false;
      };
    }

    void (coverPhotoId
      ? resolveInventoryCoverImageUri(coverPhotoId)
      : Promise.resolve(null))
      .then((uri) => {
        if (!active) return;
        setCoverState({
          key: coverKey,
          uri,
          unavailable: !uri,
        });
      })
      .catch(() => {
        if (!active) return;
        setCoverState({
          key: coverKey,
          uri: null,
          unavailable: true,
        });
      });

    return () => {
      active = false;
    };
  }, [coverImageSource, coverKey, coverPhotoId]);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityHint="Opens the saved KeepFlip analysis and captured item evidence"
        accessibilityLabel={`Open analysis for ${item.title}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.cardPressTarget,
          pressed && styles.cardPressed,
        ]}
      >
      <View style={styles.hero}>
        <AdvancedHoloOverlay width={500} height={216} />
        {resolvedSource && !imageUnavailable ? (
          
          <Image
            accessibilityLabel={`${item.title} cover photo`}
            contentFit="cover"
            onError={() =>
              setCoverState((current) =>
                current.key === coverKey
                  ? { ...current, unavailable: true }
                  : current,
              )
            }
            source={resolvedSource}
            style={styles.coverImage}
            transition={180}
          />
        ) : (
          <View style={styles.coverFallback}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="photo.on.rectangle.angled"
              size={36}
            />
            <Text style={styles.fallbackLabel}>
              {item.coverPhotoId ? "LOADING COVER" : "NO COVER PHOTO"}
            </Text>
            </View>
        )}
        <LinearGradient
          colors={[
            "rgba(1, 1, 2, 0.04)",
            "rgba(1, 1, 2, 0.14)",
            "rgba(1, 1, 2, 0.94)",
          ]}
          locations={[0, 0.42, 1]}
          pointerEvents="none"
          style={styles.heroShade}
        />

        <View pointerEvents="none" style={styles.heroTopRail}>
          <View style={styles.photoPill}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="photo.on.rectangle.angled"
              size={12}
            />
            <Text style={styles.photoPillText}>
              {item.photoCount} {item.photoCount === 1 ? "PHOTO" : "PHOTOS"}
            </Text>
          </View>

          <View style={styles.conditionPill}>
            <Text numberOfLines={1} style={styles.conditionText}>
              {item.condition}
            </Text>
            {flipDecision && flipDecision !== "UNKNOWN" ? (
              <Text numberOfLines={1} style={styles.flipDecisionText}>
                {flipDecision}{resaleVelocity ? ` / ${resaleVelocity}` : ""}
              </Text>
            ) : null}
          </View>
        </View>

        <View pointerEvents="none" style={styles.heroCopy}>
          <Text numberOfLines={2} selectable style={styles.title}>
            {item.title}
          </Text>
          {meta ? (
            <Text numberOfLines={2} selectable style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.valuationDivider,
          !hasValuation && styles.valuationDividerPending,
        ]}
      >
        <LinearGradient
          colors={[
            withAlpha(theme.colors.scannerViolet,1),
            withAlpha(theme.colors.goldBright,1),
            withAlpha(theme.colors.scannerCyan,1),
          ]}
          end={{ x: 1, y: 0.5 }}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dividerMedianMarker} />
      </View>

      <View style={styles.valuationSummary}>
        <View style={styles.savedAt}>
          <Text style={styles.savedAtLabel}>SAVED</Text>
          <Text style={styles.savedAtValue}>{formatDate(item.createdAt)}</Text>
        </View>

        <View style={styles.medianBlock}>
          <Text style={styles.medianLabel}>
            {hasValuation ? "MARKET MEDIAN" : "MARKET VALUE"}
          </Text>
          <Text selectable style={styles.medianValue}>
            {formatMoney(item.estimatedValue, item.currency)}
          </Text>
        </View>

        <View style={styles.confidenceBlock}>
          <Text style={styles.confidenceValue}>
            {item.aiConfidence == null ? "—" : `${item.aiConfidence}%`}
          </Text>
          <Text style={styles.confidenceLabel}>CONFIDENCE</Text>
        </View>
      </View>
      </Pressable>

      {onListingGuidePress ? (
        <Pressable
          accessibilityHint={`Opens a guided checklist for creating a marketplace listing for ${item.title}`}
          accessibilityLabel={`Listing creation guide for ${item.title}`}
          accessibilityRole="button"
          onPress={onListingGuidePress}
          style={({ pressed }) => [
            styles.listingGuideButton,
            pressed && styles.listingGuideButtonPressed,
          ]}
        >
          <LinearGradient
            colors={[
              "rgba(141, 114, 255, 0.22)",
              "rgba(0, 255, 255, 0.16)",
              "rgba(242, 211, 138, 0.18)",
            ]}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.listingGuideButtonIcon}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="tag.fill"
              size={17}
            />
          </View>
          <View style={styles.listingGuideButtonCopy}>
            <Text style={styles.listingGuideButtonEyebrow}>SELLER WORKFLOW</Text>
            <Text style={styles.listingGuideButtonLabel}>Listing creation guide</Text>
          </View>
          <IconSymbol
            color={theme.colors.goldBright}
            name="arrow.right"
            size={18}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: theme.radii.large,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(215, 168, 74, 0.32)",
    backgroundColor: "rgba(5, 5, 8, 0.98)",
    boxShadow:
      "0 18px 42px rgba(0, 0, 0, 0.46), 0 0 28px rgba(215, 168, 74, 0.08)",
  },
  cardPressTarget: {
    backgroundColor: "rgba(5, 5, 8, 0.98)",
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  hero: {
    height: 216,
    justifyContent: "space-between",
    backgroundColor: "#08070C",
  },
  coverImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  coverFallback: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#08070C",
    experimental_backgroundImage:
      "radial-gradient(circle at 50% 26%, rgba(141, 114, 255, 0.28) 0%, transparent 34%), radial-gradient(circle at 74% 72%, rgba(88, 223, 232, 0.16) 0%, transparent 38%), linear-gradient(145deg, #100B18 0%, #030305 76%)",
  },
  fallbackLabel: {
    color: "rgba(242, 211, 138, 0.72)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  heroShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  heroTopRail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 14,
  },
  photoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(0, 8, 13, 0.70)",
  },
  photoPillText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  conditionPill: {
    maxWidth: "58%",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.36)",
    backgroundColor: "rgba(7, 5, 10, 0.72)",
  },
  conditionText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  flipDecisionText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginTop: 3,
    textTransform: "uppercase",
  },
  heroCopy: {
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: theme.fonts.bold,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0, 0, 0, 0.96)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 7,
  },
  meta: {
    color: "rgba(235, 241, 244, 0.78)",
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textShadowColor: "rgba(0, 0, 0, 0.98)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  valuationDivider: {
    height: 7,
    overflow: "visible",
    backgroundColor: theme.colors.goldBright,
    boxShadow:
      "0 0 12px rgba(141, 114, 255, 0.46), 0 0 18px rgba(242, 211, 138, 0.56), 0 0 12px rgba(88, 223, 232, 0.42)",
  },
  valuationDividerPending: {
    opacity: 0.36,
  },
  dividerMedianMarker: {
    position: "absolute",
    top: -3,
    left: "50%",
    width: 2,
    height: 13,
    marginLeft: -1,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 0 8px rgba(255, 255, 255, 0.96)",
  },
  valuationSummary: {
    position: "relative",
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "rgba(5, 5, 8, 0.98)",
    experimental_backgroundImage:
      "radial-gradient(circle at 50% 0%, rgba(242, 211, 138, 0.13) 0%, transparent 48%), linear-gradient(90deg, rgba(141, 114, 255, 0.08) 0%, rgba(5, 5, 8, 0) 28%, rgba(5, 5, 8, 0) 72%, rgba(88, 223, 232, 0.08) 100%)",
  },
  savedAt: {
    position: "absolute",
    bottom: 18,
    left: 16,
    gap: 3,
  },
  savedAtLabel: {
    color: "rgba(255, 255, 255, 0.38)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  savedAtValue: {
    color: "rgba(255, 255, 255, 0.66)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  medianBlock: {
    alignItems: "center",
    gap: 3,
  },
  medianLabel: {
    color: "rgba(242, 211, 138, 0.70)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  medianValue: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(242, 211, 138, 0.52)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  confidenceBlock: {
    position: "absolute",
    right: 16,
    bottom: 17,
    alignItems: "flex-end",
    gap: 3,
  },
  confidenceValue: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(88, 223, 232, 0.58)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
  confidenceLabel: {
    color: "rgba(88, 223, 232, 0.60)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  listingGuideButton: {
    position: "relative",
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0, 255, 255, 0.28)",
    backgroundColor: "rgba(4, 8, 12, 0.96)",
  },
  listingGuideButtonPressed: {
    opacity: 0.76,
  },
  listingGuideButtonIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 255, 255, 0.42)",
    backgroundColor: "rgba(0, 255, 255, 0.08)",
    boxShadow: "0 0 16px rgba(0, 255, 255, 0.16)",
  },
  listingGuideButtonCopy: {
    flex: 1,
    gap: 2,
  },
  listingGuideButtonEyebrow: {
    color: "rgba(0, 255, 255, 0.66)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  listingGuideButtonLabel: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.12,
  },
});
