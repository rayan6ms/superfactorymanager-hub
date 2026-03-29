import { db } from "./db";
import { NotificationOrigin, type Notification, Prisma } from "@prisma/client";
import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_PREVIEW_LIMIT,
  normalizeNotificationLink,
  type SerializedNotification,
} from "./notifications-shared";
export * from "./notifications-shared";

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
  link: normalizeNotificationLink(notification.link),
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
  options: {
    take?: number;
    cursor?: string | null;
    unreadOnly?: boolean;
    includeUnreadCount?: boolean;
    unreadCountHint?: number;
  } = {},
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

  const shouldIncludeUnreadCount = options.includeUnreadCount !== false;
  const unreadCount = shouldIncludeUnreadCount
    ? await db.notification.count({ where: { userId, readAt: null } })
    : Math.max(0, Math.floor(options.unreadCountHint ?? 0));

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

  const notification = await db.notification.create({
    data: {
      userId,
      title,
      message,
      origin,
      link: normalizeNotificationLink(link),
      imageUrl,
      metadata: prismaMetadata,
      readAt: markUnread ? null : new Date(),
    },
  });

  void maybeSendNotificationEmail(notification).catch(error => {
    console.warn("Failed to process notification email delivery", error);
  });

  return notification;
}

type EmailMetadataFlags = {
  disabled: boolean;
  force: boolean;
};

function readEmailMetadataFlags(metadata: Prisma.JsonValue | null): EmailMetadataFlags {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { disabled: false, force: false };
  }

  const emailNode = (metadata as Record<string, unknown>).email;
  if (!emailNode || typeof emailNode !== "object" || Array.isArray(emailNode)) {
    return { disabled: false, force: false };
  }

  const emailConfig = emailNode as Record<string, unknown>;
  return {
    disabled: emailConfig.disabled === true,
    force: emailConfig.force === true,
  };
}

function isOriginEmailEnabled(
  origin: NotificationOrigin,
  prefs: {
    emailNotifyPost: boolean;
    emailNotifySystem: boolean;
    emailNotifyReport: boolean;
  },
) {
  switch (origin) {
    case NotificationOrigin.POST:
      return prefs.emailNotifyPost;
    case NotificationOrigin.REPORT:
      return prefs.emailNotifyReport;
    case NotificationOrigin.SYSTEM:
    default:
      return prefs.emailNotifySystem;
  }
}

async function maybeSendNotificationEmail(notification: Notification) {
  if (notification.readAt) return;
  if (notification.emailedAt) return;

  const metadataFlags = readEmailMetadataFlags(notification.metadata as Prisma.JsonValue | null);
  if (metadataFlags.disabled) return;

  const user = await db.user.findUnique({
    where: { id: notification.userId },
    select: {
      email: true,
      name: true,
      emailVerified: true,
      emailNotificationsEnabled: true,
      emailNotifyPost: true,
      emailNotifySystem: true,
      emailNotifyReport: true,
    },
  });

  if (!user?.emailVerified) return;
  if (!user.emailNotificationsEnabled) return;
  if (!metadataFlags.force && !isOriginEmailEnabled(notification.origin, user)) return;

  try {
    const { sendNotificationEmail } = await import("./email");
    await sendNotificationEmail({
      to: user.email,
      name: user.name,
      notification: {
        title: notification.title,
        message: notification.message,
        origin: notification.origin,
        link: notification.link,
      },
    });
  } catch (error) {
    console.warn("Failed to send notification email", error);
    return;
  }

  await db.notification.updateMany({
    where: { id: notification.id, emailedAt: null },
    data: { emailedAt: new Date() },
  });
}
