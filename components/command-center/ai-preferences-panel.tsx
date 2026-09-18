import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  ASSISTANT_MEMORY_CATEGORIES,
  getAssistantMemory,
  MAX_ASSISTANT_MEMORY_FACT_LENGTH,
  MAX_ASSISTANT_MEMORY_FACTS,
  saveAssistantMemory,
  type AssistantMemoryCategory,
  type AssistantMemoryFact,
} from '@/services/keepflip-assistant-memory-service';

const GUIDANCE_KEY = 'flip_guidance';

const CATEGORY_OPTIONS: {
  id: AssistantMemoryCategory;
  label: string;
}[] = [
  { id: 'business_profile', label: 'Business' },
  { id: 'sourcing_preference', label: 'Sourcing' },
  { id: 'buying_rule', label: 'Buying rule' },
  { id: 'workflow_preference', label: 'Workflow' },
  { id: 'goal', label: 'Goal' },
  { id: 'communication_preference', label: 'Responses' },
];

const CATEGORY_LABELS: Record<AssistantMemoryCategory, string> =
  Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.id, option.label])) as Record<
    AssistantMemoryCategory,
    string
  >;

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message.trim()
    : 'AI preferences could not load right now. Try again.';
}

function categoryAfter(category: AssistantMemoryCategory) {
  const index = ASSISTANT_MEMORY_CATEGORIES.indexOf(category);
  return ASSISTANT_MEMORY_CATEGORIES[(index + 1) % ASSISTANT_MEMORY_CATEGORIES.length];
}

export function AiPreferencesPanel({ ownerId }: { ownerId: string }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const [facts, setFacts] = useState<AssistantMemoryFact[]>([]);
  const [guidance, setGuidance] = useState('');
  const [newMemory, setNewMemory] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<AssistantMemoryCategory>(
    'business_profile',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const snapshot = await getAssistantMemory();
      if (request !== requestId.current) return;
      setFacts(snapshot.facts.filter((fact) => fact.key !== GUIDANCE_KEY));
      setGuidance(
        snapshot.facts.find((fact) => fact.key === GUIDANCE_KEY)?.value ?? '',
      );
      setDirty(false);
    } catch (cause) {
      if (request === requestId.current) setError(errorMessage(cause));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [load, ownerId]);

  const memoryCount = facts.length + (guidance.trim() ? 1 : 0);
  const canAddMemory = newMemory.trim().length > 0;
  const hasEmptyMemory = facts.some((fact) => !fact.value.trim());
  const countLabel = useMemo(
    () => `${memoryCount}/${MAX_ASSISTANT_MEMORY_FACTS} saved`,
    [memoryCount],
  );

  function addMemory() {
    const value = newMemory.trim();
    if (!value) return;
    if (value.length > MAX_ASSISTANT_MEMORY_FACT_LENGTH) {
      setError(`Keep each memory under ${MAX_ASSISTANT_MEMORY_FACT_LENGTH} characters.`);
      return;
    }
    if (memoryCount >= MAX_ASSISTANT_MEMORY_FACTS) {
      setError(`Keep at most ${MAX_ASSISTANT_MEMORY_FACTS} memories.`);
      return;
    }

    setFacts((current) => [
      ...current,
      {
        category: newMemoryCategory,
        key: `manual_memory_${Date.now()}_${current.length}`,
        updatedAt: null,
        value,
      },
    ]);
    setNewMemory('');
    setDirty(true);
    setError(null);
    setNotice(null);
  }

  function updateFact(index: number, value: string) {
    setFacts((current) =>
      current.map((fact, factIndex) =>
        factIndex === index ? { ...fact, value } : fact,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  function rotateFactCategory(index: number) {
    setFacts((current) =>
      current.map((fact, factIndex) =>
        factIndex === index
          ? { ...fact, category: categoryAfter(fact.category) }
          : fact,
      ),
    );
    setDirty(true);
    setNotice(null);
  }

  function removeFact(index: number) {
    setFacts((current) => current.filter((_, factIndex) => factIndex !== index));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    if (saving || loading) return;
    if (hasEmptyMemory) {
      setError('Remove any empty memory cards or add detail before saving.');
      return;
    }
    if (guidance.trim().length > MAX_ASSISTANT_MEMORY_FACT_LENGTH) {
      setError(`Keep Flip guidance under ${MAX_ASSISTANT_MEMORY_FACT_LENGTH} characters.`);
      return;
    }

    const nextFacts = guidance.trim()
      ? [
          ...facts,
          {
            category: 'communication_preference' as const,
            key: GUIDANCE_KEY,
            updatedAt: null,
            value: guidance.trim(),
          },
        ]
      : facts;

    if (nextFacts.length > MAX_ASSISTANT_MEMORY_FACTS) {
      setError(`Keep at most ${MAX_ASSISTANT_MEMORY_FACTS} memories, including Flip guidance.`);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const snapshot = await saveAssistantMemory(nextFacts);
      setFacts(snapshot.facts.filter((fact) => fact.key !== GUIDANCE_KEY));
      setGuidance(
        snapshot.facts.find((fact) => fact.key === GUIDANCE_KEY)?.value ?? '',
      );
      setDirty(false);
      setNotice('Saved. Flip will use this context in future responses and suggestions.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.wrap}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopline}>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP / AI PREFERENCES</Text>
            <Text style={[styles.title, { fontSize: responsiveFont(20) }]}>Give Flip better context</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={[styles.countPillText, { fontSize: responsiveFont(7) }]}>{countLabel}</Text>
          </View>
        </View>
        <Text style={[styles.intro, { fontSize: responsiveFont(10), lineHeight: 15 }]}>Add durable details about your resale business, sourcing habits, goals, and working style. Flip uses these private notes to make responses and suggestions more relevant.</Text>
        <Text style={[styles.privateNote, { fontSize: responsiveFont(8) }]}>PRIVATE TO YOUR ACCOUNT · DO NOT ADD PASSWORDS, PAYMENT DETAILS, OR API KEYS</Text>
      </View>

      {error && !loading ? (
        <View style={styles.messageCardError}>
          <Text accessibilityLiveRegion="polite" style={[styles.messageTextError, { fontSize: responsiveFont(10) }]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void load()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <IconSymbol color={theme.colors.goldBright} name="arrow.clockwise" size={15} />
            <Text style={[styles.retryButtonText, { fontSize: responsiveFont(8) }]}>RETRY</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !facts.length && !guidance ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={theme.colors.scannerCyan} />
          <Text style={[styles.loadingText, { fontSize: responsiveFont(10) }]}>Loading your private Flip context…</Text>
        </View>
      ) : null}

      {!loading || facts.length > 0 || guidance ? (
        <>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>USER-SPECIFIC MEMORY</Text>
                <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>What should Flip remember?</Text>
                <Text style={[styles.sectionBody, { fontSize: responsiveFont(10), lineHeight: 15 }]}>These are the business details Flip can carry from one conversation to the next. Tap a type badge to cycle its category.</Text>
              </View>
              <IconSymbol color={theme.colors.scannerViolet} name="bolt.fill" size={20} />
            </View>

            {facts.length ? (
              <View style={styles.factList}>
                {facts.map((fact, index) => (
                  <View key={fact.key} style={styles.factCard}>
                    <View style={styles.factHeader}>
                      <Pressable
                        accessibilityHint="Changes the category for this memory."
                        accessibilityLabel={`Memory type ${CATEGORY_LABELS[fact.category]}`}
                        accessibilityRole="button"
                        onPress={() => rotateFactCategory(index)}
                        style={({ pressed }) => [styles.categoryBadge, pressed && styles.pressed]}>
                        <Text style={[styles.categoryBadgeText, { fontSize: responsiveFont(7) }]}>{CATEGORY_LABELS[fact.category]}</Text>
                        <IconSymbol color={theme.colors.scannerViolet} name="chevron.right" size={12} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Delete memory ${index + 1}`}
                        accessibilityRole="button"
                        onPress={() => removeFact(index)}
                        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                        <IconSymbol color={theme.colors.danger} name="trash.fill" size={15} />
                      </Pressable>
                    </View>
                    <TextInput
                      accessibilityLabel={`Memory ${index + 1}`}
                      maxLength={MAX_ASSISTANT_MEMORY_FACT_LENGTH}
                      multiline
                      onChangeText={(value) => updateFact(index, value)}
                      placeholder="Add a durable detail Flip should remember"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.memoryInput, { fontSize: responsiveFont(11), lineHeight: 16 }]}
                      textAlignVertical="top"
                      value={fact.value}
                    />
                    <Text style={[styles.characterCount, { fontSize: responsiveFont(7) }]}>{fact.value.length}/{MAX_ASSISTANT_MEMORY_FACT_LENGTH}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateTitle, { fontSize: responsiveFont(10) }]}>No manual memories yet</Text>
                <Text style={[styles.emptyStateBody, { fontSize: responsiveFont(9), lineHeight: 14 }]}>Add your first durable business detail below. Flip may also learn concise facts when you state them in conversation.</Text>
              </View>
            )}

            <View style={styles.addCard}>
              <Text style={[styles.addEyebrow, { fontSize: responsiveFont(8) }]}>ADD A MEMORY</Text>
              <TextInput
                accessibilityLabel="New Flip memory"
                maxLength={MAX_ASSISTANT_MEMORY_FACT_LENGTH}
                multiline
                onChangeText={(value) => {
                  setNewMemory(value);
                  setError(null);
                }}
                placeholder="Example: I usually source vintage cameras under $40."
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.memoryInput, { fontSize: responsiveFont(11), lineHeight: 16 }]}
                textAlignVertical="top"
                value={newMemory}
              />
              <ScrollView
                contentContainerStyle={styles.categoryList}
                horizontal
                showsHorizontalScrollIndicator={false}>
                {CATEGORY_OPTIONS.map((option) => {
                  const selected = newMemoryCategory === option.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={option.id}
                      onPress={() => setNewMemoryCategory(option.id)}
                      style={({ pressed }) => [
                        styles.categoryOption,
                        selected && styles.categoryOptionSelected,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.categoryOptionText, selected && styles.categoryOptionTextSelected, { fontSize: responsiveFont(7) }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                accessibilityRole="button"
                disabled={!canAddMemory || saving}
                onPress={addMemory}
                style={({ pressed }) => [
                  styles.addButton,
                  (!canAddMemory || saving) && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}>
                <IconSymbol color={theme.colors.backgroundDeep} name="checkmark.circle.fill" size={16} />
                <Text style={[styles.addButtonText, { fontSize: responsiveFont(8) }]}>ADD TO MY MEMORIES</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(8) }]}>RESPONSE GUIDANCE</Text>
                <Text style={[styles.sectionTitle, { fontSize: responsiveFont(16) }]}>Things Flip should know</Text>
              </View>
              <IconSymbol color={theme.colors.scannerCyan} name="bubble.left.and.bubble.right.fill" size={20} />
            </View>
            <Text style={[styles.sectionBody, { fontSize: responsiveFont(10), lineHeight: 15 }]}>Tell Flip what to consider when it answers or makes suggestions. Keep it stable and practical — for example, your preferred risk level, the way you want tradeoffs explained, or what kind of inventory you are building.</Text>
            <TextInput
              accessibilityLabel="Things Flip should know"
              maxLength={MAX_ASSISTANT_MEMORY_FACT_LENGTH}
              multiline
              onChangeText={(value) => {
                setGuidance(value);
                setDirty(true);
                setNotice(null);
                setError(null);
              }}
              placeholder="Example: Be direct about downside risk. Show the likely net profit after fees and call out unknown costs before recommending a buy."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.guidanceInput, { fontSize: responsiveFont(11), lineHeight: 17 }]}
              textAlignVertical="top"
              value={guidance}
            />
            <Text style={[styles.characterCount, { fontSize: responsiveFont(7) }]}>{guidance.length}/{MAX_ASSISTANT_MEMORY_FACT_LENGTH}</Text>
          </View>

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={[styles.noticeText, { fontSize: responsiveFont(10) }]}>{notice}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: saving || !dirty }}
            disabled={saving || !dirty}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              (!dirty || saving) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}>
            {saving ? <ActivityIndicator color={theme.colors.backgroundDeep} size="small" /> : <IconSymbol color={theme.colors.backgroundDeep} name="save.fill" size={17} />}
            <Text style={[styles.saveButtonText, { fontSize: responsiveFont(9) }]}>{saving ? 'SAVING AI PREFERENCES…' : 'SAVE AI PREFERENCES'}</Text>
          </Pressable>
        </>
      ) : null}
    </Animated.View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    wrap: { gap: 12 },
    heroCard: {
      gap: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.accentVioletBorder,
      borderRadius: 14,
      backgroundColor: theme.colors.cardSoft,
    },
    heroTopline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    heroCopy: { flex: 1, gap: 3 },
    eyebrow: {
      color: theme.colors.scannerViolet,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    title: {
      color: theme.colors.cream,
      lineHeight: 25,
      fontWeight: '900',
    },
    countPill: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    countPillText: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.55,
    },
    intro: { color: theme.colors.textMuted },
    privateNote: {
      color: theme.colors.goldBright,
      fontWeight: '900',
      letterSpacing: 0.55,
    },
    sectionCard: {
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 14,
      backgroundColor: theme.colors.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionCopy: { flex: 1, gap: 3 },
    sectionEyebrow: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.25,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
    },
    sectionBody: { color: theme.colors.textMuted },
    factList: { gap: 8 },
    factCard: {
      gap: 7,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.accentVioletBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.cardSoft,
    },
    factHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: theme.colors.accentVioletBorder,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.iconSurfaceViolet,
    },
    categoryBadgeText: {
      color: theme.colors.scannerViolet,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.45,
    },
    removeButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    memoryInput: {
      minHeight: 58,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 9,
      color: theme.colors.cream,
      backgroundColor: theme.colors.surfaceInset,
    },
    characterCount: {
      color: theme.colors.textMuted,
      textAlign: 'right',
    },
    addCard: {
      gap: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.cardSoft,
    },
    addEyebrow: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    categoryList: { gap: 6, paddingRight: 3 },
    categoryOption: {
      minHeight: 30,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: theme.radii.pill,
    },
    categoryOptionSelected: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    categoryOptionText: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '800',
    },
    categoryOptionTextSelected: { color: theme.colors.scannerCyan },
    guidanceInput: {
      minHeight: 116,
      paddingHorizontal: 11,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      color: theme.colors.cream,
      backgroundColor: theme.colors.surfaceInset,
    },
    emptyState: {
      gap: 4,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: 9,
      backgroundColor: theme.colors.cardSoft,
    },
    emptyStateTitle: { color: theme.colors.text, fontWeight: '800' },
    emptyStateBody: { color: theme.colors.textMuted },
    addButton: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: theme.colors.scannerCyan,
    },
    addButtonText: {
      color: theme.colors.textOnAccent,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    saveButton: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.colors.goldBright,
    },
    saveButtonText: {
      color: theme.colors.textOnAccent,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    messageCardError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 11,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 10,
      backgroundColor: theme.colors.dangerSurface,
    },
    messageTextError: { flex: 1, color: theme.colors.danger, lineHeight: 15 },
    retryButton: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 8,
    },
    retryButtonText: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    loadingCard: {
      minHeight: 120,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
    },
    loadingText: { color: theme.colors.textMuted },
    noticeText: {
      color: theme.colors.scannerCyan,
      lineHeight: 15,
      textAlign: 'center',
    },
    pressed: { opacity: 0.72 },
    buttonDisabled: { opacity: 0.42 },
  });

  return {
    ...staticStyles,
    heroCard: [
      staticStyles.heroCard,
      { padding: responsiveWidth(14) },
    ],
    title: [staticStyles.title, { fontSize: responsiveFont(20) }],
    intro: [staticStyles.intro, { fontSize: responsiveFont(10) }],
    privateNote: [staticStyles.privateNote, { fontSize: responsiveFont(8) }],
    sectionCard: [
      staticStyles.sectionCard,
      { padding: responsiveWidth(14) },
    ],
    sectionEyebrow: [staticStyles.sectionEyebrow, { fontSize: responsiveFont(8) }],
    sectionTitle: [staticStyles.sectionTitle, { fontSize: responsiveFont(16) }],
    sectionBody: [staticStyles.sectionBody, { fontSize: responsiveFont(10) }],
    categoryBadgeText: [staticStyles.categoryBadgeText, { fontSize: responsiveFont(7) }],
    categoryOptionText: [staticStyles.categoryOptionText, { fontSize: responsiveFont(7) }],
    addEyebrow: [staticStyles.addEyebrow, { fontSize: responsiveFont(8) }],
    addButtonText: [staticStyles.addButtonText, { fontSize: responsiveFont(8) }],
    saveButtonText: [staticStyles.saveButtonText, { fontSize: responsiveFont(9) }],
    messageTextError: [staticStyles.messageTextError, { fontSize: responsiveFont(10) }],
    retryButtonText: [staticStyles.retryButtonText, { fontSize: responsiveFont(8) }],
    loadingText: [staticStyles.loadingText, { fontSize: responsiveFont(10) }],
    noticeText: [staticStyles.noticeText, { fontSize: responsiveFont(10) }],
    countPillText: [staticStyles.countPillText, { fontSize: responsiveFont(7) }],
    emptyStateTitle: [staticStyles.emptyStateTitle, { fontSize: responsiveFont(10) }],
    emptyStateBody: [staticStyles.emptyStateBody, { fontSize: responsiveFont(9) }],
    characterCount: [staticStyles.characterCount, { fontSize: responsiveFont(7) }],
    memoryInput: [staticStyles.memoryInput, { minHeight: responsiveHeight(58) }],
    guidanceInput: [staticStyles.guidanceInput, { minHeight: responsiveHeight(116) }],
  };
}
