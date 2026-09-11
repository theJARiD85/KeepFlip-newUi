import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { useKeepFlipFeedbackNudge } from "@/components/feedback/keepflip-feedback-nudge";
import { ListingNetProceedsPanel } from "@/components/seller/listing-net-proceeds-panel";
import { ListingReadinessPanel } from "@/components/seller/listing-readiness-panel";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import { EMPTY_EBAY_LISTING_REVIEW, type EbayListingReview } from "@/services/ebay-listing-readiness-service";
import { getEbayOAuthEnvironment } from "@/services/ebayConnectionService";
import {
  publishEbayListing,
  type PublishEbayListingInput,
  type PublishEbayListingResult,
} from "@/services/ebayListingService";
import {
  getInventoryItem,
  updateInventoryMarketplaceLink,
  type InventoryItem,
} from "@/services/inventory-service";
import { appendPhotoToItem } from "@/services/itemPhotoService";
import {
  runListingGenerator,
  type ListingGeneratorResult,
} from "@/services/listingService";
import { uploadItemImage } from "@/services/uploadItemImage";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type ChecklistStep = {
  completeByDefault: boolean;
  detail: string;
  id: string;
  label: string;
};

type ListingPlatform =
  keyof ListingGeneratorResult["listing"]["platformCopy"];

type EbayListingForm = {
  categoryId: string;
  quantity: string;
  marketplaceId: string;
};

function ebayPublishInput(item: InventoryItem, listing: ListingGeneratorResult["listing"], form: EbayListingForm,
  review: EbayListingReview, aspects: Record<string, string[]>, measurements: Record<string, string[]>): PublishEbayListingInput {
  const marketplaceId = form.marketplaceId.trim() || "EBAY_US";
  return {
    environment: getEbayOAuthEnvironment(), itemId: item.id, title: listing.title,
    description: [listing.description, listing.conditionDisclosure].filter(Boolean).join("\n\n"),
    price: Number(listing.priceRange.targetPrice), quantity: Number(form.quantity), categoryId: form.categoryId.trim(),
    marketplaceId, currency: marketplaceId === "EBAY_US" ? item.currency || "USD" : undefined,
    condition: listing.conditionLabel, conditionDescription: listing.conditionDisclosure,
    listingDuration: "GTC", sku: item.sku || undefined, review, aspects, measurements,
  };
}

const MAX_LISTING_PHOTOS = 10;

const CROSSLIST_PLATFORMS: {
  id: ListingPlatform;
  label: string;
  mode: string;
  description: string;
}[] = [
    {
      id: "ebay",
      label: "eBay",
      mode: "LIVE LISTING",
      description:
        "Publish the reviewed draft through your connected eBay account. Choose the category, then KeepFlip uses your saved Seller Account setup.",
    },
    {
      id: "facebookMarketplace",
      label: "Facebook Marketplace",
      mode: "ASSISTED HANDOFF",
      description:
        "Send the prepared copy to Facebook, then confirm category, pickup, and listing details.",
    },
    {
      id: "offerUp",
      label: "OfferUp",
      mode: "ASSISTED HANDOFF",
      description:
        "Send the prepared copy to OfferUp, then confirm category, shipping, and listing details.",
    },
  ];


function formatMoney(value: number | null, currency: string) {
  if (value == null) return null;

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

function formatConfidence(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

function listingTitle(item: InventoryItem) {
  const savedTitle = item.title.replace(/\s+/g, " ").trim();
  if (savedTitle) return savedTitle;

  return [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildChecklist(item: InventoryItem): ChecklistStep[] {
  const hasIdentityDetail = Boolean(item.brand || item.model || item.category);
  const hasConditionNotes = item.conditionNotes.trim().length >= 12;
  const hasPriceReference = item.estimatedValue != null;
  const photoDetail =
    item.photoCount >= 3
      ? `${item.photoCount} saved photos are available. Review each one for focus, full-item coverage, labels, and any flaws.`
      : `${item.photoCount} saved photo${item.photoCount === 1 ? " is" : "s are"} available. Add clear front, back, label, and flaw photos before publishing.`;

  return [
    {
      completeByDefault: hasIdentityDetail,
      detail: hasIdentityDetail
        ? "Confirm the brand, model, variation, and category against the actual item before using the title."
        : "Add or confirm the brand, model, variation, and category before you create a listing.",
      id: "identity",
      label: "Confirm item identity",
    },
    {
      completeByDefault: item.photoCount >= 3,
      detail: photoDetail,
      id: "photos",
      label: "Review the photo set",
    },
    {
      completeByDefault: hasConditionNotes,
      detail: hasConditionNotes
        ? "Keep the condition disclosure factual and make sure flaws shown in the photos are also described."
        : "Add factual condition notes, including wear, missing pieces, testing limits, or defects.",
      id: "condition",
      label: "Write the condition disclosure",
    },
    {
      completeByDefault: hasPriceReference,
      detail: hasPriceReference
        ? "Use the saved market estimate as a reference only. Adjust for condition, fees, shipping, and your acquisition cost."
        : "Complete an item analysis before setting a price so you have an evidence-backed market reference.",
      id: "pricing",
      label: "Set a price strategy",
    },
    {
      completeByDefault: false,
      detail:
        "Before publishing, confirm the marketplace category, required item specifics, shipping method, returns, and current fees.",
      id: "publish-review",
      label: "Complete the marketplace review",
    },
  ];
}

export default function ListingCreationGuideScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const params = useLocalSearchParams<{
    focus?: string | string[];
    itemId?: string | string[];
  }>();
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const { recordCompletedAction } = useKeepFlipFeedbackNudge();
  const userId = user?.$id;
  const {
    contentWidth, insets, pageGutter, responsiveFont,
    responsiveWidth,
    responsiveHeight,
    contentMaxWidth
  } =
    useResponsiveLayout();
    const { width } = useWindowDimensions();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmedStepIdsByItem, setConfirmedStepIdsByItem] = useState<
    Record<string, string[]>
  >({});
  const [generatedListing, setGeneratedListing] = useState<
    ListingGeneratorResult["listing"] | null
  >(null);
  const [listingConfidence, setListingConfidence] = useState<number | null>(null);
  const [listingGenerationError, setListingGenerationError] = useState<string | null>(null);
  const [generatingListing, setGeneratingListing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<
    keyof ListingGeneratorResult["listing"]["platformCopy"]
  >("ebay");
  const [sharedPlatform, setSharedPlatform] =
    useState<ListingPlatform | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [ebayPublishOpen, setEbayPublishOpen] = useState(false);
  const [ebayPublishing, setEbayPublishing] = useState(false);
  const [ebayReady, setEbayReady] = useState(false);
  const [ebayReview, setEbayReview] = useState<EbayListingReview>({ ...EMPTY_EBAY_LISTING_REVIEW });
  const [ebayAspects, setEbayAspects] = useState<Record<string, string[]>>({});
  const [ebayMeasurements, setEbayMeasurements] = useState<Record<string, string[]>>({});
  const handleEbayReadyChange = useCallback((ready: boolean) => {
    setEbayReady(ready);
  }, []);
  useEffect(() => {
    setEbayReady(false); setEbayReview({ ...EMPTY_EBAY_LISTING_REVIEW });
    setEbayAspects({}); setEbayMeasurements({});
  }, [item?.id]);

  const [ebayPublishError, setEbayPublishError] = useState<string | null>(null);
  const [ebayPublishResult, setEbayPublishResult] =
    useState<PublishEbayListingResult | null>(null);
  const [ebayForm, setEbayForm] = useState<EbayListingForm>({
    categoryId: "",
    quantity: "1",
    marketplaceId: "EBAY_US",
  });
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const promptedForPhotosRef = useRef<string | null>(null);

  const loadItem = useCallback(async () => {
    if (!userId) {
      setItem(null);
      setError("Sign in before creating a listing guide.");
      setLoading(false);
      return;
    }

    if (!itemId) {
      setItem(null);
      setError("Choose a saved inventory item to start a listing guide.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItem(await getInventoryItem(userId, itemId));
    } catch (caughtError) {
      setItem(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "KeepFlip could not load this item.",
      );
    } finally {
      setLoading(false);
    }
  }, [itemId, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadItem();
    }, [loadItem]),
  );

  const checklist = item ? buildChecklist(item) : [];
  const confirmedStepIds = item
    ? confirmedStepIdsByItem[item.id] ?? []
    : [];
  const completeStepCount = checklist.filter(
    (step) => step.completeByDefault || confirmedStepIds.includes(step.id),
  ).length;
  const title = item ? listingTitle(item) : "";
  const priceReference = item
    ? formatMoney(item.estimatedValue, item.currency)
    : null;

  const toggleStep = useCallback((targetItemId: string, step: ChecklistStep) => {
    if (step.completeByDefault) return;

    setConfirmedStepIdsByItem((current) => {
      const currentIds = current[targetItemId] ?? [];
      const nextIds = currentIds.includes(step.id)
        ? currentIds.filter((id) => id !== step.id)
        : [...currentIds, step.id];

      return { ...current, [targetItemId]: nextIds };
    });
  }, []);

  const generateListing = useCallback(async () => {
    if (!item) return;

    setGeneratingListing(true);
    setListingGenerationError(null);
    try {
      const result = await runListingGenerator({ itemId: item.id });
      setGeneratedListing(result.listing);
      setListingConfidence(result.confidence);
      setSelectedPlatform("ebay");
      recordCompletedAction();
    } catch (caughtError) {
      setListingGenerationError(
        caughtError instanceof Error
          ? caughtError.message
          : "KeepFlip could not generate this listing.",
      );
    } finally {
      setGeneratingListing(false);
    }
  }, [item, recordCompletedAction]);

  const updateGeneratedText = useCallback(
    (
      field: "title" | "subtitle" | "description" | "conditionDisclosure",
      value: string,
    ) => {
      setGeneratedListing((current) =>
        current ? { ...current, [field]: value } : current,
      );
    },
    [],
  );

  const updateGeneratedPlatformCopy = useCallback(
    (platform: ListingPlatform, value: string) => {
      setGeneratedListing((current) =>
        current
          ? {
              ...current,
              platformCopy: {
                ...current.platformCopy,
                [platform]: value,
              },
            }
          : current,
      );
    },
    [],
  );

  const uploadAdditionalPhotoAssets = useCallback(
    async (assets: readonly ImagePicker.ImagePickerAsset[]) => {
      if (!item || !userId || addingPhotos) return;

      const remainingSlots = Math.max(
        0,
        MAX_LISTING_PHOTOS - item.photoCount,
      );
      const selectedAssets = assets.filter((asset) => Boolean(asset.uri)).slice(
        0,
        remainingSlots,
      );

      if (!selectedAssets.length) {
        if (remainingSlots === 0) {
          Alert.alert(
            "Photo set is full",
            "KeepFlip supports up to " + MAX_LISTING_PHOTOS + " photos per inventory item.",
          );
        }
        return;
      }

      setAddingPhotos(true);
      setPhotoUploadError(null);

      try {
        for (const [index, asset] of selectedAssets.entries()) {
          const extension =
            asset.fileName?.split(".").pop()?.toLowerCase() || "jpg";
          const fileName =
            asset.fileName?.trim() ||
            "keepflip-item-" +
            item.id +
            "-" +
            Date.now() +
            "-" +
            index +
            "." +
            extension;
          const fileMimeType = asset.mimeType || "image/jpeg";
          const uploaded = await uploadItemImage(
            asset.uri,
            fileName,
            fileMimeType,
            userId,
          );

          await appendPhotoToItem({
            itemId: item.id,
            ownerId: userId,
            fileId: uploaded.$id,
          });
        }

        await loadItem();
        recordCompletedAction();
      } catch (caughtError) {
        setPhotoUploadError(
          caughtError instanceof Error
            ? caughtError.message
            : "KeepFlip could not add those item photos.",
        );
      } finally {
        setAddingPhotos(false);
      }
    },
    [addingPhotos, item, loadItem, recordCompletedAction, userId],
  );

  const captureAdditionalPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow KeepFlip to use the camera so you can add another item photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (result.canceled) return;
    await uploadAdditionalPhotoAssets(result.assets);
  }, [uploadAdditionalPhotoAssets]);

  const chooseAdditionalPhotos = useCallback(async () => {
    if (!item) return;

    const remainingSlots = Math.max(
      0,
      MAX_LISTING_PHOTOS - item.photoCount,
    );
    if (remainingSlots === 0) {
      Alert.alert(
        "Photo set is full",
        "KeepFlip supports up to " + MAX_LISTING_PHOTOS + " photos per inventory item.",
      );
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow KeepFlip to choose item photos from your device.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.9,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) return;
    await uploadAdditionalPhotoAssets(result.assets);
  }, [item, uploadAdditionalPhotoAssets]);

  const addItemPhotos = useCallback(() => {
    if (!item || addingPhotos) return;

    Alert.alert("Add item photos", "Choose how you want to add listing photos.", [
      {
        text: "Camera",
        onPress: () => void captureAdditionalPhoto(),
      },
      {
        text: "Photo library",
        onPress: () => void chooseAdditionalPhotos(),
      },
      {
        style: "cancel",
        text: "Cancel",
      },
    ]);
  }, [addingPhotos, captureAdditionalPhoto, chooseAdditionalPhotos, item]);

  useEffect(() => {
    if (focus !== "photos" || !item || loading || addingPhotos) return;
    if (promptedForPhotosRef.current === item.id) return;

    promptedForPhotosRef.current = item.id;
    const promptTimer = setTimeout(() => addItemPhotos(), 180);
    return () => clearTimeout(promptTimer);
  }, [addItemPhotos, addingPhotos, focus, item, loading]);

  const shareListingDraft = useCallback(
    async (platform: ListingPlatform) => {
      if (!generatedListing) return;

      setShareError(null);
      const platformInfo = CROSSLIST_PLATFORMS.find(
        (candidate) => candidate.id === platform,
      );
      const price = formatMoney(
        generatedListing.priceRange.targetPrice,
        item?.currency ?? "USD",
      );
      const message = [
        generatedListing.title,
        generatedListing.subtitle,
        generatedListing.description,
        generatedListing.platformCopy[platform],
        "Condition: " + generatedListing.conditionDisclosure,
        price ? "Target price: " + price : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      try {
        await Share.share({
          message,
          title:
            (platformInfo?.label ?? "Marketplace") + " listing draft",
        });
        setSharedPlatform(platform);
        recordCompletedAction();
      } catch (caughtError) {
        setShareError(
          caughtError instanceof Error
            ? caughtError.message
            : "KeepFlip could not open the sharing handoff.",
        );
      }
    },
    [generatedListing, item?.currency, recordCompletedAction],
  );


  const openEbayPublishForm = useCallback(() => {
    if (!generatedListing) {
      setListingGenerationError("Generate the listing draft before publishing on eBay.");
      return;
    }
    setEbayPublishError(null);
    setEbayPublishResult(null);
    setEbayPublishOpen(true);
  }, [generatedListing]);

  const publishListingToEbay = useCallback(async () => {
    if (!item || !generatedListing || ebayPublishing) return;
    if (!ebayReady) { setEbayPublishError("Complete the readiness check before publishing."); return; }

    const requiredFields: [keyof EbayListingForm, string][] = [
      ["categoryId", "eBay category ID"],
    ];
    const missingField = requiredFields.find(
      ([field]) => !ebayForm[field].trim(),
    );
    if (missingField) {
      setEbayPublishError("Add your " + missingField[1] + " before publishing.");
      return;
    }

    const price = Number(generatedListing.priceRange.targetPrice);
    const quantity = Number(ebayForm.quantity);
    if (!Number.isFinite(price) || price <= 0) {
      setEbayPublishError("The generated draft does not have a usable target price.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setEbayPublishError("Quantity must be a whole number greater than zero.");
      return;
    }

    setEbayPublishing(true);
    setEbayPublishError(null);
    try {
      const result = await publishEbayListing(ebayPublishInput(item, generatedListing, ebayForm,
        ebayReview, ebayAspects, ebayMeasurements));
      if (userId) {
        try {
          await updateInventoryMarketplaceLink({
            ebayListingId: result.listingId,
            ebayOfferId: result.offerId,
            ebaySku: result.sku,
            itemId: item.id,
            listedAt: new Date().toISOString(),
            ownerId: userId,
          });
        } catch (linkError) {
          setEbayPublishError(
            "Your eBay listing is live, but KeepFlip could not save its tracking link. Add the eBay tracking columns to inventory, then publish or open this item again to reconnect it." +
            (linkError instanceof Error ? " " + linkError.message : ""),
          );
        }
      }
      setEbayPublishResult(result);
      recordCompletedAction();
    } catch (caughtError) {
      setEbayPublishError(
        caughtError instanceof Error
          ? caughtError.message
          : "KeepFlip could not publish this item on eBay.",
      );
    } finally {
      setEbayPublishing(false);
    }
  }, [
    ebayForm,
    ebayReady,
    ebayReview,
    ebayAspects,
    ebayMeasurements,
    ebayPublishing,
    generatedListing,
    item,
    recordCompletedAction,
    userId,
  ]);

  const confirmEbayPublish = useCallback(() => {
    if (ebayPublishing || ebayPublishResult) return;
    if (!ebayReady) {
      setEbayPublishError("Check listing readiness above before publishing on eBay.");
      return;
    }
    Alert.alert(
      "Publish on eBay?",
      "This sends the reviewed draft to eBay and creates a live listing on the connected seller account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Publish listing", onPress: () => void publishListingToEbay() },
      ],
    );
  }, [ebayPublishResult, ebayPublishing, ebayReady, publishListingToEbay]);

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content,
        {
          paddingTop: insets.top + 15,
          paddingBottom: insets.bottom + 30,
          paddingHorizontal: pageGutter,
        }, { width: width, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        style={{ marginTop: insets.top, marginBottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, { width: width }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>
          <View style={styles.topRow}>
            <View style={styles.topCopy}>
              <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>SELLER WORKFLOW</Text>
              <Text style={[styles.title, { fontFamily: theme.fonts.bold, fontSize: responsiveFont(26) }]}>
                Listing Workspace
              </Text>
              <Text style={[styles.subtitle, { fontSize: responsiveFont(12) }]}>
                Draft once from the item facts, then hand off a platform-ready version to each marketplace. Review every destination before publishing.
              </Text>
            </View>
          </View>



          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={theme.colors.scannerCyan} />
              <Text style={[styles.loadingText, { fontSize: responsiveFont(15) }]}>Preparing your listing guide</Text>
            </View>
          ) : error || !item ? (
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <IconSymbol color={theme.colors.goldBright} name="tag.fill" size={28} />
              </View>
              <Text style={[styles.errorTitle, { fontSize: responsiveFont(19) }]}>Listing guide unavailable</Text>
              <Text selectable style={[styles.errorText, { fontSize: responsiveFont(14) }]}>
                {error ?? "This item could not be opened."}
              </Text>
              <Pressable
                accessibilityLabel="Try opening the listing guide again"
                accessibilityRole="button"
                onPress={() => void loadItem()}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={[styles.retryText, { fontSize: responsiveFont(13) }]}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.itemCard}>
                <View style={styles.itemCardRail} />
                <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(10) }]}>ITEM TO LIST</Text>
                <Text selectable style={[styles.itemTitle, { fontSize: responsiveFont(26) }]}>{title}</Text>
                <Text selectable style={styles.itemMeta}>
                  {[item.brand, item.model, item.category]
                    .filter(Boolean)
                    .join(" / ") || "Add identity details before publishing"}
                </Text>

                <View style={styles.itemSignals}>
                  <View style={styles.signalPill}>
                    <IconSymbol
                      color={theme.colors.scannerCyan}
                      name="photo.on.rectangle.angled"
                      size={14}
                    />
                    <Text style={[styles.signalPillText, { fontSize: responsiveFont(10) }]}>
                      {item.photoCount} PHOTO{item.photoCount === 1 ? "" : "S"}
                    </Text>
                  </View>
                  <View style={styles.signalPill}>
                    <Text style={[styles.signalPillLabel, { fontSize: responsiveFont(8) }]}>CONDITION</Text>
                    <Text style={[styles.signalPillText, { fontSize: responsiveFont(10) }]}>{item.condition || "ADD"}</Text>
                  </View>
                </View>

                <View style={styles.photoPrepRow}>
                  <View style={styles.photoPrepCopy}>
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>LISTING PHOTO SET</Text>
                    <Text style={[styles.photoPrepText, { fontSize: responsiveFont(12) }]}>
                      {item.photoCount} of {MAX_LISTING_PHOTOS} photos saved. Add
                      close-ups of labels, flaws, measurements, and the full item
                      before handing the draft to a marketplace.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Add more item photos"
                    accessibilityRole="button"
                    disabled={addingPhotos || item.photoCount >= MAX_LISTING_PHOTOS}
                    onPress={addItemPhotos}
                    style={({ pressed }) => [
                      styles.addPhotosButton,
                      pressed && styles.pressed,
                      (addingPhotos || item.photoCount >= MAX_LISTING_PHOTOS) &&
                      styles.addPhotosButtonDisabled,
                    ]}
                  >
                    {addingPhotos ? (
                      <ActivityIndicator color={theme.colors.backgroundDeep} />
                    ) : (
                      <Text style={[styles.addPhotosButtonText, { fontSize: responsiveFont(8) }]}>
                        {item.photoCount >= MAX_LISTING_PHOTOS
                          ? "FULL"
                          : "ADD PHOTOS"}
                      </Text>
                    )}
                  </Pressable>
                </View>
                {photoUploadError ? (
                  <Text selectable style={[styles.photoUploadError, { fontSize: responsiveFont(12) }]}>
                    {photoUploadError}
                  </Text>
                ) : null}
              </View>

              <View style={styles.draftCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(9) }]}>LISTING BRIEF</Text>
                    <Text style={[styles.sectionTitle, { fontSize: responsiveFont(18) }]}>Start with the facts</Text>
                  </View>
                  <View style={styles.localPill}>
                    <Text style={[styles.localPillText, { fontSize: responsiveFont(8) }]}>LOCAL GUIDE</Text>
                  </View>
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>TITLE STARTER</Text>
                  <Text selectable style={[styles.fieldValue, { fontSize: responsiveFont(14) }]}>{title}</Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>CONDITION DISCLOSURE</Text>
                  <Text selectable style={[styles.fieldValue, { fontSize: responsiveFont(14) }]}>
                    {item.conditionNotes.trim() ||
                      "Add factual notes about testing, wear, missing pieces, and defects."}
                  </Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>MARKET REFERENCE</Text>
                  <Text selectable style={[styles.fieldValue, { fontSize: responsiveFont(14) }]}>
                    {priceReference
                      ? `${priceReference} saved estimate. It is a reference, not a recommended list price.`
                      : "No saved market estimate. Analyze the item before setting a price."}
                  </Text>
                </View>
              </View>

              <View style={styles.generatorCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.generatorHeading}>
                    <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(9), fontFamily: theme.fonts.display }]}>DRAFT BUILDER</Text>
                    <Text style={[styles.sectionTitle, { fontSize: responsiveFont(18) }]}>Generate the working draft</Text>
                  </View>
                  <View style={styles.generatorBadge}>
                    <Text style={[styles.generatorBadgeText, { fontSize: responsiveFont(8) }]}>MASTER DRAFT</Text>
                  </View>
                </View>
                <Text style={[styles.generatorDescription, { fontSize: responsiveFont(12) }]}>
                  Use the saved item facts, photos, condition notes, and market reference to create platform-ready copy. Review every claim before publishing.
                </Text>
                <Pressable
                  accessibilityLabel={generatedListing ? "Regenerate listing draft" : "Generate listing draft"}
                  accessibilityRole="button"
                  disabled={generatingListing}
                  onPress={() => void generateListing()}
                  style={({ pressed }) => [
                    styles.generateButton,
                    pressed && styles.pressed,
                    generatingListing && styles.generateButtonBusy,
                  ]}
                >
                  {generatingListing ? (
                    <ActivityIndicator color={theme.colors.backgroundDeep} />
                  ) : (
                    <Text style={[styles.generateButtonText, { fontSize: responsiveFont(10) }]}>
                      {generatedListing ? "REGENERATE DRAFT" : "GENERATE LISTING DRAFT"}
                    </Text>
                  )}
                </Pressable>
                {listingGenerationError ? (
                  <Text selectable style={[styles.generatorError, { fontSize: responsiveFont(12) }]}>
                    {listingGenerationError}
                  </Text>
                ) : null}

                {generatedListing ? (
                  <View style={styles.generatedCopy}>
                    <View style={styles.generatedTitleRow}>
                      <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>TITLE</Text>
                      <TextInput
                        accessibilityLabel="Edit generated listing title"
                        autoCapitalize="sentences"
                        onChangeText={(value) => updateGeneratedText("title", value)}
                        style={[
                          styles.generatedTitle,
                          styles.generatedEditorInput,
                          styles.generatedTitleInput,
                          { fontSize: responsiveFont(13) },
                        ]}
                        value={generatedListing.title}
                      />
                      <Text style={[styles.confidenceText, { fontSize: responsiveFont(8) }]}>
                        {formatConfidence(listingConfidence)}% CONFIDENCE
                      </Text>
                    </View>
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>SUBTITLE</Text>
                    <TextInput
                      accessibilityLabel="Edit generated listing subtitle"
                      autoCapitalize="sentences"
                      multiline
                      onChangeText={(value) => updateGeneratedText("subtitle", value)}
                      style={[
                        styles.generatedSubtitle,
                        styles.generatedEditorInput,
                        styles.generatedSubtitleInput,
                        { fontSize: responsiveFont(13),
                          height: 'auto',
                        },
                      ]}
                      value={generatedListing.subtitle}
                    />
                    <View style={styles.generatedSignals}>
                      <Text style={styles.generatedSignal}>
                        {generatedListing.conditionLabel.replace(/_/g, " ").toUpperCase()}
                      </Text>
                      <Text style={styles.generatedSignal}>
                        TARGET ${generatedListing.priceRange.targetPrice.toFixed(0)}
                      </Text>
                      <Text style={styles.generatedSignal}>
                        {generatedListing.sellingStrategy.replace(/_/g, " ").toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>PLATFORM COPY</Text>
                    <View style={styles.platformTabs}>
                      {(
                        Object.keys(generatedListing.platformCopy) as (keyof ListingGeneratorResult["listing"]["platformCopy"])[]
                      ).map((platform) => (
                        <Pressable
                          key={platform}
                          accessibilityRole="button"
                          onPress={() => setSelectedPlatform(platform)}
                          style={[
                            styles.platformTab,
                            selectedPlatform === platform && styles.platformTabActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.platformTabText,
                              selectedPlatform === platform && styles.platformTabTextActive,
                            ]}
                          >
                            {platform === "facebookMarketplace"
                              ? "FACEBOOK"
                              : platform === "offerUp"
                                ? "OFFERUP"
                                : "EBAY"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>LONG DESCRIPTION</Text>
                    <TextInput
                      accessibilityLabel="Edit generated listing description"
                      autoCapitalize="sentences"
                      multiline
                      onChangeText={(value) => updateGeneratedText("description", value)}
                      style={[
                        styles.generatedBody,
                        styles.generatedEditorInput,
                        styles.generatedDescriptionInput,
                        { fontSize: responsiveFont(13) },
                      ]}
                      value={generatedListing.description}
                    />
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>MARKETPLACE COPY</Text>
                    <TextInput
                      accessibilityLabel={`Edit ${selectedPlatform} marketplace copy`}
                      autoCapitalize="sentences"
                      multiline
                      onChangeText={(value) => updateGeneratedPlatformCopy(selectedPlatform, value)}
                      style={[
                        styles.generatedBody,
                        styles.generatedEditorInput,
                        styles.generatedPlatformInput,
                        { fontSize: responsiveFont(13) },
                      ]}
                      value={generatedListing.platformCopy[selectedPlatform]}
                    />
                    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>CONDITION DISCLOSURE</Text>
                    <TextInput
                      accessibilityLabel="Edit generated condition disclosure"
                      autoCapitalize="sentences"
                      multiline
                      onChangeText={(value) => updateGeneratedText("conditionDisclosure", value)}
                      style={[
                        styles.generatedBody,
                        styles.generatedEditorInput,
                        styles.generatedConditionInput,
                        { fontSize: responsiveFont(13) },
                      ]}
                      value={generatedListing.conditionDisclosure}
                    />
                    {generatedListing.warnings.length ? (
                      <Text selectable style={styles.generatorWarning}>
                        Review: {generatedListing.warnings.join(" ")}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {generatedListing ? (
                <View style={styles.crosslistCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.generatorHeading}>
                      <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(10) }]}>CROSSLIST DESTINATIONS</Text>
                      <Text style={[styles.sectionTitle, { fontSize: responsiveFont(18) }]}>Send the draft where you sell</Text>
                    </View>
                    <View style={styles.crosslistBadge}>
                      <Text style={[styles.crosslistBadgeText, { fontSize: responsiveFont(9) }]}>
                        {CROSSLIST_PLATFORMS.length} CHANNELS
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.crosslistDescription, { fontSize: responsiveFont(12) }]}>
                    KeepFlip keeps the item facts consistent across channels. eBay can publish the reviewed draft; the other destinations open Android&apos;s standard share sheet for an assisted handoff.
                  </Text>
                  <View style={styles.destinationList}>
                    {CROSSLIST_PLATFORMS.map((platform) => {
                      const shared = sharedPlatform === platform.id;
                      const isEbay = platform.id === "ebay";
                      return (
                        <View key={platform.id} style={styles.destinationRow}>
                          <View style={styles.destinationIcon}>
                            <IconSymbol
                              color={theme.colors.scannerCyan}
                              name="paperplane.fill"
                              size={18}
                            />
                          </View>
                          <View style={styles.destinationCopy}>
                            <View style={styles.destinationTopline}>
                              <Text style={[styles.destinationName, { fontSize: responsiveFont(14) }]}>
                                {platform.label}
                              </Text>
                              <Text style={styles.destinationMode}>
                                {platform.mode}
                              </Text>
                            </View>
                            <Text style={[styles.destinationDescription, { fontSize: responsiveFont(11) }]}>
                              {platform.description}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityLabel={
                              isEbay
                                ? ebayPublishResult
                                  ? "Open published eBay listing"
                                  : "Publish listing on eBay"
                                : (shared ? "Share again" : "Share") +
                                " " +
                                platform.label +
                                " listing draft"
                            }
                            accessibilityRole="button"
                            onPress={() =>
                              isEbay
                                ? openEbayPublishForm()
                                : void shareListingDraft(platform.id)
                            }
                            style={({ pressed }) => [
                              styles.shareDraftButton,
                              (shared || (isEbay && ebayPublishResult)) &&
                              styles.shareDraftButtonDone,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.shareDraftText,
                                shared && styles.shareDraftTextDone,
                              ]}
                            >
                              {isEbay
                                ? ebayPublishResult
                                  ? "PUBLISHED"
                                  : ebayPublishOpen
                                    ? "EDIT"
                                    : "PUBLISH"
                                : shared
                                  ? "SHARED"
                                  : "SHARE"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>

                  {ebayPublishOpen ? (
                    <View style={styles.ebayPublishPanel}>
                      {item && generatedListing && userId ? (
                        <ListingNetProceedsPanel key={item.id} item={item} ownerId={userId}
                          prices={generatedListing.priceRange}
                          onTargetPriceChange={(targetPrice) => setGeneratedListing((current) => current ? ({
                            ...current, priceRange: { ...current.priceRange, targetPrice },
                          }) : current)} />
                      ) : null}
                      <View style={styles.ebayPublishHeader}>
                        <View style={styles.ebayPublishHeaderCopy}>
                          <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>PUBLISH TO EBAY</Text>
                          <Text style={[styles.ebayPublishTitle, { fontSize: responsiveFont(15) }]}>
                            Review seller settings
                          </Text>
                        </View>
                        <Text style={styles.ebayPublishMode}>
                          LIVE INVENTORY API
                        </Text>
                      </View>
                      {ebayPublishResult ? (
                        <View style={styles.ebayPublishSuccess}>
                          <IconSymbol
                            color={theme.colors.scannerCyan}
                            name="checkmark.shield.fill"
                            size={22}
                          />
                          <View style={styles.ebayPublishSuccessCopy}>
                            <Text style={[styles.ebayPublishSuccessTitle, { fontSize: responsiveFont(14) }]}>
                              {ebayPublishResult.status === "already_published"
                                ? "This item is already live on eBay."
                                : "Live eBay listing created."}
                            </Text>
                            <Text selectable style={[styles.ebayPublishSuccessDetail, { fontSize: responsiveFont(11) }]}>
                              {ebayPublishResult.listingId
                                ? "Listing ID " + ebayPublishResult.listingId
                                : "eBay accepted the listing."}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <>
                          <Text style={[styles.ebayPublishHint, { fontSize: responsiveFont(11) }]}>
                            Choose the category and quantity. KeepFlip will use the
                            shipping, payment, return, and inventory-location setup
                            saved to your Seller Account.
                          </Text>
                          <View style={styles.ebayField}>
                            <Text style={[styles.ebayFieldLabel, { fontSize: responsiveFont(8) }]}>CATEGORY ID</Text>
                            <TextInput
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType="number-pad"
                              onChangeText={(value) =>
                                setEbayForm((current) => ({
                                  ...current,
                                  categoryId: value,
                                }))
                              }
                              placeholder="Example: 9355"
                              placeholderTextColor="rgba(247, 242, 232, 0.38)"
                              style={styles.ebayFieldInput}
                              value={ebayForm.categoryId}
                            />
                          </View>
                          <View style={styles.ebaySetupNotice}>
                            <IconSymbol
                              color={theme.colors.scannerCyan}
                              name="checkmark.shield.fill"
                              size={16}
                            />
                            <Text style={[styles.ebaySetupNoticeText, { fontSize: responsiveFont(11) }]}>
                              Saved eBay setup will be used automatically. Refresh
                              Seller Account if KeepFlip says listing setup needs
                              attention.
                            </Text>
                          </View>
                          <View style={styles.ebayField}>
                            <Text style={[styles.ebayFieldLabel, { fontSize: responsiveFont(8) }]}>QUANTITY</Text>
                            <TextInput
                              keyboardType="number-pad"
                              onChangeText={(value) =>
                                setEbayForm((current) => ({
                                  ...current,
                                  quantity: value,
                                }))
                              }
                              placeholder="1"
                              placeholderTextColor="rgba(247, 242, 232, 0.38)"
                              style={styles.ebayFieldInput}
                              value={ebayForm.quantity}
                            />
                          </View>                          <View style={styles.ebayField}>
                            <Text style={[styles.ebayFieldLabel, { fontSize: responsiveFont(8) }]}>
                              MARKETPLACE
                            </Text>
                            <TextInput
                              autoCapitalize="characters"
                              autoCorrect={false}
                              onChangeText={(value) =>
                                setEbayForm((current) => ({
                                  ...current,
                                  marketplaceId: value.toUpperCase(),
                                }))
                              }
                              placeholder="EBAY_US"
                              placeholderTextColor="rgba(247, 242, 232, 0.38)"
                              style={styles.ebayFieldInput}
                              value={ebayForm.marketplaceId}
                            />
                          </View>
                          {item && generatedListing ? (
                            <ListingReadinessPanel
                              input={ebayPublishInput(item, generatedListing, ebayForm, ebayReview, ebayAspects, ebayMeasurements)}
                              review={ebayReview} onReviewChange={setEbayReview}
                              onAspectsChange={setEbayAspects} onMeasurementsChange={setEbayMeasurements}
                              onReadyChange={handleEbayReadyChange} disabled={ebayPublishing} />
                          ) : null}
                          {ebayPublishError ? (
                            <Text selectable style={[styles.ebayPublishError, { fontSize: responsiveFont(12) }]}>
                              {ebayPublishError}
                            </Text>
                          ) : null}
                          <View style={styles.ebayPublishActions}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setEbayPublishOpen(false)}
                              style={({ pressed }) => [
                                styles.ebayCancelButton,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.ebayCancelButtonText, { fontSize: responsiveFont(9) }]}>CLOSE</Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel="Publish live eBay listing"
                              accessibilityRole="button"
                              disabled={ebayPublishing}
                              onPress={confirmEbayPublish}
                              style={({ pressed }) => [
                                styles.ebayPublishButton,
                                pressed && styles.pressed,
                                ebayPublishing && styles.ebayPublishButtonDisabled,
                                !ebayReady && styles.ebayPublishButtonNeedsReadiness,
                              ]}
                            >
                              {ebayPublishing ? (
                                <ActivityIndicator
                                  color={theme.colors.backgroundDeep}
                                  size="small"
                                />
                              ) : (
                                <Text style={[styles.ebayPublishButtonText, { fontSize: responsiveFont(9) }]}>
                                  PUBLISH LIVE LISTING
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        </>
                      )}
                      {ebayPublishResult?.listingUrl ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() =>
                            void Linking.openURL(ebayPublishResult.listingUrl!).catch(
                              () => undefined,
                            )
                          }
                          style={({ pressed }) => [
                            styles.ebayOpenButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.ebayOpenButtonText, { fontSize: responsiveFont(9) }]}>
                            OPEN EBAY LISTING
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {shareError ? (
                    <Text selectable style={[styles.crosslistError, { fontSize: responsiveFont(12) }]}>
                      {shareError}
                    </Text>
                  ) : null}
                  <Text style={styles.crosslistFootnote}>
                    KeepFlip does not claim a listing is live until the marketplace confirms it. Confirm the final category, item specifics, shipping, returns, and fees in each destination.
                  </Text>
                </View>
              ) : null}
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <View>
                    <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(9) }]}>PUBLISHING READINESS</Text>
                    <Text style={[styles.sectionTitle, { fontSize: responsiveFont(18) }]}>
                      {completeStepCount} of {checklist.length} steps reviewed
                    </Text>
                  </View>
                  <View style={styles.progressCount}>
                    <Text style={[styles.progressCountText, { fontSize: responsiveFont(13) }]}>
                      {Math.round((completeStepCount / checklist.length) * 100)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(completeStepCount / checklist.length) * 100}%`,
                      },
                    ]}
                  />
                </View>

                <View style={styles.checklist}>
                  {checklist.map((step, index) => {
                    const complete =
                      step.completeByDefault || confirmedStepIds.includes(step.id);

                    return (
                      <Pressable
                        accessibilityHint={
                          step.completeByDefault
                            ? "This saved item detail is ready for review."
                            : "Marks this listing step as reviewed for this session."
                        }
                        accessibilityLabel={step.label}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: complete }}
                        disabled={step.completeByDefault}
                        key={step.id}
                        onPress={() => toggleStep(item.id, step)}
                        style={({ pressed }) => [
                          styles.checklistStep,
                          complete && styles.checklistStepComplete,
                          pressed && !step.completeByDefault && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.checkmark,
                            complete && styles.checkmarkComplete,
                          ]}
                        >
                          {complete ? (
                            <IconSymbol
                              color={theme.colors.backgroundDeep}
                              name="checkmark.shield.fill"
                              size={15}
                            />
                          ) : (
                            <Text style={styles.checkmarkNumber}>0{index + 1}</Text>
                          )}
                        </View>
                        <View style={styles.checklistCopy}>
                          <Text style={[styles.checklistLabel, { fontSize: responsiveFont(14) }]}>{step.label}</Text>
                          <Text style={[styles.checklistDetail, { fontSize: responsiveFont(12) }]}>{step.detail}</Text>
                        </View>
                        {!step.completeByDefault ? (
                          <IconSymbol
                            color={
                              complete
                                ? theme.colors.scannerCyan
                                : theme.colors.goldMuted
                            }
                            name={complete ? "checkmark.shield.fill" : "chevron.right"}
                            size={18}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.publishNotice}>
                <IconSymbol
                  color={theme.colors.goldBright}
                  name="tag.fill"
                  size={20}
                />
                <Text style={[styles.publishNoticeText, { fontSize: responsiveFont(12) }]}>
                  When you are ready to publish, confirm the live marketplace category, item specifics, shipping, returns, and fees before creating the listing.
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: {
      flexGrow: 1,
    },
    page: {
      alignSelf: "center",
      gap: 16,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    topCopy: {
      flex: 1,
      gap: 8,
    },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2,
    },
    title: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    subtitle: {
      maxWidth: 620,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.34)",
      backgroundColor: "rgba(7, 7, 12, 0.78)",
    },
    loadingCard: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.22)",
      backgroundColor: "rgba(7, 10, 15, 0.88)",
    },
    loadingText: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: 15,
      fontWeight: "800",
    },
    errorCard: {
      alignItems: "center",
      gap: 12,
      padding: 24,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(232, 97, 88, 0.42)",
      backgroundColor: "rgba(41, 9, 12, 0.58)",
    },
    errorIcon: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      backgroundColor: "rgba(242, 211, 138, 0.11)",
    },
    errorTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 19,
      fontWeight: "900",
    },
    errorText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    retryButton: {
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.scannerViolet,
    },
    retryText: {
      color: theme.colors.backgroundDeep,
      fontFamily: theme.fonts.body,
      fontSize: 13,
      fontWeight: "900",
    },
    itemCard: {
      overflow: "hidden",
      gap: 8,
      padding: 20,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.28)",
      backgroundColor: "rgba(5, 10, 14, 0.90)",
      boxShadow: "0 0 26px rgba(0, 255, 255, 0.07)",
    },
    itemCardRail: {
      position: "absolute",
      top: 0,
      right: 0,
      left: 0,
      height: 2,
      backgroundColor: theme.colors.scannerCyan,
    },
    sectionEyebrow: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.7,
    },
    itemTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 28,
    },
    itemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 13,
      lineHeight: 19,
    },
    itemSignals: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 5,
    },
    signalPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.16)",
      backgroundColor: "rgba(247, 242, 232, 0.05)",
    },
    signalPillLabel: {
      color: theme.colors.goldMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    signalPillText: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.4,
    },
    draftCard: {
      gap: 12,
      padding: 20,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(141, 114, 255, 0.30)",
      backgroundColor: "rgba(13, 9, 20, 0.84)",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 23,
    },
    localPill: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(141, 114, 255, 0.40)",
      backgroundColor: "rgba(141, 114, 255, 0.12)",
    },
    localPillText: {
      color: theme.colors.scannerViolet,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    fieldBlock: {
      gap: 5,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(247, 242, 232, 0.13)",
    },
    fieldLabel: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    fieldValue: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
    },
    generatorCard: {
      gap: 12,
      padding: 20,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.28)",
      backgroundColor: "rgba(5, 14, 18, 0.88)",
    },
    generatorHeading: {
      flex: 1,
      gap: 2,
    },
    generatorBadge: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.35)",
      backgroundColor: "rgba(0, 255, 255, 0.08)",
    },
    generatorBadgeText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    generatorDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 18,
    },
    generateButton: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.goldBright,
    },
    generateButtonBusy: {
      opacity: 0.68,
    },
    generateButtonText: {
      color: theme.colors.backgroundDeep,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    generatorError: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    generatedCopy: {
      gap: 10,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(0, 255, 255, 0.20)",
    },
    generatedTitleRow: {
      gap: 6,
    },
    generatedTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 24,
    },
    generatedEditorInput: {
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.24)",
      borderRadius: 6,
      backgroundColor: "rgba(247, 242, 232, 0.04)",
      color: theme.colors.cream,
      paddingHorizontal: 10,
      paddingVertical: 9,
      textAlignVertical: "top",
    },
    generatedTitleInput: {
      minHeight: 48,
      textAlignVertical: "center",
    },
    generatedSubtitleInput: {
      minHeight: 64,
    },
    generatedDescriptionInput: {
      minHeight: 132,
    },
    generatedPlatformInput: {
      minHeight: 150,
    },
    generatedConditionInput: {
      minHeight: 108,
    },
    confidenceText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    generatedSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    generatedSignals: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    generatedSignal: {
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.20)",
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    platformTabs: {
      flexDirection: "row",
      gap: 6,
    },
    platformTab: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.16)",
      backgroundColor: "rgba(247, 242, 232, 0.04)",
    },
    platformTabActive: {
      borderColor: "rgba(0, 255, 255, 0.44)",
      backgroundColor: "rgba(0, 255, 255, 0.10)",
    },
    platformTabText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    platformTabTextActive: {
      color: theme.colors.scannerCyan,
    },
    generatedBody: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: 13,
      lineHeight: 20,
    },
    generatorWarning: {
      color: theme.colors.goldBright,
      fontSize: 11,
      lineHeight: 16,
    },
    photoPrepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(247, 242, 232, 0.13)",
    },
    photoPrepCopy: {
      flex: 1,
      gap: 5,
    },
    photoPrepText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    addPhotosButton: {
      minHeight: 38,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.42)",
      backgroundColor: "rgba(0, 255, 255, 0.11)",
    },
    addPhotosButtonDisabled: {
      opacity: 0.48,
    },
    addPhotosButtonText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    photoUploadError: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    crosslistCard: {
      gap: 14,
      padding: 20,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.28)",
      backgroundColor: "rgba(7, 12, 18, 0.88)",
    },
    crosslistBadge: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.34)",
      backgroundColor: "rgba(0, 255, 255, 0.08)",
    },
    crosslistBadgeText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    crosslistDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 18,
    },
    destinationList: {
      gap: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(247, 242, 232, 0.13)",
    },
    destinationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(247, 242, 232, 0.13)",
    },
    destinationIcon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.24)",
      backgroundColor: "rgba(0, 255, 255, 0.06)",
    },
    destinationCopy: {
      flex: 1,
      gap: 4,
    },
    destinationTopline: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
    },
    destinationName: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      fontWeight: "900",
    },
    destinationMode: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    destinationDescription: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    },
    shareDraftButton: {
      minWidth: 58,
      minHeight: 34,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.42)",
      backgroundColor: "rgba(242, 211, 138, 0.10)",
    },
    shareDraftButtonDone: {
      borderColor: "rgba(0, 255, 255, 0.42)",
      backgroundColor: "rgba(0, 255, 255, 0.10)",
    },
    shareDraftText: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    shareDraftTextDone: {
      color: theme.colors.scannerCyan,
    },
    ebayPublishPanel: {
      gap: 12,
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(247, 242, 232, 0.14)",
    },
    ebayPublishHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    ebayPublishHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    ebayPublishTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      fontWeight: "900",
    },
    ebayPublishMode: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    ebayPublishHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 17,
    },
    ebaySetupNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 12,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: "rgba(88, 223, 232, 0.22)",
      backgroundColor: "rgba(88, 223, 232, 0.06)",
    },
    ebaySetupNoticeText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    }, ebayField: {
      gap: 6,
    },
    ebayFieldRow: {
      flexDirection: "row",
      gap: 10,
    },
    ebayFieldHalf: {
      flex: 1,
      gap: 6,
    },
    ebayFieldLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    ebayFieldInput: {
      minHeight: 42,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.18)",
      backgroundColor: "rgba(247, 242, 232, 0.06)",
      color: theme.colors.cream,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      borderRadius: 4,
    },
    ebayPublishActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
    },
    ebayCancelButton: {
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.18)",
      borderRadius: 4,
    },
    ebayCancelButtonText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    ebayPublishButton: {
      minHeight: 40,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      backgroundColor: theme.colors.goldBright,
      borderRadius: 4,
    },
    ebayPublishButtonDisabled: {
      opacity: 0.6,
    },
    ebayPublishButtonNeedsReadiness: {
      opacity: 0.72,
    },
    ebayPublishButtonText: {
      color: theme.colors.backgroundDeep,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    ebayPublishError: {
      color: theme.colors.danger,
      fontSize: 12,
      lineHeight: 17,
    },
    ebayPublishSuccess: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.28)",
      backgroundColor: "rgba(0, 255, 255, 0.06)",
      borderRadius: 4,
    },
    ebayPublishSuccessCopy: {
      flex: 1,
      gap: 4,
    },
    ebayPublishSuccessTitle: {
      color: theme.colors.cream,
      fontSize: 14,
      fontWeight: "900",
    },
    ebayPublishSuccessDetail: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    ebayOpenButton: {
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(0, 255, 255, 0.34)",
      backgroundColor: "rgba(0, 255, 255, 0.08)",
      borderRadius: 4,
    },
    ebayOpenButtonText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    crosslistError: {
      color: theme.colors.danger,
      fontSize: 12,
      lineHeight: 17,
    },
    crosslistFootnote: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    progressCard: {
      gap: 15,
      padding: 20,
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.28)",
      backgroundColor: "rgba(13, 11, 8, 0.86)",
    },
    progressHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    progressCount: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.38)",
      backgroundColor: "rgba(242, 211, 138, 0.12)",
    },
    progressCountText: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
      fontWeight: "900",
    },
    progressTrack: {
      height: 6,
      overflow: "hidden",
      borderRadius: theme.radii.pill,
      backgroundColor: "rgba(247, 242, 232, 0.10)",
    },
    progressFill: {
      height: "100%",
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.scannerCyan,
    },
    checklist: {
      gap: 9,
    },
    checklistStep: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 13,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.13)",
      backgroundColor: "rgba(4, 4, 8, 0.64)",
    },
    checklistStepComplete: {
      borderColor: "rgba(0, 255, 255, 0.30)",
      backgroundColor: "rgba(0, 255, 255, 0.07)",
    },
    checkmark: {
      width: 31,
      height: 31,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.30)",
      backgroundColor: "rgba(242, 211, 138, 0.08)",
    },
    checkmarkComplete: {
      borderColor: "rgba(0, 255, 255, 0.62)",
      backgroundColor: theme.colors.scannerCyan,
    },
    checkmarkNumber: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
    },
    checklistCopy: {
      flex: 1,
      gap: 3,
    },
    checklistLabel: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      fontWeight: "900",
    },
    checklistDetail: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    publishNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
      padding: 16,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: "rgba(242, 211, 138, 0.28)",
      backgroundColor: "rgba(215, 168, 74, 0.10)",
    },
    publishNoticeText: {
      flex: 1,
      fontFamily: theme.fonts.display,
      color: theme.colors.goldBright,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
    },
    pressed: {
      opacity: 0.76,
      transform: [{ scale: 0.985 }],
    },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    backButton: [
      staticStyles.backButton,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    loadingText: [
      staticStyles.loadingText,
      {
        fontSize: responsiveFont(15),
      },
    ],
    errorIcon: [
      staticStyles.errorIcon,
      {
        width: responsiveWidth(56),
        height: responsiveHeight(56),
      },
    ],
    errorTitle: [
      staticStyles.errorTitle,
      {
        fontSize: responsiveFont(19),
      },
    ],
    errorText: [
      staticStyles.errorText,
      {
        fontSize: responsiveFont(14),
      },
    ],
    retryText: [
      staticStyles.retryText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    itemCardRail: [
      staticStyles.itemCardRail,
      {
        height: responsiveHeight(2),
      },
    ],
    sectionEyebrow: [
      staticStyles.sectionEyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    itemTitle: [
      staticStyles.itemTitle,
      {
        fontSize: responsiveFont(22),
      },
    ],
    itemMeta: [
      staticStyles.itemMeta,
      {
        fontSize: responsiveFont(13),
      },
    ],
    signalPillLabel: [
      staticStyles.signalPillLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    signalPillText: [
      staticStyles.signalPillText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    sectionTitle: [
      staticStyles.sectionTitle,
      {
        fontSize: responsiveFont(18),
      },
    ],
    localPillText: [
      staticStyles.localPillText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    fieldLabel: [
      staticStyles.fieldLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    fieldValue: [
      staticStyles.fieldValue,
      {
        fontSize: responsiveFont(14),
      },
    ],
    generatorBadgeText: [
      staticStyles.generatorBadgeText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    generatorDescription: [
      staticStyles.generatorDescription,
      {
        fontSize: responsiveFont(12),
      },
    ],
    generateButtonText: [
      staticStyles.generateButtonText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    generatorError: [
      staticStyles.generatorError,
      {
        fontSize: responsiveFont(12),
      },
    ],
    generatedTitle: [
      staticStyles.generatedTitle,
      {
        fontSize: responsiveFont(18),
      },
    ],
    confidenceText: [
      staticStyles.confidenceText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    generatedSubtitle: [
      staticStyles.generatedSubtitle,
      {
        fontSize: responsiveFont(12),
      },
    ],
    generatedSignal: [
      staticStyles.generatedSignal,
      {
        fontSize: responsiveFont(8),
      },
    ],
    platformTabText: [
      staticStyles.platformTabText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    generatedBody: [
      staticStyles.generatedBody,
      {
        fontSize: responsiveFont(13),
      },
    ],
    generatorWarning: [
      staticStyles.generatorWarning,
      {
        fontSize: responsiveFont(11),
      },
    ],
    photoPrepText: [
      staticStyles.photoPrepText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    addPhotosButtonText: [
      staticStyles.addPhotosButtonText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    photoUploadError: [
      staticStyles.photoUploadError,
      {
        fontSize: responsiveFont(12),
      },
    ],
    crosslistBadgeText: [
      staticStyles.crosslistBadgeText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    crosslistDescription: [
      staticStyles.crosslistDescription,
      {
        fontSize: responsiveFont(12),
      },
    ],
    destinationIcon: [
      staticStyles.destinationIcon,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    destinationName: [
      staticStyles.destinationName,
      {
        fontSize: responsiveFont(14),
      },
    ],
    destinationMode: [
      staticStyles.destinationMode,
      {
        fontSize: responsiveFont(8),
      },
    ],
    destinationDescription: [
      staticStyles.destinationDescription,
      {
        fontSize: responsiveFont(11),
      },
    ],
    shareDraftText: [
      staticStyles.shareDraftText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    ebayPublishTitle: [
      staticStyles.ebayPublishTitle,
      {
        fontSize: responsiveFont(15),
      },
    ],
    ebayPublishMode: [
      staticStyles.ebayPublishMode,
      {
        fontSize: responsiveFont(8),
      },
    ],
    ebayPublishHint: [
      staticStyles.ebayPublishHint,
      {
        fontSize: responsiveFont(11),
      },
    ],
    ebaySetupNoticeText: [
      staticStyles.ebaySetupNoticeText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    ebayFieldLabel: [
      staticStyles.ebayFieldLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    ebayFieldInput: [
      staticStyles.ebayFieldInput,
      {
        fontSize: responsiveFont(13),
      },
    ],
    ebayCancelButtonText: [
      staticStyles.ebayCancelButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    ebayPublishButtonText: [
      staticStyles.ebayPublishButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    ebayPublishError: [
      staticStyles.ebayPublishError,
      {
        fontSize: responsiveFont(12),
      },
    ],
    ebayPublishSuccessTitle: [
      staticStyles.ebayPublishSuccessTitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    ebayPublishSuccessDetail: [
      staticStyles.ebayPublishSuccessDetail,
      {
        fontSize: responsiveFont(11),
      },
    ],
    ebayOpenButtonText: [
      staticStyles.ebayOpenButtonText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    crosslistError: [
      staticStyles.crosslistError,
      {
        fontSize: responsiveFont(12),
      },
    ],
    crosslistFootnote: [
      staticStyles.crosslistFootnote,
      {
        fontSize: responsiveFont(11),
      },
    ],
    progressCountText: [
      staticStyles.progressCountText,
      {
        fontSize: responsiveFont(13),
      },
    ],
    progressTrack: [
      staticStyles.progressTrack,
      {
        height: responsiveHeight(6),
      },
    ],
    checkmark: [
      staticStyles.checkmark,
      {
        width: responsiveWidth(31),
        height: responsiveHeight(31),
      },
    ],
    checkmarkNumber: [
      staticStyles.checkmarkNumber,
      {
        fontSize: responsiveFont(9),
      },
    ],
    checklistLabel: [
      staticStyles.checklistLabel,
      {
        fontSize: responsiveFont(14),
      },
    ],
    checklistDetail: [
      staticStyles.checklistDetail,
      {
        fontSize: responsiveFont(12),
      },
    ],
    publishNoticeText: [
      staticStyles.publishNoticeText,
      {
        fontSize: responsiveFont(13),
      },
    ],
  };
}
