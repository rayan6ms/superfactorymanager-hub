"use client";

import { NOTIFICATION_SYNC_EVENT, type SerializedNotification } from "./notifications-shared";

export type NotificationSyncDetail = {
  unreadCount?: number;
  updates?: { id: string; readAt: string | null }[];
  preview?: SerializedNotification[];
  allReadAt?: string;
};

export function dispatchNotificationSync(detail: NotificationSyncDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT, { detail }));
}
