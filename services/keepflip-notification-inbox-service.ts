import {
  Channel,
  Query,
  databases,
  realtime,
} from '@/lib/appwrite';
import type { Models, RealtimeSubscription } from 'react-native-appwrite';

export type KeepFlipNotificationSource =
  | 'ebay'
  | 'keepflip'
  | 'subscription'
  | 'seller_operations'
  | 'system';

export type KeepFlipNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type KeepFlipNotificationEmailOptions = {
  enabled?: boolean;
  subject?: string;
  body?: string;
};

/**
 * Payload values are authored by trusted server-side writers. The optional
 * email object is consumed by the notification delivery Function; it is not
 * a client-side email-sending capability.
 */
export type KeepFlipNotificationPayload = Record<string, unknown> & {
  email?: boolean | KeepFlipNotificationEmailOptions;
};

export type KeepFlipNotification = {
  id: string;
  ownerId: string;
  source: KeepFlipNotificationSource | string;
  kind: string;
  severity: KeepFlipNotificationSeverity | string;
  title: string;
  body: string;
  url?: string;
  externalId?: string;
  threadId?: string;
  dedupeKey: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
  payload?: KeepFlipNotificationPayload;
};

type NotificationDocument = Models.Document &
  Omit<KeepFlipNotification, 'id' | 'payload'> & {
    payload?: string;
  };

function configuration() {
  const databaseId = process.env.EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_DATABASE_ID?.trim();
  const collectionId = process.env.EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_COLLECTION_ID?.trim();
  if (!databaseId || !collectionId) {
    throw new Error(
      'KeepFlip notifications are not configured. Add EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_DATABASE_ID and EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_COLLECTION_ID.',
    );
  }
  return { databaseId, collectionId };
}

function cleanId(value: string) {
  const id = value.trim();
  if (!id) throw new Error('A valid KeepFlip account is required for notifications.');
  return id;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePayload(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function documentToNotification(document: Models.Document): KeepFlipNotification | null {
  const row = document as Partial<NotificationDocument>;
  const ownerId = optionalText(row.ownerId);
  const source = optionalText(row.source);
  const kind = optionalText(row.kind);
  const severity = optionalText(row.severity);
  const title = optionalText(row.title);
  const body = optionalText(row.body);
  const dedupeKey = optionalText(row.dedupeKey);
  const createdAt = optionalText(row.createdAt);
  const updatedAt = optionalText(row.updatedAt);
  if (
    !ownerId ||
    !source ||
    !kind ||
    !severity ||
    !title ||
    !body ||
    !dedupeKey ||
    !createdAt ||
    !updatedAt ||
    typeof row.read !== 'boolean'
  ) {
    return null;
  }

  return {
    id: document.$id,
    ownerId,
    source,
    kind,
    severity,
    title,
    body,
    ...(optionalText(row.url) ? { url: optionalText(row.url) } : {}),
    ...(optionalText(row.externalId)
      ? { externalId: optionalText(row.externalId) }
      : {}),
    ...(optionalText(row.threadId) ? { threadId: optionalText(row.threadId) } : {}),
    dedupeKey,
    read: row.read,
    createdAt,
    updatedAt,
    ...(parsePayload(row.payload)
      ? { payload: parsePayload(row.payload) as KeepFlipNotificationPayload }
      : {}),
  };
}

export async function listKeepFlipNotifications(
  ownerIdValue: string,
  { unreadOnly = false, limit = 100 }: { unreadOnly?: boolean; limit?: number } = {},
) {
  const ownerId = cleanId(ownerIdValue);
  const { databaseId, collectionId } = configuration();
  const queries = [
    Query.equal('ownerId', [ownerId]),
    Query.orderDesc('createdAt'),
    Query.limit(Math.min(Math.max(limit, 1), 100)),
  ];
  if (unreadOnly) queries.splice(1, 0, Query.equal('read', [false]));

  const response = await databases.listDocuments({
    databaseId,
    collectionId,
    queries,
  });
  return response.documents
    .map(documentToNotification)
    .filter((notification): notification is KeepFlipNotification => Boolean(notification));
}

export async function markKeepFlipNotificationRead(
  ownerIdValue: string,
  notificationIdValue: string,
) {
  const ownerId = cleanId(ownerIdValue);
  const notificationId = notificationIdValue.trim();
  if (!notificationId) throw new Error('A valid notification is required.');

  const { databaseId, collectionId } = configuration();
  const existing = await databases.getDocument({
    databaseId,
    collectionId,
    documentId: notificationId,
  });
  if ((existing as Partial<NotificationDocument>).ownerId !== ownerId) {
    throw new Error('That notification does not belong to the signed-in account.');
  }

  const updated = await databases.updateDocument({
    databaseId,
    collectionId,
    documentId: notificationId,
    data: { read: true, updatedAt: new Date().toISOString() },
  });
  return documentToNotification(updated);
}

export async function markAllKeepFlipNotificationsRead(ownerIdValue: string) {
  const ownerId = cleanId(ownerIdValue);
  const unread = await listKeepFlipNotifications(ownerId, { unreadOnly: true });
  await Promise.all(unread.map((notification) =>
    markKeepFlipNotificationRead(ownerId, notification.id),
  ));
  return unread.length;
}

export function subscribeToKeepFlipNotifications(
  ownerIdValue: string,
  onChange: () => void,
  onError?: (error: unknown) => void,
) {
  const ownerId = cleanId(ownerIdValue);
  const { databaseId, collectionId } = configuration();
  let disposed = false;
  let subscription: RealtimeSubscription | null = null;

  void realtime
    .subscribe(
      [
        Channel.database(databaseId).collection(collectionId).document().create(),
        Channel.database(databaseId).collection(collectionId).document().update(),
      ],
      () => {
        if (!disposed) onChange();
      },
      [Query.equal('ownerId', [ownerId])],
    )
    .then((nextSubscription) => {
      if (disposed) {
        void nextSubscription.unsubscribe();
        return;
      }
      subscription = nextSubscription;
    })
    .catch((error) => {
      if (!disposed) onError?.(error);
    });

  return () => {
    disposed = true;
    void subscription?.unsubscribe();
  };
}
