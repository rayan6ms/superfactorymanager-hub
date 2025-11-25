"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export default function ReopenReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/reports/${reportId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reopen: true }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Unable to reopen report.");
        }

        router.push("/admin/reports");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reopen report.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        type="button"
        onClick={handleReopen}
        className={clsx(
          "rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white transition",
          pending ? "bg-white/10 opacity-70" : "bg-white/5 hover:border-white/30 hover:bg-white/10",
        )}
        disabled={pending}
      >
        {pending ? "Reopening..." : "Reopen"}
      </button>
      {error && <span className="text-[0.7rem] text-rose-200">{error}</span>}
    </div>
  );
}
