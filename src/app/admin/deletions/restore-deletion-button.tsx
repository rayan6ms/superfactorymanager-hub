"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, RotateCcw } from "lucide-react";

type Props = {
  type: "post" | "comment";
  targetId: string;
  label?: string;
};

export default function RestoreDeletionButton({ type, targetId, label = "Restore" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRestore = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId, action: "restore" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not restore item.");
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRestore}
        disabled={loading}
        className={clsx(
          "inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-50 transition hover:border-emerald-400 hover:bg-emerald-500/20",
          loading && "opacity-60",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
        <span>{label}</span>
      </button>
      {error && <p className="text-right text-xs text-red-300">{error}</p>}
    </div>
  );
}
