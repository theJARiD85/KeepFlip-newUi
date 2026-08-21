import {
  APPWRITE,
  ID,
  Permission,
  Query,
  Role,
  tablesDB,
} from '@/lib/appwrite';

export type AssistantTaskStatus = 'open' | 'completed' | 'cancelled';
export type AssistantTaskSource = 'user' | 'assistant' | 'system';

export type AssistantTask = {
  id: string;
  ownerId: string;
  taskType: 'task' | 'reminder';
  title: string;
  description: string | null;
  status: AssistantTaskStatus;
  priority: number;
  dueAt: string | null;
  recurrence: string | null;
  source: AssistantTaskSource;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantActionRun = {
  id: string;
  ownerId: string;
  taskId: string | null;
  actionType: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  inputJson: string | null;
  outputJson: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type AssistantTaskRow = {
  $id: string;
  ownerId?: string;
  taskType?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: number | null;
  dueAt?: string | null;
  recurrence?: string | null;
  source?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AssistantActionRunRow = {
  $id: string;
  ownerId?: string;
  taskId?: string | null;
  actionType?: string | null;
  status?: string | null;
  inputJson?: string | null;
  outputJson?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
};

const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 2_000;

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function taskTableId() {
  if (!APPWRITE.databaseId || !APPWRITE.assistantTasksTableId) {
    throw new Error(
      'KeepFlip Assistant needs EXPO_PUBLIC_APPWRITE_ASSISTANT_TASKS_TABLE_ID.',
    );
  }
  return APPWRITE.assistantTasksTableId;
}

function actionRunsTableId() {
  if (!APPWRITE.databaseId || !APPWRITE.assistantActionRunsTableId) {
    throw new Error(
      'KeepFlip Assistant activity is not configured yet. Add EXPO_PUBLIC_APPWRITE_ASSISTANT_ACTION_RUNS_TABLE_ID.',
    );
  }
  return APPWRITE.assistantActionRunsTableId;
}

function ownerPermissions(ownerId: string) {
  return [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
}

function validStatus(value: string | null | undefined): AssistantTaskStatus {
  return value === 'completed' || value === 'cancelled' ? value : 'open';
}

function validSource(value: string | null | undefined): AssistantTaskSource {
  return value === 'assistant' || value === 'system' ? value : 'user';
}

function rowToTask(row: AssistantTaskRow): AssistantTask {
  return {
    id: row.$id,
    ownerId: row.ownerId ?? '',
    taskType: row.taskType === 'reminder' ? 'reminder' : 'task',
    title: row.title ?? 'Untitled task',
    description: row.description ?? null,
    status: validStatus(row.status),
    priority: Number.isFinite(row.priority) ? Number(row.priority) : 2,
    dueAt: row.dueAt ?? null,
    recurrence: row.recurrence ?? null,
    source: validSource(row.source),
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? row.createdAt ?? '',
  };
}

function rowToActionRun(row: AssistantActionRunRow): AssistantActionRun {
  const status =
    row.status === 'running' ||
    row.status === 'completed' ||
    row.status === 'failed'
      ? row.status
      : 'queued';

  return {
    id: row.$id,
    ownerId: row.ownerId ?? '',
    taskId: row.taskId ?? null,
    actionType: row.actionType ?? 'assistant_command',
    status,
    inputJson: row.inputJson ?? null,
    outputJson: row.outputJson ?? null,
    errorMessage: row.errorMessage ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt ?? '',
  };
}

export async function listAssistantTasks(ownerId: string) {
  const tableId = taskTableId();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return [];

  const queries = [
    Query.equal('ownerId', [cleanOwnerId]),
    Query.orderAsc('dueAt'),
    Query.limit(50),
  ];

  try {
    const response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      queries,
    })) as unknown as { rows: AssistantTaskRow[] };
    return response.rows.map(rowToTask);
  } catch (error) {
    // A missing optional index should not make the assistant unavailable.
    const response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      queries: [Query.equal('ownerId', [cleanOwnerId]), Query.limit(50)],
    })) as unknown as { rows: AssistantTaskRow[] };
    return response.rows.map(rowToTask).sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }
}

export async function createAssistantTask({
  ownerId,
  title,
  description,
  taskType = 'task',
  dueAt = null,
  priority = 2,
  recurrence = null,
  source = 'user',
}: {
  ownerId: string;
  title: string;
  description?: string | null;
  taskType?: 'task' | 'reminder';
  dueAt?: string | null;
  priority?: number;
  recurrence?: string | null;
  source?: AssistantTaskSource;
}) {
  const tableId = taskTableId();
  const cleanOwnerId = ownerId.trim();
  const cleanTitle = cleanText(title, MAX_TITLE_LENGTH);
  if (!cleanOwnerId) throw new Error('Sign in before creating an assistant task.');
  if (!cleanTitle) throw new Error('Give the assistant task a title.');

  const now = new Date().toISOString();
  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId,
    rowId: ID.unique(),
    data: {
      ownerId: cleanOwnerId,
      taskType,
      title: cleanTitle,
      description: cleanText(description, MAX_DESCRIPTION_LENGTH),
      status: 'open',
      priority: Math.max(1, Math.min(3, Math.round(priority))),
      dueAt: dueAt ?? null,
      recurrence: cleanText(recurrence, 120),
      source,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as AssistantTaskRow;

  return rowToTask(created);
}

export async function completeAssistantTask(ownerId: string, taskId: string) {
  const tableId = taskTableId();
  const cleanOwnerId = ownerId.trim();
  const now = new Date().toISOString();
  const updated = (await tablesDB.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId,
    rowId: taskId,
    data: { status: 'completed', completedAt: now, updatedAt: now },
  })) as unknown as AssistantTaskRow;

  if (updated.ownerId && updated.ownerId !== cleanOwnerId) {
    throw new Error('That assistant task belongs to another account.');
  }
  return rowToTask(updated);
}

export async function createAssistantActionRun({
  ownerId,
  taskId = null,
  actionType = 'assistant_command',
  input,
  status = 'completed',
  output = null,
  errorMessage = null,
}: {
  ownerId: string;
  taskId?: string | null;
  actionType?: string;
  input: string;
  status?: AssistantActionRun['status'];
  output?: string | null;
  errorMessage?: string | null;
}) {
  const tableId = actionRunsTableId();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) throw new Error('Sign in before recording assistant activity.');
  const now = new Date().toISOString();

  const created = (await tablesDB.createRow({
    databaseId: APPWRITE.databaseId,
    tableId,
    rowId: ID.unique(),
    data: {
      ownerId: cleanOwnerId,
      taskId,
      actionType: cleanText(actionType, 80) ?? 'assistant_command',
      status,
      inputJson: cleanText(input, 4_000),
      outputJson: cleanText(output, 4_000),
      errorMessage: cleanText(errorMessage, 1_000),
      startedAt: now,
      completedAt: now,
      createdAt: now,
    },
    permissions: ownerPermissions(cleanOwnerId),
  })) as unknown as AssistantActionRunRow;

  return rowToActionRun(created);
}

export type ParsedAssistantCommand =
  | { type: 'create_task'; title: string; taskType: 'task' | 'reminder'; dueAt: string | null }
  | { type: 'navigate'; route: '/inventory' | '/books' | '/deal-shelf' | '/account' }
  | { type: 'help' };

function dueDateFromPhrase(phrase: string | null) {
  if (!phrase) return null;
  const now = new Date();
  const lower = phrase.toLowerCase();
  if (lower.includes('tomorrow')) now.setDate(now.getDate() + 1);
  if (lower.includes('in an hour')) now.setHours(now.getHours() + 1);
  const time = lower.match(/(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (time) {
    let hours = Number(time[1]);
    const minutes = Number(time[2] ?? 0);
    if (time[3] === 'pm' && hours < 12) hours += 12;
    if (time[3] === 'am' && hours === 12) hours = 0;
    now.setHours(hours, minutes, 0, 0);
  }
  return now.toISOString();
}

export function parseAssistantCommand(input: string): ParsedAssistantCommand {
  const command = input.trim();
  const lower = command.toLowerCase();
  if (lower.includes('open inventory') || lower === 'inventory') {
    return { type: 'navigate', route: '/inventory' };
  }
  if (lower.includes('open books') || lower.includes('open reports')) {
    return { type: 'navigate', route: '/books' };
  }
  if (lower.includes('open deal shelf') || lower.includes('open deals')) {
    return { type: 'navigate', route: '/deal-shelf' };
  }
  if (lower.includes('open account') || lower.includes('account settings')) {
    return { type: 'navigate', route: '/account' };
  }

  const reminder = command.match(/^remind me(?: to)?\s+(.+)$/i);
  if (reminder) {
    const title = reminder[1]
      .replace(/\s+(?:tomorrow|today|in an hour)\b.*$/i, '')
      .replace(/\s+(?:at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, '')
      .trim();
    return {
      type: 'create_task',
      taskType: 'reminder',
      title,
      dueAt: dueDateFromPhrase(reminder[1]),
    };
  }

  const task = command.match(/^(?:add|create)\s+(?:a\s+)?task(?:\s+to)?\s+(.+)$/i);
  if (task) {
    return { type: 'create_task', taskType: 'task', title: task[1].trim(), dueAt: null };
  }

  return { type: 'help' };
}
