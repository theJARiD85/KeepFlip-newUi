import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { KeepFlipControlRow } from '@/components/ui/keepflip-control-row';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  completeAssistantTask,
  createAssistantActionRun,
  createAssistantTask,
  listAssistantTasks,
  parseAssistantCommand,
  type AssistantTask,
} from '@/services/keepflip-assistant-service';

type AssistantRoute = '/inventory' | '/books' | '/deal-shelf' | '/account';

export function KeepFlipAssistantPanel({
  onNavigate,
}: {
  onNavigate: (route: AssistantRoute) => void;
}) {
  const { user } = useKeepFlipAuth();
  const [command, setCommand] = useState('');
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open').slice(0, 4),
    [tasks],
  );

  const loadTasks = useCallback(async () => {
    if (!user?.$id) return;
    setIsLoading(true);
    try {
      setTasks(await listAssistantTasks(user.$id));
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
  }, [user?.$id]);

  useEffect(() => {
    void loadTasks();
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
        setMessage(
          parsed.taskType === 'reminder'
            ? 'Reminder saved to your assistant queue.'
            : 'Task added to your assistant queue.',
        );
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
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>KEEPFLIP ASSISTANT</Text>
          <Text style={styles.title}>What should we handle?</Text>
          <Text style={styles.subtitle}>
            Create reminders, queue reseller work, or jump straight to a business tool.
          </Text>
        </View>
        <View style={styles.orb}>
          <Text style={styles.orbText}>KF</Text>
        </View>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Ask KeepFlip Assistant"
          autoCapitalize="sentences"
          editable={!isWorking}
          onChangeText={setCommand}
          onSubmitEditing={() => void runCommand()}
          placeholder="Ask or say: remind me to list the camera tomorrow"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="send"
          style={styles.input}
          value={command}
        />
        <Pressable
          accessibilityLabel="Run assistant command"
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
            <Text style={styles.sendText}>RUN</Text>
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
            <Text style={styles.quickText}>{quick}</Text>
          </Pressable>
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.taskHeader}>
        <Text style={styles.taskLabel}>UP NEXT</Text>
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
              icon={task.taskType === 'reminder' ? 'envelope.fill' : 'checkmark.shield.fill'}
              label={task.title}
              onPress={() => void finishTask(task)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No open tasks. Give the assistant something to handle.</Text>
      )}
    </View>
  );
}

function dueLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Scheduled reminder';
  return `Due ${date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

const styles = StyleSheet.create({
  surface: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.25)',
    backgroundColor: 'rgba(5, 14, 18, 0.88)',
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: { color: theme.colors.cream, fontSize: 18, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
  orb: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.42)',
    backgroundColor: 'rgba(141, 114, 255, 0.12)',
  },
  orbText: { color: theme.colors.scannerViolet, fontSize: 12, fontWeight: '900' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: 44,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.22)',
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    color: theme.colors.text,
    fontSize: 12,
  },
  sendButton: {
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: theme.colors.goldBright,
  },
  sendButtonDisabled: { opacity: 0.42 },
  sendButtonPressed: { opacity: 0.75 },
  sendText: { color: theme.colors.background, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.18)',
    backgroundColor: 'rgba(242, 211, 138, 0.04)',
  },
  quickChipPressed: { backgroundColor: 'rgba(242, 211, 138, 0.12)' },
  quickText: { color: theme.colors.goldMuted, fontSize: 9, fontWeight: '700' },
  message: { color: theme.colors.scannerCyan, fontSize: 10, lineHeight: 14 },
  error: { color: '#FFB8B1', fontSize: 10, lineHeight: 14 },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskLabel: { color: theme.colors.goldBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  refresh: { color: theme.colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  taskList: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(242, 211, 138, 0.18)' },
  empty: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15 },
});
