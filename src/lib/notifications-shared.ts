import { NotificationOrigin } from "@prisma/client";

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

export function normalizeNotificationLink(link: string | null | undefined): string | null {
  if (typeof link !== "string") return null;

  const trimmed = link.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed;
}

export function withNotificationSource(link: string | null | undefined): string | null {
  const href = normalizeNotificationLink(link);
  if (!href) return null;

  if (
    href.includes("from=notifications") ||
    href.includes("source=notifications") ||
    href.includes("fromNotifications")
  ) {
    return href;
  }

  const [pathAndQuery, hash] = href.split("#");
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  const next = `${pathAndQuery}${separator}from=notifications`;
  return hash ? `${next}#${hash}` : next;
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
