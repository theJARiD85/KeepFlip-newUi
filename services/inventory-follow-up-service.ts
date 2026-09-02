import type { InventoryItem } from '@/services/inventory-service';
import { createAssistantTask } from '@/services/keepflip-assistant-service';
import {
  scheduleKeepFlipTaskReminder,
  type KeepFlipReminderScheduleResult,
} from '@/services/keepflip-notification-service';

const MINIMUM_LISTING_PHOTO_COUNT = 4;

function nextWorkdayReminder() {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 1);
  dueAt.setHours(10, 0, 0, 0);
  return dueAt.toISOString();
}

export type InventoryFollowUpResult =
  | { status: 'not_needed' }
  | {
      status: 'created';
      taskId: string;
      notification: KeepFlipReminderScheduleResult;
    };

/**
 * Adds one purposeful reminder when a new inventory item is still missing the
 * minimum photo evidence needed for a confident marketplace listing.
 */
export async function createInventoryMediaFollowUp({
  item,
  ownerId,
}: {
  item: InventoryItem;
  ownerId: string;
}): Promise<InventoryFollowUpResult> {
  const missingPhotoCount = Math.max(
    0,
    MINIMUM_LISTING_PHOTO_COUNT - item.photoCount,
  );
  if (!ownerId.trim() || missingPhotoCount === 0) {
    return { status: 'not_needed' };
  }

  const plural = missingPhotoCount === 1 ? '' : 's';
  const task = await createAssistantTask({
    description:
      'Add clear full-item photos plus labels, flaws, and measurements before listing.',
    dueAt: nextWorkdayReminder(),
    ownerId,
    priority: 2,
    source: 'system',
    taskType: 'reminder',
    title:
      'Add ' +
      missingPhotoCount +
      ' more photo' +
      plural +
      ' for ' +
      item.title,
  });

  const notification = await scheduleKeepFlipTaskReminder({
    body:
      'Add ' +
      missingPhotoCount +
      ' more photo' +
      plural +
      ', plus labels, flaws, and measurements before listing.',
    dueAt: task.dueAt!,
    requestPermission: true,
    taskId: task.id,
    title: 'Finish this item',
    url:
      '/listing-guide?itemId=' +
      encodeURIComponent(item.id) +
      '&focus=photos',
  }).catch(() => ({ status: 'permission_denied' } as const));

  return { notification, status: 'created', taskId: task.id };
}
