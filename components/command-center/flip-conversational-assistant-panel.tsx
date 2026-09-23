import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipCompanion, useFlipCompanion } from '@/components/flip';
import { useFlipGuidance } from '@/components/command-center/flip-guidance-overlay';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  ASSISTANT_CONVERSATION_PAGE_SIZE,
  completeAssistantTask,
  createAssistantActionRun,
  createAssistantTask,
  defaultAssistantConversationId,
  listAssistantConversation,
  listAssistantTasks,
  listOlderAssistantConversation,
  parseAssistantCommand,
  runKeepFlipAssistant,
  subscribeToAssistantConversation,
  type AssistantAction,
  type AssistantAdvisory,
  type AssistantConversationMessage,
  type AssistantProfileContext,
  type AssistantRoute,
  type AssistantTask,
  type AssistantWorkspaceContext,
} from '@/services/keepflip-assistant-service';
import {
  getInventoryItem,
  listInventoryItemsForAssistant,
  updateInventoryItemNumber,
  type InventoryItem,
  type InventoryNumberField,
} from '@/services/inventory-service';
import {
  cancelKeepFlipTaskReminder,
  scheduleKeepFlipTaskReminder,
} from '@/services/keepflip-notification-service';
import { getResellerBuyRules } from '@/services/user-profile-onboarding-service';
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';

const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');
const OPTIMISTIC_USER_MESSAGE_PREFIX = 'local-user-';
const OPTIMISTIC_MESSAGE_MATCH_WINDOW_MS = 30_000;

function isFlipQuestionOrTask(input: string) {
  return /[?]|\b(?:can|could|would|should|what|where|when|why|how|help|remind|add|create|open|show|review|plan|find|tell|give)\b/i.test(
    input,
  );
}

async function scheduleTaskReminder(
  task: AssistantTask,
  requestPermission: boolean,
) {
  if (task.status !== 'open' || task.taskType !== 'reminder' || !task.dueAt) {
    return { status: 'skipped' } as const;
  }
  return scheduleKeepFlipTaskReminder({
    body: task.title,
    dueAt: task.dueAt,
    requestPermission,
    taskId: task.id,
    title: 'KeepFlip reminder',
    url: '/command-center',
  });
}

function validDueAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const ADVISORY_MODE_LABELS: Record<AssistantAdvisory['mode'], string> = {
  general: 'STRATEGIC READ',
  buy_decision: 'BUY / SKIP READ',
  inventory: 'INVENTORY READ',
  cash_flow: 'CASH FLOW READ',
  growth: 'GROWTH READ',
  seller_operations: 'OPERATIONS READ',
  financial_review: 'FINANCIAL READ',
};

function AdvisoryCard({
  advisory,
  responsiveFont,
  styles,
}: {
  advisory: AssistantAdvisory;
  responsiveFont: (size: number) => number;
  styles: ReturnType<typeof createResponsiveStyles>;
}) {
  return (
    <View accessibilityLabel="Flip strategic read" style={styles.advisoryCard}>
      <View style={styles.advisoryHeader}>
        <Text style={[styles.advisoryLabel, { fontSize: responsiveFont(7) }]}>
          {ADVISORY_MODE_LABELS[advisory.mode]}
        </Text>
        <Text style={[styles.advisoryConfidence, { fontSize: responsiveFont(7) }]}>
          {advisory.confidence.toUpperCase()} CONFIDENCE
        </Text>
      </View>
      <Text selectable style={[styles.advisoryRecommendation, { fontSize: responsiveFont(10), lineHeight: 14 }]}>
        {advisory.recommendation}
      </Text>
      {advisory.evidence.length ? (
        <View style={styles.advisoryEvidence}>
          {advisory.evidence.slice(0, 3).map((evidence, index) => (
            <View key={`${evidence.label}-${evidence.source}-${index}`} style={styles.advisoryEvidenceRow}>
              <Text selectable style={[styles.advisoryEvidenceLabel, { fontSize: responsiveFont(8) }]}>
                {evidence.label}
              </Text>
              <Text selectable style={[styles.advisoryEvidenceValue, { fontSize: responsiveFont(8) }]}>
                {evidence.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.advisoryNextAction}>
        <Text style={[styles.advisoryNextLabel, { fontSize: responsiveFont(7) }]}>NEXT MOVE</Text>
        <Text selectable style={[styles.advisoryNextText, { fontSize: responsiveFont(9), lineHeight: 13 }]}>
          {advisory.nextAction}
        </Text>
      </View>
      {advisory.unknowns.length ? (
        <Text selectable style={[styles.advisoryUnknowns, { fontSize: responsiveFont(8), lineHeight: 12 }]}>
          {`Watch-outs: ${advisory.unknowns.slice(0, 2).join(' · ')}`}
        </Text>
      ) : null}
    </View>
  );
}

function profileContextFromRules(
  rules: Awaited<ReturnType<typeof getResellerBuyRules>>,
): AssistantProfileContext | null {
  if (!rules) return null;
  return {
    inventoryFocus: rules.inventoryFocus,
    saleSpeed: rules.saleSpeed,
    minimumRoiPercent: rules.minimumRoiPercent,
    minimumNetProfitCents: rules.minimumNetProfitCents,
    maximumItemCostCents: rules.maximumItemCostCents,
    maximumTypicalDays: rules.maximumTypicalDays,
  };
}

type PendingInventoryUpdate = {
  type: 'update_inventory_number';
  itemId: string;
  field: InventoryNumberField;
  value: number;
  item: InventoryItem;
};

function inventoryFieldLabel(field: InventoryNumberField) {
  const labels: Record<InventoryNumberField, string> = {
    acquisition_cost_cents: 'Acquisition cost',
    estimated_value_cents: 'Estimated value',
    inventory_cost_cents_on_hand: 'Inventory cost on hand',
    quantity_on_hand: 'Quantity on hand',
    quantity_purchased: 'Quantity purchased',
    resale_typical_days: 'Typical resale days',
  };
  return labels[field];
}

function inventoryItemNumber(item: InventoryItem, field: InventoryNumberField) {
  switch (field) {
    case 'acquisition_cost_cents':
      return item.acquisitionCost == null ? null : Math.round(item.acquisitionCost * 100);
    case 'estimated_value_cents':
      return item.estimatedValue == null ? null : Math.round(item.estimatedValue * 100);
    case 'inventory_cost_cents_on_hand':
      return item.inventoryCostOnHand == null
        ? null
        : Math.round(item.inventoryCostOnHand * 100);
    case 'quantity_on_hand':
      return item.quantityOnHand;
    case 'quantity_purchased':
      return item.quantityPurchased;
    case 'resale_typical_days':
      return item.resaleTypicalDays;
  }
}

function formatInventoryNumber(field: InventoryNumberField, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Not set';
  if (
    field === 'acquisition_cost_cents' ||
    field === 'estimated_value_cents' ||
    field === 'inventory_cost_cents_on_hand'
  ) {
    return new Intl.NumberFormat(undefined, {
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(value / 100);
  }
  return String(value);
}

function PendingInventoryUpdateCard({
  busy,
  onCancel,
  onConfirm,
  pending,
  responsiveFont,
  styles,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pending: PendingInventoryUpdate;
  responsiveFont: (size: number) => number;
  styles: ReturnType<typeof createResponsiveStyles>;
}) {
  const currentValue = inventoryItemNumber(pending.item, pending.field);
  return (
    <Animated.View entering={FadeInDown.duration(180)} style={styles.inventoryUpdateCard}>
      <View style={styles.inventoryUpdateHeader}>
        <View style={styles.inventoryUpdateCopy}>
          <Text style={[styles.inventoryUpdateLabel, { fontSize: responsiveFont(7) }]}>REVIEW BEFORE SAVING</Text>
          <Text numberOfLines={2} style={[styles.inventoryUpdateTitle, { fontSize: responsiveFont(12), lineHeight: 16 }]}>
            {pending.item.title}
          </Text>
        </View>
        <Text style={[styles.inventoryUpdateBadge, { fontSize: responsiveFont(7) }]}>CONFIRM</Text>
      </View>
      <View style={styles.inventoryUpdateValues}>
        <View style={styles.inventoryUpdateValueBlock}>
          <Text style={[styles.inventoryUpdateValueLabel, { fontSize: responsiveFont(7) }]}>FIELD</Text>
          <Text style={[styles.inventoryUpdateValue, { fontSize: responsiveFont(9) }]}>
            {inventoryFieldLabel(pending.field)}
          </Text>
        </View>
        <View style={styles.inventoryUpdateValueBlock}>
          <Text style={[styles.inventoryUpdateValueLabel, { fontSize: responsiveFont(7) }]}>BEFORE</Text>
          <Text style={[styles.inventoryUpdateValue, { fontSize: responsiveFont(9) }]}>
            {formatInventoryNumber(pending.field, currentValue)}
          </Text>
        </View>
        <View style={styles.inventoryUpdateValueBlock}>
          <Text style={[styles.inventoryUpdateValueLabel, { fontSize: responsiveFont(7) }]}>PROPOSED</Text>
          <Text style={[styles.inventoryUpdateProposed, { fontSize: responsiveFont(10) }]}>
            {formatInventoryNumber(pending.field, pending.value)}
          </Text>
        </View>
      </View>
      <Text style={[styles.inventoryUpdateNote, { fontSize: responsiveFont(8), lineHeight: 12 }]}>
        This works for imported, incomplete, and review-flagged records. A Books review, if related, still needs its own confirmation.
      </Text>
      <View style={styles.inventoryUpdateActions}>
        <Pressable
          accessibilityLabel="Leave the proposed inventory update unchanged"
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.inventoryUpdateCancel, pressed && styles.inventoryUpdatePressed, busy && styles.inventoryUpdateDisabled]}
        >
          <Text style={[styles.inventoryUpdateCancelText, { fontSize: responsiveFont(8) }]}>LEAVE UNCHANGED</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Save the proposed inventory update"
          accessibilityRole="button"
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [styles.inventoryUpdateConfirm, pressed && styles.inventoryUpdatePressed, busy && styles.inventoryUpdateDisabled]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.background} size="small" />
          ) : (
            <Text style={[styles.inventoryUpdateConfirmText, { fontSize: responsiveFont(8) }]}>SAVE UPDATE</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

function mergeConversationMessage(
  current: AssistantConversationMessage[],
  next: AssistantConversationMessage,
) {
  const withoutWelcome =
    next.role === 'user'
      ? current.filter((message) => message.id !== 'flip-welcome')
      : current;
  const existingIndex = withoutWelcome.findIndex((message) => message.id === next.id);
  const optimisticIndex =
    existingIndex < 0 && next.role === 'user'
      ? withoutWelcome.findIndex((message) => {
        if (
          message.role !== 'user' ||
          !message.id.startsWith(OPTIMISTIC_USER_MESSAGE_PREFIX) ||
          message.content !== next.content
        ) {
          return false;
        }

        const optimisticCreatedAt = Date.parse(message.createdAt);
        const persistedCreatedAt = Date.parse(next.createdAt);
        return (
          Number.isFinite(optimisticCreatedAt) &&
          Number.isFinite(persistedCreatedAt) &&
          Math.abs(persistedCreatedAt - optimisticCreatedAt) <=
          OPTIMISTIC_MESSAGE_MATCH_WINDOW_MS
        );
      })
      : -1;
  const matchedIndex = existingIndex >= 0 ? existingIndex : optimisticIndex;
  const nextIncludesAdvisory = Object.prototype.hasOwnProperty.call(next, 'advisory');
  const merged =
    matchedIndex >= 0
      ? withoutWelcome.map((message, index) => {
          if (index !== matchedIndex) return message;
          return nextIncludesAdvisory || !message.advisory
            ? next
            : { ...next, advisory: message.advisory };
        })
      : [...withoutWelcome, next];

  return merged.sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function mergeConversationMessages(
  current: AssistantConversationMessage[],
  next: AssistantConversationMessage[],
) {
  return next.reduce(mergeConversationMessage, current);
}

export type FlipAssistantPresentation = 'inline' | 'overlay';

export function FlipConversationalAssistantPanel({
  currentRoute,
  startsExpanded = false,
  fillAvailableHeight = false,
  onNavigate,
  onOpenSellerOperations,
  onExpandedChange,
  overlayConversationMaxHeight,
  presentation = 'inline',
}: {
  currentRoute?: string | null;
  startsExpanded?: boolean;
  fillAvailableHeight?: boolean;
  onNavigate: (route: AssistantRoute) => void;
  onOpenSellerOperations: () => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  overlayConversationMaxHeight?: number;
  presentation?: FlipAssistantPresentation;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const responsiveLayout = useResponsiveLayout();
  const responsiveFont = (size: number, factor?: number) =>
    responsiveLayout.responsiveFont(Math.max(size, 11), factor);

  const { user } = useKeepFlipAuth();
  const [command, setCommand] = useState('');
  const [isExpanded, setIsExpanded] = useState(startsExpanded);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([]);
  const [profile, setProfile] = useState<AssistantProfileContext | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryItemsTruncated, setInventoryItemsTruncated] = useState(false);
  const [pendingInventoryUpdate, setPendingInventoryUpdate] = useState<PendingInventoryUpdate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const conversationContentHeightRef = useRef(0);
  const conversationOffsetRef = useRef(0);
  const shouldRestoreHistoryScrollRef = useRef(false);
  const canLoadOlderOnScrollRef = useRef(false);
  const isOverlay = presentation === 'overlay';
  const userId = user?.$id ?? null;
  const conversationId = useMemo(
    () => (userId ? defaultAssistantConversationId(userId) : null),
    [userId],
  );
  const displayName = user?.name?.trim() || null;
  const {
    markActivity,
    react,
    reactionActive,
    setMode,
    state,
  } = useFlipCompanion();
  const { startGuide } = useFlipGuidance();
  const isInteractionLocked = isWorking || reactionActive || state === 'speaking';
  const isInputLocked = isInteractionLocked || pendingInventoryUpdate !== null;

  const setAssistantExpanded = useCallback((nextValue: boolean) => {
    setIsExpanded(nextValue);
    onExpandedChange?.(nextValue);
  }, [onExpandedChange]);

  const collapseAssistant = useCallback(() => {
    markActivity();
    setIsMemoryOpen(false);
    setAssistantExpanded(false);
  }, [markActivity, setAssistantExpanded]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open'),
    [tasks],
  );
  const visibleMessages = messages;
  const latestMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const hasUserMessage = messages.some((entry) => entry.role === 'user');

  const loadWorkspace = useCallback(async () => {
    if (!userId || !conversationId) {
      setTasks([]);
      setMessages([]);
      setProfile(null);
      setInventoryItems([]);
      setInventoryItemsTruncated(false);
      setPendingInventoryUpdate(null);
      setHasOlderMessages(false);
      setHistoryError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const [taskResult, conversationResult, profileResult, inventoryResult] =
      await Promise.allSettled([
        listAssistantTasks(userId),
        listAssistantConversation(
          userId,
          ASSISTANT_CONVERSATION_PAGE_SIZE,
          conversationId,
        ),
        getResellerBuyRules(userId, displayName),
        listInventoryItemsForAssistant(userId),
      ]);

    if (taskResult.status === 'fulfilled') {
      setTasks(taskResult.value);
      void Promise.all(
        taskResult.value.map((task) =>
          scheduleTaskReminder(task, false).catch(() => undefined),
        ),
      );
    } else {
      setError(
        taskResult.reason instanceof Error
          ? taskResult.reason.message
          : 'Flip could not load your open work yet.',
      );
    }
    if (conversationResult.status === 'fulfilled') {
      setMessages((current) =>
        mergeConversationMessages(current, conversationResult.value),
      );
      setHasOlderMessages(
        conversationResult.value.length >= ASSISTANT_CONVERSATION_PAGE_SIZE,
      );
      setHistoryError(null);
    }
    if (profileResult.status === 'fulfilled') {
      setProfile(profileContextFromRules(profileResult.value));
    }
    if (inventoryResult.status === 'fulfilled') {
      setInventoryItems(inventoryResult.value.items);
      setInventoryItemsTruncated(inventoryResult.value.truncated);
    } else {
      // Inventory is useful context but should not prevent Flip from loading
      // tasks and conversation history when the optional item fields are not
      // configured in Appwrite yet.
      setInventoryItems([]);
      setInventoryItemsTruncated(false);
    }
    setIsLoading(false);
  }, [conversationId, displayName, userId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadWorkspace(), 0);
    return () => clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    if (!userId || !conversationId) return;
    return subscribeToAssistantConversation({
      conversationId,
      onMessage: (nextMessage) => {
        setMessages((current) => mergeConversationMessage(current, nextMessage));
      },
      ownerId: userId,
    });
  }, [conversationId, userId]);

  useEffect(() => {
    if (!userId || isLoading || messages.length > 0) return;
    const name = displayName ? ` ${displayName}` : '';
    const ruleHint = profile?.minimumRoiPercent != null
      ? ` I know you're protecting a ${profile.minimumRoiPercent}% ROI floor.`
      : '';
    const taskHint = openTasks.length
      ? ` I see ${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'} when you're ready.`
      : '';
    setMessages([
      {
        id: 'flip-welcome',
        role: 'assistant',
        content: `Hey${name}! I'm Flip, your resale copilot. Tell me what you're sourcing, listing, or trying to untangle.${ruleHint}${taskHint}`,
        createdAt: new Date().toISOString(),
      },
    ]);
    const wasAsleep = markActivity();
    if (!wasAsleep) {
      react('greeting');
    }
  }, [
    displayName,
    isLoading,
    messages.length,
    openTasks.length,
    profile?.minimumRoiPercent,
    markActivity,
    react,
    userId,
  ]);

  useEffect(() => {
    if (isExpanded) {
      markActivity();
    }
  }, [isExpanded, markActivity]);

  useEffect(() => {
    if (!isExpanded || !latestMessageId) return;
    const frame = requestAnimationFrame(() => {
      conversationScrollRef.current?.scrollToEnd({
        animated: visibleMessages.length > 1,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isExpanded, latestMessageId, visibleMessages.length]);

  const loadOlderMessages = useCallback(async () => {
    if (
      !userId ||
      !conversationId ||
      !hasOlderMessages ||
      isLoadingOlderMessages
    ) {
      return;
    }

    const oldestPersistedMessage = messages.find(
      (message) =>
        message.id !== 'flip-welcome' &&
        !message.id.startsWith(OPTIMISTIC_USER_MESSAGE_PREFIX),
    );
    if (!oldestPersistedMessage) {
      setHasOlderMessages(false);
      return;
    }

    setIsLoadingOlderMessages(true);
    setHistoryError(null);
    shouldRestoreHistoryScrollRef.current = true;
    const previousContentHeight = conversationContentHeightRef.current;

    try {
      const page = await listOlderAssistantConversation({
        conversationId,
        oldestMessageId: oldestPersistedMessage.id,
        ownerId: userId,
      });
      if (!page.messages.length) {
        shouldRestoreHistoryScrollRef.current = false;
        setHasOlderMessages(false);
        return;
      }

      conversationContentHeightRef.current = previousContentHeight;
      setMessages((current) => mergeConversationMessages(current, page.messages));
      setHasOlderMessages(page.hasMore);
    } catch (historyLoadError) {
      shouldRestoreHistoryScrollRef.current = false;
      setHistoryError(
        historyLoadError instanceof Error
          ? historyLoadError.message
          : 'Earlier messages could not be loaded.',
      );
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    conversationId,
    hasOlderMessages,
    isLoadingOlderMessages,
    messages,
    userId,
  ]);

  const workspaceContext = (): AssistantWorkspaceContext => ({
    currentRoute: currentRoute ?? null,
    displayName,
    inventoryItems: inventoryItems.map((item) => ({
      acquisitionCostCents:
        item.acquisitionCost == null ? null : Math.round(item.acquisitionCost * 100),
      brand: item.brand,
      category: item.category,
      condition: item.condition,
      estimatedValueCents:
        item.estimatedValue == null ? null : Math.round(item.estimatedValue * 100),
      id: item.id,
      inventoryCostCentsOnHand:
        item.inventoryCostOnHand == null
          ? null
          : Math.round(item.inventoryCostOnHand * 100),
      isListed: item.isListed,
      model: item.model,
      quantityOnHand: item.quantityOnHand,
      quantityPurchased: item.quantityPurchased,
      resaleStatus: item.resaleStatus,
      resaleTypicalDays: item.resaleTypicalDays,
      sku: item.sku,
      status: item.status,
      title: item.title,
    })),
    inventoryItemsTruncated,
    openTasks: openTasks.slice(0, 12).map(({ title, taskType, dueAt }) => ({
      title,
      taskType,
      dueAt,
    })),
    profile,
  });

  const applyAction = async (action: AssistantAction) => {
    if (!userId) return;
    if (action.type === 'navigate') {
      onNavigate(action.route);
      if (isOverlay) collapseAssistant();
      return;
    }
    if (action.type === 'open_seller_operations') {
      onOpenSellerOperations();
      if (isOverlay) collapseAssistant();
      return;
    }
    if (action.type === 'start_guide') {
      Keyboard.dismiss();
      startGuide(action.guideId);
      if (isOverlay) collapseAssistant();
      return;
    }
    if (action.type === 'update_inventory_number') {
      const item = await getInventoryItem(userId, action.itemId);
      setInventoryItems((current) => {
        const alreadyLoaded = current.some((entry) => entry.id === item.id);
        return alreadyLoaded
          ? current.map((entry) => (entry.id === item.id ? item : entry))
          : [item, ...current];
      });
      setPendingInventoryUpdate({ ...action, item });
      return;
    }
    if (action.type !== 'create_task') return;

    const task = await createAssistantTask({
      ownerId: userId,
      title: action.title,
      taskType: action.taskType,
      dueAt: validDueAt(action.dueAt),
      source: 'assistant',
    });
    setTasks((current) => [task, ...current]);
    if (task.taskType === 'reminder' && task.dueAt) {
      await scheduleTaskReminder(task, true).catch(() => undefined);
    }
  };

  const sendMessage = async (value = command) => {
    const input = value.trim();
    if (!input || !userId || isInputLocked) return;
    const directCommand = parseAssistantCommand(input);
    const directNavigation =
      directCommand.type === 'navigate' ? directCommand : null;
    const initialReaction = isFlipQuestionOrTask(input)
      ? 'aha'
      : 'acknowledge';

    const userMessage: AssistantConversationMessage = {
      id: `${OPTIMISTIC_USER_MESSAGE_PREFIX}${Date.now()}`,
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };
    const history = messages;
    setMessages((current) => [...current, userMessage]);
    setCommand('');
    setError(null);
    setIsWorking(true);
    setIsReplying(false);
    markActivity();
    setMode('speaking');
    react(initialReaction);

    try {
      // Navigation is an app command. Honor it immediately instead of making
      // the seller wait for an AI response or accepting a nearby route the
      // model may have guessed.
      if (directNavigation) {
        await applyAction(directNavigation);
      }
      const reply = await runKeepFlipAssistant({
        conversationId: conversationId ?? undefined,
        message: input,
        history,
        context: workspaceContext(),
        ownerId: userId,
      });
      if (!directNavigation) {
        await applyAction(reply.action);
      }
      if (reply.persistedMessages.length) {
        setMessages((current) =>
          mergeConversationMessages(
            current.filter((entry) => entry.id !== userMessage.id),
            reply.persistedMessages,
          ),
        );
      } else {
        const assistantMessage: AssistantConversationMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply.reply,
          createdAt: new Date().toISOString(),
          advisory: reply.advisory ?? null,
        };
        setMessages((current) => mergeConversationMessage(current, assistantMessage));
      }
      setIsReplying(true);
      await createAssistantActionRun({
        ownerId: userId,
        actionType: 'conversation',
        input: JSON.stringify({ message: input }),
        output: JSON.stringify({
          reply: reply.reply,
          action: reply.action,
          source: reply.source,
        }),
      }).catch(() => undefined);
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.assistantRequestCompleted, {
        action_type: reply.action.type,
        source: reply.source,
      });
      if (reply.reaction !== initialReaction) {
        react(reply.reaction);
      }
    } catch (runError) {
      const detail =
        runError instanceof Error
          ? runError.message
          : 'Flip could not complete that request.';
      setError(detail);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `I hit a snag: ${detail} If you want, try saying that another way and I'll pick it back up.`,
          createdAt: new Date().toISOString(),
        },
      ]);
      react('confused');
    } finally {
      setIsWorking(false);
    }
  };

  const confirmInventoryUpdate = async () => {
    if (!userId || !pendingInventoryUpdate || isWorking) return;
    const pending = pendingInventoryUpdate;
    setIsWorking(true);
    setError(null);
    setIsReplying(false);
    markActivity();
    setMode('speaking');
    react('aha');

    try {
      const updated = await updateInventoryItemNumber({
        field: pending.field,
        itemId: pending.itemId,
        ownerId: userId,
        value: pending.value,
      });
      setInventoryItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setPendingInventoryUpdate(null);
      const booksFollowUp =
        pending.field === 'acquisition_cost_cents' ||
        pending.field === 'inventory_cost_cents_on_hand'
          ? ' If this is tied to a Books cost review, Books still needs its own confirmation.'
          : '';
      setMessages((current) => [
        ...current,
        {
          id: `assistant-inventory-update-${Date.now()}`,
          role: 'assistant',
          content: `Done - updated “${updated.title}”: ${inventoryFieldLabel(pending.field)} is now ${formatInventoryNumber(pending.field, inventoryItemNumber(updated, pending.field))}.${booksFollowUp}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      await createAssistantActionRun({
        ownerId: userId,
        actionType: 'update_inventory_number',
        input: JSON.stringify({
          field: pending.field,
          itemId: pending.itemId,
          value: pending.value,
        }),
        output: JSON.stringify({
          field: pending.field,
          itemId: updated.id,
          value: pending.value,
        }),
      }).catch(() => undefined);
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.inventoryUpdated, {
        field: pending.field,
      });
      react('celebrate');
    } catch (updateError) {
      const detail =
        updateError instanceof Error
          ? updateError.message
          : 'That inventory number could not be updated.';
      setError(detail);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-inventory-error-${Date.now()}`,
          role: 'assistant',
          content: `I left the inventory record unchanged because the update did not complete: ${detail}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      react('confused');
    } finally {
      setIsWorking(false);
    }
  };

  const cancelInventoryUpdate = () => {
    if (!pendingInventoryUpdate || isWorking) return;
    setPendingInventoryUpdate(null);
    setError(null);
    markActivity();
    setMessages((current) => [
      ...current,
      {
        id: `assistant-inventory-cancel-${Date.now()}`,
        role: 'assistant',
        content: 'Understood - I left that inventory number unchanged.',
        createdAt: new Date().toISOString(),
      },
    ]);
    react('acknowledge');
  };

  const finishTask = async (task: AssistantTask) => {
    if (!userId || isInputLocked) return;
    setIsWorking(true);
    setError(null);
    setIsReplying(false);
    markActivity();
    setMode('speaking');
    react('aha');
    try {
      const completed = await completeAssistantTask(userId, task.id);
      await cancelKeepFlipTaskReminder(task.id).catch(() => undefined);
      setTasks((current) =>
        current.map((entry) => (entry.id === completed.id ? completed : entry)),
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-task-${Date.now()}`,
          role: 'assistant',
          content: `Nice - "${task.title}" is marked complete. What should we tackle next?`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setIsReplying(true);
      trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.taskCompleted);
      react('celebrate');
    } catch (finishError) {
      const detail =
        finishError instanceof Error
          ? finishError.message
          : 'That task could not be completed.';
      setError(detail);
      react('confused');
    } finally {
      setIsReplying(false);
      setIsWorking(false);
    }
  };

  const profileSummary = profile?.minimumRoiPercent != null
    ? `${profile.minimumRoiPercent}% ROI floor`
    : null;
  const presenceLabel = state === 'goingtosleep'
    ? 'POWERING DOWN'
    : state === 'wakingup'
      ? 'WAKING UP'
      : state === 'sleeping'
        ? 'ASLEEP'
        : state === 'speaking'
          ? 'SPEAKING'
          : 'READY';

  return (
    <View
      style={[
        styles.surface,
        fillAvailableHeight && isExpanded && styles.fillAvailableHeight,
        isOverlay && styles.overlaySurface,
        isOverlay && isExpanded && styles.overlaySurfaceExpanded,
        isOverlay && !isExpanded && styles.overlaySurfaceCollapsed,
      ]}>
      {!isExpanded ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <Pressable
            accessibilityHint={
              isOverlay
                ? 'Tap to open a conversation with Flip. Drag the minimized button to move it.'
                : 'Opens a conversation with Flip.'
            }
            accessibilityLabel="Talk to Flip"
            accessibilityRole="button"
            onPress={() => {
              markActivity();
              setAssistantExpanded(true);
            }}
            style={({ pressed }) => [
              styles.collapsedBar,
              isOverlay && styles.overlayCollapsedBar,
              pressed && styles.collapsedBarPressed,
            ]}>
            <View
              style={[
                styles.collapsedAvatar,
                isOverlay && styles.overlayCollapsedAvatar,
              ]}>
              <FlipCompanion size={isOverlay ? 38 : 46} />
              {isOverlay ? <View style={styles.overlayStatusDot} /> : null}
            </View>
            {!isOverlay ? (
              <>
                <View style={styles.collapsedCopy}>
                  <View style={styles.searchMeta}>
                    <Text style={[styles.searchLabel, { fontSize: responsiveFont(8) }]}>FLIP ASSISTANT</Text>
                    <View style={styles.onlineDot} />
                    <Text style={[styles.onlineText, { fontSize: responsiveFont(7) }]}>{presenceLabel}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.searchPlaceholder}>
                    {"Tell Flip what you're working on..."}
                  </Text>
                </View>
                <View style={styles.chevronButton}>
                  <IconSymbol color={theme.colors.scannerCyan} name="chevron.right" size={16} />
                </View>
              </>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(140)}
          style={[
            styles.expandedContent,
            fillAvailableHeight && styles.fillAvailableHeightExpandedContent,
            isOverlay && styles.overlayExpandedContent,
          ]}>
          <View style={[styles.heading, isOverlay && styles.overlayHeading]}>
            <View style={styles.headingAvatar}>
              <FlipCompanion size={46} />
            </View>
            <View style={styles.headingCopy}>
              <View style={styles.searchMeta}>
                <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP ASSISTANT</Text>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineText, { fontSize: responsiveFont(7) }]}>{presenceLabel}</Text>
              </View>
              <Text style={[styles.title, { fontSize: responsiveFont(17) }]}>Talk it through with Flip</Text>
            </View>
            <View style={styles.headingActions}>
              <Pressable
                accessibilityLabel={isMemoryOpen ? 'Hide Flip memories' : 'Show Flip memories'}
                accessibilityRole="button"
                accessibilityState={{ expanded: isMemoryOpen }}
                onPress={() => {
                  markActivity();
                  setIsMemoryOpen((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.menuButton,
                  isMemoryOpen && styles.menuButtonOpen,
                  pressed && styles.menuButtonPressed,
                ]}>
                <IconSymbol color={theme.colors.scannerCyan} name="ellipsis" size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel="Collapse Flip assistant"
                accessibilityRole="button"
                hitSlop={8}
                onPress={collapseAssistant}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}>
                <IconSymbol color={theme.colors.textMuted} name="xmark" size={17} />
              </Pressable>
            </View>
          </View>

          {!userId ? (
            <Text style={styles.empty}>Sign in so Flip can remember your workspace.</Text>
          ) : (
            <>
              <ScrollView
                accessibilityLabel="Conversation with Flip"
                contentContainerStyle={styles.conversationContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                onContentSizeChange={(_width, contentHeight) => {
                  const previousContentHeight = conversationContentHeightRef.current;
                  conversationContentHeightRef.current = contentHeight;
                  if (!shouldRestoreHistoryScrollRef.current) return;

                  shouldRestoreHistoryScrollRef.current = false;
                  const nextOffset = conversationOffsetRef.current + Math.max(
                    0,
                    contentHeight - previousContentHeight,
                  );
                  conversationOffsetRef.current = nextOffset;
                  requestAnimationFrame(() => {
                    conversationScrollRef.current?.scrollTo({
                      animated: false,
                      y: nextOffset,
                    });
                  });
                }}
                onScroll={(event) => {
                  const offsetY = event.nativeEvent.contentOffset.y;
                  conversationOffsetRef.current = offsetY;
                  if (
                    offsetY <= 24 &&
                    canLoadOlderOnScrollRef.current &&
                    hasOlderMessages &&
                    !isLoadingOlderMessages
                  ) {
                    canLoadOlderOnScrollRef.current = false;
                    void loadOlderMessages();
                  }
                }}
                onScrollBeginDrag={() => {
                  canLoadOlderOnScrollRef.current = true;
                }}
                ref={conversationScrollRef}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={isOverlay}
                style={[
                  styles.conversation,
                  fillAvailableHeight && styles.fillAvailableHeightConversation,
                  isOverlay && styles.overlayConversation,
                  isOverlay && overlayConversationMaxHeight != null
                    ? { maxHeight: overlayConversationMaxHeight }
                    : null,
                ]}>
                {historyError ? (
                  <Pressable
                    accessibilityLabel="Retry loading earlier Flip messages"
                    accessibilityRole="button"
                    onPress={() => void loadOlderMessages()}
                    style={({ pressed }) => [
                      styles.historyLoadButton,
                      pressed && styles.historyLoadButtonPressed,
                    ]}>
                    <Text style={[styles.historyLoadText, { fontSize: responsiveFont(8) }]}>
                      {"EARLIER MESSAGES COULDN'T LOAD - TAP TO RETRY"}
                    </Text>
                  </Pressable>
                ) : isLoadingOlderMessages ? (
                  <View style={styles.historyLoading}>
                    <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
                    <Text style={[styles.historyLoadText, { fontSize: responsiveFont(8) }]}>
                      LOADING EARLIER MESSAGES...
                    </Text>
                  </View>
                ) : hasOlderMessages ? (
                  <Pressable
                    accessibilityLabel="Load earlier Flip messages"
                    accessibilityRole="button"
                    onPress={() => void loadOlderMessages()}
                    style={({ pressed }) => [
                      styles.historyLoadButton,
                      pressed && styles.historyLoadButtonPressed,
                    ]}>
                    <Text style={[styles.historyLoadText, { fontSize: responsiveFont(8) }]}>
                      LOAD EARLIER MESSAGES
                    </Text>
                  </Pressable>
                ) : null}
                {isLoading && !visibleMessages.length ? (
                  <View style={styles.loadingConversation}>
                    <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
                    <Text style={[styles.typingText, { fontSize: responsiveFont(10) }]}>Flip is checking your workspace...</Text>
                  </View>
                ) : null}
                {visibleMessages.map((entry) => (
                  <Animated.View
                    entering={FadeInDown.duration(180)}
                    key={entry.id}
                    style={[
                      styles.messageRow,
                      entry.role === 'user' && styles.messageRowUser,
                    ]}>
                    {entry.role === 'assistant' ? (
                      <Image
                        accessibilityLabel="Flip"
                        contentFit="cover"
                        source={FLIP_MASCOT_IMAGE}
                        style={styles.messageAvatar}
                      />
                    ) : null}
                    {entry.role === 'assistant' ? (
                      <View style={styles.assistantMessageStack}>
                        <View style={[styles.messageBubble, styles.assistantBubble]}>
                          <Text selectable style={[styles.messageText, { fontSize: responsiveFont(14), lineHeight: 21 }]}>
                            {entry.content}
                          </Text>
                        </View>
                        {entry.advisory ? (
                          <AdvisoryCard
                            advisory={entry.advisory}
                            responsiveFont={responsiveFont}
                            styles={styles}
                          />
                        ) : null}
                      </View>
                    ) : (
                      <View style={[styles.messageBubble, styles.userBubble]}>
                        <Text selectable style={[styles.messageText, { fontSize: responsiveFont(14), lineHeight: 21 }]}>
                          {entry.content}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                ))}
                {isInteractionLocked ? (
                  <Animated.View entering={FadeIn.duration(140)} style={styles.typingRow}>
                    <Image
                      accessibilityLabel="Flip"
                      contentFit="cover"
                      source={FLIP_MASCOT_IMAGE}
                      style={styles.messageAvatar}
                    />
                    <View style={styles.typingBubble}>
                      <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
                      <Text style={[styles.typingText, { fontSize: responsiveFont(10) }]}>
                        {isReplying ? 'Flip is speaking...' : 'Flip is thinking...'}
                      </Text>
                    </View>
                  </Animated.View>
                ) : null}
              </ScrollView>

              {pendingInventoryUpdate ? (
                <PendingInventoryUpdateCard
                  busy={isWorking}
                  onCancel={cancelInventoryUpdate}
                  onConfirm={() => void confirmInventoryUpdate()}
                  pending={pendingInventoryUpdate}
                  responsiveFont={responsiveFont}
                  styles={styles}
                />
              ) : null}

              {!hasUserMessage && !isInputLocked ? (
                <View style={styles.promptRow}>
                  {[
                    'What should I work on next?',
                    'Help me pressure-test a buy',
                    'Walk me through updating inventory',
                    'Remind me to list something',
                  ].map((prompt) => (
                    <Pressable
                      accessibilityRole="button"
                      key={prompt}
                      onPress={() => {
                        markActivity();
                        setCommand(prompt);
                        void sendMessage(prompt);
                      }}
                      style={({ pressed }) => [
                        styles.promptChip,
                        pressed && styles.promptChipPressed,
                      ]}>
                      <Text style={[styles.promptText, { fontSize: responsiveFont(9) }]}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {isMemoryOpen ? (
                <Animated.View entering={FadeInDown.duration(160)} style={styles.memoryStrip}>
                  <View style={styles.memoryCopy}>
                    <Text style={[styles.memoryLabel, { fontSize: responsiveFont(7) }]}>FLIP REMEMBERS</Text>
                    <Text style={[styles.memoryText, { fontSize: responsiveFont(10) }]}>
                      {openTasks.length
                        ? `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}${profileSummary ? ` - ${profileSummary}` : ''}`
                        : profileSummary || 'Your queue is clear'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Refresh Flip workspace memory"
                    accessibilityRole="button"
                    disabled={isLoading || isInputLocked}
                    onPress={() => {
                      markActivity();
                      void loadWorkspace();
                    }}
                    style={({ pressed }) => [
                      styles.refreshButton,
                      pressed && styles.refreshButtonPressed,
                    ]}>
                    <IconSymbol
                      color={theme.colors.textMuted}
                      name="arrow.clockwise"
                      size={14}
                    />
                  </Pressable>
                </Animated.View>
              ) : null}

              {openTasks.length && !isOverlay ? (
                <View style={styles.taskSection}>
                  <View style={styles.taskHeader}>
                    <Text style={[styles.taskLabel, { fontSize: responsiveFont(8) }]}>OPEN WORK</Text>
                    <Text style={[styles.taskHint, { fontSize: responsiveFont(8) }]}>Ask Flip to add or reprioritize</Text>
                  </View>
                  <View style={styles.taskList}>
                    {openTasks.slice(0, 4).map((task) => (
                      <KeepFlipControlRow
                        key={task.id}
                        accent={task.taskType === 'reminder' ? 'cyan' : 'gold'}
                        actionLabel="DONE"
                        description={task.dueAt ? dueLabel(task.dueAt) : 'No due date'}
                        icon={task.taskType === 'reminder' ? 'envelope.fill' : 'checkmark.shield.fill'}
                        label={task.title}
                        onPress={() => void finishTask(task)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}

          {error ? <Text style={[styles.error, { fontSize: responsiveFont(10), lineHeight: 14 }]}>{error}</Text> : null}

          {userId ? (
            <View style={styles.inputRow}>
              <View style={styles.inputShell}>
                <View
                  accessibilityLabel="Flip"
                  accessible
                  style={styles.inputAvatar}>
                  <FlipCompanion size={25} />
                </View>
                <TextInput
                  accessibilityLabel="Message Flip"
                  autoCapitalize="sentences"
                  autoFocus
                  editable={!isInputLocked}
                  onChangeText={(value) => {
                    markActivity();
                    setCommand(value);
                  }}
                  onSubmitEditing={() => void sendMessage()}
                  onFocus={markActivity}
                  placeholder="Tell Flip what you need..."
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="send"
                  style={styles.input}
                  value={command}
                />
              </View>
              <Pressable
                accessibilityLabel="Send message to Flip"
                accessibilityRole="button"
                disabled={!command.trim() || isInputLocked}
                hitSlop={4}
                onPress={() => void sendMessage()}
                style={({ pressed }) => [
                  styles.sendButton,
                  (!command.trim() || isInputLocked) && styles.sendButtonDisabled,
                  pressed && styles.sendButtonPressed,
                ]}>
                {isInteractionLocked ? (
                  <ActivityIndicator color={theme.colors.background} size="small" />
                ) : (
                  <IconSymbol color={theme.colors.background} name="paperplane.fill" size={16} />
                )}
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

function dueLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Scheduled reminder';
  return `Due ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight } = responsiveLayout;
  const responsiveFont = (size: number, factor?: number) =>
    responsiveLayout.responsiveFont(Math.max(size, 11), factor);
  const staticStyles = StyleSheet.create({
    surface: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.card,
    },
    fillAvailableHeight: {
      flex: 1,
      minHeight: 0,
    },
    fillAvailableHeightExpandedContent: {
      flex: 1,
      minHeight: 0,
    },
    fillAvailableHeightConversation: {
      flex: 1,
      minHeight: 0,
    },
    overlaySurface: {
      width: '100%',
      alignSelf: 'flex-end',
      borderRadius: 18,
      backgroundColor: theme.colors.card,
      boxShadow: '0 16px 36px rgba(0, 0, 0, 0.42), 0 0 18px rgba(88, 223, 232, 0.12)',
      elevation: 8,
    },
    overlaySurfaceExpanded: {
      flex: 1,
      minHeight: 0,
    },
    overlaySurfaceCollapsed: {
      width: '100%',
      height: '100%',
      borderRadius: 999,
      opacity: 0.74,
    },
    collapsedBar: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    overlayCollapsedBar: {
      width: '100%',
      height: '100%',
      minHeight: 0,
      justifyContent: 'center',
      gap: 0,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    collapsedBarPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    collapsedAvatar: {
      width: 48,
      height: 48,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 24,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    overlayCollapsedAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    overlayStatusDot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 8,
      height: 8,
      borderWidth: 1,
      borderColor: theme.colors.background,
      borderRadius: 4,
      backgroundColor: theme.colors.scannerCyan,
    },
    collapsedCopy: { flex: 1, minWidth: 0, gap: 4 },
    searchMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    searchLabel: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.4,
    },
    onlineDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.scannerCyan,
    },
    onlineText: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    searchPlaceholder: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
    chevronButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    expandedContent: { gap: 12, padding: 14 },
    overlayExpandedContent: {
      flex: 1,
      minHeight: 0,
    },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // The always-visible navigation trigger occupies the top-right corner of
    // the overlay. Keep the assistant actions out of its hit area when open.
    overlayHeading: { paddingRight: 58 },
    headingAvatar: {
      width: 46,
      height: 46,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 23,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    headingCopy: { flex: 1, gap: 3 },
    headingActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    title: { color: theme.colors.cream, fontSize: 17, fontWeight: '900' },
    subtitle: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 14 },
    menuButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    menuButtonOpen: {
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    menuButtonPressed: { opacity: 0.72 },
    closeButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.cardSoft,
    },
    closeButtonPressed: { backgroundColor: theme.colors.cardSoft },
    conversation: {
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.cardSoft,
    },
    conversationContent: {
      gap: 9,
      padding: 10,
    },
    overlayConversation: {
      flex: 1,
      minHeight: 0,
    },
    historyLoadButton: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      borderCurve: 'continuous',
      paddingHorizontal: 9,
      paddingVertical: 6,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    historyLoadButtonPressed: { opacity: 0.68 },
    historyLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 4,
    },
    historyLoadText: {
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    loadingConversation: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 7,
    },
    messageRowUser: { justifyContent: 'flex-end' },
    messageAvatar: {
      width: 24,
      height: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 12,
      borderCurve: 'continuous',
    },
    messageBubble: {
      maxWidth: '86%',
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 13,
      borderCurve: 'continuous',
    },
    assistantMessageStack: {
      maxWidth: '86%',
      minWidth: 0,
      gap: 6,
    },
    assistantBubble: {
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderBottomLeftRadius: 4,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    userBubble: {
      borderBottomRightRadius: 4,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    messageText: {
      color: theme.colors.text,
      fontSize: 11,
      lineHeight: 16,
    },
    advisoryCard: {
      gap: 7,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
      boxShadow: '0 3px 10px rgba(0, 0, 0, 0.18)',
    },
    advisoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    advisoryLabel: {
      color: theme.colors.goldBright,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    advisoryConfidence: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '800',
      letterSpacing: 0.7,
    },
    advisoryRecommendation: {
      color: theme.colors.cream,
      fontSize: 10,
      fontWeight: '800',
    },
    advisoryEvidence: {
      gap: 4,
      paddingTop: 2,
    },
    advisoryEvidenceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    advisoryEvidenceLabel: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 8,
    },
    advisoryEvidenceValue: {
      flexShrink: 1,
      color: theme.colors.text,
      fontSize: 8,
      fontWeight: '800',
      textAlign: 'right',
    },
    advisoryNextAction: {
      gap: 2,
      paddingTop: 5,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dividerStrong,
    },
    advisoryNextLabel: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1,
    },
    advisoryNextText: {
      color: theme.colors.text,
      fontSize: 9,
      fontWeight: '700',
    },
    advisoryUnknowns: {
      color: theme.colors.textMuted,
      fontSize: 8,
      fontStyle: 'italic',
    },
    inventoryUpdateCard: {
      gap: 9,
      padding: 11,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 13,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
      boxShadow: '0 5px 16px rgba(0, 0, 0, 0.22)',
    },
    inventoryUpdateHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    inventoryUpdateCopy: { flex: 1, gap: 3 },
    inventoryUpdateLabel: {
      color: theme.colors.goldBright,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    inventoryUpdateTitle: {
      color: theme.colors.cream,
      fontSize: 12,
      fontWeight: '900',
    },
    inventoryUpdateBadge: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    inventoryUpdateValues: {
      flexDirection: 'row',
      gap: 8,
    },
    inventoryUpdateValueBlock: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    inventoryUpdateValueLabel: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    inventoryUpdateValue: {
      color: theme.colors.text,
      fontSize: 9,
      fontWeight: '700',
    },
    inventoryUpdateProposed: {
      color: theme.colors.goldBright,
      fontSize: 10,
      fontWeight: '900',
    },
    inventoryUpdateNote: {
      color: theme.colors.textMuted,
      fontSize: 8,
      lineHeight: 12,
    },
    inventoryUpdateActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 7,
    },
    inventoryUpdateCancel: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 34,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 9,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.cardSoft,
    },
    inventoryUpdateCancelText: {
      color: theme.colors.textMuted,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    inventoryUpdateConfirm: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 34,
      minWidth: 104,
      paddingHorizontal: 11,
      borderRadius: 9,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.goldBright,
    },
    inventoryUpdateConfirmText: {
      color: theme.colors.textOnAccent,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    inventoryUpdatePressed: { opacity: 0.72 },
    inventoryUpdateDisabled: { opacity: 0.45 },
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    typingBubble: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    typingText: { color: theme.colors.textMuted, fontSize: 10 },
    promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    promptChip: {
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 10,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    promptChipPressed: { backgroundColor: theme.colors.iconSurfaceGold },
    promptText: { color: theme.colors.goldMuted, fontSize: 9, fontWeight: '700' },
    inputRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    inputShell: {
      minHeight: 48,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.surfaceInset,
    },
    inputAvatar: {
      width: 25,
      height: 25,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: 13,
      borderCurve: 'continuous',
    },
    input: {
      minHeight: 44,
      flex: 1,
      paddingHorizontal: 0,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 14,
    },
    sendButton: {
      width: 44,
      height: 44,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.goldBright,
    },
    sendButtonDisabled: { opacity: 0.42 },
    sendButtonPressed: { opacity: 0.75 },
    memoryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: 10,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    memoryCopy: { flex: 1, gap: 2 },
    memoryLabel: {
      color: theme.colors.scannerCyan,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    memoryText: { color: theme.colors.textMuted, fontSize: 10 },
    refreshButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
    },
    refreshButtonPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    taskSection: { gap: 7 },
    taskHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    taskLabel: {
      color: theme.colors.goldBright,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.3,
    },
    taskHint: { color: theme.colors.textMuted, fontSize: 8 },
    taskList: {
      gap: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dividerStrong,
    },
    empty: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
    error: { color: theme.colors.danger, fontSize: 10, lineHeight: 14 },
  });
  return {
    ...staticStyles,
    overlaySurfaceCollapsed: [
      staticStyles.overlaySurfaceCollapsed,
      {
        width: responsiveWidth(48),
        borderRadius: responsiveWidth(24),
      },
    ],
    overlayCollapsedBar: [
      staticStyles.overlayCollapsedBar,
      {
        width: responsiveWidth(48),
        height: responsiveHeight(48),
        minHeight: responsiveHeight(48),
      },
    ],
    collapsedAvatar: [
      staticStyles.collapsedAvatar,
      {
        width: responsiveWidth(48),
        height: responsiveHeight(48),
      },
    ],
    searchLabel: [
      staticStyles.searchLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    onlineDot: [
      staticStyles.onlineDot,
      {
        width: responsiveWidth(5),
        height: responsiveHeight(5),
      },
    ],
    onlineText: [
      staticStyles.onlineText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    searchPlaceholder: [
      staticStyles.searchPlaceholder,
      {
        fontSize: responsiveFont(12),
      },
    ],
    chevronButton: [
      staticStyles.chevronButton,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    headingAvatar: [
      staticStyles.headingAvatar,
      {
        width: responsiveWidth(46),
        height: responsiveHeight(46),
      },
    ],
    overlayHeading: [
      staticStyles.overlayHeading,
      {
        paddingRight: responsiveWidth(58),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(8),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(17),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(10),
      },
    ],
    menuButton: [
      staticStyles.menuButton,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    messageAvatar: [
      staticStyles.messageAvatar,
      {
        width: responsiveWidth(24),
        height: responsiveHeight(24),
      },
    ],
    messageText: [
      staticStyles.messageText,
      {
        fontSize: responsiveFont(11),
      },
    ],
    typingText: [
      staticStyles.typingText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    promptText: [
      staticStyles.promptText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    inputAvatar: [
      staticStyles.inputAvatar,
      {
        width: responsiveWidth(25),
        height: responsiveHeight(25),
      },
    ],
    input: [
      staticStyles.input,
      {
        fontSize: responsiveFont(12),
      },
    ],
    sendButton: [
      staticStyles.sendButton,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    memoryLabel: [
      staticStyles.memoryLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    memoryText: [
      staticStyles.memoryText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    refreshButton: [
      staticStyles.refreshButton,
      {
        width: responsiveWidth(28),
        height: responsiveHeight(28),
      },
    ],
    taskLabel: [
      staticStyles.taskLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    taskHint: [
      staticStyles.taskHint,
      {
        fontSize: responsiveFont(8),
      },
    ],
    empty: [
      staticStyles.empty,
      {
        fontSize: responsiveFont(11),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}
