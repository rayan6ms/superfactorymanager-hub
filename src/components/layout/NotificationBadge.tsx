"use client";

import { useEffect, useState } from "react";
import { NOTIFICATION_UNREAD_EVENT } from "@/lib/notifications";

type NotificationBadgeProps = {
  initialCount: number;
};

export default function NotificationBadge({ initialCount }: NotificationBadgeProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<{ count: number }>).detail;
      if (!detail || typeof detail.count !== "number") return;
      setCount(detail.count);
    }

    window.addEventListener(NOTIFICATION_UNREAD_EVENT, handle as EventListener);
    return () => window.removeEventListener(NOTIFICATION_UNREAD_EVENT, handle as EventListener);
  }, []);

  if (count <= 0) return null;

  return (
    <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}
