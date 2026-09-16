import type { SerializedNotification } from "../../src/lib/notifications-shared";

export function notification(id: string, read = false): SerializedNotification {
  return {
    id,
    title: `Notification ${id}`,
    message: `Message ${id}`,
    origin: "SYSTEM",
    createdAt: "2026-09-16T12:00:00.000Z",
    readAt: read ? "2026-09-16T13:00:00.000Z" : null,
    link: null,
    imageUrl: null,
  };
}

export function preview(items: SerializedNotification[]) {
  const unread = items.filter((item) => !item.readAt);
  return { notifications: unread.slice(0, 5), unreadCount: unread.length };
}
