import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';

export type PlaidBankAccount = {
  id: string;
  mask: string | null;
  name: string | null;
  subtype: string | null;
  type: string | null;
};

export type PlaidBankConnection = {
  accounts: PlaidBankAccount[];
  connectionId: string;
  institutionId: string | null;
  institutionName: string;
  itemId: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  status: string;
};

export type PlaidBankStatus = {
  automationEnabled: boolean;
  connections: PlaidBankConnection[];
};

export type PlaidBankSyncResult = {
  connections: number;
  errors: string[];
  failedConnections: number;
  hasMore: boolean;
  ignored: number;
  imported: number;
  needsReview: number;
  pending: number;
  removed: number;
  updated: number;
};

export type PlaidBankLinkResult = {
  connection: PlaidBankConnection;
  sync: PlaidBankSyncResult;
};

export type PlaidExchangeInput = {
  accounts: PlaidBankAccount[];
  institution: { id?: string; name?: string } | null;
  publicToken: string;
};

export type PlaidLinkPlatform = 'android' | 'web';

type FunctionPayload = Record<string, unknown>;

function bookkeepingFunctionId() {
  const functionId = APPWRITE.bookkeepingFunctionId;
  if (!functionId) {
    throw new Error(
      'Automated bank expenses are not configured in this build yet. Add EXPO_PUBLIC_APPWRITE_BOOKKEEPING_FUNCTION_ID after the Books Function is deployed.',
    );
  }
  return functionId;
}

function parsePayload(value: string): FunctionPayload {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FunctionPayload)
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown, maximum = 8_000) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : '';
}

function functionError(responseBody: string, fallback: string) {
  const payload = parsePayload(responseBody);
  const error = text(payload.error, 500);
  return new Error(error || fallback);
}

function account(value: unknown): PlaidBankAccount | null {
  const raw = value && typeof value === 'object' ? (value as FunctionPayload) : {};
  const id = text(raw.id, 180);
  if (!id) return null;
  return {
    id,
    mask: text(raw.mask, 8) || null,
    name: text(raw.name, 255) || null,
    subtype: text(raw.subtype, 80) || null,
    type: text(raw.type, 80) || null,
  };
}

function accounts(value: unknown): PlaidBankAccount[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = account(item);
        return parsed ? [parsed] : [];
      })
    : [];
}

function connection(value: unknown): PlaidBankConnection | null {
  const raw = value && typeof value === 'object' ? (value as FunctionPayload) : {};
  const connectionId = text(raw.connectionId, 64);
  const itemId = text(raw.itemId, 180);
  if (!connectionId || !itemId) return null;
  return {
    accounts: accounts(raw.accounts),
    connectionId,
    institutionId: text(raw.institutionId, 180) || null,
    institutionName: text(raw.institutionName, 255) || 'Connected bank',
    itemId,
    lastError: text(raw.lastError, 500) || null,
    lastSyncedAt: text(raw.lastSyncedAt, 80) || null,
    status: text(raw.status, 40) || 'connected',
  };
}

async function executeBankFunction(
  xpath:
    | '/plaid/link-token'
    | '/plaid/exchange'
    | '/plaid/status'
    | '/plaid/sync'
    | '/plaid/disconnect',
  body: Record<string, unknown> = {},
) {
  return functions.createExecution({
    async: false,
    body: JSON.stringify(body),
    functionId: bookkeepingFunctionId(),
    headers: { 'content-type': 'application/json' },
    method: ExecutionMethod.POST,
    xpath,
  });
}

export function isPlaidBankingConfigured() {
  return Boolean(APPWRITE.bookkeepingFunctionId);
}

export async function createPlaidLinkToken(platform: PlaidLinkPlatform) {
  const execution = await executeBankFunction('/plaid/link-token', { platform });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not prepare secure bank linking.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  const linkToken = text(payload.linkToken, 4_096);
  if (payload.ok !== true || !linkToken) {
    throw new Error('The bank-link service did not return a usable Link token.');
  }
  return {
    automationEnabled: payload.automationEnabled === true,
    expiration: text(payload.expiration, 80) || null,
    linkToken,
  };
}

export async function exchangePlaidPublicToken(input: PlaidExchangeInput) {
  const execution = await executeBankFunction('/plaid/exchange', {
    accounts: input.accounts.slice(0, 50),
    institution: input.institution,
    publicToken: input.publicToken,
  });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not finish connecting that bank account.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  const parsedConnection = connection(payload.connection);
  if (payload.ok !== true || !parsedConnection) {
    throw new Error('The bank-link service did not confirm the connection.');
  }
  return parsedConnection;
}

export async function getPlaidBankStatus(): Promise<PlaidBankStatus> {
  const execution = await executeBankFunction('/plaid/status');
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not read your connected bank accounts.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  if (payload.ok !== true || !Array.isArray(payload.connections)) {
    throw new Error('The bank-link service returned an invalid connection status.');
  }
  return {
    automationEnabled: payload.automationEnabled === true,
    connections: payload.connections.flatMap((item) => {
      const parsed = connection(item);
      return parsed ? [parsed] : [];
    }),
  };
}

export async function syncPlaidBankTransactions(
  connectionId?: string,
): Promise<PlaidBankSyncResult> {
  const execution = await executeBankFunction(
    '/plaid/sync',
    connectionId ? { connectionId } : {},
  );
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not sync bank expenses.',
    );
  }
  const payload = parsePayload(execution.responseBody);
  if (payload.ok !== true) {
    throw new Error('The bank-sync service did not confirm the sync.');
  }
  return {
    connections: Number(payload.connections) || 0,
    errors: Array.isArray(payload.errors)
      ? payload.errors.flatMap((value) => {
          const parsed = text(value, 500);
          return parsed ? [parsed] : [];
        })
      : [],
    failedConnections: Number(payload.failedConnections) || 0,
    hasMore: payload.hasMore === true,
    ignored: Number(payload.ignored) || 0,
    imported: Number(payload.imported) || 0,
    needsReview: Number(payload.needsReview) || 0,
    pending: Number(payload.pending) || 0,
    removed: Number(payload.removed) || 0,
    updated: Number(payload.updated) || 0,
  };
}

export async function disconnectPlaidBankConnection(connectionId: string) {
  const execution = await executeBankFunction('/plaid/disconnect', { connectionId });
  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not disconnect that bank account.',
    );
  }
}
