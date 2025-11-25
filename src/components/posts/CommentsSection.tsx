"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowBigDown, ArrowBigUp, ArrowLeft, CornerDownRight, Eye, Loader2, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui";
import Button from "@/components/ui/Button";
import ReportButton from "@/components/ReportButton";
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

type SortOption = "recent" | "top";

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

const countNestedReplies = (items: SerializedComment[]): number => {
  return items.reduce((total, item) => total + 1 + countNestedReplies(item.replies), 0);
};

const MIN_VISIBLE_REPLIES = 1;

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

const findCommentById = (items: SerializedComment[], id: string): SerializedComment | null => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.replies.length) {
      const found = findCommentById(item.replies, id);
      if (found) return found;
    }
  }
  return null;
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
  const [sortOrder, setSortOrder] = useState<SortOption>("recent");
  const [sortLoading, setSortLoading] = useState(false);
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
  const [revealedHidden, setRevealedHidden] = useState<Record<string, boolean>>({});
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [replyDisplayLimit, setReplyDisplayLimit] = useState(5);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const focusHandledRef = useRef(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canPost = Boolean(currentUser);
  const loginRedirect = `/login?from=/posts/${postSlug}`;
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

  const threadRoot = useMemo(() => {
    if (!threadRootId) return null;
    return findCommentById(comments, threadRootId);
  }, [comments, threadRootId]);

  const sortComments = useCallback((items: SerializedComment[], sort: SortOption) => {
    const sorted = [...items];
    if (sort === "top") {
      sorted.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted.map(item => ({ ...item }));
  }, []);

  const updateCommentTree = useCallback(
    (items: SerializedComment[], id: string, updater: (comment: SerializedComment) => SerializedComment) => {
      let updated = false;
      const next = items.map(item => {
        if (item.id === id) {
          updated = true;
          return updater(item);
        }
        if (item.replies.length) {
          const child = updateCommentTree(item.replies, id, updater);
          if (child.updated) {
            updated = true;
            return { ...item, replies: child.items };
          }
        }
        return item;
      });
      return { items: next, updated };
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 640px)");
    const handleChange = () => setReplyDisplayLimit(media.matches ? 5 : 3);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (threadRootId && !threadRoot) {
      setThreadRootId(null);
    }
  }, [threadRootId, threadRoot]);

  const fetchComments = useCallback(
    async (cursorValue: string | null, sortOverride?: SortOption): Promise<CommentResponse> => {
      const params = new URLSearchParams();
      if (cursorValue) params.set("cursor", cursorValue);
      const activeSort = sortOverride ?? sortOrder;
      params.set("sort", activeSort);
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
    [postSlug, sortOrder],
  );

  const handleVote = useCallback(
    async (comment: SerializedComment, direction: "up" | "down") => {
      if (!canPost) {
        window.location.href = loginRedirect;
        return;
      }
      if (voting[comment.id]) return;

      setVoting(prev => ({ ...prev, [comment.id]: true }));
      setError(null);
      const method = comment.vote === direction ? "DELETE" : "POST";
      try {
        const res = await fetch(`/api/comments/${comment.id}/vote`, {
          method,
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          credentials: "include",
          body: method === "POST" ? JSON.stringify({ vote: direction }) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as { comment?: SerializedComment; error?: string };
        if (!res.ok || !data.comment) {
          throw new Error(data.error ?? "Failed to update vote");
        }
        setComments(prev => {
          const result = updateCommentTree(prev, comment.id, current => ({
            ...current,
            score: data.comment!.score,
            vote: data.comment!.vote,
          }));
          const nextList = result.updated ? result.items : prev;
          return sortComments(nextList, sortOrder);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update vote";
        setError(message);
      } finally {
        setVoting(prev => ({ ...prev, [comment.id]: false }));
      }
    },
    [canPost, loginRedirect, sortComments, sortOrder, updateCommentTree, voting],
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
        setComments(prev => sortComments([createdComment, ...prev], sortOrder));
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
    [canPost, submitting, isCommentValid, postSlug, commentText, sortComments, sortOrder],
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
            const inlineLimit = Math.min(replyDisplayLimit, insertedReplyCount);
            const current = prev[replyTargetId] ?? Math.min(MIN_VISIBLE_REPLIES, insertedReplyCount);
            if (current >= inlineLimit) return prev;
            return { ...prev, [replyTargetId]: Math.min(inlineLimit, current + 1) };
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
    [canPost, replySubmitting, replyTargetId, isReplyValid, postSlug, replyText, replyDisplayLimit],
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
    (commentId: string, totalReplies: number, baseline = replyDisplayLimit) => {
      if (totalReplies <= 0) return 0;
      const stored = visibleRepliesMap[commentId];
      const fallback = Math.max(0, Math.min(MIN_VISIBLE_REPLIES, totalReplies));
      const allowedMax = Math.min(baseline, totalReplies);
      const current = Math.min(typeof stored === "number" ? stored : fallback, allowedMax);
      return Math.max(fallback, current);
    },
    [replyDisplayLimit, visibleRepliesMap],
  );

  const showNextReply = useCallback(
    (commentId: string, totalReplies: number, baseline = replyDisplayLimit) => {
      if (totalReplies <= 0) return;
      setVisibleRepliesMap(prev => {
        const maxInline = Math.min(totalReplies, baseline);
        const current = prev[commentId] ?? Math.min(MIN_VISIBLE_REPLIES, totalReplies);
        if (current >= maxInline) return prev;
        return { ...prev, [commentId]: Math.min(maxInline, current + 1) };
      });
    },
    [replyDisplayLimit],
  );

  const handleSortChange = useCallback(
    async (value: SortOption) => {
      if (value === sortOrder) return;
      setSortOrder(value);
      setSortLoading(true);
      setError(null);
      try {
        const data = await fetchComments(null, value);
        if (data.error) throw new Error(data.error);
        setComments(sortComments(data.comments ?? [], value));
        setCursor(data.nextCursor ?? null);
        setTotal(data.total ?? total);
        setVisibleRepliesMap({});
        setRevealedHidden({});
        setThreadRootId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update sort order";
        setError(message);
      } finally {
        setSortLoading(false);
      }
    },
    [fetchComments, sortComments, sortOrder, total],
  );

  const revealHidden = useCallback((id: string) => {
    setRevealedHidden(prev => ({ ...prev, [id]: true }));
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
        setComments(prev => sortComments([...prev, ...nextComments], sortOrder));
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
  }, [cursor, loadingMore, fetchComments, sortComments, sortOrder]);

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

  const renderThread = (
    nodes: SerializedComment[],
    depth = 0,
    options: { limitReplies?: boolean } = {},
  ): ReactNode => {
    if (!nodes.length) return null;
    const { limitReplies = true } = options;
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
            className="pointer-events-none absolute -left-px top-2 bottom-0 w-px bg-linear-to-b from-white/20 via-white/10 to-transparent"
          />
        )}
        {nodes.map(comment => {
          const authorName = comment.author?.name ?? "Deleted user";
          const avatarUrl = comment.author?.image ?? null;
          const isAuthor = comment.author?.id === postAuthorId;
          const isHighlighted = highlightedComment === comment.id;
          const isReplyingHere = replyTargetId === comment.id;
          const replyBaseline = replyDisplayLimit;
          const visibleReplies = limitReplies
            ? getVisibleReplies(comment.id, comment.replies.length, replyBaseline)
            : comment.replies.length;
          const repliesToRender = comment.replies.slice(0, visibleReplies);
          const remainingReplies = Math.max(comment.replies.length - visibleReplies, 0);
          const hiddenReplies = limitReplies ? comment.replies.slice(visibleReplies) : [];
          const hiddenReplyCount = limitReplies ? countNestedReplies(hiddenReplies) : 0;
          const inlineLimit = Math.min(replyBaseline, comment.replies.length);
          const canShowInline = limitReplies && visibleReplies < inlineLimit;
          const showRestInThread = limitReplies && !canShowInline && remainingReplies > 0;
          const profileHref = comment.author?.name ? `/profile/${comment.author.name}` : null;
          const isHidden = comment.score < 0 && !revealedHidden[comment.id];
          const votingHere = Boolean(voting[comment.id]);
          if (isHidden) {
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
                <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <div className="flex items-center gap-2">
                      {avatarUrl ? (
                        profileHref ? (
                          <Link
                            href={profileHref}
                            className="h-7 w-7 shrink-0 rounded-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${avatarUrl})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="h-7 w-7 shrink-0 rounded-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${avatarUrl})` }}
                            aria-hidden="true"
                          />
                        )
                      ) : profileHref ? (
                        <Link
                          href={profileHref}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white"
                        >
                          {initials(authorName)}
                        </Link>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white">
                          {initials(authorName)}
                        </span>
                      )}
                      {profileHref ? (
                        <Link
                          href={profileHref}
                          className="font-semibold text-white underline-offset-4 hover:underline"
                        >
                          {authorName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white">{authorName}</span>
                      )}
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-white/70">
                      Hidden comment
                    </span>
                    <span className="text-white/50">Score {comment.score}</span>
                    <button
                      type="button"
                      onClick={() => revealHidden(comment.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 font-semibold text-white transition hover:bg-white/20"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View comment
                    </button>
                  </div>
                </article>
              </div>
            );
          }

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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {avatarUrl ? (
                    profileHref ? (
                      <Link
                        href={profileHref}
                        className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                    )
                  ) : profileHref ? (
                    <Link
                      href={profileHref}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
                    >
                      {initials(authorName)}
                    </Link>
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {initials(authorName)}
                    </span>
                  )}
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                      {profileHref ? (
                        <Link
                          href={profileHref}
                          className="font-semibold text-white underline-offset-4 hover:underline"
                        >
                          {authorName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white">{authorName}</span>
                      )}
                      <span>•</span>
                      <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
                      {isAuthor && (
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-emerald-100">
                          Author
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-white/80">{comment.content}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-white/70">
                        <button
                          type="button"
                          aria-pressed={comment.vote === "up"}
                          onClick={() => handleVote(comment, "up")}
                          className={clsx(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                            comment.vote === "up"
                              ? "text-brand-100"
                              : "text-white/60 hover:text-white",
                          )}
                          disabled={votingHere}
                        >
                          <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Upvote</span>
                        </button>
                        <span className="min-w-[2.5rem] text-center text-sm font-semibold text-white">{comment.score}</span>
                        <button
                          type="button"
                          aria-pressed={comment.vote === "down"}
                          onClick={() => handleVote(comment, "down")}
                          className={clsx(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                            comment.vote === "down"
                              ? "text-brand-100"
                              : "text-white/60 hover:text-white",
                          )}
                          disabled={votingHere}
                        >
                          <ArrowBigDown className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Downvote</span>
                        </button>
                      </div>

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
                      <ReportButton
                        type="comment"
                        targetId={comment.id}
                        targetLabel={`comment by ${authorName}`}
                        canReport={canPost}
                        loginHref={loginRedirect}
                        className="border-none px-0 py-0 text-xs font-semibold text-white/60 hover:text-white"
                      >
                        Report
                      </ReportButton>
                    </div>
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
                  {renderThread(repliesToRender, depth + 1, options)}
                </div>
              )}
              {limitReplies && remainingReplies > 0 && (
                <div className="ml-4 sm:ml-6">
                  <button
                    type="button"
                    onClick={() =>
                      showRestInThread
                        ? setThreadRootId(comment.id)
                        : showNextReply(comment.id, comment.replies.length, replyBaseline)
                    }
                    className="text-xs font-semibold text-brand-200 underline-offset-4 transition hover:text-brand-100 hover:underline"
                  >
                    {showRestInThread ? "Show rest in thread" : "Show 1 more reply"}
                    {showRestInThread && hiddenReplyCount > 0 ? ` (${hiddenReplyCount} more)` : ""}
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
    <div id="comments">
      <Card className="space-y-6">
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

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
          <div className="flex items-center gap-2">
            <span className="text-white/50">Sort by:</span>
            <button
              type="button"
              onClick={() => handleSortChange("recent")}
              className={clsx(
                "rounded-full border px-3 py-1 font-semibold transition",
                sortOrder === "recent"
                  ? "border-brand-300 bg-brand-500/20 text-white"
                  : "border-white/15 text-white/70 hover:border-white/30 hover:text-white",
              )}
              disabled={sortLoading}
            >
              Most recent
            </button>
            <button
              type="button"
              onClick={() => handleSortChange("top")}
              className={clsx(
                "rounded-full border px-3 py-1 font-semibold transition",
                sortOrder === "top"
                  ? "border-brand-300 bg-brand-500/20 text-white"
                  : "border-white/15 text-white/70 hover:border-white/30 hover:text-white",
              )}
              disabled={sortLoading}
            >
              Top voted
            </button>
          </div>
          {sortLoading && (
            <div className="flex items-center gap-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Updating
            </div>
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
          {threadRoot ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Thread view</p>
                  <p className="text-sm text-white/70">
                    Showing the rest of the replies in this thread. Use the back button to return to the main comments.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setThreadRootId(null)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to comments
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                {renderThread([threadRoot], 0, { limitReplies: false })}
              </div>
            </div>
          ) : comments.length === 0 ? (
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
              className="min-w-32"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Load more"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
