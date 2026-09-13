import {
  APPWRITE,
  Channel,
  ExecutionMethod,
  functions,
  ID,
  Permission,
  Query,
  realtime,
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

export type AssistantRoute =
  | '/scanner'
  | '/inventory'
  | '/command-center'
  | '/books'
  | '/flip-plan'
  | '/account'
  | '/ebay-connect'
  | '/ebay-account'
  | '/market-research';

const ASSISTANT_NAVIGATION_ROUTES: ReadonlySet<AssistantRoute> = new Set([
  '/scanner',
  '/inventory',
  '/command-center',
  '/books',
  '/flip-plan',
  '/account',
  '/ebay-connect',
  '/ebay-account',
  '/market-research',
]);

function isAssistantRoute(value: unknown): value is AssistantRoute {
  return (
    typeof value === 'string' &&
    ASSISTANT_NAVIGATION_ROUTES.has(value as AssistantRoute)
  );
}

export type AssistantConversationRole = 'user' | 'assistant';

export type AssistantConversationMessage = {
  id: string;
  role: AssistantConversationRole;
  content: string;
  createdAt: string;
  conversationId?: string;
};

export type AssistantConversationPage = {
  messages: AssistantConversationMessage[];
  hasMore: boolean;
};

export const ASSISTANT_CONVERSATION_PAGE_SIZE = 40;

export type AssistantProfileContext = {
  inventoryFocus?: string | null;
  saleSpeed?: string | null;
  minimumRoiPercent?: number | null;
  minimumNetProfitCents?: number | null;
  maximumItemCostCents?: number | null;
  maximumTypicalDays?: number | null;
};

export type AssistantWorkspaceContext = {
  currentRoute?: string | null;
  displayName?: string | null;
  openTasks?: Array<Pick<AssistantTask, 'title' | 'taskType' | 'dueAt'>>;
  profile?: AssistantProfileContext | null;
};

export type AssistantAction =
  | { type: 'none' }
  | { type: 'navigate'; route: AssistantRoute }
  | { type: 'open_seller_operations' }
  | {
      type: 'create_task';
      title: string;
      taskType: 'task' | 'reminder';
      dueAt: string | null;
    };

export type AssistantReaction =
  | 'greeting'
  | 'acknowledge'
  | 'aha'
  | 'confused'
  | 'celebrate';

export type KeepFlipAssistantReply = {
  reply: string;
  reaction: AssistantReaction;
  action: AssistantAction;
  source: 'cloud' | 'local';
};

export type KeepFlipAssistantRun = KeepFlipAssistantReply & {
  conversationId: string | null;
  persistedMessages: AssistantConversationMessage[];
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

type AssistantConversationRow = {
  $id: string;
  $createdAt?: string | null;
  ownerId?: string | null;
  conversationId?: string | null;
  role?: string | null;
  content?: string | null;
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

function messagesTableId() {
  if (!APPWRITE.databaseId || !APPWRITE.assistantMessagesTableId) return null;
  return APPWRITE.assistantMessagesTableId;
}

function assistantFunctionId() {
  if (!APPWRITE.assistantFunctionId || !messagesTableId()) return null;
  return APPWRITE.assistantFunctionId;
}

export function defaultAssistantConversationId(ownerId: string) {
  return ownerId.trim();
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

function rowToConversationMessage(
  row: AssistantConversationRow,
  ownerId: string,
  conversationId: string,
): AssistantConversationMessage | null {
  if (row.ownerId !== ownerId || row.conversationId !== conversationId) return null;
  const content = cleanText(row.content, 4_000);
  const createdAt = cleanText(row.$createdAt, 80);
  if (!content || !createdAt) return null;
  if (row.role !== 'user' && row.role !== 'assistant') return null;
  return {
    content,
    conversationId,
    createdAt,
    id: row.$id,
    role: row.role,
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

function parseJsonRecord(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function listLegacyAssistantConversation(ownerId: string, limit: number) {
  const tableId = actionRunsTableId();
  const cleanOwnerId = ownerId.trim();
  if (!cleanOwnerId) return [];
  const safeLimit = Math.max(1, Math.min(40, Math.round(limit)));
  const baseQueries = [Query.equal('ownerId', [cleanOwnerId])];
  let response: { rows: AssistantActionRunRow[] };
  try {
    response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      queries: [
        ...baseQueries,
        Query.orderDesc('createdAt'),
        Query.limit(safeLimit),
      ],
    })) as unknown as { rows: AssistantActionRunRow[] };
  } catch {
    response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      queries: [...baseQueries, Query.limit(safeLimit)],
    })) as unknown as { rows: AssistantActionRunRow[] };
  }

  const messages: AssistantConversationMessage[] = [];
  for (const row of response.rows.map(rowToActionRun)) {
    if (row.actionType !== 'conversation') continue;
    const input = parseJsonRecord(row.inputJson);
    const output = parseJsonRecord(row.outputJson);
    const userText = cleanText(
      typeof input?.message === 'string' ? input.message : null,
      2_000,
    );
    const assistantText = cleanText(
      typeof output?.reply === 'string' ? output.reply : null,
      4_000,
    );
    if (!userText || !assistantText) continue;
    const createdAt = row.createdAt || new Date().toISOString();
    messages.push(
      {
        id: `${row.id}:user`,
        role: 'user',
        content: userText,
        createdAt,
      },
      {
        id: `${row.id}:assistant`,
        role: 'assistant',
        content: assistantText,
        createdAt,
      },
    );
  }

  return messages
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-(safeLimit * 2));
}

async function listPersistentAssistantConversation(
  ownerId: string,
  conversationId: string,
  limit: number,
) {
  const page = await listPersistentAssistantConversationPage(
    ownerId,
    conversationId,
    limit,
  );
  return page?.messages ?? null;
}

async function listPersistentAssistantConversationPage(
  ownerId: string,
  conversationId: string,
  limit: number,
  cursorAfterMessageId?: string,
): Promise<AssistantConversationPage | null> {
  const tableId = messagesTableId();
  if (!tableId) return null;
  const cleanOwnerId = ownerId.trim();
  const cleanConversationId = conversationId.trim();
  if (!cleanOwnerId || !cleanConversationId) {
    return { messages: [], hasMore: false };
  }
  const safeLimit = Math.max(1, Math.min(ASSISTANT_CONVERSATION_PAGE_SIZE, Math.round(limit)));
  const cursor = cleanText(cursorAfterMessageId, 64);
  const baseQueries = [
    Query.equal('ownerId', [cleanOwnerId]),
    Query.equal('conversationId', [cleanConversationId]),
  ];

  let response: { rows: AssistantConversationRow[] };
  try {
    response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      // Match the Function's compound owner/conversation/created-at index, then
      // put the limited result back into chronological order below. With a
      // descending sort, cursorAfter the oldest loaded row gets the next
      // older page.
      queries: [
        ...baseQueries,
        Query.orderDesc('$createdAt'),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
        Query.limit(safeLimit),
      ],
      total: false,
    })) as unknown as { rows: AssistantConversationRow[] };
  } catch {
    if (cursor) {
      return { messages: [], hasMore: false };
    }
    response = (await tablesDB.listRows({
      databaseId: APPWRITE.databaseId,
      tableId,
      queries: [...baseQueries, Query.limit(safeLimit)],
      total: false,
    })) as unknown as { rows: AssistantConversationRow[] };
  }

  return {
    hasMore: response.rows.length === safeLimit,
    messages: response.rows
      .map((row) => rowToConversationMessage(row, cleanOwnerId, cleanConversationId))
      .filter((row): row is AssistantConversationMessage => row !== null)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-safeLimit),
  };
}

/**
 * Prefer the owner-scoped persistent conversation table once it is configured.
 * Until then, retain prior action-run conversation history so the current Flip
 * experience stays available during the table rollout.
 */
export async function listAssistantConversation(
  ownerId: string,
  limit = 24,
  conversationId = defaultAssistantConversationId(ownerId),
) {
  const persistent = await listPersistentAssistantConversation(
    ownerId,
    conversationId,
    limit,
  );
  if (persistent) return persistent;
  return listLegacyAssistantConversation(ownerId, limit);
}

export async function listOlderAssistantConversation({
  ownerId,
  conversationId = defaultAssistantConversationId(ownerId),
  oldestMessageId,
  limit = ASSISTANT_CONVERSATION_PAGE_SIZE,
}: {
  ownerId: string;
  conversationId?: string;
  oldestMessageId: string;
  limit?: number;
}): Promise<AssistantConversationPage> {
  const persistent = await listPersistentAssistantConversationPage(
    ownerId,
    conversationId,
    limit,
    oldestMessageId,
  );
  return persistent ?? { messages: [], hasMore: false };
}

export function subscribeToAssistantConversation({
  ownerId,
  conversationId = defaultAssistantConversationId(ownerId),
  onMessage,
  onSubscriptionError,
}: {
  ownerId: string;
  conversationId?: string;
  onMessage: (message: AssistantConversationMessage) => void;
  onSubscriptionError?: (error: unknown) => void;
}) {
  const tableId = messagesTableId();
  const cleanOwnerId = ownerId.trim();
  const cleanConversationId = conversationId.trim();
  if (!tableId || !APPWRITE.databaseId || !cleanOwnerId || !cleanConversationId) {
    return () => undefined;
  }

  let disposed = false;
  let unsubscribe: (() => Promise<void>) | null = null;

  void realtime
    .subscribe(
      Channel.tablesdb(APPWRITE.databaseId).table(tableId).row().create(),
      (event) => {
        if (disposed) return;
        const message = rowToConversationMessage(
          event.payload as AssistantConversationRow,
          cleanOwnerId,
          cleanConversationId,
        );
        if (message) onMessage(message);
      },
      [
        Query.equal('ownerId', [cleanOwnerId]),
        Query.equal('conversationId', [cleanConversationId]),
      ],
    )
    .then((subscription) => {
      if (disposed) {
        void subscription.unsubscribe();
        return;
      }
      unsubscribe = () => subscription.unsubscribe();
    })
    .catch((subscriptionError) => {
      if (!disposed) onSubscriptionError?.(subscriptionError);
    });

  return () => {
    disposed = true;
    if (unsubscribe) void unsubscribe();
  };
}

export type ParsedAssistantCommand =
  | { type: 'create_task'; title: string; taskType: 'task' | 'reminder'; dueAt: string | null }
  | { type: 'navigate'; route: AssistantRoute }
  | { type: 'help' };

function dueDateFromPhrase(phrase: string | null) {
  if (!phrase) return null;
  const now = new Date();
  const lower = phrase.toLowerCase();
  let hasDate = false;
  if (lower.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
    hasDate = true;
  }
  if (lower.includes('today')) hasDate = true;
  if (lower.includes('in an hour')) {
    now.setHours(now.getHours() + 1);
    hasDate = true;
  }
  const time = lower.match(/(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (time) {
    let hours = Number(time[1]);
    const minutes = Number(time[2] ?? 0);
    if (hours > 23 || minutes > 59) return null;
    if (time[3] === 'pm' && hours < 12) hours += 12;
    if (time[3] === 'am' && hours === 12) hours = 0;
    now.setHours(hours, minutes, 0, 0);
    hasDate = true;
  }
  return hasDate ? now.toISOString() : null;
}

export function parseAssistantCommand(input: string): ParsedAssistantCommand {
  const command = input.trim();
  const lower = command.toLowerCase();
  if (
    lower === 'scanner' ||
    lower.includes('open scanner') ||
    lower.includes('open the scanner') ||
    lower.includes('go to scanner') ||
    lower.includes('go to the scanner') ||
    lower.includes('show scanner') ||
    lower.includes('show the scanner') ||
    lower.includes('take me to scanner') ||
    lower.includes('take me to the scanner')
  ) {
    return { type: 'navigate', route: '/scanner' };
  }
  if (lower.includes('open inventory') || lower === 'inventory') {
    return { type: 'navigate', route: '/inventory' };
  }
  if (
    lower.includes('open command center') ||
    lower.includes('open the command center') ||
    lower.includes('go to command center') ||
    lower.includes('take me to command center') ||
    lower === 'command center'
  ) {
    return { type: 'navigate', route: '/command-center' };
  }
  if (lower.includes('open books') || lower.includes('open reports')) {
    return { type: 'navigate', route: '/books' };
  }
  if (
    lower.includes('open flip plan') ||
    lower.includes('open the flip plan') ||
    lower.includes('go to flip plan') ||
    lower === 'flip plan'
  ) {
    return { type: 'navigate', route: '/flip-plan' };
  }
  if (
    lower.includes('open market research') ||
    lower.includes('open the market research') ||
    lower.includes('go to market research') ||
    lower === 'market research'
  ) {
    return { type: 'navigate', route: '/market-research' };
  }
  if (
    lower.includes('connect ebay') ||
    lower.includes('connect to ebay') ||
    lower.includes('reconnect ebay') ||
    lower.includes('open ebay connection') ||
    lower.includes('open the ebay connection')
  ) {
    return { type: 'navigate', route: '/ebay-connect' };
  }
  if (
    lower.includes('open ebay account') ||
    lower.includes('open my ebay account') ||
    lower.includes('show ebay account') ||
    lower.includes('show my ebay account')
  ) {
    return { type: 'navigate', route: '/ebay-account' };
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

export type ParsedAssistantIntent =
  | ParsedAssistantCommand
  | { type: 'open_seller_operations' }
  | { type: 'greeting' }
  | { type: 'thanks' }
  | { type: 'workspace_status' }
  | { type: 'conversation' };

export function parseAssistantIntent(input: string): ParsedAssistantIntent {
  const parsed = parseAssistantCommand(input);
  if (parsed.type !== 'help') return parsed;

  const lower = input.trim().toLowerCase();
  if (
    /\b(open|show|go to|take me to|navigate to)\b/.test(lower) &&
    /seller operations|orders|fulfillment|payout|realized profit|money sync|sold items/.test(
      lower,
    )
  ) {
    return { type: 'open_seller_operations' };
  }
  if (/^(hi|hey|hello|yo|good morning|good afternoon|good evening)\b/.test(lower)) {
    return { type: 'greeting' };
  }
  if (/\b(thanks|thank you|appreciate it|you rock)\b/.test(lower)) {
    return { type: 'thanks' };
  }
  if (
    /what should i work on|what's next|what is next|up next|my queue|my tasks|what do i have/.test(
      lower,
    )
  ) {
    return { type: 'workspace_status' };
  }
  if (/what can you do|how can you help|help me|commands|options/.test(lower)) {
    return { type: 'help' };
  }
  return { type: 'conversation' };
}

function assistantMoney(cents: number | null | undefined) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function assistantDueLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function localAssistantReply(
  input: string,
  context: AssistantWorkspaceContext,
): KeepFlipAssistantReply {
  const intent = parseAssistantIntent(input);
  const openTasks = context.openTasks ?? [];
  const profile = context.profile;
  const profileDetails = [
    profile?.minimumRoiPercent != null ? `${profile.minimumRoiPercent}% ROI` : null,
    assistantMoney(profile?.minimumNetProfitCents)
      ? `${assistantMoney(profile?.minimumNetProfitCents)} take-home`
      : null,
    assistantMoney(profile?.maximumItemCostCents)
      ? `${assistantMoney(profile?.maximumItemCostCents)} item cap`
      : null,
  ].filter(Boolean);
  const profileHint = profileDetails.length
    ? ` I'll keep your ${profileDetails.join(', ')} in mind.`
    : '';
  const displayName = context.displayName?.trim();

  if (intent.type === 'create_task') {
    const when = assistantDueLabel(intent.dueAt);
    return {
      reply: `Got it - I'll keep "${intent.title}" in your queue${when ? ` for ${when}` : ''}.`,
      reaction: 'acknowledge',
      action: intent,
      source: 'local',
    };
  }
  if (intent.type === 'navigate') {
    const labels: Record<AssistantRoute, string> = {
      '/scanner': 'Scanner',
      '/inventory': 'inventory',
      '/command-center': 'Command Center',
      '/books': 'Books',
      '/flip-plan': 'Flip Plan',
      '/account': 'account settings',
      '/ebay-connect': 'eBay connection',
      '/ebay-account': 'eBay account',
      '/market-research': 'Market Research',
    };
    return {
      reply: `On it - opening ${labels[intent.route]} now.`,
      reaction: 'aha',
      action: intent,
      source: 'local',
    };
  }
  if (intent.type === 'open_seller_operations') {
    return {
      reply: "I'll open seller operations so we can work through orders, fulfillment, and realized profit together.",
      reaction: 'aha',
      action: intent,
      source: 'local',
    };
  }
  if (intent.type === 'greeting') {
    const name = displayName ? ` ${displayName}` : '';
    return {
      reply: `Hey${name}! I'm here. Tell me what you're sourcing, listing, or trying to untangle.${profileHint}`,
      reaction: 'greeting',
      action: { type: 'none' },
      source: 'local',
    };
  }
  if (intent.type === 'thanks') {
    return {
      reply: "Anytime. Keep the good flips moving - I'm here when the next decision shows up.",
      reaction: 'celebrate',
      action: { type: 'none' },
      source: 'local',
    };
  }
  if (intent.type === 'workspace_status') {
    if (!openTasks.length) {
      return {
        reply: `Your queue is clear. Want to plan a sourcing run, review an item, or set a reminder?${profileHint}`,
        reaction: 'acknowledge',
        action: { type: 'none' },
        source: 'local',
      };
    }
    const taskLines = openTasks
      .slice(0, 3)
      .map((task) => {
        const due = assistantDueLabel(task.dueAt);
        return `- ${task.title}${due ? ` - ${due}` : ''}`;
      })
      .join('\\n');
    return {
      reply: `You have ${openTasks.length} open ${openTasks.length === 1 ? 'item' : 'items'} in your queue:\n${taskLines}\nTell me which one you want to tackle first.${profileHint}`,
      reaction: 'aha',
      action: { type: 'none' },
      source: 'local',
    };
  }
  if (intent.type === 'help') {
    return {
      reply:
        'Talk to me normally - I can help you source, price, list, navigate KeepFlip, and remember work. Try "open Scanner," "connect eBay," or "remind me to photograph the jackets tomorrow."' +
        profileHint,
      reaction: 'acknowledge',
      action: { type: 'none' },
      source: 'local',
    };
  }

  const lower = input.toLowerCase();
  if (/\b(buy|source|worth it|profit|roi|margin|flip)\b/.test(lower)) {
    return {
      reply: `Let's work it through. Tell me the item, your buy cost, expected sale price, and any fees or repairs you know about. I'll help you pressure-test the decision against your saved rules.${profileHint}`,
      reaction: 'aha',
      action: { type: 'none' },
      source: 'local',
    };
  }
  if (/\b(list|listing|photo|photograph|clean|ship|shipments?)\b/.test(lower)) {
    return {
      reply: 'For a direct listing, I will steer you to eBay first: KeepFlip can publish a reviewed draft through your connected eBay account. Tell me the item, or ask me to open Inventory so you can choose it; I can help with photos, pricing, copy, or shipping from there.',
      reaction: 'acknowledge',
      action: { type: 'none' },
      source: 'local',
    };
  }
  return {
    reply: "I'm listening. Give me the item or business problem in your own words and I'll help you choose the next move.",
    reaction: 'acknowledge',
    action: { type: 'none' },
    source: 'local',
  };
}
function normalizeAssistantAction(value: unknown): AssistantAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'none' };
  }
  const action = value as Record<string, unknown>;
  if (action.type === 'open_seller_operations') {
    return { type: 'open_seller_operations' };
  }
  if (action.type === 'navigate') {
    const route = action.route;
    if (isAssistantRoute(route)) {
      return { type: 'navigate', route };
    }
  }
  if (action.type === 'create_task') {
    const title = cleanText(
      typeof action.title === 'string' ? action.title : null,
      MAX_TITLE_LENGTH,
    );
    if (title) {
      return {
        type: 'create_task',
        title,
        taskType: action.taskType === 'reminder' ? 'reminder' : 'task',
        dueAt: typeof action.dueAt === 'string' ? action.dueAt : null,
      };
    }
  }
  return { type: 'none' };
}

function normalizeAssistantReply(
  value: unknown,
  fallback: KeepFlipAssistantReply,
): KeepFlipAssistantReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const candidate = value as Record<string, unknown>;
  const reply = cleanText(
    typeof candidate.reply === 'string' ? candidate.reply : null,
    4_000,
  );
  if (!reply) return fallback;
  const reaction =
    candidate.reaction === 'greeting' ||
    candidate.reaction === 'acknowledge' ||
    candidate.reaction === 'aha' ||
    candidate.reaction === 'confused' ||
    candidate.reaction === 'celebrate'
      ? candidate.reaction
      : 'acknowledge';
  return {
    reply,
    reaction,
    action: normalizeAssistantAction(candidate.action),
    source: 'cloud',
  };
}

function parseFunctionPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function responseConversationMessage(value: unknown): AssistantConversationMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const content = cleanText(typeof row.content === 'string' ? row.content : null, 4_000);
  const createdAt = cleanText(
    typeof row.createdAt === 'string' ? row.createdAt : null,
    80,
  );
  const id = cleanText(typeof row.id === 'string' ? row.id : null, 36);
  const role = row.role === 'user' || row.role === 'assistant' ? row.role : null;
  if (!content || !createdAt || !id || !role) return null;
  return { content, createdAt, id, role };
}

export async function runKeepFlipAssistant({
  ownerId,
  conversationId = defaultAssistantConversationId(ownerId),
  message,
  history,
  context,
}: {
  ownerId: string;
  conversationId?: string;
  message: string;
  history: AssistantConversationMessage[];
  context: AssistantWorkspaceContext;
}): Promise<KeepFlipAssistantRun> {
  const cleanMessage = cleanText(message, 2_000);
  if (!cleanMessage) throw new Error('Tell Flip what you need help with.');
  const fallback = localAssistantReply(cleanMessage, context);
  const functionId = assistantFunctionId();
  const cleanConversationId = conversationId.trim();

  if (!functionId || !cleanConversationId) {
    return {
      ...fallback,
      conversationId: null,
      persistedMessages: [],
    };
  }

  // Conversation history is intentionally loaded by the Function from the
  // owner-scoped message table. Keeping it server-side prevents a client from
  // presenting another seller's history as prompt context.
  void history;
  const execution = await functions.createExecution({
    async: false,
    body: JSON.stringify({
      context,
      conversationId: cleanConversationId,
      message: cleanMessage,
    }),
    functionId,
    headers: { 'content-type': 'application/json' },
    method: ExecutionMethod.POST,
    xpath: '/message',
  });
  const payload = parseFunctionPayload(execution.responseBody);

  if (execution.responseStatusCode !== 200 || payload?.ok !== true) {
    const detail = cleanText(
      typeof payload?.error === 'string' ? payload.error : null,
      1_000,
    );
    throw new Error(detail || 'Flip could not respond right now.');
  }

  const reply = normalizeAssistantReply(payload.reply, fallback);
  if (reply.source !== 'cloud') {
    throw new Error('Flip returned an unreadable assistant response.');
  }
  const userMessage = responseConversationMessage(payload.userMessage);
  const assistantMessage = responseConversationMessage(payload.assistantMessage);
  if (!userMessage || !assistantMessage) {
    throw new Error('Flip could not save this conversation response.');
  }

  // Explicit navigation belongs to the app, not to a probabilistic model. The
  // Function may still supply the conversational answer, but it cannot reroute
  // a direct command such as "open Scanner" to a nearby screen like Inventory.
  const directCommand = parseAssistantCommand(cleanMessage);
  const directNavigation =
    directCommand.type === 'navigate' ? directCommand : null;
  const correctedReply = directNavigation
    ? {
        ...reply,
        action: directNavigation,
        reaction: fallback.reaction,
        reply: fallback.reply,
      }
    : reply;
  const correctedAssistantMessage = directNavigation
    ? { ...assistantMessage, content: fallback.reply }
    : assistantMessage;

  return {
    ...correctedReply,
    conversationId: cleanConversationId,
    persistedMessages: [userMessage, correctedAssistantMessage],
  };
}
