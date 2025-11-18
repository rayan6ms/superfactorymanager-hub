"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui";
import Button from "@/components/ui/Button";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  type SerializedComment,
} from "@/lib/comment-constants";

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type CurrentUser = {
  id: string;
  name: string | null;
  image: string | null;
};

type CommentsSectionProps = {
  postSlug: string;
  initialComments: SerializedComment[];
  initialCursor: string | null;
  initialTotal: number;
  currentUser: CurrentUser | null;
  postAuthorId: string;
};

type CommentResponse = {
  comments?: SerializedComment[];
  nextCursor?: string | null;
  total?: number;
  error?: string;
};

type CreateCommentResponse = {
  comment?: SerializedComment;
  total?: number;
  error?: string;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function initials(name: string | null) {
  const base = name?.trim();
  if (!base) return "?";
  const [first, second] = base.split(" ");
  if (second) return `${first[0]}${second[0]}`.toUpperCase();
  return (first[0] ?? "?").toUpperCase();
}

export default function CommentsSection({
  postSlug,
  initialComments,
  initialCursor,
  initialTotal,
  currentUser,
  postAuthorId,
}: CommentsSectionProps) {
  const [comments, setComments] = useState<SerializedComment[]>(initialComments);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [total, setTotal] = useState<number>(initialTotal);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [highlightedComment, setHighlightedComment] = useState<string | null>(null);
  const focusHandledRef = useRef(false);

  const canPost = Boolean(currentUser);
  const isCommentValid = commentText.trim().length >= COMMENT_MIN_LENGTH;

  const fetchComments = useCallback(
    async (cursorValue: string | null): Promise<CommentResponse> => {
      const params = new URLSearchParams();
      if (cursorValue) params.set("cursor", cursorValue);
      const query = params.toString();
      const res = await fetch(`/api/posts/${postSlug}/comments${query ? `?${query}` : ""}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as CommentResponse;
        return { error: data.error ?? "Failed to load comments" };
      }
      return (await res.json()) as CommentResponse;
    },
    [postSlug],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canPost || submitting || !isCommentValid) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/posts/${postSlug}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: commentText.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as CreateCommentResponse;
        if (!res.ok || !data.comment) {
          throw new Error(data.error ?? "Failed to post comment");
        }
        const createdComment = data.comment;
        setComments(prev => [createdComment, ...prev]);
        setTotal(prev => (typeof data.total === "number" ? data.total : prev + 1));
        setCommentText("");
        setHighlightedComment(createdComment.id);
        requestAnimationFrame(() => {
          const element = document.getElementById(`comment-${createdComment.id}`);
          element?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to post comment";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [canPost, submitting, isCommentValid, postSlug, commentText],
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.slice(0, COMMENT_MAX_LENGTH);
    setCommentText(value);
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    const currentCursor = cursor;
    try {
      const data = await fetchComments(currentCursor);
      if (data.error) throw new Error(data.error);
      const nextComments = data.comments ?? [];
      if (nextComments.length) {
        setComments(prev => [...prev, ...nextComments]);
      }
      if (typeof data.total === "number") {
        setTotal(data.total);
      }
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load more comments";
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, fetchComments]);

  const visibleCount = comments.length;
  const hasMore = Boolean(cursor);

  useEffect(() => {
    if (!highlightedComment) return;
    const timer = setTimeout(() => setHighlightedComment(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedComment]);

  useEffect(() => {
    function applyHash() {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      if (hash.startsWith("#comment-")) {
        const id = hash.replace("#comment-", "");
        setTargetCommentId(id);
        focusHandledRef.current = false;
      } else {
        setTargetCommentId(null);
        focusHandledRef.current = false;
      }
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (!targetCommentId) return;
    if (focusHandledRef.current) return;
    const exists = comments.some(comment => comment.id === targetCommentId);
    if (!exists) return;
    focusHandledRef.current = true;
    setHighlightedComment(targetCommentId);
    requestAnimationFrame(() => {
      const element = document.getElementById(`comment-${targetCommentId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [targetCommentId, comments]);

  useEffect(() => {
    if (!targetCommentId) return;
    if (comments.some(comment => comment.id === targetCommentId)) return;
    if (!cursor || loadingMore) return;
    loadMore();
  }, [targetCommentId, comments, cursor, loadingMore, loadMore]);

  const targetMissing = useMemo(() => {
    if (!targetCommentId) return false;
    if (comments.some(comment => comment.id === targetCommentId)) return false;
    if (cursor || loadingMore) return false;
    return true;
  }, [targetCommentId, comments, cursor, loadingMore]);

  return (
    <Card className="space-y-6" id="comments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-white/40">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Comments
          </div>
          <p className="text-lg font-semibold text-white">{total} comment{total === 1 ? "" : "s"}</p>
          <p className="text-sm text-white/60">Share your feedback, tips, or troubleshooting steps.</p>
        </div>
        {canPost ? null : (
          <Link href={`/login?from=/posts/${postSlug}`} className="inline-flex">
            <Button variant="outline" size="sm">Log in to comment</Button>
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      )}

      {targetMissing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          We couldn’t find the comment linked in your notification. It may have been deleted or moved.
        </div>
      )}

      {canPost && (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <textarea
            name="comment"
            rows={4}
            value={commentText}
            onChange={handleInputChange}
            placeholder="Leave a constructive comment..."
            className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
            <span>
              {commentText.length} / {COMMENT_MAX_LENGTH} characters
            </span>
            <Button type="submit" size="sm" disabled={!isCommentValid || submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Submit comment
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-white/60">No comments yet. Start the discussion!</p>
        ) : (
          comments.map(comment => {
            const authorName = comment.author?.name ?? "Deleted user";
            const avatarUrl = comment.author?.image ?? null;
            const isAuthor = comment.author?.id === postAuthorId;
            const isHighlighted = highlightedComment === comment.id;
            return (
              <article
                key={comment.id}
                id={`comment-${comment.id}`}
                className={clsx(
                  "rounded-2xl border border-white/10 bg-white/5 p-4",
                  isHighlighted && "ring-2 ring-brand-400",
                )}
              >
                <div className="flex items-start gap-3">
                  {avatarUrl ? (
                    <span
                      className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {initials(authorName)}
                    </span>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                      <span className="font-semibold text-white">{authorName}</span>
                      <span>•</span>
                      <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
                      {isAuthor && (
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-emerald-100">
                          Author
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-white/80">{comment.content}</p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {visibleCount < total && (
        <p className="text-center text-xs text-white/60">
          Showing {visibleCount} of {total} comment{total === 1 ? "" : "s"}
        </p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="min-w-[8rem]"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Load more"}
          </Button>
        </div>
      )}
    </Card>
  );
}
