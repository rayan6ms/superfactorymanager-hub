"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import {
  NOTIFICATION_PREVIEW_LIMIT,
  NOTIFICATION_SYNC_EVENT,
  type SerializedNotification,
} from "@/lib/notifications-shared";
import {
  dispatchNotificationSync,
  type NotificationSyncDetail,
} from "@/lib/notification-events";

type HeaderNotificationsProps = {
  initialNotifications: SerializedNotification[];
  initialUnreadCount: number;
  scrollClassName?: string;
};

type ApiResponse = {
  unreadCount?: number;
  notifications?: SerializedNotification[];
};

export default function HeaderNotifications({
  initialNotifications,
  initialUnreadCount,
  scrollClassName,
}: HeaderNotificationsProps) {
  const [notifications, setNotifications] = useState<SerializedNotification[]>(
    initialNotifications.filter(notification => !notification.readAt),
  );
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dispatchNotificationSync({ unreadCount });
  }, [unreadCount]);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<NotificationSyncDetail>).detail;
      if (!detail) return;

      if (typeof detail.unreadCount === "number") {
        setUnreadCount(detail.unreadCount);
      }

      if (detail.updates?.length) {
        setNotifications(prev =>
          prev.map(item => {
            const update = detail.updates!.find(change => change.id === item.id);
            return update ? { ...item, readAt: update.readAt } : item;
          }),
        );
      }

      if (detail.preview) {
        setNotifications(detail.preview);
      }
    }

    window.addEventListener(NOTIFICATION_SYNC_EVENT, handle as EventListener);
    return () => window.removeEventListener(NOTIFICATION_SYNC_EVENT, handle as EventListener);
  }, []);

  const updateUnreadCount = useCallback(
    (next: number | ((prev: number) => number)) => {
      setUnreadCount(prev =>
        typeof next === "function" ? (next as (value: number) => number)(prev) : next,
      );
    },
    [],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      if (pendingIds.has(id)) return;

      const existingIndex = notifications.findIndex(item => item.id === id);
      const existingItem = existingIndex >= 0 ? notifications[existingIndex] : null;
      const nextNotifications = notifications.filter(item => item.id !== id);
      const timestamp = new Date().toISOString();

      setPendingIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setError(null);

      setNotifications(nextNotifications);

      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [id], read: true }),
        });
        if (!res.ok) throw new Error("Request failed");

        const data = (await res.json()) as ApiResponse;
        const nextUnreadCount = typeof data.unreadCount === "number"
          ? data.unreadCount
          : Math.max(0, unreadCount - 1);

        if (typeof data.unreadCount === "number") {
          updateUnreadCount(data.unreadCount);
        } else {
          updateUnreadCount(prev => Math.max(0, prev - 1));
        }
        dispatchNotificationSync({
          unreadCount: nextUnreadCount,
          updates: [{ id, readAt: timestamp }],
          preview: nextNotifications.slice(0, NOTIFICATION_PREVIEW_LIMIT),
        });
      } catch (err) {
        console.error(err);
        setError("We couldn’t update that notification. Please try again.");
        if (existingItem) {
          setNotifications(prev => {
            if (prev.some(item => item.id === existingItem.id)) return prev;
            const restored = [...prev];
            restored.splice(existingIndex, 0, existingItem);
            return restored;
          });
        }

      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [notifications, pendingIds, unreadCount, updateUnreadCount],
  );

  const derivedUnread = notifications.filter(n => !n.readAt).length;
  const labelCount = unreadCount ?? derivedUnread;
  const visibleCount = Math.min(notifications.length, 1);
  const extraCount = Math.max(0, labelCount - visibleCount);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="font-semibold text-white">Notifications</span>
        <span>{labelCount > 0 ? `${labelCount} unread` : "All caught up"}</span>
      </div>

      <NotificationPreviewList
        notifications={notifications}
        emptyLabel="No unread notifications"
        dense
        maxVisible={1}
        className={clsx("overflow-y-auto pr-1", scrollClassName ?? "max-h-72")}
        onMarkRead={markAsRead}
      />

      {extraCount > 0 && (
        <p className="text-[0.7rem] text-white/60">
          +{extraCount} more unread {extraCount === 1 ? "notification" : "notifications"}
        </p>
      )}

      <Link
        href="/notifications"
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white transition bg-neutral-800/50 hover:border-white/30 hover:bg-white/10"
      >
        View all notifications
      </Link>

      {error && <p className="text-[0.7rem] text-error">{error}</p>}
    </div>
  );
}
