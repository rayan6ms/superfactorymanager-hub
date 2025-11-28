"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Flag, Loader2, X } from "lucide-react";

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;
const REASONS = [
  "spam",
  "inappropriate_content",
  "harassment_or_bullying",
  "spreads_false_information",
  "hate_speech_or_symbols",
  "promotes_violence_or_dangerous_behavior",
  "promotes_illegal_activity",
  "promotes_self_harm_or_suicide",
  "other",
] as const;

function labelForReason(value: (typeof REASONS)[number]) {
  switch (value) {
    case "spam":
      return "Spam";
    case "inappropriate_content":
      return "Inappropriate content";
    case "harassment_or_bullying":
      return "Harassment or Bullying";
    case "spreads_false_information":
      return "Spreads false information";
    case "hate_speech_or_symbols":
      return "Hate speech or symbols";
    case "promotes_violence_or_dangerous_behavior":
      return "Promotes violence or dangerous behavior";
    case "promotes_illegal_activity":
      return "Promotes illegal activity";
    case "promotes_self_harm_or_suicide":
      return "Promotes self-harm or suicide";
    case "other":
      return "Other";
    default:
      return value;
  }
}

type ReportButtonProps = {
  type: "post" | "comment";
  targetId: string;
  targetLabel: string;
  canReport?: boolean;
  loginHref?: string;
  className?: string;
  children?: ReactNode;
};

export default function ReportButton({
  type,
  targetId,
  targetLabel,
  canReport = false,
  loginHref,
  className,
  children,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const remainingChars = useMemo(() => MAX_LENGTH - message.length, [message]);
  const isOtherReason = reason === "other";
  const tooShort = isOtherReason && message.trim().length < MIN_LENGTH;

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setReason(null);
    setMessage("");
    setError(null);
    setResult("idle");
  }, [submitting]);

  const openDialog = useCallback(() => {
    if (!canReport) {
      if (loginHref) {
        window.location.href = loginHref;
      }
      return;
    }
    setOpen(true);
  }, [canReport, loginHref]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const submitReport = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!reason) {
        setError("Choose a reason for the report.");
        return;
      }
      if (tooShort) {
        setError("Explain what’s wrong so our team can review it quickly.");
        return;
      }
      setSubmitting(true);
      setError(null);
      setResult("idle");
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type,
            targetId,
            reason,
            message: isOtherReason ? message.trim() : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "We couldn’t record your report just yet.");
        }
        setResult("success");
        setMessage("");
        setReason(null);
      } catch (err) {
        const fallback = err instanceof Error ? err.message : "We couldn’t send your report.";
        setError(fallback);
        setResult("error");
      } finally {
        setSubmitting(false);
      }
    },
    [isOtherReason, message, reason, targetId, type, tooShort],
  );

  const dialog =
    mounted && open
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e111a]/75 px-4 py-6 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onMouseDown={event => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-[#111827]/90 p-6 text-white shadow-2xl backdrop-blur-sm max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Report {type}</p>
                <h2 className="text-2xl font-semibold text-white">{targetLabel}</h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-10 w-10 p-2.5 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Close report dialog</span>
              </button>
            </div>

            <form className="space-y-4" onSubmit={submitReport}>
              <div className="space-y-2 text-sm text-white/80">
                <span className="block">What’s going on?</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REASONS.map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReason(value)}
                      className={clsx(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-2 text-left transition",
                        reason === value
                          ? "border-red-400/60 bg-red-500/20 text-white"
                          : "border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:text-white",
                      )}
                      aria-pressed={reason === value}
                    >
                      <span className="text-sm font-semibold">{labelForReason(value)}</span>
                      {reason === value && <span className="text-xs text-white/60">Selected</span>}
                    </button>
                  ))}
                </div>
              </div>

              {isOtherReason && (
                <>
                  <label className="space-y-2 text-sm text-white/80">
                    <span>Share more details (required)</span>
                    <textarea
                      rows={5}
                      value={message}
                      onChange={event => setMessage(event.target.value.slice(0, MAX_LENGTH))}
                      className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40"
                      placeholder="Explain why this content should be reviewed"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/50">
                    <span>
                      {Math.max(message.trim().length, 0)} / {MAX_LENGTH} characters ({remainingChars} left)
                    </span>
                    <span>Minimum {MIN_LENGTH} characters</span>
                  </div>
                </>
              )}
              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
              )}
              {result === "success" && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Thanks for flagging this. Our moderators will review it shortly.
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
                  {submitting ? "Sending..." : "Send report"}
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
        onClick={openDialog}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-red-200 transition hover:text-red-100",
          className,
        )}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {children ?? "Report"}
      </button>
      {dialog}
    </>
  );
}
