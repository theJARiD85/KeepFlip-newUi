import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipBackground } from "@/components/ui/keepflip-background";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import {
  getInventoryItem,
  type InventoryItem,
} from "@/services/inventory-service";

type ChecklistStep = {
  completeByDefault: boolean;
  detail: string;
  id: string;
  label: string;
};

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
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const userId = user?.$id;
  const { contentWidth, insets, pageGutter, responsiveFont } =
    useResponsiveLayout();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmedStepIdsByItem, setConfirmedStepIdsByItem] = useState<
    Record<string, string[]>
  >({});

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

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 22,
            paddingBottom: insets.bottom + 32,
            paddingHorizontal: pageGutter,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, { width: contentWidth }]}>
          <View style={styles.topRow}>
            <View style={styles.topCopy}>
              <Text style={styles.eyebrow}>SELLER WORKFLOW</Text>
              <Text style={[styles.title, { fontSize: responsiveFont(30) }]}>
                Listing Creation Guide
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Back to inventory"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <IconSymbol color={theme.colors.cream} name="xmark" size={20} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Turn the evidence already saved with this item into a clear, honest listing. KeepFlip does not publish or request data from this guide.
          </Text>

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={theme.colors.scannerCyan} />
              <Text style={styles.loadingText}>Preparing your listing guide</Text>
            </View>
          ) : error || !item ? (
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <IconSymbol color={theme.colors.goldBright} name="tag.fill" size={28} />
              </View>
              <Text style={styles.errorTitle}>Listing guide unavailable</Text>
              <Text selectable style={styles.errorText}>
                {error ?? "This item could not be opened."}
              </Text>
              <Pressable
                accessibilityLabel="Try opening the listing guide again"
                accessibilityRole="button"
                onPress={() => void loadItem()}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.itemCard}>
                <View style={styles.itemCardRail} />
                <Text style={styles.sectionEyebrow}>ITEM TO LIST</Text>
                <Text selectable style={styles.itemTitle}>{title}</Text>
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
                    <Text style={styles.signalPillText}>
                      {item.photoCount} PHOTO{item.photoCount === 1 ? "" : "S"}
                    </Text>
                  </View>
                  <View style={styles.signalPill}>
                    <Text style={styles.signalPillLabel}>CONDITION</Text>
                    <Text style={styles.signalPillText}>{item.condition || "ADD"}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.draftCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>LISTING BRIEF</Text>
                    <Text style={styles.sectionTitle}>Start with the facts</Text>
                  </View>
                  <View style={styles.localPill}>
                    <Text style={styles.localPillText}>LOCAL GUIDE</Text>
                  </View>
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>TITLE STARTER</Text>
                  <Text selectable style={styles.fieldValue}>{title}</Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>CONDITION DISCLOSURE</Text>
                  <Text selectable style={styles.fieldValue}>
                    {item.conditionNotes.trim() ||
                      "Add factual notes about testing, wear, missing pieces, and defects."}
                  </Text>
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>MARKET REFERENCE</Text>
                  <Text selectable style={styles.fieldValue}>
                    {priceReference
                      ? `${priceReference} saved estimate. It is a reference, not a recommended list price.`
                      : "No saved market estimate. Analyze the item before setting a price."}
                  </Text>
                </View>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>PUBLISHING READINESS</Text>
                    <Text style={styles.sectionTitle}>
                      {completeStepCount} of {checklist.length} steps reviewed
                    </Text>
                  </View>
                  <View style={styles.progressCount}>
                    <Text style={styles.progressCountText}>
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
                          <Text style={styles.checklistLabel}>{step.label}</Text>
                          <Text style={styles.checklistDetail}>{step.detail}</Text>
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
                <Text style={styles.publishNoticeText}>
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

const styles = StyleSheet.create({
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
    gap: 18,
  },
  topCopy: {
    flex: 1,
    gap: 4,
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
    fontSize: 14,
    lineHeight: 21,
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
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
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
