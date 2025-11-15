"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import type { SerializedNotification } from "@/lib/notifications";

type HeaderNotificationsProps = {
  initialNotifications: SerializedNotification[];
  initialUnreadCount: number;
  /** Optional: tweak scroll height (desktop vs mobile) */
  scrollClassName?: string;
};

type ApiResponse = {
  unreadCount?: number;
};

export default function HeaderNotifications({
  initialNotifications,
  initialUnreadCount,
  scrollClassName,
}: HeaderNotificationsProps) {
  const [notifications, setNotifications] = useState<SerializedNotification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

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
          body: JSON.stringify({ ids: [id], read: true }),
        });
        if (!res.ok) throw new Error("Request failed");

        const data = (await res.json()) as ApiResponse;
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        } else {
          // fallback if API doesn’t return count
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error(err);
        setError("We couldn’t update that notification. Please try again.");

        // (optional) you could rollback here if you really care about accuracy
      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [pendingIds],
  );

  const derivedUnread = notifications.filter(n => !n.readAt).length;
  const labelCount = unreadCount ?? derivedUnread;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="font-semibold text-white">Notifications</span>
        <span>{labelCount > 0 ? `${labelCount} unread` : "All caught up"}</span>
      </div>

      <NotificationPreviewList
        notifications={notifications}
        emptyLabel="No notifications yet"
        dense
        className={clsx("overflow-y-auto pr-1", scrollClassName ?? "max-h-72")}
        onMarkRead={markAsRead}
      />

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
