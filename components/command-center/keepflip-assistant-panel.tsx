import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { FlipSellerDecisions } from '@/components/command-center/flip-seller-decisions';
import {
  FlipCompanion,
  useFlipCompanion,
} from '@/components/flip';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  completeAssistantTask,
  createAssistantActionRun,
  createAssistantTask,
  listAssistantTasks,
  parseAssistantCommand,
  type AssistantRoute,
  type AssistantTask,
} from '@/services/keepflip-assistant-service';
import {
  cancelKeepFlipTaskReminder,
  scheduleKeepFlipTaskReminder,
} from '@/services/keepflip-notification-service';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';

const FLIP_MASCOT_IMAGE = require('@/assets/images/flip-mascot.png');

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

export function KeepFlipAssistantPanel({
  onNavigate,
  onOpenSellerOperations,
}: {
  onNavigate: (route: AssistantRoute) => void;
  onOpenSellerOperations: () => void;
}) {
  const responsiveLayout2 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const { user } = useKeepFlipAuth();
  const [command, setCommand] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.$id ?? null;
  const userName = user?.name ?? null;
  const {
    markActivity,
    setMode,
    react,
  } = useFlipCompanion();
  console.log('User name', userName);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open').slice(0, 4),
    [tasks],
  );

  const loadTasks = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await listAssistantTasks(userId);
      setTasks(loaded);
      void Promise.all(
        loaded.map((task) => scheduleTaskReminder(task, false).catch(() => undefined)),
      );
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Assistant tasks could not be loaded yet.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!markActivity()) {
      react('greeting');
    }
  }, [markActivity, react]);

  useEffect(() => {
    const taskLoadTimer = setTimeout(() => {
      void loadTasks();
    }, 0);
    return () => clearTimeout(taskLoadTimer);
  }, [loadTasks]);

  const runCommand = async (value = command) => {
    const input = value.trim();
    if (!input || !user?.$id || isWorking) return;

    setIsWorking(true);
    setMessage(null);
    setError(null);
    const parsed = parseAssistantCommand(input);

    try {
      if (parsed.type === 'navigate') {
        await createAssistantActionRun({
          ownerId: user.$id,
          actionType: 'navigate',
          input,
          output: parsed.route,
        }).catch(() => undefined);
        onNavigate(parsed.route);
        return;
      }

      if (parsed.type === 'create_task') {
        const task = await createAssistantTask({
          ownerId: user.$id,
          title: parsed.title,
          taskType: parsed.taskType,
          dueAt: parsed.dueAt,
          source: 'assistant',
        });
        await createAssistantActionRun({
          ownerId: user.$id,
          taskId: task.id,
          actionType: 'create_task',
          input,
          output: JSON.stringify({ taskId: task.id }),
        }).catch(() => undefined);
        setTasks((current) => [task, ...current]);
        setCommand('');

        if (parsed.taskType === 'reminder' && task.dueAt) {
          const scheduled = await scheduleTaskReminder(task, true).catch(
            () => ({ status: 'permission_denied' } as const),
          );
          setMessage(
            scheduled.status === 'scheduled'
              ? 'Reminder saved and scheduled on this phone.'
              : scheduled.status === 'permission_denied'
                ? 'Reminder saved. Turn on KeepFlip notifications in your phone settings to receive the alert.'
                : 'Reminder saved to your assistant queue.',
          );
        } else {
          setMessage(
            parsed.taskType === 'reminder'
              ? 'Reminder saved. Add “tomorrow at 9 am” when you want a phone alert.'
              : 'Task added to your assistant queue.',
          );
        }
        return;
      }

      setMessage(
        'Try “remind me to list the camera tomorrow at 9 am”, “add task photograph inventory”, or “open books”.',
      );
      await createAssistantActionRun({
        ownerId: user.$id,
        actionType: 'help',
        input,
        output: 'help',
      }).catch(() => undefined);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : 'The assistant could not complete that request.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const finishTask = async (task: AssistantTask) => {
    if (!user?.$id || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const completed = await completeAssistantTask(user.$id, task.id);
      await cancelKeepFlipTaskReminder(task.id).catch(() => undefined);
      setTasks((current) =>
        current.map((entry) => (entry.id === completed.id ? completed : entry)),
      );
      setMessage('Task marked complete.');
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : 'That task could not be completed.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <View style={styles.surface}>
      {!isExpanded ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <Pressable
            accessibilityHint="Expands Flip's assistant search bar."
            accessibilityLabel="Ask Flip"
            accessibilityRole="button"
            onPress={() => setIsExpanded(true)}
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}>
            <View style={styles.flipAvatar}>
              <FlipCompanion size={190} />
            </View>
            <View style={styles.searchCopy}>
              <View style={styles.searchMeta}>
                <Text style={[styles.searchLabel, { fontSize: responsiveFont(9) }]}>FLIP</Text>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineText, { fontSize: responsiveFont(8) }]}>ONLINE</Text>
              </View>
              <Text numberOfLines={5} style={styles.searchPlaceholder}>
                Hey {userName}, anything I can help you with today?
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(140)}
          style={styles.expandedContent}>
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <View style={styles.searchMeta}>
                <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP</Text>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineText, { fontSize: responsiveFont(8) }]}>ONLINE</Text>
              </View>
              <Text style={[styles.title, { fontSize: responsiveFont(18) }]}>Ask Flip</Text>
              <Text style={[styles.subtitle, { fontSize: responsiveFont(11), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(15) : 15 }]}>
                Seller decisions, reminders, and business tools in one conversation.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Collapse Ask Flip"
              accessibilityRole="button"
              onPress={() => setIsExpanded(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <Ionicons color={theme.colors.textMuted} name="close" size={17} />
            </Pressable>
          </View>

          {userId ? (
            <FlipSellerDecisions
              ownerId={userId}
              onOpenSellerOperations={onOpenSellerOperations}
            />
          ) : (
            <Text style={styles.empty}>Sign in so Flip can open your seller decisions.</Text>
          )}

          <View style={styles.inputRow}>
            <View style={styles.inputShell}>
              <Image
                accessibilityLabel="Flip"
                contentFit="cover"
                source={FLIP_MASCOT_IMAGE}
                style={styles.inputAvatar}
              />
              <TextInput
                accessibilityLabel="Ask Flip what to do"
                autoCapitalize="sentences"
                autoFocus
                editable={!isWorking}
                onChangeText={setCommand}
                onSubmitEditing={() => void runCommand()}
                placeholder="Ask Flip: remind me to list the camera tomorrow"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="send"
                style={styles.input}
                value={command}
              />
            </View>
            <Pressable
              accessibilityLabel="Run request with Flip"
              accessibilityRole="button"
              disabled={!command.trim() || isWorking}
              onPress={() => void runCommand()}
              style={({ pressed }) => [
                styles.sendButton,
                (!command.trim() || isWorking) && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}>
              {isWorking ? (
                <ActivityIndicator color={theme.colors.background} size="small" />
              ) : (
                <Text style={[styles.sendText, { fontSize: responsiveFont(9) }]}>RUN</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.quickRow}>
            {['Remind me to list an item', 'Open books', 'Open inventory'].map((quick) => (
              <Pressable
                key={quick}
                accessibilityRole="button"
                disabled={isWorking}
                onPress={() => {
                  setCommand(quick);
                  void runCommand(quick);
                }}
                style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}>
                <Text style={[styles.quickText, { fontSize: responsiveFont(9) }]}>{quick}</Text>
              </Pressable>
            ))}
          </View>

          {message ? <Text style={[styles.message, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>{message}</Text> : null}
          {error ? <Text style={[styles.error, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>{error}</Text> : null}

          <View style={styles.taskHeader}>
            <Text style={[styles.taskLabel, { fontSize: responsiveFont(8) }]}>UP NEXT</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadTasks()}>
              <Text style={styles.refresh}>REFRESH</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator color={theme.colors.scannerCyan} size="small" />
          ) : openTasks.length ? (
            <View style={styles.taskList}>
              {openTasks.map((task) => (
                <KeepFlipControlRow
                  key={task.id}
                  accent={task.taskType === 'reminder' ? 'cyan' : 'gold'}
                  actionLabel="DONE"
                  description={task.dueAt ? dueLabel(task.dueAt) : 'No due date'}
                  icon={task.taskType === 'reminder' ? 'mail' : 'checkmark-circle'}
                  label={task.title}
                  onPress={() => void finishTask(task)}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No open tasks. Give Flip something to handle.</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function dueLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Scheduled reminder';
  return `Due ${date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    surface: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder, borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    searchBar: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(64) : 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
    },
    searchBarPressed: { backgroundColor: theme.colors.iconSurfaceCyan },
    flipAvatar: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(190) : 190,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(190) : 190,
      overflow: 'hidden',
    },
    flipAvatarImage: { width: '100%', height: '100%' },
    searchCopy: { flex: 1, minWidth: 0, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3, padding: 5, justifyContent: 'flex-start', alignItems: 'flex-start', height: '90%' },
    searchMeta: { flexDirection: 'row', alignItems: 'center', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5 },
    searchLabel: {
      color: theme.colors.gold,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9,
      fontWeight: '900',
      letterSpacing: 1.4,
    },
    onlineDot: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(5) : 5,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(5) : 5,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3,
      backgroundColor: theme.colors.scannerCyan,
    },
    onlineText: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    searchPlaceholder: { color: theme.colors.text, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14, fontWeight: '700', fontFamily: theme.fonts.body },
    searchIcon: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(34) : 34,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(34) : 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(17) : 17,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    expandedContent: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12, padding: 14 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12 },
    headingCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
    title: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(18) : 18, fontWeight: '900' },
    subtitle: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15 },
    closeButton: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(32) : 32,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(32) : 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.cardSoft,
    },
    closeButtonPressed: { backgroundColor: theme.colors.cardSoft },
    inputRow: { flexDirection: 'row', alignItems: 'stretch', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    inputShell: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : 48,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.surfaceInset,
    },
    inputAvatar: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(25) : 25,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(25) : 25,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      borderCurve: 'continuous',
    },
    input: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(44) : 44,
      flex: 1,
      paddingHorizontal: 0,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(8) : 8,
      color: theme.colors.text,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12,
    },
    sendButton: {
      minWidth: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(54) : 54,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.goldBright,
    },
    sendButtonDisabled: { opacity: 0.42 },
    sendButtonPressed: { opacity: 0.75 },
    sendText: { color: theme.colors.background, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '900', letterSpacing: 0.8 },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(6) : 6 },
    quickChip: {
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(6) : 6,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8,
      borderCurve: 'continuous',
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    quickChipPressed: { backgroundColor: theme.colors.iconSurfaceGold },
    quickText: { color: theme.colors.goldMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9, fontWeight: '700' },
    message: { color: theme.colors.scannerCyan, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    error: { color: theme.colors.danger, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14 },
    taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    taskLabel: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 1.3 },
    refresh: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8, fontWeight: '900', letterSpacing: 0.7 },
    taskList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    empty: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : 11, lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15 },
  });
  return {
    ...staticStyles,
    flipAvatar: [
      staticStyles.flipAvatar,
      {
        width: responsiveWidth(190),
        height: responsiveHeight(190),
      },
    ],
    searchLabel: [
      staticStyles.searchLabel,
      {
        fontSize: responsiveFont(9),
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
        fontSize: responsiveFont(8),
      },
    ],
    searchPlaceholder: [
      staticStyles.searchPlaceholder,
      {
        fontSize: responsiveFont(14),
      },
    ],
    searchIcon: [
      staticStyles.searchIcon,
      {
        width: responsiveWidth(34),
        height: responsiveHeight(34),
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
        fontSize: responsiveFont(18),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
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
    sendText: [
      staticStyles.sendText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    quickText: [
      staticStyles.quickText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    message: [
      staticStyles.message,
      {
        fontSize: responsiveFont(10),
      },
    ],
    error: [
      staticStyles.error,
      {
        fontSize: responsiveFont(10),
      },
    ],
    taskLabel: [
      staticStyles.taskLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    refresh: [
      staticStyles.refresh,
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
  };
}
