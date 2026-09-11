import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const KEEPFLIP_NOTIFICATION_CHANNEL_ID = 'keepflip-work';

export type KeepFlipReminderScheduleResult =
  | { status: 'scheduled'; identifier: string }
  | { status: 'skipped' | 'permission_denied' | 'unsupported' };

export type KeepFlipScheduledReminder = {
  body: string;
  dueAt: string;
  requestPermission?: boolean;
  taskId: string;
  title: string;
  url: string;
};

function canUseNotifications() {
  return Platform.OS !== 'web';
}

function hasNotificationPermission(
  settings: Notifications.NotificationPermissionsStatus,
) {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function prepareAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(
    KEEPFLIP_NOTIFICATION_CHANNEL_ID,
    {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: 'KeepFlip reminders',
      vibrationPattern: [0, 160, 100, 160],
    },
  );
}

/**
 * Ask only at the moment a user creates a dated reminder. Existing reminders
 * are rehydrated silently when the app has already been allowed to alert.
 */
export async function ensureKeepFlipNotificationPermission({
  requestIfNeeded = true,
}: {
  requestIfNeeded?: boolean;
} = {}) {
  if (!canUseNotifications()) return false;

  await prepareAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (hasNotificationPermission(existing)) return true;
  if (!requestIfNeeded) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return hasNotificationPermission(requested);
}

function reminderTaskId(request: Notifications.NotificationRequest, taskId: string) {
  return request.content.data?.taskId === taskId;
}

export async function cancelKeepFlipTaskReminder(taskId: string) {
  if (!canUseNotifications() || !taskId.trim()) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => reminderTaskId(request, taskId))
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

export async function scheduleKeepFlipTaskReminder({
  body,
  dueAt,
  requestPermission = true,
  taskId,
  title,
  url,
}: KeepFlipScheduledReminder): Promise<KeepFlipReminderScheduleResult> {
  if (!canUseNotifications()) return { status: 'unsupported' };

  const dueDate = new Date(dueAt);
  if (!Number.isFinite(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
    return { status: 'skipped' };
  }

  const allowed = await ensureKeepFlipNotificationPermission({ requestIfNeeded: requestPermission });
  if (!allowed) return { status: 'permission_denied' };

  await cancelKeepFlipTaskReminder(taskId);
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      body: body.trim().slice(0, 240),
      data: {
        kind: 'keepflip_reminder',
        taskId,
        url,
      },
      title: title.trim().slice(0, 120),
    },
    trigger: {
      channelId: KEEPFLIP_NOTIFICATION_CHANNEL_ID,
      date: dueDate,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    },
  });

  return { identifier, status: 'scheduled' };
}

export function notificationRouteFromData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = (value as Record<string, unknown>).url;
  return typeof url === 'string' &&
    url.startsWith('/') &&
    !url.startsWith('//')
    ? url
    : null;
}

export function configureKeepFlipNotificationHandler() {
  if (!canUseNotifications()) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
