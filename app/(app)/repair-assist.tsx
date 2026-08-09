import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeepFlipAuth } from "@/components/auth/keepflip-auth-context";
import { RepairNeonSign } from "@/components/repair/repair-neon-sign";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import {
  getInventoryItem,
  type InventoryItem,
} from "@/services/inventory-service";
import {
  runRepairAssist,
  type RepairAssistResult,
} from "@/services/repairService";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function repairabilityLabel(value: RepairAssistResult["diagnosis"]["repairability"]) {
  return value.replace(/_/g, " ").toUpperCase();
}

function urgencyLabel(value: RepairAssistResult["diagnosis"]["urgency"]) {
  return value === "stop_using" ? "STOP USING" : value.toUpperCase();
}

function itemDescriptor(item: InventoryItem) {
  return [item.brand, item.model, item.category]
    .filter(Boolean)
    .join(" / ");
}

export default function RepairAssistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useKeepFlipAuth();
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = firstParam(params.itemId);
  const userId = user?.$id;
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [result, setResult] = useState<RepairAssistResult | null>(null);

  const loadItem = useCallback(async () => {
    if (!itemId) {
      setLoadError("The selected inventory item is missing.");
      setLoading(false);
      return;
    }

    if (!userId) {
      setLoadError("Sign in before opening repair intelligence.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      setItem(await getInventoryItem(userId, itemId));
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : "KeepFlip could not open this inventory item.",
      );
    } finally {
      setLoading(false);
    }
  }, [itemId, userId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadItem();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [loadItem]);

  const normalizedIssue = issueDescription.replace(/\s+/g, " ").trim();
  const canResearch = normalizedIssue.length >= 8 && !researching;
  const descriptor = useMemo(
    () => (item ? itemDescriptor(item) : ""),
    [item],
  );

  const handleResearch = useCallback(async () => {
    if (!item || !canResearch) return;

    setResearching(true);
    setResearchError(null);
    setResult(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );

    try {
      const response = await runRepairAssist({
        itemId: item.id,
        issueDescription: normalizedIssue,
        symptoms: [normalizedIssue],
      });
      setResult(response);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    } catch (caught) {
      setResearchError(
        caught instanceof Error
          ? caught.message
          : "KeepFlip could not research this repair.",
      );
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => undefined);
    } finally {
      setResearching(false);
    }
  }, [canResearch, item, normalizedIssue]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={theme.colors.scannerCyan} />
        <Text style={styles.centerLabel}>OPENING REPAIR INTELLIGENCE</Text>
      </View>
    );
  }

  if (loadError || !item) {
    return (
      <View style={styles.centerState}>
        <Text selectable style={styles.centerError}>
          {loadError ?? "No inventory item was supplied."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.centerBackButton}
        >
          <Text style={styles.centerBackText}>GO BACK</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <RepairNeonSign
        style={[styles.modelStage, { top: insets.top + 28 }]}
      />
      <LinearGradient
        colors={[
          "rgba(1, 1, 2, 0.1)",
          "rgba(1, 1, 2, 0.05)",
          "rgba(1, 1, 2, 0.86)",
          theme.colors.backgroundDeep,
        ]}
        locations={[0, 0.28, 0.54, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardRoot}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: insets.bottom + 34,
              paddingTop: insets.top + 14,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Back to inventory"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <IconSymbol
                color={theme.colors.scannerCyan}
                name="chevron.left.forwardslash.chevron.right"
                size={17}
              />
              <Text style={styles.backButtonText}>DIAGNOSTICS</Text>
            </Pressable>
            </View>

          <View pointerEvents="none" style={styles.modelClearance} />

          <View style={styles.identityReadout}>
            <Text style={styles.eyebrow}>REPAIR INTELLIGENCE // ITEM LINKED</Text>
            <Text numberOfLines={2} selectable style={styles.itemTitle}>
              {item.title}
            </Text>
            {descriptor ? (
              <Text numberOfLines={1} selectable style={styles.itemMeta}>
                {descriptor}
              </Text>
            ) : null}
          </View>

          <View style={styles.promptCard}>
            <View style={styles.promptCardHeader}>
              <View style={styles.stepChip}>
                <Text style={styles.stepChipText}>01 / INTAKE</Text>
              </View>
              <Text style={styles.privateLabel}>PRIVATE ITEM CONTEXT</Text>
            </View>

            <Text style={styles.question}>What is wrong with this item?</Text>
            <Text style={styles.questionDetail}>
              Describe what it does, what changed, any sounds, lights, leaks, damage, or messages you see.
            </Text>

            <TextInput
              accessibilityLabel="Describe what is wrong with the item"
              maxLength={1500}
              multiline
              onChangeText={setIssueDescription}
              placeholder="Example: it powers on, but shuts off after a few minutes and the screen flickers…"
              placeholderTextColor="rgba(173, 167, 178, 0.54)"
              selectionColor={theme.colors.goldBright}
              style={styles.issueInput}
              textAlignVertical="top"
              value={issueDescription}
            />

            <View style={styles.inputFooter}>
              <Text style={styles.characterCount}>
                {normalizedIssue.length}/1500
              </Text>
              <Text style={styles.serverNotice}>
                ITEM ID + SYMPTOM / PROTECTED SEARCH
              </Text>
            </View>

            {researchError ? (
              <View style={styles.errorNotice}>
                <Text selectable style={styles.errorNoticeText}>
                  {researchError}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canResearch }}
              disabled={!canResearch}
              onPress={() => void handleResearch()}
              style={({ pressed }) => [
                styles.researchButton,
                !canResearch && styles.researchButtonDisabled,
                pressed && canResearch && styles.buttonPressed,
              ]}
            >
              <LinearGradient
                colors={[
                  "rgba(141, 114, 255, 0.94)",
                  "rgba(0, 255, 255, 0.84)",
                  "rgba(242, 211, 138, 0.86)",
                ]}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              {researching ? (
                <ActivityIndicator color={theme.colors.backgroundDeep} />
              ) : (
                <IconSymbol
                  color={theme.colors.backgroundDeep}
                  name="magnifyingglass"
                  size={18}
                />
              )}
              <Text style={styles.researchButtonText}>
                {researching ? "RESEARCHING REPAIR" : "SEARCH REPAIR EVIDENCE"}
              </Text>
            </Pressable>
          </View>

          {result ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View>
                  <Text style={styles.resultEyebrow}>REPAIR SIGNAL / VERIFIED RESPONSE</Text>
                  <Text selectable style={styles.resultTitle}>
                    {result.diagnosis.issueTitle}
                  </Text>
                </View>
                <View style={styles.urgencyPill}>
                  <Text style={styles.urgencyText}>
                    {urgencyLabel(result.diagnosis.urgency)}
                  </Text>
                </View>
              </View>

              <Text selectable style={styles.resultSummary}>
                {result.diagnosis.diagnosisSummary}
              </Text>

              <View style={styles.resultMetricRow}>
                <View style={styles.metricBlock}>
                  <Text style={styles.metricLabel}>LIKELY CAUSE</Text>
                  <Text selectable style={styles.metricValue}>
                    {result.diagnosis.likelyCause}
                  </Text>
                </View>
                <View style={styles.metricBlockRight}>
                  <Text style={styles.metricLabel}>REPAIR PATH</Text>
                  <Text style={styles.metricValueAccent}>
                    {repairabilityLabel(result.diagnosis.repairability)}
                  </Text>
                </View>
              </View>

              {result.diagnosis.safetyWarnings.length > 0 ? (
                <View style={styles.safetySection}>
                  <Text style={styles.safetyLabel}>SAFETY FIRST</Text>
                  {result.diagnosis.safetyWarnings.slice(0, 3).map((warning) => (
                    <Text key={warning} selectable style={styles.safetyText}>
                      • {warning}
                    </Text>
                  ))}
                </View>
              ) : null}

              {result.diagnosis.safeNextSteps.length > 0 ? (
                <View style={styles.nextStepsSection}>
                  <Text style={styles.nextStepsLabel}>NEXT SAFE STEPS</Text>
                  {result.diagnosis.safeNextSteps.slice(0, 3).map((step, index) => (
                    <View key={step} style={styles.nextStepRow}>
                      <Text style={styles.nextStepIndex}>0{index + 1}</Text>
                      <Text selectable style={styles.nextStepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {result.partsResearch.parts.length > 0 ? (
                <View style={styles.partsSection}>
                  <Text style={styles.partsLabel}>PARTS RESEARCH / TOP MATCHES</Text>
                  {result.partsResearch.parts.slice(0, 2).map((part) => (
                    <View key={`${part.name}-${part.searchQuery}`} style={styles.partRow}>
                      <View style={styles.partDot} />
                      <View style={styles.partCopy}>
                        <Text selectable style={styles.partName}>{part.name}</Text>
                        <Text selectable style={styles.partDetail}>
                          {Math.round(part.confidence)}% MATCH · {part.matchLevel.replace(/_/g, " ").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.researchHint}>
              <View style={styles.researchHintLine} />
              <Text style={styles.researchHintText}>
                Your saved item identity and this symptom are sent to KeepFlip’s protected repair-research Function; service credentials never enter the app.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDeep,
  },
  keyboardRoot: {
    flex: 1,
  },
  modelStage: {
    position: "absolute",
    right: 0,
    left: 0,
    height: 314,
  },
  content: {
    gap: 14,
    paddingHorizontal: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 255, 255, 0.35)",
    backgroundColor: "rgba(2, 8, 12, 0.72)",
  },
  backButtonText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  livePill: {
    maxWidth: "61%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.32)",
    backgroundColor: "rgba(8, 6, 11, 0.74)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: "0 0 9px rgba(0, 255, 255, 0.9)",
  },
  liveDotWarning: {
    backgroundColor: theme.colors.goldBright,
    boxShadow: "0 0 9px rgba(242, 211, 138, 0.9)",
  },
  livePillText: {
    flexShrink: 1,
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.62,
  },
  modelClearance: {
    height: 216,
  },
  identityReadout: {
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 20,
  },
  eyebrow: {
    color: "rgba(0, 255, 255, 0.78)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.12,
    textAlign: "center",
  },
  itemTitle: {
    color: theme.colors.scannerWhite,
    fontFamily: theme.fonts.bold,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.55,
    lineHeight: 30,
    textAlign: "center",
    textShadowColor: "rgba(0, 255, 255, 0.24)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  itemMeta: {
    color: "rgba(242, 237, 228, 0.62)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.65,
    textAlign: "center",
  },
  promptCard: {
    overflow: "hidden",
    gap: 13,
    padding: 17,
    borderRadius: theme.radii.large,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(141, 114, 255, 0.38)",
    backgroundColor: "rgba(8, 8, 13, 0.90)",
    boxShadow: "0 18px 42px rgba(0, 0, 0, 0.4), 0 0 28px rgba(141, 114, 255, 0.1)",
    experimental_backgroundImage:
      "radial-gradient(circle at 92% 2%, rgba(0, 255, 255, 0.12) 0%, transparent 30%), radial-gradient(circle at 0% 100%, rgba(141, 114, 255, 0.14) 0%, transparent 42%), linear-gradient(140deg, rgba(17, 15, 27, 0.97) 0%, rgba(4, 4, 7, 0.98) 100%)",
  },
  promptCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.36)",
    backgroundColor: "rgba(242, 211, 138, 0.06)",
  },
  stepChipText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  privateLabel: {
    color: "rgba(173, 167, 178, 0.70)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  question: {
    color: theme.colors.cream,
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.45,
    lineHeight: 27,
  },
  questionDetail: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  issueInput: {
    minHeight: 138,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: theme.radii.medium,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.24)",
    backgroundColor: "rgba(1, 5, 8, 0.68)",
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  inputFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: -5,
  },
  characterCount: {
    color: "rgba(173, 167, 178, 0.62)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
  },
  serverNotice: {
    flexShrink: 1,
    color: "rgba(0, 255, 255, 0.58)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.62,
    textAlign: "right",
  },
  errorNotice: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: theme.radii.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232, 97, 88, 0.48)",
    backgroundColor: "rgba(91, 17, 24, 0.42)",
  },
  errorNoticeText: {
    color: "#FFC3BE",
    fontSize: 12,
    lineHeight: 17,
  },
  researchButton: {
    position: "relative",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    overflow: "hidden",
    borderRadius: theme.radii.medium,
    borderCurve: "continuous",
    boxShadow: "0 0 26px rgba(0, 255, 255, 0.25)",
  },
  researchButtonDisabled: {
    opacity: 0.42,
  },
  researchButtonText: {
    color: theme.colors.backgroundDeep,
    fontFamily: theme.fonts.radar,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  resultCard: {
    gap: 16,
    padding: 17,
    borderRadius: theme.radii.large,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.34)",
    backgroundColor: "rgba(4, 9, 12, 0.94)",
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.36), 0 0 24px rgba(0, 255, 255, 0.08)",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  resultEyebrow: {
    color: "rgba(0, 255, 255, 0.74)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  resultTitle: {
    marginTop: 5,
    color: theme.colors.scannerWhite,
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  urgencyPill: {
    maxWidth: "35%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.42)",
    backgroundColor: "rgba(242, 211, 138, 0.10)",
  },
  urgencyText: {
    color: theme.colors.goldBright,
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  resultSummary: {
    color: "rgba(242, 237, 228, 0.82)",
    fontSize: 13,
    lineHeight: 20,
  },
  resultMetricRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0, 255, 255, 0.18)",
  },
  metricBlock: {
    flex: 1.35,
    gap: 5,
  },
  metricBlockRight: {
    flex: 0.8,
    alignItems: "flex-end",
    gap: 5,
  },
  metricLabel: {
    color: "rgba(173, 167, 178, 0.64)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  metricValueAccent: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.55,
    textAlign: "right",
  },
  safetySection: {
    gap: 6,
    padding: 12,
    borderRadius: theme.radii.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232, 97, 88, 0.46)",
    backgroundColor: "rgba(87, 18, 25, 0.34)",
  },
  safetyLabel: {
    color: "#FFAEA5",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  safetyText: {
    color: "rgba(255, 218, 213, 0.88)",
    fontSize: 12,
    lineHeight: 18,
  },
  nextStepsSection: {
    gap: 9,
  },
  nextStepsLabel: {
    color: "rgba(242, 211, 138, 0.78)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.85,
  },
  nextStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  nextStepIndex: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  nextStepText: {
    flex: 1,
    color: "rgba(242, 237, 228, 0.80)",
    fontSize: 12,
    lineHeight: 18,
  },
  partsSection: {
    gap: 9,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(141, 114, 255, 0.22)",
  },
  partsLabel: {
    color: "rgba(141, 114, 255, 0.88)",
    fontFamily: theme.fonts.radar,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.82,
  },
  partRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  partDot: {
    width: 6,
    height: 6,
    marginTop: 5,
    borderRadius: 99,
    backgroundColor: theme.colors.scannerViolet,
    boxShadow: "0 0 8px rgba(141, 114, 255, 0.86)",
  },
  partCopy: {
    flex: 1,
    gap: 3,
  },
  partName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  partDetail: {
    color: "rgba(173, 167, 178, 0.76)",
    fontFamily: theme.fonts.radar,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.45,
  },
  researchHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  researchHintLine: {
    width: 2,
    height: 34,
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.scannerViolet,
    boxShadow: "0 0 9px rgba(141, 114, 255, 0.75)",
  },
  researchHintText: {
    flex: 1,
    color: "rgba(173, 167, 178, 0.82)",
    fontSize: 12,
    lineHeight: 18,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    padding: 28,
    backgroundColor: theme.colors.backgroundDeep,
  },
  centerLabel: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  centerError: {
    maxWidth: 360,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  centerBackButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 255, 0.40)",
  },
  centerBackText: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
