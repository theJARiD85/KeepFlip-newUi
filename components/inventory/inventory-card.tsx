import { Ionicons } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  releaseInventoryCoverImageUri,
  resolveInventoryCoverImageUri,
} from "@/services/inventory-cover-image";
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

export function InventoryCard({
  coverImageSource,
  compact = false,
  item,
  onPress,
  onListingGuidePress,
  onAddPhotosPress,
  onRemoveBackgroundPress,
  onMarkSoldPress,
  onDeletePress,
  isDeleting = false,
}: {
  coverImageSource?: CoverImageSource;
  compact?: boolean;
  item: InventoryItem;
  onPress: () => void;
  onListingGuidePress?: () => void;
  onAddPhotosPress?: () => void;
  onRemoveBackgroundPress?: () => void;
  onMarkSoldPress?: () => void;
  onDeletePress?: () => void;
  isDeleting?: boolean;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont: scaleResponsiveFont } = useResponsiveLayout();
  const responsiveFont = (size: number, factor?: number) =>
    scaleResponsiveFont(Math.max(size, 11), factor);

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
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const requestedPhotoIds = useRef(new Set<string>());
  const photoGeneration = useRef(0);
  const resolvedPhotoUris = useRef(new Set<string>());
  const meta = [item.brand, item.model, item.category]
    .filter((value) => Boolean(value) && value !== "Other")
    .join(" / ");
  const hasValuation = item.estimatedValue != null;
  const costOnHand = item.inventoryCostOnHand ?? item.acquisitionCost;

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
        if (generation !== photoGeneration.current) {
          if (uri) releaseInventoryCoverImageUri(uri);
          return;
        }

        if (uri) resolvedPhotoUris.current.add(uri);

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

    return () => {
      photoGeneration.current += 1;
      resolvedPhotoUris.current.forEach(releaseInventoryCoverImageUri);
      resolvedPhotoUris.current.clear();
    };
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
        <View style={[styles.hero, compact && styles.compactHero]}>
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
                        <Ionicons
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
              <Ionicons
                color={theme.colors.goldBright}
                name="photo.on.rectangle.angled"
                size={36}
              />
              <Text style={[styles.fallbackLabel, { fontSize: responsiveFont(8) }]}>
                NO COVER PHOTO
              </Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.heroTopRail}>
            {!compact && item.condition.toLowerCase() !== "unknown" ? (
              <View style={styles.conditionPill}>
                <Text numberOfLines={1} style={styles.conditionText}>
                  {item.condition}
                </Text>
              </View>
            ) : <View />}
            {photoPageKeys.length > 1 ? (
              <View style={styles.photoPill}>
                <Ionicons
                  color={theme.colors.scannerCyan}
                  name="photo.on.rectangle.angled"
                  size={14}
                />
                <Text style={styles.photoPillText}>
                  {photoIndex + 1}/{photoPageKeys.length}
                </Text>
              </View>
            ) : null}
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

        <View style={[styles.details, compact && styles.compactDetails]}>
          <View style={styles.identity}>
            <Text numberOfLines={compact ? 1 : 2} selectable style={[styles.itemTitle, compact && styles.compactTitle]}>
              {item.title}
            </Text>
            {!compact && meta ? (
              <Text numberOfLines={1} selectable style={styles.meta}>
                {meta}
              </Text>
            ) : null}
          </View>

          {compact ? (
            <View style={styles.compactValuation}>
              <Text style={styles.compactValuationLabel}>EST. VALUE</Text>
              <Text numberOfLines={1} selectable style={styles.compactValuationValue}>
                {hasValuation ? formatMoney(item.estimatedValue, item.currency) : "Not set"}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.valuationSummary}>
                <View style={styles.medianBlock}>
                  <Text style={styles.medianLabel}>
                    {hasValuation ? "ESTIMATED RESALE VALUE" : "RESALE VALUE"}
                  </Text>
                  <Text numberOfLines={1} selectable style={styles.medianValue}>
                    {hasValuation ? formatMoney(item.estimatedValue, item.currency) : "Not set"}
                  </Text>
                </View>
              </View>

              <View style={styles.recordStrip}>
                <View style={styles.recordMetric}>
                  <Text style={styles.recordLabel}>COST ON HAND</Text>
                  <Text numberOfLines={1} style={styles.recordValue}>
                    {formatCost(costOnHand, item.currency)}
                  </Text>
                </View>
                <View style={styles.recordMetric}>
                  <Text style={styles.recordLabel}>QUANTITY</Text>
                  <Text numberOfLines={1} style={styles.recordValue}>
                    {item.quantityOnHand.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.recordMetricStorage}>
                  <Text style={styles.recordLabel}>LOCATION</Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.recordValue,
                      !item.storageLocation && styles.recordValueMuted,
                    ]}
                  >
                    {item.storageLocation || "Not set"}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </Pressable>

      {onListingGuidePress || onAddPhotosPress || onRemoveBackgroundPress || onMarkSoldPress || onDeletePress ? (
        <View style={styles.itemActions}>
          <Pressable
            accessibilityHint={`${actionsExpanded ? "Hides" : "Shows"} the listing, photo, sale, and delete actions for ${item.title}`}
            accessibilityLabel={`${actionsExpanded ? "Hide" : "Show"} item actions for ${item.title}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: actionsExpanded }}
            onPress={() => setActionsExpanded((expanded) => !expanded)}
            style={({ pressed }) => [
              styles.itemActionsToggle,
              actionsExpanded && styles.itemActionsToggleExpanded,
              pressed && styles.listingGuideButtonPressed,
            ]}
          >
            <Text style={styles.itemActionsToggleLabel}>
              {actionsExpanded ? "Close" : "Actions"}
            </Text>
            <Ionicons
              color={theme.colors.scannerCyan}
              name="ellipsis"
              size={21}
            />
          </Pressable>

          {actionsExpanded ? (
            <View>
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
                    <Ionicons
                      color={theme.colors.scannerCyan}
                      name="tag.fill"
                      size={17}
                    />
                  </View>
                  <View style={styles.listingGuideButtonCopy}>
                    <Text style={styles.listingGuideButtonLabel}>List</Text>
                  </View>
                  <Ionicons
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
                    <Ionicons
                      color={theme.colors.scannerCyan}
                      name="photo.on.rectangle.angled"
                      size={17}
                    />
                  </View>
                  <View style={styles.listingGuideButtonCopy}>
                    <Text style={styles.listingGuideButtonLabel}>Photos</Text>
                  </View>
                  <Ionicons
                    color={theme.colors.scannerCyan}
                    name="arrow.right"
                    size={18}
                  />
                </Pressable>
              ) : null}

              {onRemoveBackgroundPress ? (
                <Pressable
                  accessibilityHint={"Opens background removal for saved photos of " + item.title}
                  accessibilityLabel={"Remove background from a photo of " + item.title}
                  accessibilityRole="button"
                  onPress={onRemoveBackgroundPress}
                  style={({ pressed }) => [
                    styles.listingGuideButton,
                    styles.photoManagerButton,
                    pressed && styles.listingGuideButtonPressed,
                  ]}
                >
                  <View style={styles.listingGuideButtonIcon}>
                    <Ionicons
                      color={theme.colors.scannerCyan}
                      name="photo.on.rectangle.angled"
                      size={17}
                    />
                  </View>
                  <View style={styles.listingGuideButtonCopy}>
                    <Text style={styles.listingGuideButtonLabel}>Remove background</Text>
                  </View>
                  <Ionicons
                    color={theme.colors.scannerCyan}
                    name="arrow.right"
                    size={18}
                  />
                </Pressable>
              ) : null}

              {onMarkSoldPress ? (
                <Pressable
                  accessibilityHint={`Opens the manual sale form with ${item.title} selected. Enter the actual sold amount and quantity to record the sale.`}
                  accessibilityLabel={`Mark ${item.title} sold`}
                  accessibilityRole="button"
                  onPress={onMarkSoldPress}
                  style={({ pressed }) => [
                    styles.listingGuideButton,
                    styles.markSoldButton,
                    pressed && styles.listingGuideButtonPressed,
                  ]}
                >
                  <View style={[styles.listingGuideButtonIcon, styles.markSoldButtonIcon]}>
                    <Ionicons
                      color={theme.colors.goldBright}
                      name="checkmark.circle.fill"
                      size={17}
                    />
                  </View>
                  <View style={styles.listingGuideButtonCopy}>
                    <Text style={[styles.listingGuideButtonLabel, styles.markSoldButtonLabel]}>Mark sold</Text>
                  </View>
                  <Ionicons
                    color={theme.colors.goldBright}
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
                    <Ionicons
                      color={theme.colors.danger}
                      name="trash.fill"
                      size={17}
                    />
                  </View>
                  <View style={styles.listingGuideButtonCopy}>
                    <Text style={[styles.listingGuideButtonLabel, styles.deleteButtonLabel]}>
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveHeight, responsiveWidth } = responsiveLayout;
  const responsiveFont = (size: number, factor?: number) =>
    responsiveLayout.responsiveFont(Math.max(size, 11), factor);
  const staticStyles = StyleSheet.create({
    card: {
      overflow: "hidden",
      width: '100%',
      borderRadius: theme.radii.medium,
      borderCurve: "continuous",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.card,
      boxShadow: "0 8px 20px rgba(0, 0, 0, 0.24)",
    },
    cardPressTarget: {
      backgroundColor: theme.colors.card,
    },
    cardPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.985 }],
    },
    hero: {
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(190) : 190,
      backgroundColor: theme.colors.surfaceInset,
    },
    details: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      padding: 14,
      backgroundColor: theme.colors.card,
    },
    compactDetails: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : 9,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
    },
    identity: {
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3,
      minWidth: 0,
    },
    itemTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: responsiveFont(16),
      fontWeight: "800",
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(20) : 20,
    },
    compactTitle: {
      fontSize: responsiveFont(12),
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(16) : 16,
    },
    meta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(10),
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14,
    },
    compactValuation: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6,
      paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    compactValuationLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "800",
      letterSpacing: 0.65,
    },
    compactValuationValue: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: responsiveFont(14),
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    valuationSummary: {
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
      borderRadius: theme.radii.small,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceInset,
    },
    medianBlock: {
      alignItems: "flex-start",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3,
    },
    medianLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    medianValue: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.numbers,
      fontSize: responsiveFont(24),
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(30) : 30,
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    photoCarousel: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    photoCarouselContent: {
      height: "100%",
      flexDirection: "row",
      alignItems: "stretch",
      flexGrow: 1,
    },
    photoPage: {
      alignSelf: "stretch",
      flexGrow: 0,
      flexShrink: 0,
      height: "100%",
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
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      backgroundColor: theme.colors.surfaceInset,
      experimental_backgroundImage:
        "radial-gradient(circle at 50% 26%, rgba(141, 114, 255, 0.28) 0%, transparent 34%), radial-gradient(circle at 74% 72%, rgba(88, 223, 232, 0.16) 0%, transparent 38%), linear-gradient(145deg, #100B18 0%, #030305 76%)",
    },
    fallbackLabel: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    heroTopRail: {
      position: "absolute",
      top: 0,
      right: 0,
      left: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(42) : 42,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(10) : 10,
      zIndex: 1,
    },
    photoPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6,
      borderRadius: theme.radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    photoPillText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    conditionPill: {
      maxWidth: "58%",
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5,
      borderRadius: theme.radii.small,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: "rgba(5, 5, 8, 0.78)",
    },
    conditionText: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    recordStrip: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      paddingTop: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(11) : 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    recordMetric: {
      flex: 1,
      minWidth: 0,
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4,
    },
    recordMetricStorage: {
      flex: 1.15,
      minWidth: 0,
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(4) : 4,
    },
    recordLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(8),
      fontWeight: "900",
      letterSpacing: 0.55,
    },
    recordValue: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(10),
      fontWeight: "900",
      fontVariant: ["tabular-nums"],
    },
    recordValueMuted: {
      color: theme.colors.textMuted,
    },
    itemActions: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceInset,
    },
    itemActionsToggle: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(40) : 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      alignSelf: "flex-end",
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
    },
    itemActionsToggleLabel: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.body,
      fontSize: responsiveFont(9),
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    itemActionsToggleExpanded: {
      backgroundColor: theme.colors.cardSoft,
    },
    listingGuideButton: {
      position: "relative",
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(53) : 53,
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(11) : 11,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(15) : 15,
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
    markSoldButton: {
      borderTopColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    markSoldButtonIcon: {
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
      boxShadow: "0 0 16px rgba(242, 211, 138, 0.12)",
    },
    markSoldButtonLabel: {
      color: theme.colors.goldBright,
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
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5,
    },
    photoIndicator: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3,
      backgroundColor: theme.colors.cardSoft,
    },
    photoIndicatorActive: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
      backgroundColor: theme.colors.goldBright,
    },
    listingGuideButtonIcon: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(34) : 34,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(34) : 34,
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
        height: responsiveHeight(190),
      },
    ],
    compactHero: {
      height: responsiveHeight(132),
    },
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
    listingGuideButtonIcon: [
      staticStyles.listingGuideButtonIcon,
      {
        width: responsiveWidth(34),
        height: responsiveHeight(34),
      },
    ],
    listingGuideButtonLabel: [
      staticStyles.listingGuideButtonLabel,
      {
        fontSize: responsiveFont(15) / 2,
      },
    ],
  };
}
