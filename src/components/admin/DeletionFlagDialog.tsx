"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AlertTriangle, Loader2, ShieldOff, X } from "lucide-react";

type Props = {
  type: "post" | "comment";
  targetId: string;
  targetLabel: string;
  onFlagged?: (result?: { slug?: string }) => void;
  className?: string;
  children?: ReactNode;
};

export default function DeletionFlagDialog({
  type,
  targetId,
  targetLabel,
  onFlagged,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requireText = "CONFIRM";
  const canSubmit = useMemo(() => confirmValue.trim().toUpperCase() === requireText, [confirmValue]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setConfirmValue("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setError(`Type "${requireText}" to continue.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId, action: "flag" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Unable to flag item.");
      }
      onFlagged?.(data);
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/80 p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-5 w-5" aria-hidden />
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Deletion flag</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/35 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden />
                <span className="sr-only">Close dialog</span>
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <h2 className="text-xl font-semibold text-white">Flag this {type} as deleted?</h2>
              <p className="text-sm text-white/70">
                This hides the {type} from everyone immediately. Type “{requireText}” to confirm you want to flag {targetLabel} for removal.
              </p>
            </div>

            <form className="mt-3 space-y-3" onSubmit={submit}>
              <label className="space-y-2 text-sm text-white/80">
                <span>Type {requireText} to proceed</span>
                <input
                  type="text"
                  value={confirmValue}
                  onChange={(event) => setConfirmValue(event.target.value)}
                  className="w-full rounded-2xl border border-white/20 bg-black/40 px-4 py-2 mt-1 text-white placeholder-white/40 outline-none transition focus:border-white/40"
                  placeholder={requireText}
                />
              </label>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <div className="flex flex-col pt-3 gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/35 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={clsx(
                    "inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/50 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/25",
                    submitting && "opacity-60",
                  )}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
                  <span>Flag as deleted</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/20",
          className,
        )}
      >
        <ShieldOff className="h-4 w-4" aria-hidden />
        <span>{children ?? "Flag as deleted"}</span>
      </button>
      {dialog}
    </>
  );
}
