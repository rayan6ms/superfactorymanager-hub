"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCheck, Loader2, Mail, RefreshCw } from "lucide-react";
import clsx from "clsx";
import Pagination from "@/components/ui/Pagination";
import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_SYNC_EVENT,
  formatNotificationTimestamp,
  withNotificationSource,
  type SerializedNotification,
} from "@/lib/notifications-shared";
import { dispatchNotificationSync, type NotificationSyncDetail } from "@/lib/notification-events";
import { fetchNotificationPreview, updateNotifications } from "@/lib/notification-client";

const ORIGIN_LABEL: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "System",
  POST: "Post",
  REPORT: "Report",
};

const ORIGIN_COLOR: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "bg-emerald-500/20 text-emerald-200",
  POST: "bg-sky-500/20 text-sky-200",
  REPORT: "bg-red-500/20 text-red-200",
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
  const [notifications, setNotifications] =
    useState<SerializedNotification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const request = useRef<AbortController | null>(null);
  const busy = loading || loadingMore || bulkLoading || pendingIds.size > 0;
  const totalLoaded = notifications.length;

  const pageNotifications = useMemo(() => {
    const start = (page - 1) * NOTIFICATION_PAGE_SIZE;
    const end = start + NOTIFICATION_PAGE_SIZE;
    return notifications.slice(start, end);
  }, [notifications, page]);

  const updatePending = useCallback((id: string, add: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<NotificationSyncDetail>).detail;
      if (!detail) return;

      if (typeof detail.unreadCount === "number") {
        setUnreadCount(detail.unreadCount);
      }

      if (detail.updates?.length || detail.allReadAt) {
        request.current?.abort();
        setNotifications((prev) =>
          prev.map((item) => {
            if (detail.allReadAt) return { ...item, readAt: item.readAt ?? detail.allReadAt };
            const update = detail.updates?.find((change) => change.id === item.id);
            return update ? { ...item, readAt: update.readAt } : item;
          }),
        );
      }
    }

    window.addEventListener(NOTIFICATION_SYNC_EVENT, handle as EventListener);
    return () => {
      request.current?.abort();
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handle as EventListener);
    };
  }, []);

  const applyUpdates = useCallback(
    (next: SerializedNotification[], unread: number, nextCursorValue?: string | null) => {
      setNotifications(next);
      setUnreadCount(unread);
      if (typeof nextCursorValue !== "undefined") {
        setCursor(nextCursorValue);
      }
      setPage(1);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const [res, preview] = await Promise.all([
        fetch(`/api/notifications?limit=${NOTIFICATION_PAGE_SIZE}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        }),
        fetchNotificationPreview(controller.signal),
      ]);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = (await res.json()) as ApiResponse;
      if (controller.signal.aborted) return;
      applyUpdates(data.notifications ?? [], preview.unreadCount, data.nextCursor ?? null);
      dispatchNotificationSync({
        unreadCount: preview.unreadCount,
        preview: preview.notifications,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setError("We couldn’t refresh notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [applyUpdates]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cursor,
        limit: String(NOTIFICATION_PAGE_SIZE),
        includeUnreadCount: "0",
      });
      const res = await fetch(`/api/notifications?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as ApiResponse;
      if (controller.signal.aborted) return;
      setNotifications((prev) => [
        ...prev,
        ...(data.notifications ?? []).filter(
          (item) => !prev.some((existing) => existing.id === item.id),
        ),
      ]);
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setError("We couldn’t load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor]);

  const toggleRead = useCallback(
    async (notification: SerializedNotification, makeRead: boolean) => {
      updatePending(notification.id, true);
      setError(null);

      try {
        await updateNotifications({ ids: [notification.id], read: makeRead });
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
    if (!unreadCount) return;

    setBulkLoading(true);
    setError(null);

    try {
      await updateNotifications({ all: true, read: true });
    } catch (err) {
      console.error(err);
      setError("We couldn’t mark everything as read. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  }, [unreadCount]);

  const hasNotifications = notifications.length > 0;

  const handlePageChange = useCallback((nextPage: number) => {
    if (!Number.isFinite(nextPage)) return;
    setPage(Math.max(1, Math.floor(nextPage)));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
        <div>
          <p className="text-sm font-semibold text-white">{unreadCount} unread</p>
          <p className="text-xs text-white/50">{totalLoaded} notifications loaded</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={!unreadCount || busy}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
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
            {pageNotifications.map((item) => {
              const created = formatNotificationTimestamp(item.createdAt);
              const unread = !item.readAt;
              const pending = pendingIds.has(item.id);
              const href = withNotificationSource(item.link);
              return (
                <li
                  key={item.id}
                  className={clsx(
                    "flex flex-col gap-3 rounded-2xl border border-white/10 bg-(--surface-2)/60 p-4 text-sm text-white/80 shadow-sm transition backdrop-blur-sm",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {item.imageUrl ? (
                      <div className="relative h-14 w-14 flex-none overflow-hidden rounded-lg border border-white/10 bg-black/30">
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs uppercase tracking-wide text-white/40">
                        {ORIGIN_LABEL[item.origin]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                            ORIGIN_COLOR[item.origin],
                          )}
                        >
                          {ORIGIN_LABEL[item.origin]}
                        </span>
                        <span>{created}</span>
                        {unread && (
                          <span
                            className="inline-flex h-2 w-2 rounded-full bg-brand-400"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        {href ? (
                          <Link
                            href={href}
                            className="block font-semibold text-white hover:underline"
                          >
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
                        onClick={() => toggleRead(item, unread)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1 font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : unread ? (
                          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {unread ? "Mark read" : "Mark unread"}
                      </button>
                      {href && (
                        <Link
                          href={href}
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

          <Pagination
            currentPage={page}
            pageSize={NOTIFICATION_PAGE_SIZE}
            total={totalLoaded}
            buildHref={(targetPage) => `?page=${targetPage}`}
            onPageChange={handlePageChange}
          />

          {cursor && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
