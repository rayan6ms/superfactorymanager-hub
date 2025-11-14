"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, Loader2, RefreshCw } from "lucide-react";
import clsx from "clsx";
import {
  NOTIFICATION_PAGE_SIZE,
  formatNotificationTimestamp,
  type SerializedNotification,
} from "@/lib/notifications";

const ORIGIN_LABEL: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "System",
  POST: "Post",
};

const ORIGIN_COLOR: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "bg-emerald-500/20 text-emerald-200",
  POST: "bg-sky-500/20 text-sky-200",
};

type NotificationCenterProps = {
  initialNotifications: SerializedNotification[];
  initialUnreadCount: number;
  initialCursor: string | null;
};

type ApiResponse = {
  notifications?: SerializedNotification[];
  unreadCount?: number;
  nextCursor?: string | null;
};

export default function NotificationCenter({
  initialNotifications,
  initialUnreadCount,
  initialCursor,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<SerializedNotification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const unreadIds = useMemo(() => notifications.filter(item => !item.readAt).map(item => item.id), [notifications]);
  const totalLoaded = notifications.length;

  const updatePending = useCallback((id: string, add: boolean) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const applyUpdates = useCallback((next: SerializedNotification[], unread: number, nextCursorValue?: string | null) => {
    setNotifications(next);
    setUnreadCount(unread);
    if (typeof nextCursorValue !== "undefined") {
      setCursor(nextCursorValue);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notifications?limit=${NOTIFICATION_PAGE_SIZE}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = (await res.json()) as ApiResponse;
      applyUpdates(data.notifications ?? [], data.unreadCount ?? 0, data.nextCursor ?? null);
    } catch (err) {
      console.error(err);
      setError("We couldn’t refresh notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [applyUpdates]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cursor,
        limit: String(NOTIFICATION_PAGE_SIZE),
      });
      const res = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as ApiResponse;
      setNotifications(prev => [...prev, ...(data.notifications ?? [])]);
      setUnreadCount(data.unreadCount ?? unreadCount);
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error(err);
      setError("We couldn’t load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, unreadCount]);

  const toggleRead = useCallback(
    async (notification: SerializedNotification, makeRead: boolean) => {
      updatePending(notification.id, true);
      setError(null);
      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notification.id], read: makeRead }),
        });
        if (!res.ok) throw new Error("Request failed");
        const data = (await res.json()) as { unreadCount?: number };
        setNotifications(prev =>
          prev.map(item =>
            item.id === notification.id
              ? {
                ...item,
                readAt: makeRead ? new Date().toISOString() : null,
              }
              : item,
          ),
        );
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
      } catch (err) {
        console.error(err);
        setError("We couldn’t update that notification. Please try again.");
      } finally {
        updatePending(notification.id, false);
      }
    },
    [updatePending],
  );

  const markAllAsRead = useCallback(async () => {
    const ids = unreadIds;
    if (!ids.length) return;
    setBulkLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, read: true }),
      });
      if (!res.ok) throw new Error("Failed to mark notifications as read");
      const data = (await res.json()) as { unreadCount?: number };
      const timestamp = new Date().toISOString();
      setNotifications(prev => prev.map(item => ({ ...item, readAt: item.readAt ?? timestamp })));
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error(err);
      setError("We couldn’t mark everything as read. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  }, [unreadIds]);

  const hasNotifications = notifications.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{unreadCount} unread</p>
          <p className="text-xs text-white/50">{totalLoaded} notifications loaded</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={!unreadIds.length || bulkLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            Mark all read
          </button>
        </div>
      </div>

      {!hasNotifications && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-white">You’re all caught up!</p>
          <p className="mt-2 text-sm text-white/60">
            Publish posts, follow discussions, and we’ll drop updates here as soon as they happen.
          </p>
          <Link
            href="/posts/new"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
          >
            Share a new post
          </Link>
        </div>
      )}

      {hasNotifications && (
        <div className="space-y-4">
          <ul className="space-y-3">
            {notifications.map(item => {
              const created = formatNotificationTimestamp(item.createdAt);
              const unread = !item.readAt;
              const pending = pendingIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className={clsx(
                    "flex flex-col gap-3 rounded-2xl border border-white/10 bg-(--surface-2)/80 p-4 text-sm text-white/80 shadow-sm transition",
                    unread ? "ring-1 ring-brand-400/70" : "",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {item.imageUrl ? (
                      <div className="relative h-14 w-14 flex-none overflow-hidden rounded-lg border border-white/10">
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs uppercase tracking-wide text-white/40">
                        {ORIGIN_LABEL[item.origin]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide", ORIGIN_COLOR[item.origin])}>
                          {ORIGIN_LABEL[item.origin]}
                        </span>
                        <span>{created}</span>
                        {unread && <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" aria-label="Unread" />}
                      </div>
                      <div className="space-y-1">
                        {item.link ? (
                          <Link href={item.link} className="block font-semibold text-white hover:underline">
                            {item.title}
                          </Link>
                        ) : (
                          <p className="font-semibold text-white">{item.title}</p>
                        )}
                        {item.message && <p className="text-white/70">{item.message}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <p className="text-white/50">{unread ? "Unread" : "Read"}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleRead(item, !unread)}
                        disabled={pending}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1 font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {unread ? "Mark read" : "Mark unread"}
                      </button>
                      {item.link && (
                        <Link
                          href={item.link}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1 font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {cursor && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
