import type React from "react";
import { clsx } from "clsx";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-lg bg-white/5 border border-base-700/70 px-2 py-0.5 text-xs text-white/80",
        className,
      )}
    >
      {children}
    </span>
  );
}
