import { db } from "./db";
import { NotificationOrigin, type Notification, Prisma } from "@prisma/client";

export const NOTIFICATION_PREVIEW_LIMIT = 5;
export const NOTIFICATION_PAGE_SIZE = 10;
export const NOTIFICATION_UNREAD_EVENT = "sfm:notifications:unread-count";
export const NOTIFICATION_SYNC_EVENT = "sfm:notifications:sync";

export type SerializedNotification = {
  id: string;
  title: string;
  message: string;
  origin: NotificationOrigin;
  link: string | null;
  imageUrl: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationQueryResult = {
  notifications: SerializedNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

const serialize = (notification: Notification): SerializedNotification => ({
  id: notification.id,
  title: notification.title,
  message: notification.message,
  origin: notification.origin,
  link: notification.link ?? null,
  imageUrl: notification.imageUrl ?? null,
  createdAt: notification.createdAt.toISOString(),
  readAt: notification.readAt ? notification.readAt.toISOString() : null,
});

export async function getNotificationPreview(userId: string, limit = NOTIFICATION_PREVIEW_LIMIT) {
  const take = Math.min(Math.max(limit, 1), 10);
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications: items.map(serialize), unreadCount };
}

export async function getNotifications(
  userId: string,
  options: { take?: number; cursor?: string | null; unreadOnly?: boolean } = {}
): Promise<NotificationQueryResult> {
  const take = Math.min(Math.max(options.take ?? NOTIFICATION_PAGE_SIZE, 1), 50);
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.unreadOnly ? { readAt: null } : {}),
  };
  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });

  let nextCursor: string | null = null;
  if (notifications.length > take) {
    const next = notifications.pop();
    nextCursor = next ? next.id : null;
  }

  const unreadCount = await db.notification.count({ where: { userId, readAt: null } });
  return {
    notifications: notifications.map(serialize),
    unreadCount,
    nextCursor,
  };
}

export async function markNotifications(
  userId: string,
  ids: string[],
  read: boolean
): Promise<{ unreadCount: number }> {
  if (!ids.length) {
    const unreadCount = await db.notification.count({ where: { userId, readAt: null } });
    return { unreadCount };
  }

  await db.notification.updateMany({
    where: { userId, id: { in: ids } },
    data: { readAt: read ? new Date() : null },
  });

  const unreadCount = await db.notification.count({ where: { userId, readAt: null } });
  return { unreadCount };
}

export async function createNotification(options: {
  userId: string;
  title: string;
  message: string;
  origin?: NotificationOrigin;
  link?: string | null;
  imageUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  markUnread?: boolean;
}) {
  const {
    userId,
    title,
    message,
    origin = NotificationOrigin.SYSTEM,
    link = null,
    imageUrl = null,
    metadata = null,
    markUnread = true,
  } = options;

  const prismaMetadata: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined =
    metadata === null ? Prisma.JsonNull : metadata;

  return db.notification.create({
    data: {
      userId,
      title,
      message,
      origin,
      link,
      imageUrl,
      metadata: prismaMetadata,
      readAt: markUnread ? null : new Date(),
    },
  });
}

export function formatNotificationTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
