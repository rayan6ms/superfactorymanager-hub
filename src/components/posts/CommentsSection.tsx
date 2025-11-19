"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CornerDownRight, Loader2, MessageCircle } from "lucide-react";
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

const flattenComments = (items: SerializedComment[]): SerializedComment[] => {
  const result: SerializedComment[] = [];
  for (const item of items) {
    result.push(item);
    if (item.replies.length) {
      result.push(...flattenComments(item.replies));
    }
  }
  return result;
};

const insertReply = (
  items: SerializedComment[],
  parentId: string,
  reply: SerializedComment,
): { updated: SerializedComment[]; inserted: boolean; replyCount?: number } => {
  let inserted = false;
  let replyCount: number | undefined;
  const updated = items.map(item => {
    if (inserted) return item;
    if (item.id === parentId) {
      inserted = true;
      replyCount = item.replies.length + 1;
      return { ...item, replies: [...item.replies, reply] };
    }
    if (item.replies.length) {
      const childResult = insertReply(item.replies, parentId, reply);
      if (childResult.inserted) {
        inserted = true;
        replyCount = childResult.replyCount;
        return { ...item, replies: childResult.updated };
      }
    }
    return item;
  });
  return { updated: inserted ? updated : items, inserted, replyCount };
};

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
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [highlightedComment, setHighlightedComment] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ id: string; authorName: string } | null>(null);
  const [visibleRepliesMap, setVisibleRepliesMap] = useState<Record<string, number>>({});
  const focusHandledRef = useRef(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canPost = Boolean(currentUser);
  const isCommentValid = commentText.trim().length >= COMMENT_MIN_LENGTH;
  const isReplyValid = replyText.trim().length >= COMMENT_MIN_LENGTH;
  const replyTargetId = replyTarget?.id ?? null;

  const flatComments = useMemo(() => flattenComments(comments), [comments]);
  const commentExists = useCallback(
    (id: string | null) => {
      if (!id) return false;
      return flatComments.some(comment => comment.id === id);
    },
    [flatComments],
  );

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
        setCommentText("");
        setTotal(prev => (typeof data.total === "number" ? data.total : prev + 1));
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

  const handleReplySubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canPost || replySubmitting || !replyTargetId || !isReplyValid) return;
      setReplySubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/posts/${postSlug}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: replyText.trim(), parentId: replyTargetId }),
        });
        const data = (await res.json().catch(() => ({}))) as CreateCommentResponse;
        if (!res.ok || !data.comment) {
          throw new Error(data.error ?? "Failed to post reply");
        }
        const createdComment = data.comment;
        let insertedReplyCount = 0;
        setComments(prev => {
          const result = insertReply(prev, replyTargetId, createdComment);
          if (result.inserted && typeof result.replyCount === "number") {
            insertedReplyCount = result.replyCount;
          }
          return result.inserted ? result.updated : prev;
        });
        if (insertedReplyCount > 0) {
          setVisibleRepliesMap(prev => {
            const current = prev[replyTargetId];
            if (current && current >= insertedReplyCount) return prev;
            return { ...prev, [replyTargetId]: insertedReplyCount };
          });
        }
        setReplyText("");
        setReplyTarget(null);
        setTotal(prev => (typeof data.total === "number" ? data.total : prev + 1));
        setHighlightedComment(createdComment.id);
        requestAnimationFrame(() => {
          const element = document.getElementById(`comment-${createdComment.id}`);
          element?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to post reply";
        setError(message);
      } finally {
        setReplySubmitting(false);
      }
    },
    [canPost, replySubmitting, replyTargetId, isReplyValid, postSlug, replyText],
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.slice(0, COMMENT_MAX_LENGTH);
    setCommentText(value);
  }, []);

  const handleReplyInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.slice(0, COMMENT_MAX_LENGTH);
    setReplyText(value);
  }, []);

  const toggleReply = useCallback((comment: SerializedComment) => {
    setReplyText("");
    setReplyTarget(prev => {
      if (prev?.id === comment.id) return null;
      return { id: comment.id, authorName: comment.author?.name ?? "Deleted user" };
    });
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTarget(null);
    setReplyText("");
  }, []);

  const getVisibleReplies = useCallback(
    (commentId: string, totalReplies: number) => {
      if (totalReplies <= 0) return 0;
      const stored = visibleRepliesMap[commentId];
      const baseline = totalReplies > 0 ? 1 : 0;
      return Math.min(totalReplies, typeof stored === "number" ? stored : baseline);
    },
    [visibleRepliesMap],
  );

  const showNextReply = useCallback((commentId: string, totalReplies: number) => {
    if (totalReplies <= 0) return;
    setVisibleRepliesMap(prev => {
      const current = prev[commentId] ?? (totalReplies > 0 ? 1 : 0);
      if (current >= totalReplies) return prev;
      return { ...prev, [commentId]: current + 1 };
    });
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

  const visibleCount = flatComments.length;
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
    if (!commentExists(targetCommentId)) return;
    focusHandledRef.current = true;
    setHighlightedComment(targetCommentId);
    requestAnimationFrame(() => {
      const element = document.getElementById(`comment-${targetCommentId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [targetCommentId, commentExists]);

  useEffect(() => {
    if (!targetCommentId) return;
    if (commentExists(targetCommentId)) return;
    if (!cursor || loadingMore) return;
    loadMore();
  }, [targetCommentId, commentExists, cursor, loadingMore, loadMore]);

  const targetMissing = Boolean(
    targetCommentId &&
      !commentExists(targetCommentId) &&
      !cursor &&
      !loadingMore,
  );

  useEffect(() => {
    if (!replyTargetId) return;
    replyTextareaRef.current?.focus();
  }, [replyTargetId]);

  const renderThread = (nodes: SerializedComment[], depth = 0): JSX.Element | null => {
    if (!nodes.length) return null;
    return (
      <div
        className={clsx(
          "space-y-4",
          depth > 0 && "relative border-l border-white/10 pl-4 sm:pl-6",
        )}
      >
        {depth > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-px top-2 bottom-0 w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent"
          />
        )}
        {nodes.map(comment => {
          const authorName = comment.author?.name ?? "Deleted user";
          const avatarUrl = comment.author?.image ?? null;
          const isAuthor = comment.author?.id === postAuthorId;
          const isHighlighted = highlightedComment === comment.id;
          const isReplyingHere = replyTargetId === comment.id;
          const visibleReplies = getVisibleReplies(comment.id, comment.replies.length);
          const repliesToRender = comment.replies.slice(0, visibleReplies);
          const remainingReplies = Math.max(comment.replies.length - repliesToRender.length, 0);
          return (
            <div
              key={comment.id}
              className="relative space-y-3"
              id={`comment-${comment.id}`}
            >
              {depth > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-4 top-5 h-5 w-5 border-b border-l border-white/15 sm:-left-6 sm:w-6"
                />
              )}
              <article
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
                  <div className="flex-1 space-y-3">
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
                    {canPost && (
                      <button
                        type="button"
                        onClick={() => toggleReply(comment)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-white/70 transition hover:text-white"
                      >
                        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                        Reply
                      </button>
                    )}
                  </div>
                </div>
              </article>

              {isReplyingHere && canPost && (
                <form className="space-y-2 pl-6" onSubmit={handleReplySubmit}>
                  <p className="text-xs text-white/50">Replying to {replyTarget?.authorName ?? "this comment"}</p>
                  <textarea
                    ref={replyTextareaRef}
                    rows={3}
                    value={replyText}
                    onChange={handleReplyInputChange}
                    placeholder="Write your reply..."
                    className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span>
                      {replyText.length} / {COMMENT_MAX_LENGTH} characters
                    </span>
                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" disabled={!isReplyValid || replySubmitting}>
                        {replySubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Submit reply
                      </Button>
                      <button
                        type="button"
                        onClick={cancelReply}
                        className="text-white/60 underline-offset-4 hover:text-white hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {repliesToRender.length > 0 && (
                <div className="ml-4 sm:ml-6">
                  {renderThread(repliesToRender, depth + 1)}
                </div>
              )}
              {remainingReplies > 0 && (
                <div className="ml-4 sm:ml-6">
                  <button
                    type="button"
                    onClick={() => showNextReply(comment.id, comment.replies.length)}
                    className="text-xs font-semibold text-brand-200 underline-offset-4 transition hover:text-brand-100 hover:underline"
                  >
                    Show 1 more reply ({remainingReplies} left)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
          renderThread(comments)
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
