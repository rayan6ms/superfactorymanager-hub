import { PropsWithChildren } from "react";
import { clsx } from "clsx";

export default function Card({
  children,
  className,
  hoverable = false,
}: PropsWithChildren<{ className?: string; hoverable?: boolean }>) {
  return (
    <div
      className={clsx(
        "surface p-4",
        hoverable && "transition hover:shadow-card hover:-translate-y-[1px]",
        className
      )}
    >
      {children}
    </div>
  );
}
