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
        "surface w-full max-w-full min-w-0 p-4 backdrop-blur-sm wrap-break-word",
        hoverable && "transition hover:shadow-card hover:-translate-y-px",
        className
      )}
    >
      {children}
    </div>
  );
}
