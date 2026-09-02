import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REQUIRED_SAVED_ITEMS = 3;
const REVIEW_COOLDOWN_DAYS = 120;
const REVIEW_COOLDOWN_MS =
  REVIEW_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

const STORAGE_KEY_PREFIX = 'keepflip.in-app-review.milestone.v1';

type KeepflipInAppReviewNativeModule = {
  /**
   * Resolves when the Play review flow finishes. This does not mean the user
   * saw the dialog or submitted a rating.
   */
  requestReview(): Promise<boolean>;
};

type ReviewMilestoneState = {
  version: 1;
  /**
   * Unique inventory items counted toward the next review milestone.
   * This list resets after a review request so another three saves are needed.
   */
  savedItemIds: string[];
  /**
   * Timestamp of the last request attempt, not a rating result.
   */
  lastReviewAttemptAt: string | null;
};

/**
 * `requireOptionalNativeModule` is intentional:
 * - Android production/dev builds with the custom module can show the review flow.
 * - Expo Go, web, iOS, and older builds safely do nothing.
 */
const inAppReviewModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<KeepflipInAppReviewNativeModule>(
        'KeepflipInAppReview'
      )
    : null;

function storageKeyFor(ownerId: string): string {
  return `${STORAGE_KEY_PREFIX}.${ownerId}`;
}

function emptyState(): ReviewMilestoneState {
  return {
    version: 1,
    savedItemIds: [],
    lastReviewAttemptAt: null,
  };
}

function normalizeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isWithinCooldown(lastReviewAttemptAt: string | null): boolean {
  if (!lastReviewAttemptAt) {
    return false;
  }

  const attemptTime = Date.parse(lastReviewAttemptAt);

  if (Number.isNaN(attemptTime)) {
    return false;
  }

  return Date.now() - attemptTime < REVIEW_COOLDOWN_MS;
}

async function readState(storageKey: string): Promise<ReviewMilestoneState> {
  const rawState = await SecureStore.getItemAsync(storageKey);

  if (!rawState) {
    return emptyState();
  }

  try {
    const parsed = JSON.parse(rawState) as Partial<ReviewMilestoneState>;

    const savedItemIds = Array.isArray(parsed.savedItemIds)
      ? parsed.savedItemIds
          .map(normalizeId)
          .filter(Boolean)
          .filter(
            (itemId, index, itemIds) => itemIds.indexOf(itemId) === index
          )
          .slice(-REQUIRED_SAVED_ITEMS)
      : [];

    return {
      version: 1,
      savedItemIds,
      lastReviewAttemptAt:
        typeof parsed.lastReviewAttemptAt === 'string'
          ? parsed.lastReviewAttemptAt
          : null,
    };
  } catch {
    // A corrupt or obsolete local value should never interfere with inventory.
    return emptyState();
  }
}

async function writeState(
  storageKey: string,
  state: ReviewMilestoneState
): Promise<void> {
  await SecureStore.setItemAsync(storageKey, JSON.stringify(state));
}

/**
 * Call only after a paid inventory item, its photos, and any bookkeeping have
 * all saved successfully. This function intentionally never throws, so it
 * cannot turn a successful inventory save into a failure.
 */
export async function noteSuccessfulInventorySave({
  ownerId,
  itemId,
}: {
  ownerId: string;
  itemId: string;
}): Promise<void> {
  if (Platform.OS !== 'android' || !inAppReviewModule) {
    return;
  }

  const normalizedOwnerId = normalizeId(ownerId);
  const normalizedItemId = normalizeId(itemId);

  if (!normalizedOwnerId || !normalizedItemId) {
    return;
  }

  const storageKey = storageKeyFor(normalizedOwnerId);

  try {
    const currentState = await readState(storageKey);

    // Editing/retrying the same saved item must not advance the milestone.
    if (currentState.savedItemIds.includes(normalizedItemId)) {
      return;
    }

    const nextState: ReviewMilestoneState = {
      ...currentState,
      savedItemIds: [
        ...currentState.savedItemIds,
        normalizedItemId,
      ].slice(-REQUIRED_SAVED_ITEMS),
    };

    // Always remember a valid successful save, even during the cooldown.
    await writeState(storageKey, nextState);

    if (
      nextState.savedItemIds.length < REQUIRED_SAVED_ITEMS ||
      isWithinCooldown(nextState.lastReviewAttemptAt)
    ) {
      return;
    }

    /*
     * Record the attempt before requesting the Play flow. Google may suppress
     * the dialog due to quota, and the app cannot determine whether the user
     * rated it, so we must not repeatedly retry or prompt the user ourselves.
     */
    const attemptedState: ReviewMilestoneState = {
      ...nextState,
      lastReviewAttemptAt: new Date().toISOString(),
    };

    await writeState(storageKey, attemptedState);

    try {
      await inAppReviewModule.requestReview();
    } catch {
      // Review availability must never affect inventory saving.
    } finally {
      /*
       * A future review attempt requires another three successful item saves,
       * plus the 120-day cooldown.
       */
      await writeState(storageKey, {
        ...attemptedState,
        savedItemIds: [],
      }).catch(() => undefined);
    }
  } catch {
    // SecureStore or Play Review failures are deliberately non-blocking.
  }
}