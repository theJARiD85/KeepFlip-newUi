import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from '@/lib/appwrite';

export const ASSISTANT_MEMORY_CATEGORIES = [
  'business_profile',
  'sourcing_preference',
  'buying_rule',
  'workflow_preference',
  'goal',
  'communication_preference',
] as const;

export type AssistantMemoryCategory = (typeof ASSISTANT_MEMORY_CATEGORIES)[number];

export type AssistantMemoryFact = {
  category: AssistantMemoryCategory;
  key: string;
  updatedAt: string | null;
  value: string;
};

export type AssistantMemorySnapshot = {
  facts: AssistantMemoryFact[];
  updatedAt: string | null;
};

export const MAX_ASSISTANT_MEMORY_FACTS = 32;
export const MAX_ASSISTANT_MEMORY_FACT_LENGTH = 500;

function assistantFunctionId() {
  const functionId = APPWRITE.assistantFunctionId.trim();
  if (!functionId) {
    throw new Error(
      'AI preferences are not connected in this build. Your changes have not been saved.',
    );
  }
  return functionId;
}

function parsePayload(responseBody: string) {
  try {
    const payload: unknown = JSON.parse(responseBody);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('not an object');
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new Error('Flip returned an unreadable AI preferences response. Try again.');
  }
}

async function executeMemoryRequest(
  method: ExecutionMethod,
  body?: Record<string, unknown>,
) {
  const execution = await functions.createExecution({
    async: false,
    ...(body ? { body: JSON.stringify(body) } : {}),
    functionId: assistantFunctionId(),
    headers: { 'content-type': 'application/json' },
    method,
    xpath: '/memory',
  });
  const payload = parsePayload(execution.responseBody);

  if (
    execution.status !== 'completed' ||
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300 ||
    payload.ok !== true
  ) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'Flip could not update AI preferences right now. Try again.',
    );
  }

  return payload;
}

function isAssistantMemoryCategory(value: unknown): value is AssistantMemoryCategory {
  return (
    typeof value === 'string' &&
    (ASSISTANT_MEMORY_CATEGORIES as readonly string[]).includes(value)
  );
}

function parseSnapshot(payload: Record<string, unknown>): AssistantMemorySnapshot {
  const rawMemory = payload.memory;
  if (!rawMemory || typeof rawMemory !== 'object' || Array.isArray(rawMemory)) {
    throw new Error('Flip returned an invalid AI preferences record. Try again.');
  }

  const memory = rawMemory as Record<string, unknown>;
  if (!Array.isArray(memory.facts) || memory.facts.length > MAX_ASSISTANT_MEMORY_FACTS) {
    throw new Error('Flip returned an invalid AI preferences list. Try again.');
  }

  const facts = memory.facts.map((candidate): AssistantMemoryFact => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Flip returned an invalid AI memory. Try again.');
    }

    const fact = candidate as Record<string, unknown>;
    if (
      typeof fact.key !== 'string' ||
      !fact.key.trim() ||
      fact.key.length > 48 ||
      !isAssistantMemoryCategory(fact.category) ||
      typeof fact.value !== 'string' ||
      !fact.value.trim() ||
      fact.value.length > MAX_ASSISTANT_MEMORY_FACT_LENGTH
    ) {
      throw new Error('Flip returned an invalid AI memory. Try again.');
    }

    return {
      category: fact.category,
      key: fact.key,
      updatedAt: typeof fact.updatedAt === 'string' ? fact.updatedAt : null,
      value: fact.value,
    };
  });

  return {
    facts,
    updatedAt: typeof memory.updatedAt === 'string' ? memory.updatedAt : null,
  };
}

export async function getAssistantMemory(): Promise<AssistantMemorySnapshot> {
  return parseSnapshot(await executeMemoryRequest(ExecutionMethod.GET));
}

export async function saveAssistantMemory(
  facts: AssistantMemoryFact[],
): Promise<AssistantMemorySnapshot> {
  if (facts.length > MAX_ASSISTANT_MEMORY_FACTS) {
    throw new Error(
      `Keep at most ${MAX_ASSISTANT_MEMORY_FACTS} memories so Flip can use them reliably.`,
    );
  }

  return parseSnapshot(
    await executeMemoryRequest(ExecutionMethod.POST, {
      facts: facts.map(({ category, key, updatedAt, value }) => ({
        category,
        key,
        updatedAt,
        value,
      })),
    }),
  );
}
