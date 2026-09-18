import { AdvancedHoloOverlay } from '@/components/scanner/advanced-holo-overlay';
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { withAlpha } from '@/lib/withAlpha';
import { resolveInventoryCoverImageUri } from "@/services/inventory-cover-image";
import type { InventoryItem } from "@/services/inventory-service";
import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

type CoverImageSource = ImageSource | number | string;
const PROVIDED_COVER_IMAGE_KEY = "__provided-cover-image__";

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

function formatCost(value: number | null, currency: string) {
  if (value == null) return "—";

  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(value);
  } catch {
    return "$" + value.toFixed(2);
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
  onAddPhotosPress,
  onDeletePress,
  isDeleting = false,
}: {
  coverImageSource?: CoverImageSource;
  item: InventoryItem;
  onPress: () => void;
  onListingGuidePress?: () => void;
  onAddPhotosPress?: () => void;
  onDeletePress?: () => void;
  isDeleting?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();

  const coverPhotoId = item.coverPhotoId;
  const hasProvidedCoverImage = Boolean(coverImageSource);
  const photoPageKeys = useMemo(() => {
    const seen = new Set<string>();
    const candidates = [
      ...(coverPhotoId ? [coverPhotoId] : []),
      ...item.itemPhotos,
    ];

    if (hasProvidedCoverImage) {
      candidates.unshift(PROVIDED_COVER_IMAGE_KEY);
    }

    return candidates.reduce<string[]>((result, candidate) => {
      const cleanCandidate = candidate.trim();

      if (cleanCandidate && !seen.has(cleanCandidate)) {
        seen.add(cleanCandidate);
        result.push(cleanCandidate);
      }

      return result;
    }, []);
  }, [coverPhotoId, hasProvidedCoverImage, item.itemPhotos]);
  const photoKeySignature = photoPageKeys.join("|");
  const [photoState, setPhotoState] = useState<{
    signature: string;
    index: number;
    uris: Record<string, string | null>;
    failures: Record<string, boolean>;
  }>({
    signature: "",
    index: 0,
    uris: {},
    failures: {},
  });
  const activePhotoState =
    photoState.signature === photoKeySignature
      ? photoState
      : {
        signature: photoKeySignature,
        index: 0,
        uris: {},
        failures: {},
      };
  const { failures: photoFailures, index: photoIndex, uris: photoUris } = activePhotoState;
  const [heroWidth, setHeroWidth] = useState(0);
  const requestedPhotoIds = useRef(new Set<string>());
  const photoGeneration = useRef(0);
  const meta = [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" / ");
  const hasValuation = item.estimatedValue != null;
  const flipDecision = displaySignal(item.flipDecision ?? item.flipVerdict);
  const resaleVelocity = displaySignal(item.resaleVelocity);
  const costBasis = item.acquisitionCost ?? item.inventoryCostOnHand;

  const requestPhoto = useCallback((photoId: string | undefined) => {
    if (
      !photoId ||
      photoId === PROVIDED_COVER_IMAGE_KEY ||
      requestedPhotoIds.current.has(photoId)
    ) {
      return;
    }

    requestedPhotoIds.current.add(photoId);
    const generation = photoGeneration.current;

    void resolveInventoryCoverImageUri(photoId)
      .then((uri) => {
        if (generation !== photoGeneration.current) return;

        setPhotoState((current) => {
          const base =
            current.signature === photoKeySignature
              ? current
              : {
                signature: photoKeySignature,
                index: 0,
                uris: {},
                failures: {},
              };

          return {
            ...base,
            uris: { ...base.uris, [photoId]: uri },
            failures: uri
              ? base.failures
              : { ...base.failures, [photoId]: true },
          };
        });
      })
      .catch(() => {
        if (generation !== photoGeneration.current) return;

        setPhotoState((current) => {
          const base =
            current.signature === photoKeySignature
              ? current
              : {
                signature: photoKeySignature,
                index: 0,
                uris: {},
                failures: {},
              };

          return {
            ...base,
            failures: { ...base.failures, [photoId]: true },
          };
        });
      });
  }, [photoKeySignature]);

  const ensureNearbyPhotos = useCallback(
    (index: number) => {
      for (const offset of [-1, 0, 1]) {
        const nearbyIndex = index + offset;

        if (
          nearbyIndex < 0 ||
          nearbyIndex >= photoPageKeys.length ||
          (nearbyIndex === 0 && hasProvidedCoverImage)
        ) {
          continue;
        }

        requestPhoto(photoPageKeys[nearbyIndex]);
      }
    },
    [hasProvidedCoverImage, photoPageKeys, requestPhoto],
  );

  useEffect(() => {
    photoGeneration.current += 1;
    requestedPhotoIds.current.clear();
    ensureNearbyPhotos(0);
  }, [ensureNearbyPhotos, photoKeySignature]);

  const handlePhotoScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (heroWidth <= 0 || photoPageKeys.length <= 1) return;

      const nextIndex = Math.max(
        0,
        Math.min(
          photoPageKeys.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / heroWidth),
        ),
      );

      setPhotoState((current) => ({
        ...(current.signature === photoKeySignature
          ? current
          : {
            signature: photoKeySignature,
            index: 0,
            uris: {},
            failures: {},
          }),
        index: nextIndex,
      }));
      ensureNearbyPhotos(nextIndex);
    },
    [ensureNearbyPhotos, heroWidth, photoKeySignature, photoPageKeys.length],
  );

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
          <AdvancedHoloOverlay width={500} height={240} />
          {photoPageKeys.length > 0 ? (
            <ScrollView
              bounces={photoPageKeys.length > 1}
              contentContainerStyle={[
                styles.photoCarouselContent,
                heroWidth > 0 && {
                  width: heroWidth * photoPageKeys.length,
                },
              ]}
              contentInsetAdjustmentBehavior="never"
              decelerationRate="fast"
              horizontal
              nestedScrollEnabled
              onLayout={(event) => setHeroWidth(event.nativeEvent.layout.width)}
              onMomentumScrollEnd={handlePhotoScrollEnd}
              pagingEnabled
              scrollEnabled={photoPageKeys.length > 1}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={heroWidth > 0 ? heroWidth : undefined}
              style={styles.photoCarousel}
            >
              {photoPageKeys.map((photoKey, index) => {
                const source =
                  index === 0 && coverImageSource
                    ? coverImageSource
                    : photoUris[photoKey]
                      ? { uri: photoUris[photoKey] }
                      : null;
                const unavailable = photoFailures[photoKey] === true;

                return (
                  <View
                    key={photoKey}
                    style={[
                      styles.photoPage,
                      heroWidth > 0 && { width: heroWidth },
                    ]}
                  >
                    {source && !unavailable ? (
                      <Image
                        accessibilityLabel={`${item.title} photo ${index + 1} of ${photoPageKeys.length}`}
                        contentFit="cover"
                        onError={() =>
                          setPhotoState((current) => {
                            const base =
                              current.signature === photoKeySignature
                                ? current
                                : {
                                  signature: photoKeySignature,
                                  index: 0,
                                  uris: {},
                                  failures: {},
                                };

                            return {
                              ...base,
                              failures: { ...base.failures, [photoKey]: true },
                            };
                          })
                        }
                        source={source}
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
                        <Text style={[styles.fallbackLabel, { fontSize: responsiveFont(8) }]}>
                          {unavailable ? "PHOTO UNAVAILABLE" : "LOADING PHOTO"}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.coverFallback}>
              <IconSymbol
                color={theme.colors.goldBright}
                name="photo.on.rectangle.angled"
                size={36}
              />
              <Text style={[styles.fallbackLabel, { fontSize: responsiveFont(8) }]}>
                NO COVER PHOTO
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
            <View style={styles.conditionPill}>
              <Text numberOfLines={1} style={[styles.conditionText, { fontSize: responsiveFont(8) }]}>
                {item.condition}
              </Text>
              {flipDecision && flipDecision !== "UNKNOWN" ? (
                <Text numberOfLines={1} style={[styles.flipDecisionText, { fontSize: responsiveFont(7) }]}>
                  {flipDecision}{resaleVelocity ? ` / ${resaleVelocity}` : ""}
                </Text>
              ) : null}
            </View>
            {photoPageKeys.length > 0 ? (
              <View style={styles.photoPill}>
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="photo.on.rectangle.angled"
                  size={14}
                />
                <Text style={[styles.photoPillText, { fontSize: responsiveFont(8) }]}>
                  {photoIndex + 1}/{photoPageKeys.length}
                </Text>
              </View>
            ) : null}
          </View>

          <View pointerEvents="none" style={styles.heroCopy}>
            <Text numberOfLines={2} selectable style={[styles.title, { fontSize: responsiveFont(21), lineHeight: 25 }]}>
              {item.title}
            </Text>
            {meta ? (
              <Text numberOfLines={2} selectable style={styles.meta}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View style={styles.savedAt}>
            <Text style={[styles.savedAtLabel, { fontSize: responsiveFont(7) }]}>SAVED</Text>
            <Text style={[styles.savedAtValue, { fontSize: responsiveFont(8) }]}>{formatDate(item.createdAt)}</Text>
          </View>
          {photoPageKeys.length > 1 ? (
            <View pointerEvents="none" style={styles.photoIndicators}>
              {photoPageKeys.map((photoKey, index) => (
                <View
                  key={photoKey}
                  style={[
                    styles.photoIndicator,
                    index === photoIndex && styles.photoIndicatorActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.valuationDivider,
            !hasValuation && styles.valuationDividerPending,
          ]}
        >
          <LinearGradient
            colors={[
              withAlpha(theme.colors.scannerViolet, 1),
              withAlpha(theme.colors.goldBright, 1),
              withAlpha(theme.colors.scannerCyan, 1),
            ]}
            end={{ x: 1, y: 0.5 }}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.dividerMedianMarker} />
        </View>

        <View style={styles.valuationSummary}>

          <View style={styles.medianBlock}>
            <Text style={[styles.medianLabel, { fontSize: responsiveFont(8) }]}>
              {hasValuation ? "MARKET MEDIAN" : "MARKET VALUE"}
            </Text>
            <Text selectable style={[styles.medianValue, { fontSize: responsiveFont(40), lineHeight: 46 }]}>
              {formatMoney(item.estimatedValue, item.currency)}
            </Text>
          </View>

          <View style={styles.confidenceBlock}>
            <Text style={[styles.confidenceValue, { fontSize: responsiveFont(16) }]}>
              {item.aiConfidence == null ? "—" : `${item.aiConfidence}%`}
            </Text>
            <Text style={[styles.confidenceLabel, { fontSize: responsiveFont(7) }]}>CONFIDENCE</Text>
          </View>
        </View>
        <View style={styles.recordStrip}>
          <View style={styles.recordMetric}>
            <Text style={[styles.recordLabel, { fontSize: responsiveFont(7) }]}>COGS / ACTUAL PAID</Text>
            <Text numberOfLines={1} style={[styles.recordValue, { fontSize: responsiveFont(11) }]}>
              {formatCost(costBasis, item.currency)}
            </Text>
          </View>
          <View style={styles.recordMetric}>
            <Text style={[styles.recordLabel, { fontSize: responsiveFont(7) }]}>ON HAND</Text>
            <Text numberOfLines={1} style={[styles.recordValue, { fontSize: responsiveFont(11) }]}>
              {item.quantityOnHand.toLocaleString()}
            </Text>
          </View>
          <View style={styles.recordMetricStorage}>
            <Text style={[styles.recordLabel, { fontSize: responsiveFont(7) }]}>STORAGE</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.recordValue,
                !item.storageLocation && styles.recordValueMuted,
              ]}
            >
              {item.storageLocation ?? "NOT SET"}
            </Text>
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
            <Text style={[styles.listingGuideButtonEyebrow, { fontSize: responsiveFont(7) }]}>SELLER WORKFLOW</Text>
            <Text style={[styles.listingGuideButtonLabel, { fontSize: responsiveFont(15) }]}>List item</Text>
          </View>
          <IconSymbol
            color={theme.colors.goldBright}
            name="arrow.right"
            size={18}
          />
        </Pressable>
      ) : null}

      {onAddPhotosPress ? (
        <Pressable
          accessibilityHint={"Opens the photo manager for " + item.title}
          accessibilityLabel={"Add photos to " + item.title}
          accessibilityRole="button"
          onPress={onAddPhotosPress}
          style={({ pressed }) => [
            styles.listingGuideButton,
            styles.photoManagerButton,
            pressed && styles.listingGuideButtonPressed,
          ]}
        >
          <View style={styles.listingGuideButtonIcon}>
            <IconSymbol
              color={theme.colors.scannerCyan}
              name="photo.on.rectangle.angled"
              size={17}
            />
          </View>
          <View style={styles.listingGuideButtonCopy}>
            <Text style={[styles.listingGuideButtonEyebrow, { fontSize: responsiveFont(7) }]}>PHOTO SET</Text>
            <Text style={[styles.listingGuideButtonLabel, { fontSize: responsiveFont(15) }]}> Add photos</Text>
          </View>
          <IconSymbol
            color={theme.colors.scannerCyan}
            name="arrow.right"
            size={18}
          />
        </Pressable>
      ) : null}

      {onDeletePress ? (
        <Pressable
          accessibilityHint={
            isDeleting
              ? "Delete operation in progress"
              : `Deletes ${item.title} from KeepFlip inventory after confirmation`
          }
          accessibilityLabel={
            isDeleting
              ? `Deleting ${item.title}`
              : `Delete ${item.title} from inventory`
          }
          accessibilityRole="button"
          accessibilityState={{ busy: isDeleting, disabled: isDeleting }}
          disabled={isDeleting}
          onPress={onDeletePress}
          style={({ pressed }) => [
            styles.listingGuideButton,
            styles.deleteButton,
            pressed && styles.listingGuideButtonPressed,
            isDeleting && styles.deleteButtonDisabled,
          ]}
        >
          <View style={[styles.listingGuideButtonIcon, styles.deleteButtonIcon]}>
            <IconSymbol
              color={theme.colors.danger}
              name="trash.fill"
              size={17}
            />
          </View>
          <View style={styles.listingGuideButtonCopy}>
            <Text style={[styles.listingGuideButtonEyebrow, styles.deleteButtonLabel, { fontSize: responsiveFont(7) }]}>INVENTORY CONTROL</Text>
            <Text style={[styles.listingGuideButtonLabel, styles.deleteButtonLabel, { fontSize: responsiveFont(15) }]}>
              {isDeleting ? "Deleting…" : "Delete item"}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    card: {
      overflow: "hidden",
      borderRadius: theme.radii.large,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.card,
      boxShadow:
        "0 18px 42px rgba(0, 0, 0, 0.46), 0 0 28px rgba(215, 168, 74, 0.08)",
    },
    cardPressTarget: {
      backgroundColor: theme.colors.card,
    },
    cardPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.985 }],
    },
    hero: {
      height: 240,
      justifyContent: "space-between",
      backgroundColor: theme.colors.surfaceInset,
    },
    photoCarousel: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    photoCarouselContent: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    photoPage: {
      alignSelf: "stretch",
      flexGrow: 0,
      flexShrink: 0,
      width: "100%",
      overflow: "hidden",
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
      backgroundColor: theme.colors.surfaceInset,
      experimental_backgroundImage:
        "radial-gradient(circle at 50% 26%, rgba(141, 114, 255, 0.28) 0%, transparent 34%), radial-gradient(circle at 74% 72%, rgba(88, 223, 232, 0.16) 0%, transparent 38%), linear-gradient(145deg, #100B18 0%, #030305 76%)",
    },
    fallbackLabel: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
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
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    photoPillText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    conditionPill: {
      maxWidth: "58%",
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: theme.radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    conditionText: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    flipDecisionText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
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
      color: theme.colors.text,
      fontFamily: theme.fonts.bold,
      fontSize: responsiveFont(21),
      lineHeight: 25,
      fontWeight: "900",
      letterSpacing: -0.3,
      textShadowColor: "rgba(0, 0, 0, 0.96)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 7,
    },
    meta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(9),
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
      backgroundColor: theme.colors.text,
      boxShadow: "0 0 8px rgba(255, 255, 255, 0.96)",
    },
    valuationSummary: {
      position: "relative",
      minHeight: 70,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 7,
      backgroundColor: theme.colors.card,
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
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    savedAtValue: {
      color: theme.colors.text,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    medianBlock: {
      alignItems: "center",
      gap: 3,
    },
    medianLabel: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    medianValue: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(40),
      lineHeight: 46,
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
      fontSize: responsiveFont(16),
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
      textShadowColor: "rgba(88, 223, 232, 0.58)",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 7,
    },
    confidenceLabel: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    recordStrip: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    recordMetric: {
      flex: 0.78,
      minWidth: '25%',
      gap: 3,
    },
    recordMetricStorage: {
      flex: 1.2,
      minWidth: 0,
      gap: 3,
    },
    recordLabel: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    recordValue: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(11),
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    recordValueMuted: {
      color: theme.colors.textMuted,
    },
    listingGuideButton: {
      position: "relative",
      minHeight: 53,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 15,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.surfaceInset,
    },
    listingGuideButtonPressed: {
      opacity: 0.76,
    },
    photoManagerButton: {
      borderTopColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.surfaceInset,
    },
    deleteButton: {
      borderTopColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
    },
    deleteButtonDisabled: {
      opacity: 0.58,
    },
    deleteButtonIcon: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
      boxShadow: "0 0 16px rgba(255, 107, 107, 0.14)",
    },
    deleteButtonLabel: {
      color: theme.colors.danger,
    },
    photoIndicators: {
      position: "absolute",
      right: 0,
      bottom: 14,
      left: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    photoIndicator: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.cardSoft,
    },
    photoIndicatorActive: {
      width: 16,
      backgroundColor: theme.colors.goldBright,
    },
    listingGuideButtonIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.small,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
      boxShadow: "0 0 16px rgba(0, 255, 255, 0.16)",
    },
    listingGuideButtonCopy: {
      flex: 1,
      gap: 2,
    },
    listingGuideButtonEyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveFont(7),
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    listingGuideButtonLabel: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: responsiveFont(15),
      fontWeight: "900",
      letterSpacing: -0.12,
    },
  });
  return {
    ...staticStyles,
    hero: [
      staticStyles.hero,
      {
        height: responsiveHeight(240),
      },
    ],
    fallbackLabel: [
      staticStyles.fallbackLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    photoPillText: [
      staticStyles.photoPillText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    conditionText: [
      staticStyles.conditionText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    flipDecisionText: [
      staticStyles.flipDecisionText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(21),
        textShadowOffset: { width: responsiveWidth(0), height: responsiveHeight(2) },
      },
    ],
    meta: [
      staticStyles.meta,
      {
        fontSize: responsiveFont(9),
        textShadowOffset: { width: responsiveWidth(0), height: responsiveHeight(1) },
      },
    ],
    valuationDivider: [
      staticStyles.valuationDivider,
      {
        height: responsiveHeight(7),
      },
    ],
    dividerMedianMarker: [
      staticStyles.dividerMedianMarker,
      {
        width: responsiveWidth(2),
        height: responsiveHeight(13),
      },
    ],
    savedAtLabel: [
      staticStyles.savedAtLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    savedAtValue: [
      staticStyles.savedAtValue,
      {
        fontSize: responsiveFont(8),
      },
    ],
    medianLabel: [
      staticStyles.medianLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    medianValue: [
      staticStyles.medianValue,
      {
        fontSize: responsiveFont(40),
        textShadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
    confidenceValue: [
      staticStyles.confidenceValue,
      {
        fontSize: responsiveFont(16),
        textShadowOffset: { width: responsiveWidth(0), height: responsiveHeight(0) },
      },
    ],
    confidenceLabel: [
      staticStyles.confidenceLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    recordLabel: [
      staticStyles.recordLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    recordValue: [
      staticStyles.recordValue,
      {
        fontSize: responsiveFont(11),
      },
    ],
    listingGuideButtonIcon: [
      staticStyles.listingGuideButtonIcon,
      {
        width: responsiveWidth(34),
        height: responsiveHeight(34),
      },
    ],
    listingGuideButtonEyebrow: [
      staticStyles.listingGuideButtonEyebrow,
      {
        fontSize: responsiveFont(7),
      },
    ],
    listingGuideButtonLabel: [
      staticStyles.listingGuideButtonLabel,
      {
        fontSize: responsiveFont(15),
      },
    ],
  };
}
