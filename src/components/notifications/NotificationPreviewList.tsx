"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { CheckCheck, Loader2 } from "lucide-react";
import { formatNotificationTimestamp, type SerializedNotification } from "@/lib/notifications-shared";

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

type NotificationPreviewListProps = {
  notifications: SerializedNotification[];
  emptyLabel?: string;
  className?: string;
  dense?: boolean;
  maxVisible?: number;
  onMarkRead?: (id: string) => void | Promise<void>;
};

function withNotificationSource(href: string | null): string | null {
  if (!href) return href;

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

export default function NotificationPreviewList({
  notifications,
  emptyLabel = "You’re all caught up!",
  className,
  dense = false,
  maxVisible,
  onMarkRead,
}: NotificationPreviewListProps) {
  const [localUnread, setLocalUnread] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setLocalUnread({});
    setPendingIds(new Set());
  }, [notifications]);

  const toggleRead = useCallback(
    async (notification: SerializedNotification) => {
      const id = notification.id;

      const unreadFromProps = !notification.readAt;
      const override = localUnread[id];
      const unread = typeof override === "boolean" ? override : unreadFromProps;

      const makeRead = unread;

      setPendingIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      setLocalUnread(prev => ({
        ...prev,
        [id]: !makeRead,
      }));

      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [id], read: makeRead }),
        });

        if (!res.ok) {
          throw new Error("Failed to update notification");
        }

        if (onMarkRead) {
          await onMarkRead(id);
        }
      } catch (error) {
        console.error(error);
        setLocalUnread(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [localUnread, onMarkRead],
  );

  const items = typeof maxVisible === "number" ? notifications.slice(0, Math.max(0, maxVisible)) : notifications;

  if (!notifications.length) {
    return (
      <div
        className={clsx(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-10 text-center text-sm text-white/70",
          className,
        )}
      >
        <p className="font-medium">{emptyLabel}</p>
        <p className="text-xs text-white/50">We’ll let you know when something new happens.</p>
      </div>
    );
  }

  return (
    <ul className={clsx("space-y-3", className)}>
      {items.map(item => {
        const created = formatNotificationTimestamp(item.createdAt);

        const unreadFromProps = !item.readAt;
        const override = localUnread[item.id];
        const unread = typeof override === "boolean" ? override : unreadFromProps;
        const pending = pendingIds.has(item.id);
        const href = withNotificationSource(item.link);

        return (
          <li
            key={item.id}
            className={clsx(
              "rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-sm text-white/80 shadow-sm transition",
            )}
          >
            <div className={clsx("flex gap-3", dense ? "items-start" : "items-center")}>
              {item.imageUrl ? (
                <div className="relative h-12 w-12 flex-none overflow-hidden rounded-lg border border-white/10">
                  <Image
                    src={item.imageUrl}
                    alt="Notification thumbnail"
                    fill
                    sizes="48px"
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
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                      ORIGIN_COLOR[item.origin],
                    )}
                  >
                    {ORIGIN_LABEL[item.origin]}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleRead(item)}
                    disabled={pending}
                    className={clsx(
                      "inline-flex items-center justify-center gap-1 rounded-full border border-white/20 px-2 py-0.5 text-[0.65rem] font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white shrink-0 disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCheck className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>{unread ? "Mark read" : "Mark unread"}</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-white/50">
                    <span>{created}</span>
                    {unread && (
                      <span
                        className="inline-flex h-2 w-2 rounded-full bg-brand-400"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-0.5 space-y-1">
              {item.message && <p className="text-white/70">{item.message}</p>}
              {href ? (
                <Link
                  href={href}
                  className="flex justify-end font-semibold text-white hover:underline"
                >
                  {item.title}
                </Link>
              ) : (
                <p className="font-semibold text-white">{item.title}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
