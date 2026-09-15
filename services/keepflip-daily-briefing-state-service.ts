import * as SecureStore from 'expo-secure-store';

import type {
  AssistantAdvisory,
  AssistantReaction,
} from '@/services/keepflip-assistant-service';

const COMPLETED_DATE_KEY_PREFIX = 'keepflip.daily-briefing.completed.v1.';
const CACHE_KEY_PREFIX = 'keepflip.daily-briefing.cache.v1.';

export type KeepFlipDailyBriefingCache = {
  dateKey: string;
  reply: string;
  reaction: AssistantReaction;
  advisory: AssistantAdvisory | null;
  source: 'cloud' | 'local';
};

function keyFor(prefix: string, ownerId: string) {
  return `${prefix}${ownerId.trim()}`;
}

function isCachedBriefing(value: unknown): value is KeepFlipDailyBriefingCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const candidate = value as Partial<KeepFlipDailyBriefingCache>;
  return (
    typeof candidate.dateKey === 'string' &&
    typeof candidate.reply === 'string' &&
    (candidate.source === 'cloud' || candidate.source === 'local') &&
    (candidate.reaction === 'greeting' ||
      candidate.reaction === 'acknowledge' ||
      candidate.reaction === 'aha' ||
      candidate.reaction === 'confused' ||
      candidate.reaction === 'celebrate') &&
    (candidate.advisory === null ||
      (typeof candidate.advisory === 'object' && !Array.isArray(candidate.advisory)))
  );
}

export function keepFlipLocalDateKey(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function hasCompletedKeepFlipDailyBriefing(
  ownerId: string,
  dateKey: string,
) {
  if (!ownerId.trim() || !dateKey.trim()) return false;

  try {
    return (
      (await SecureStore.getItemAsync(keyFor(COMPLETED_DATE_KEY_PREFIX, ownerId))) ===
      dateKey
    );
  } catch {
    // Fail open so an unavailable local store never suppresses a briefing.
    return false;
  }
}

export async function getKeepFlipDailyBriefingCache(
  ownerId: string,
  dateKey: string,
) {
  if (!ownerId.trim() || !dateKey.trim()) return null;

  try {
    const raw = await SecureStore.getItemAsync(keyFor(CACHE_KEY_PREFIX, ownerId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCachedBriefing(parsed) && parsed.dateKey === dateKey ? parsed : null;
  } catch {
    return null;
  }
}

export async function cacheKeepFlipDailyBriefing(
  ownerId: string,
  briefing: KeepFlipDailyBriefingCache,
) {
  if (!ownerId.trim()) return false;

  try {
    await SecureStore.setItemAsync(
      keyFor(CACHE_KEY_PREFIX, ownerId),
      JSON.stringify(briefing),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * This is intentionally the only operation that completes a daily briefing.
 * The caller must invoke it from an explicit close/back action, never from
 * modal mount, data load, or modal unmount.
 */
export async function markKeepFlipDailyBriefingCompleted(
  ownerId: string,
  dateKey: string,
) {
  if (!ownerId.trim() || !dateKey.trim()) return false;

  try {
    await SecureStore.setItemAsync(
      keyFor(COMPLETED_DATE_KEY_PREFIX, ownerId),
      dateKey,
    );
    await SecureStore.deleteItemAsync(keyFor(CACHE_KEY_PREFIX, ownerId)).catch(
      () => undefined,
    );
    return true;
  } catch {
    // If persistence fails, the next app open safely shows the briefing again.
    return false;
  }
}
