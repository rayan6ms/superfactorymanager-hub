"use client";

type NotificationBadgeProps = {
  count: number;
};

export default function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count <= 0) return null;

  return (
    <output
      aria-label={`${count} unread notifications`}
      className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold leading-none text-white"
    >
      {count > 9 ? "9+" : count}
    </output>
  );
}
