"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import { type SerializedNotification } from "@/lib/notifications-shared";

type HeaderNotificationsProps = {
  notifications: SerializedNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => Promise<void>;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  scrollClassName?: string;
};

export default function HeaderNotifications({
  notifications,
  unreadCount,
  onMarkRead,
  loading = false,
  loadError,
  onRetry,
  scrollClassName,
}: HeaderNotificationsProps) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const markAsRead = useCallback(
    async (id: string) => {
      if (pendingIds.has(id)) return;

      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setError(null);

      try {
        await onMarkRead(id);
      } catch (err) {
        console.error(err);
        setError("We couldn’t update that notification. Please try again.");
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onMarkRead, pendingIds],
  );

  const labelCount = unreadCount;
  const visibleCount = Math.min(notifications.length, 1);
  const extraCount = Math.max(0, labelCount - visibleCount);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="font-semibold text-white">Notifications</span>
        <span>
          {labelCount > 0
            ? `${labelCount} unread`
            : loading
              ? "Loading…"
              : loadError
                ? "Unavailable"
                : "All caught up"}
        </span>
      </div>

      {notifications.length > 0 || (!loading && !loadError) ? (
        <NotificationPreviewList
          notifications={notifications}
          emptyLabel="No unread notifications"
          dense
          maxVisible={1}
          className={clsx("overflow-y-auto pr-1", scrollClassName ?? "max-h-72")}
          onMarkRead={markAsRead}
          pendingIds={pendingIds}
        />
      ) : loading ? (
        <output className="text-xs text-white/60">Loading notifications…</output>
      ) : null}

      {loadError && (
        <div role="alert" className="text-xs text-error">
          <p>{loadError}</p>
          <button type="button" onClick={onRetry} className="mt-2 underline">
            Retry
          </button>
        </div>
      )}

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

      {error && (
        <p role="alert" className="text-[0.7rem] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
