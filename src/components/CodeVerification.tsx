"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useAuthRequired } from "@/components/auth/AuthRequiredProvider";

type VoteValue = "up" | "down" | null;

type ApiResponse = {
  worked: number;
  broken: number;
  total: number;
  my: VoteValue;
  message?: string;
};

type CodeVerificationProps = {
  slug: string;
  initialVote: VoteValue;
  worked: number;
  broken: number;
  isAuthor: boolean;
  codeStatus: "VERIFIED" | "UNVERIFIED" | "BROKEN";
  codeNote?: string | null;
};

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const withError = data as { error?: unknown };
    if (typeof withError.error === "string" && withError.error.trim().length > 0) {
      return withError.error;
    }
    const withMessage = data as { message?: unknown };
    if (typeof withMessage.message === "string" && withMessage.message.trim().length > 0) {
      return withMessage.message;
    }
  }
  return fallback;
}

export default function CodeVerification({
  slug,
  initialVote,
  worked,
  broken,
  isAuthor,
  codeStatus,
  codeNote,
}: CodeVerificationProps) {
  const { apiFetchJson } = useAuthRequired();

  const [myVote, setMyVote] = useState<VoteValue>(initialVote);
  const [workedCount, setWorkedCount] = useState(worked);
  const [brokenCount, setBrokenCount] = useState(broken);
  const [busy, setBusy] = useState(false);

  const total = workedCount + brokenCount;
  const successRate = total > 0 ? Math.round((workedCount / total) * 100) : 0;

  const status = useMemo(() => {
    if (codeStatus === "BROKEN") {
      return {
        tone: "danger" as const,
        message: codeNote ?? "The author flagged this script as broken. Use with caution.",
      };
    }
    if (codeStatus === "VERIFIED" && total === 0) {
      return {
        tone: "positive" as const,
        message: "The author marked this script as verified. Help confirm their verdict.",
      };
    }
    if (total === 0) {
      return {
        tone: "neutral" as const,
        message: "No community verification yet. Be the first to report if the code works for you.",
      };
    }
    if (workedCount === 0) {
      return {
        tone: "danger" as const,
        message: "So far everyone reports this script did not work for them.",
      };
    }
    if (brokenCount === 0) {
      return {
        tone: "positive" as const,
        message: "Everyone who voted says the code worked for them.",
      };
    }
    const tone = successRate >= 60 ? (successRate >= 85 ? "positive" : "caution") : "danger";
    return {
      tone,
      message: `Community verification: ${successRate}% success (${workedCount} of ${total} reports).`,
    };
  }, [codeStatus, codeNote, total, workedCount, brokenCount, successRate]);

  const toneClasses = useMemo(() => {
    switch (status.tone) {
      case "positive":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
      case "danger":
        return "border-red-500/40 bg-red-500/10 text-error";
      case "caution":
        return "border-amber-400/40 bg-amber-500/10 text-amber-100";
      default:
        return "border-white/20 bg-white/5 text-white/80";
    }
  }, [status.tone]);

  const sendVote = async (vote: "up" | "down") => {
    if (isAuthor || busy) return;
    if (myVote === vote) {
      await clearVote();
      return;
    }

    setBusy(true);
    const { res, data } = await apiFetchJson<ApiResponse>(`/api/posts/${slug}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    });
    setBusy(false);

    if (!res.ok) {
      alert(getErrorMessage(data, "We couldn’t record your vote. Please try again."));
      return;
    }

    const payload = data as ApiResponse;
    setMyVote(payload.my ?? vote);
    setWorkedCount(payload.worked ?? workedCount);
    setBrokenCount(payload.broken ?? brokenCount);
  };

  const clearVote = async () => {
    if (isAuthor || busy || myVote === null) return;
    setBusy(true);
    const { res, data } = await apiFetchJson<ApiResponse>(`/api/posts/${slug}/rate`, {
      method: "DELETE",
    });
    setBusy(false);

    if (!res.ok) {
      alert(getErrorMessage(data, "We couldn’t clear your vote. Please try again."));
      return;
    }

    const payload = data as ApiResponse;
    setMyVote(payload.my ?? null);
    setWorkedCount(payload.worked ?? workedCount);
    setBrokenCount(payload.broken ?? brokenCount);
  };

  const voteButton = (
    vote: "up" | "down",
    label: string,
    count: number,
  ) => {
    const active = myVote === vote;
    const icon = vote === "up" ? <ThumbsUp className="h-4 w-4" aria-hidden /> : <ThumbsDown className="h-4 w-4" aria-hidden />;
    return (
      <button
        type="button"
        disabled={busy || isAuthor}
        onClick={() => sendVote(vote)}
        aria-pressed={active}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
          vote === "up"
            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/60 hover:bg-emerald-500/15"
            : "border-red-500/40 bg-red-500/10 text-error hover:border-red-400/70 hover:bg-red-500/15",
          (busy || isAuthor) && "opacity-60"
        )}
      >
        {icon}
        <span className="font-medium">{label}</span>
        <span className="rounded-full bg-black/30 px-2 text-xs text-white/70">{count}</span>
      </button>
    );
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Code verification</p>
          <p className="text-xs text-white/60">Share whether this script worked for you.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-white/70" aria-hidden />}
          {isAuthor && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide">Author view</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {voteButton("up", "Code worked for me", workedCount)}
        {voteButton("down", "Code didn’t work for me", brokenCount)}
        {!isAuthor && myVote !== null && (
          <button
            type="button"
            onClick={clearVote}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-xs text-white/70 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Clear my vote
          </button>
        )}
      </div>

      <div className={clsx("mt-4 rounded-xl border px-4 py-3 text-sm", toneClasses)}>
        <p>{status.message}</p>
        {status.tone === "positive" && total > 0 && successRate >= 85 && (
          <p className="mt-1 text-xs text-white/70">Thanks for helping verify this script!</p>
        )}
        {status.tone === "danger" && codeStatus !== "BROKEN" && total > 0 && (
          <p className="mt-1 text-xs text-white/70">
            Double-check the required game and mod versions before using this code.
          </p>
        )}
      </div>
    </section>
  );
}
