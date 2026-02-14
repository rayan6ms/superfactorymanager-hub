"use client";

import {
  NOTIFICATION_SYNC_EVENT,
  NOTIFICATION_UNREAD_EVENT,
  type SerializedNotification,
} from "./notifications-shared";

export type NotificationSyncDetail = {
  unreadCount?: number;
  updates?: { id: string; readAt: string | null }[];
  preview?: SerializedNotification[];
};

export function dispatchNotificationSync(detail: NotificationSyncDetail) {
  if (typeof window === "undefined") return;

  if (typeof detail.unreadCount === "number") {
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_UNREAD_EVENT, { detail: { count: detail.unreadCount } }),
    );
  }

  window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT, { detail }));
}
