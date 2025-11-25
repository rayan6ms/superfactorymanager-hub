"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export type ReportActionPayload = {
  reportId: string;
  targetLabel: string;
  defaultResolved: boolean;
};

export default function ReportActionControls({ reportId, targetLabel, defaultResolved }: ReportActionPayload) {
  const router = useRouter();
  const [markResolved, setMarkResolved] = useState(!defaultResolved);
  const [flagTarget, setFlagTarget] = useState(false);
  const [flagAuthorPosts, setFlagAuthorPosts] = useState(false);
  const [flagAuthorComments, setFlagAuthorComments] = useState(false);
  const [revokePostVotes, setRevokePostVotes] = useState(false);
  const [disableCreatePosts, setDisableCreatePosts] = useState(false);
  const [disableCreateComments, setDisableCreateComments] = useState(false);
  const [disableVotePosts, setDisableVotePosts] = useState(false);
  const [disableVoteComments, setDisableVoteComments] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutValue = timeoutMinutes ? Number(timeoutMinutes) : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markResolved,
          flagTarget,
          flagAuthorPosts,
          flagAuthorComments,
          revokePostVotes,
          disableCreatePosts,
          disableCreateComments,
          disableVotePosts,
          disableVoteComments,
          timeoutMinutes: timeoutValue,
          note: note.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to apply moderation.");
      }

      setFeedback("Actions saved.");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Moderation options</p>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/30 bg-transparent"
              checked={markResolved}
              onChange={event => setMarkResolved(event.target.checked)}
            />
            Mark report as resolved
          </label>
        </div>

        <p className="mt-2 text-xs text-white/60">Target: {targetLabel}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={flagTarget}
            onChange={event => setFlagTarget(event.target.checked)}
          />
          <span>
            Flag this content as deleted
            <span className="block text-xs text-white/60">Hide the reported item from public view.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={revokePostVotes}
            onChange={event => setRevokePostVotes(event.target.checked)}
          />
          <span>
            Revoke all of the user&apos;s post votes
            <span className="block text-xs text-white/60">Remove their previous post ratings and recalculate scores.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={flagAuthorPosts}
            onChange={event => setFlagAuthorPosts(event.target.checked)}
          />
          <span>
            Flag all posts by this user
            <span className="block text-xs text-white/60">Soft-delete every post authored by them.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={flagAuthorComments}
            onChange={event => setFlagAuthorComments(event.target.checked)}
          />
          <span>
            Flag all comments by this user
            <span className="block text-xs text-white/60">Soft-delete every comment authored by them.</span>
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={disableCreatePosts}
            onChange={event => setDisableCreatePosts(event.target.checked)}
          />
          <span>
            Block new posts
            <span className="block text-xs text-white/60">Prevent the user from publishing new posts.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={disableCreateComments}
            onChange={event => setDisableCreateComments(event.target.checked)}
          />
          <span>
            Block new comments
            <span className="block text-xs text-white/60">Stop the user from adding any comments.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={disableVotePosts}
            onChange={event => setDisableVotePosts(event.target.checked)}
          />
          <span>
            Block post votes
            <span className="block text-xs text-white/60">Remove access to voting on posts.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent"
            checked={disableVoteComments}
            onChange={event => setDisableVoteComments(event.target.checked)}
          />
          <span>
            Block comment votes
            <span className="block text-xs text-white/60">Remove access to voting on comments.</span>
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr,200px]">
        <label className="space-y-2 text-sm text-white/80">
          <span className="block text-xs uppercase tracking-wide text-white/60">Moderator note</span>
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none"
            placeholder="Explain the decision or context for future reference."
          />
        </label>
        <label className="space-y-2 text-sm text-white/80">
          <span className="block text-xs uppercase tracking-wide text-white/60">Timeout duration</span>
          <select
            value={timeoutMinutes}
            onChange={event => setTimeoutMinutes(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white focus:border-brand-300 focus:outline-none"
          >
            <option value="">No timeout</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="240">4 hours</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
          </select>
          <p className="text-xs text-white/60">Temporarily pause all interactions for this user.</p>
        </label>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {feedback && <p className="text-sm text-emerald-300">{feedback}</p>}

      <div className="flex flex-wrap justify-between gap-3">
        <p className="text-xs text-white/60">Submitting applies changes immediately. Use cautiously.</p>
        <button
          type="submit"
          disabled={submitting}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition",
            submitting && "opacity-70",
          )}
        >
          {submitting ? "Applying..." : "Apply actions"}
        </button>
      </div>
    </form>
  );
}
