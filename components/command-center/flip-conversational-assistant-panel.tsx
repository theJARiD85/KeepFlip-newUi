import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipCompanion, useFlipCompanion } from '@/components/flip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { responsiveWidth } from '@/lib/responsiveFont';
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
  type AssistantConversationMessage,
  type AssistantProfileContext,
  type AssistantRoute,
  type AssistantTask,
} from '@/services/keepflip-assistant-service';
import {
  cancelKeepFlipTaskReminder,
  scheduleKeepFlipTaskReminder,
} from '@/services/keepflip-notification-service';
import { getResellerBuyRules } from '@/services/user-profile-onboarding-service';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
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
  const merged =
    matchedIndex >= 0
      ? withoutWelcome.map((message, index) => (index === matchedIndex ? next : message))
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
  onNavigate,
  onOpenSellerOperations,
  onExpandedChange,
  overlayConversationMaxHeight,
  presentation = 'inline',
}: {
  onNavigate: (route: AssistantRoute) => void;
  onOpenSellerOperations: () => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  overlayConversationMaxHeight?: number;
  presentation?: FlipAssistantPresentation;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const { user } = useKeepFlipAuth();
  const [command, setCommand] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([]);
  const [profile, setProfile] = useState<AssistantProfileContext | null>(null);
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
  const isInteractionLocked = isWorking || reactionActive || state === 'speaking';

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
      setHasOlderMessages(false);
      setHistoryError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const [taskResult, conversationResult, profileResult] =
      await Promise.allSettled([
        listAssistantTasks(userId),
        listAssistantConversation(
          userId,
          ASSISTANT_CONVERSATION_PAGE_SIZE,
          conversationId,
        ),
        getResellerBuyRules(userId, displayName),
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

  const workspaceContext = (): {
    displayName: string | null;
    openTasks: Array<Pick<AssistantTask, 'title' | 'taskType' | 'dueAt'>>;
    profile: AssistantProfileContext | null;
  } => ({
    displayName,
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
    if (!input || !userId || isInteractionLocked) return;
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

  const finishTask = async (task: AssistantTask) => {
    if (!userId || isInteractionLocked) return;
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
        isOverlay && styles.overlaySurface,
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
                    Tell Flip what you're working on...
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
          style={styles.expandedContent}>
          <View style={styles.heading}>
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
              <Text style={[styles.subtitle, { fontSize: responsiveFont(10), lineHeight: 14 }]}>
                A resale copilot that listens first, remembers your work, and helps with the next move.
              </Text>
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
                      EARLIER MESSAGES COULDN'T LOAD - TAP TO RETRY
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
                    <View
                      style={[
                        styles.messageBubble,
                        entry.role === 'assistant'
                          ? styles.assistantBubble
                          : styles.userBubble,
                      ]}>
                      <Text selectable style={[styles.messageText, { fontSize: responsiveFont(11), lineHeight: 16 }]}>
                        {entry.content}
                      </Text>
                    </View>
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

              {!hasUserMessage && !isInteractionLocked ? (
                <View style={styles.promptRow}>
                  {[
                    'What should I work on next?',
                    'Help me pressure-test a buy',
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

              <View style={styles.inputRow}>
                <View style={styles.inputShell}>
                  <Image
                    accessibilityLabel="Flip"
                    contentFit="cover"
                    source={FLIP_MASCOT_IMAGE}
                    style={styles.inputAvatar}
                  />
                  <TextInput
                    accessibilityLabel="Message Flip"
                    autoCapitalize="sentences"
                    autoFocus
                    editable={!isInteractionLocked}
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
                  disabled={!command.trim() || isInteractionLocked}
                  onPress={() => void sendMessage()}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (!command.trim() || isInteractionLocked) && styles.sendButtonDisabled,
                    pressed && styles.sendButtonPressed,
                  ]}>
                  {isInteractionLocked ? (
                    <ActivityIndicator color={theme.colors.background} size="small" />
                  ) : (
                    <IconSymbol color={theme.colors.background} name="paperplane.fill" size={16} />
                  )}
                </Pressable>
              </View>

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
                    disabled={isLoading || isInteractionLocked}
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
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    surface: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.25)',
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(5, 14, 18, 0.88)',
    },
    overlaySurface: {
      width: '100%',
      alignSelf: 'flex-end',
      borderRadius: 18,
      backgroundColor: 'rgba(5, 14, 18, 0.97)',
      boxShadow: '0 16px 36px rgba(0, 0, 0, 0.42), 0 0 18px rgba(88, 223, 232, 0.12)',
      elevation: 8,
    },
    overlaySurfaceCollapsed: {
      width: 46,
      borderRadius: 23,
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
      width: 46,
      minHeight: 46,
      justifyContent: 'center',
      gap: 0,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    collapsedBarPressed: { backgroundColor: 'rgba(0, 255, 255, 0.06)' },
    collapsedAvatar: {
      width: 48,
      height: 48,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.48)',
      borderRadius: 24,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(242, 211, 138, 0.1)',
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
      borderColor: 'rgba(0, 255, 255, 0.28)',
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(0, 255, 255, 0.08)',
    },
    expandedContent: { gap: 12, padding: 14 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headingAvatar: {
      width: 46,
      height: 46,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.44)',
      borderRadius: 23,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(242, 211, 138, 0.08)',
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
      borderColor: 'rgba(88, 223, 232, 0.22)',
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(88, 223, 232, 0.06)',
    },
    menuButtonOpen: {
      borderColor: 'rgba(242, 211, 138, 0.42)',
      backgroundColor: 'rgba(242, 211, 138, 0.1)',
    },
    menuButtonPressed: { opacity: 0.72 },
    closeButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(173, 167, 178, 0.25)',
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(173, 167, 178, 0.08)',
    },
    closeButtonPressed: { backgroundColor: 'rgba(173, 167, 178, 0.18)' },
    conversation: {
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.16)',
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    conversationContent: {
      gap: 9,
      padding: 10,
    },
    overlayConversation: {
      maxHeight: 240,
    },
    historyLoadButton: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.2)',
      borderRadius: 10,
      borderCurve: 'continuous',
      paddingHorizontal: 9,
      paddingVertical: 6,
      backgroundColor: 'rgba(88, 223, 232, 0.05)',
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
      borderColor: 'rgba(242, 211, 138, 0.34)',
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
    assistantBubble: {
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.19)',
      borderBottomLeftRadius: 4,
      backgroundColor: 'rgba(88, 223, 232, 0.08)',
    },
    userBubble: {
      borderBottomRightRadius: 4,
      backgroundColor: 'rgba(242, 211, 138, 0.9)',
    },
    messageText: {
      color: theme.colors.text,
      fontSize: 11,
      lineHeight: 16,
    },
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    typingBubble: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: 'rgba(88, 223, 232, 0.16)',
      borderRadius: 10,
      backgroundColor: 'rgba(88, 223, 232, 0.06)',
    },
    typingText: { color: theme.colors.textMuted, fontSize: 10 },
    promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    promptChip: {
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.2)',
      borderRadius: 10,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(242, 211, 138, 0.045)',
    },
    promptChipPressed: { backgroundColor: 'rgba(242, 211, 138, 0.12)' },
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
      borderColor: 'rgba(242, 211, 138, 0.22)',
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    inputAvatar: {
      width: 25,
      height: 25,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(242, 211, 138, 0.38)',
      borderRadius: 13,
      borderCurve: 'continuous',
    },
    input: {
      minHeight: 44,
      flex: 1,
      paddingHorizontal: 0,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 12,
    },
    sendButton: {
      width: 48,
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
      borderColor: 'rgba(88, 223, 232, 0.13)',
      borderRadius: 10,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(88, 223, 232, 0.035)',
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
    refreshButtonPressed: { backgroundColor: 'rgba(88, 223, 232, 0.1)' },
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
      borderColor: 'rgba(242, 211, 138, 0.18)',
    },
    empty: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
    error: { color: '#FFB8B1', fontSize: 10, lineHeight: 14 },
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
        width: responsiveWidth(48),
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
