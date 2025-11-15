"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import clsx from "clsx";
import { formatNotificationTimestamp, type SerializedNotification } from "@/lib/notifications";

const ORIGIN_LABEL: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "System",
  POST: "Post",
};

const ORIGIN_COLOR: Record<SerializedNotification["origin"], string> = {
  SYSTEM: "bg-emerald-500/20 text-emerald-200",
  POST: "bg-sky-500/20 text-sky-200",
};

type NotificationPreviewListProps = {
  notifications: SerializedNotification[];
  emptyLabel?: string;
  className?: string;
  dense?: boolean;
  onMarkRead?: (id: string) => void | Promise<void>;
};

export default function NotificationPreviewList({
  notifications,
  emptyLabel = "You’re all caught up!",
  className,
  dense = false,
  onMarkRead,
}: NotificationPreviewListProps) {
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
      {notifications.map(item => {
        const created = formatNotificationTimestamp(item.createdAt);
        const unread = !item.readAt;
        return (
          <li
            key={item.id}
            className={clsx(
              "rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 shadow-sm transition",
              unread ? "ring-1 ring-brand-400/70" : "",
            )}
          >
            <div className={clsx("flex gap-3", dense ? "items-start" : "items-center")}>
              {item.imageUrl ? (
                <div className="relative h-12 w-12 flex-none overflow-hidden rounded-lg border border-white/10">
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  <span className="sr-only">Notification thumbnail</span>
                </div>
              ) : (
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs uppercase tracking-wide text-white/40">
                  {ORIGIN_LABEL[item.origin]}
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
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
              {onMarkRead && unread && (
                <button
                  type="button"
                  onClick={() => onMarkRead(item.id)}
                  className="ml-auto inline-flex h-8 items-center justify-center rounded-lg border border-white/15 px-2 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Mark as read
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
