"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import clsx from "clsx";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import {
  NOTIFICATION_PREVIEW_LIMIT,
  type SerializedNotification,
} from "@/lib/notifications";

const LIMIT = NOTIFICATION_PREVIEW_LIMIT;

type NotificationBellProps = {
  initialNotifications: SerializedNotification[];
  initialUnreadCount: number;
};

type FetchState = "idle" | "loading" | "error";
type ApiResponse = {
  notifications?: SerializedNotification[];
  unreadCount?: number;
};

export default function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!open) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markAsRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, read: true }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { unreadCount?: number };
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setFetchState("loading");
    try {
      const res = await fetch(`/api/notifications?limit=${LIMIT}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = (await res.json()) as ApiResponse;
      setNotifications(data.notifications ?? []);
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
      const unreadIds = (data.notifications ?? []).filter(notification => !notification.readAt).map(notification => notification.id);
      if (unreadIds.length) {
        await markAsRead(unreadIds);
      }
      setFetchState("idle");
    } catch (error) {
      console.error(error);
      setFetchState("error");
    }
  }, [markAsRead]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications();
  }, [open, loadNotifications]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={clsx(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[var(--surface-2)]/85 text-white transition hover:border-white/25 hover:bg-[var(--surface-2)]/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
          open && "border-brand-400/70",
        )}
        aria-label="Open notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-[var(--surface-2)]/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              <p className="text-xs text-white/50">Showing the latest {LIMIT} updates</p>
            </div>
            {fetchState === "loading" && <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-hidden="true" />}
          </div>

          <NotificationPreviewList
            notifications={notifications}
            emptyLabel="No notifications yet"
            dense
            className="max-h-80 overflow-y-auto pr-1"
          />

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="text-xs text-white/50">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
            <Link
              href="/notifications"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>

          {fetchState === "error" && (
            <p className="mt-2 text-xs text-red-300">We couldn’t refresh notifications. Please try again.</p>
          )}
        </div>
      )}
    </div>
  );
}
