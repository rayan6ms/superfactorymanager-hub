"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { diffLines } from "diff";
import { clsx } from "clsx";
import { Clock, GitPullRequest, History, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-amber-300 bg-amber-500/10 border-amber-500/40",
  MERGED: "text-emerald-200 bg-emerald-500/10 border-emerald-500/40",
  REJECTED: "text-red-200 bg-red-500/10 border-red-500/30",
};

export type CommitForHistory = {
  id: string;
  title: string | null;
  message: string;
  status: "PENDING" | "MERGED" | "REJECTED";
  createdAt: string;
  mergedAt: string | null;
  rejectedAt: string | null;
  author: { id: string; name: string | null };
  code: string;
  baseCommitId: string | null;
};

export type ContributorSummary = {
  id: string;
  name: string | null;
  mergedCommits: number;
};

type CodeHistoryPanelProps = {
  slug: string;
  commits: CommitForHistory[];
  currentCommitId: string | null;
  isAuthor: boolean;
  contributors: ContributorSummary[];
};

type DiffRow = {
  type: "context" | "added" | "removed";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function CodeHistoryPanel({
  slug,
  commits,
  currentCommitId,
  isAuthor,
  contributors,
}: CodeHistoryPanelProps) {
  const router = useRouter();
  const [primaryId, setPrimaryId] = useState<string>(currentCommitId ?? commits[0]?.id ?? "");
  const [secondaryId, setSecondaryId] = useState<string>(
    commits.find(commit => commit.id !== (currentCommitId ?? commits[0]?.id ?? ""))?.id ?? "",
  );
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const primaryCommit = useMemo(() => commits.find(commit => commit.id === primaryId) ?? null, [commits, primaryId]);
  const secondaryCommit = useMemo(
    () => commits.find(commit => commit.id === secondaryId) ?? null,
    [commits, secondaryId],
  );

  const diffRows = useMemo<DiffRow[]>(() => {
    if (!primaryCommit || !secondaryCommit) return [];
    const changes = diffLines(secondaryCommit.code, primaryCommit.code);
    let oldLine = 1;
    let newLine = 1;

    return changes.flatMap(change => {
      const lines = change.value.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();

      return lines.map(line => {
        if (change.added) {
          const row: DiffRow = { type: "added", text: line, oldLine: null, newLine };
          newLine += 1;
          return row;
        }

        if (change.removed) {
          const row: DiffRow = { type: "removed", text: line, oldLine, newLine: null };
          oldLine += 1;
          return row;
        }

        const row: DiffRow = { type: "context", text: line, oldLine, newLine };
        oldLine += 1;
        newLine += 1;
        return row;
      });
    });
  }, [primaryCommit, secondaryCommit]);

  const handleAction = async (commitId: string, action: "merge" | "reject" | "revert") => {
    setActionError(null);
    setActionTarget(`${commitId}:${action}`);
    try {
      const res = await fetch(`/api/posts/${slug}/commits/${commitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data?.error || "Could not update this contribution.");
        return;
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update this contribution.";
      setActionError(message);
    } finally {
      setActionTarget(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Code history</h2>
          <p className="text-sm text-white/70">Review contributions, merge pull requests, or revert earlier versions.</p>
        </div>
        {contributors.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-white/70">
            {contributors.map(contributor => (
              <span key={contributor.id} className="rounded-full border border-white/10 px-3 py-1">
                {contributor.name ?? "Anonymous"} · {contributor.mergedCommits}
              </span>
            ))}
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap gap-3 text-sm text-white/70">
            <label className="flex flex-col text-white/80">
              Compare
              <select
                className="mt-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
                value={primaryId}
                onChange={event => setPrimaryId(event.target.value)}
              >
                {commits.map(commit => (
                  <option key={commit.id} value={commit.id}>
                    {commit.title ?? commit.message}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-white/80">
              Against
              <select
                className="mt-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
                value={secondaryId}
                onChange={event => setSecondaryId(event.target.value)}
              >
                <option value="">— None —</option>
                {commits
                  .filter(commit => commit.id !== primaryId)
                  .map(commit => (
                    <option key={commit.id} value={commit.id}>
                      {commit.title ?? commit.message}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 font-mono text-sm text-white/80">
            {primaryCommit && secondaryCommit ? (
              diffRows.length ? (
                <div className="divide-y divide-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 px-4 py-3 text-xs text-white/70">
                    <div>
                      <p className="font-semibold text-white">
                        Comparing {primaryCommit.title ?? primaryCommit.message} against {secondaryCommit.title ?? secondaryCommit.message}
                      </p>
                      <p className="text-white/60">Green lines are additions in the first selection; red lines were removed from the comparison target.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-100">
                        <Plus className="h-3 w-3" /> Added
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 font-semibold text-red-100">
                        <Minus className="h-3 w-3" /> Removed
                      </span>
                    </div>
                  </div>
                  {diffRows.map((row, index) => (
                    <div
                      key={`${row.type}-${row.oldLine ?? "-"}-${row.newLine ?? "-"}-${index}`}
                      className={clsx(
                        "grid grid-cols-[3.25rem_3.25rem_1fr] items-start gap-3 px-4 py-1.5 text-xs sm:text-sm",
                        row.type === "added" && "bg-emerald-500/10 text-emerald-100",
                        row.type === "removed" && "bg-red-500/10 text-red-100",
                        row.type === "context" && "text-white/80",
                      )}
                    >
                      <span className="text-[11px] text-white/40 sm:text-xs">{row.oldLine ?? ""}</span>
                      <span className="text-[11px] text-white/40 sm:text-xs">{row.newLine ?? ""}</span>
                      <pre className="whitespace-pre-wrap text-inherit">{row.text || " "}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-white/60">No differences between the selected commits.</p>
              )
            ) : (
              <p className="px-4 py-4 text-sm text-white/60">Choose two commits to view a diff.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {commits.map(commit => {
            const statusStyle = STATUS_COLOR[commit.status] ?? "border-white/10 text-white";
            const isCurrent = commit.id === currentCommitId;
            const actionBusy = actionTarget === `${commit.id}:merge` || actionTarget === `${commit.id}:reject` || actionTarget === `${commit.id}:revert`;
            return (
              <div key={commit.id} className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">{commit.title ?? commit.message}</p>
                    {commit.message && commit.title && (
                      <p className="mt-1 text-sm text-white/70">{commit.message}</p>
                    )}
                    <p className="text-xs text-white/60">
                      {commit.author.name ?? "Anonymous"} · {formatDate(commit.createdAt)}
                    </p>
                  </div>
                  <span className={clsx("rounded-full border px-3 py-1 text-xs font-semibold", statusStyle)}>
                    {commit.status.toLowerCase()}
                  </span>
                </div>
                {isCurrent && (
                  <p className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                    <History className="h-3 w-3" /> Current code
                  </p>
                )}
                {commit.status === "PENDING" && isAuthor && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Button
                      type="button"
                      size="sm"
                      disabled={actionBusy}
                      onClick={() => handleAction(commit.id, "merge")}
                    >
                      {actionTarget === `${commit.id}:merge` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitPullRequest className="h-4 w-4" />
                      )}
                      Merge
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actionBusy}
                      onClick={() => handleAction(commit.id, "reject")}
                    >
                      {actionTarget === `${commit.id}:reject` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                      Reject
                    </Button>
                  </div>
                )}
                {commit.status === "MERGED" && isAuthor && commit.id !== currentCommitId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionBusy}
                    onClick={() => handleAction(commit.id, "revert")}
                  >
                    {actionTarget === `${commit.id}:revert` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Revert to this version
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
