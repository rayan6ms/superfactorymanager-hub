"use client";

import { dispatchNotificationSync } from "./notification-events";
import { NOTIFICATION_PREVIEW_LIMIT, type NotificationPreview } from "./notifications-shared";

export async function fetchNotificationPreview(signal?: AbortSignal): Promise<NotificationPreview> {
  const params = new URLSearchParams({
    limit: String(NOTIFICATION_PREVIEW_LIMIT),
    unreadOnly: "1",
  });
  const res = await fetch(`/api/notifications?${params}`, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}

export async function updateNotifications(
  action: { ids: string[]; read: boolean } | { all: true; read: true },
) {
  const res = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(action),
  });
  if (!res.ok) throw new Error("Failed to update notifications");
  const data = (await res.json()) as NotificationPreview;
  const readAt = action.read ? new Date().toISOString() : null;
  dispatchNotificationSync({
    unreadCount: data.unreadCount,
    preview: data.notifications,
    ...("ids" in action
      ? { updates: action.ids.map((id) => ({ id, readAt })) }
      : { allReadAt: readAt! }),
  });
  return data;
}
