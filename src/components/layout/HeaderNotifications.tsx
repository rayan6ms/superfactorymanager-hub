"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import {
  NOTIFICATION_PREVIEW_LIMIT,
  NOTIFICATION_UNREAD_EVENT,
  type SerializedNotification,
} from "@/lib/notifications";

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
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_UNREAD_EVENT, { detail: { count: unreadCount } }),
    );
  }, [unreadCount]);

  const updateUnreadCount = useCallback(
    (next: number | ((prev: number) => number)) => {
      setUnreadCount(prev =>
        typeof next === "function" ? (next as (value: number) => number)(prev) : next,
      );
    },
    [],
  );

  const refreshPreview = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(NOTIFICATION_PREVIEW_LIMIT),
        unreadOnly: "1",
      });
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ApiResponse;
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications.filter(notification => !notification.readAt));
      }
      if (typeof data.unreadCount === "number") {
        updateUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error(err);
    }
  }, [updateUnreadCount]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (pendingIds.has(id)) return;

      setPendingIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setError(null);

      const timestamp = new Date().toISOString();

      // optimistic update
      setNotifications(prev =>
        prev.map(item => (item.id === id ? { ...item, readAt: timestamp } : item)),
      );

      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [id], read: true }),
        });
        if (!res.ok) throw new Error("Request failed");

        const data = (await res.json()) as ApiResponse;
        if (typeof data.unreadCount === "number") {
          updateUnreadCount(data.unreadCount);
        } else {
          updateUnreadCount(prev => Math.max(0, prev - 1));
        }
        await refreshPreview();
      } catch (err) {
        console.error(err);
        setError("We couldn’t update that notification. Please try again.");

      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [pendingIds, refreshPreview, updateUnreadCount],
  );

  const derivedUnread = notifications.filter(n => !n.readAt).length;
  const labelCount = unreadCount ?? derivedUnread;
  const visibleCount = Math.min(notifications.length, 1);
  const extraCount = Math.max(0, labelCount - visibleCount);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
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
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
      >
        View all notifications
      </Link>

      {error && <p className="text-[0.7rem] text-error">{error}</p>}
    </div>
  );
}
