"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { ArrowBigDown, ArrowBigUp, ArrowLeft, CornerDownRight, Eye, Loader2, MessageCircle, Pin, PinOff } from "lucide-react";
import { Card } from "@/components/ui";
import Button from "@/components/ui/Button";
import ReportButton from "@/components/ReportButton";
import DeletionFlagDialog from "@/components/admin/DeletionFlagDialog";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_DEPTH,
  COMMENT_MIN_LENGTH,
  type SerializedComment,
} from "@/lib/comment-constants";
import { splitVotesFromScore, wilsonScore, WILSON_Z_80 } from "@/lib/wilson-score";

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
  initialPinnedComment: SerializedComment | null;
  postAuthorId: string;
};

type CommentResponse = {
  comments?: SerializedComment[];
  nextCursor?: string | null;
  total?: number;
  pinnedComment?: SerializedComment | null;
  error?: string;
};

type CreateCommentResponse = {
  comment?: SerializedComment;
  total?: number;
  error?: string;
};

type PinCommentResponse = {
  comment?: SerializedComment;
  error?: string;
};

type ThreadResponse = {
  comment?: SerializedComment;
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

const COMMENT_HIDE_THRESHOLD = 0.35;

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
      const nextReplyCount = Math.max(item.replyCount, item.replies.length) + 1;
      replyCount = nextReplyCount;
      return { ...item, replyCount: nextReplyCount, replies: [...item.replies, reply] };
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

type UpdateCommentTreeResult = {
  items: SerializedComment[];
  updated: boolean;
};

function updateCommentTree(
  items: SerializedComment[],
  id: string,
  updater: (comment: SerializedComment) => SerializedComment,
): UpdateCommentTreeResult {
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
}

function mapCommentTree(
  items: SerializedComment[],
  mapper: (comment: SerializedComment) => SerializedComment,
): SerializedComment[] {
  return items.map(item => ({
    ...mapper(item),
    replies: mapCommentTree(item.replies, mapper),
  }));
}

function sortCommentTree(items: SerializedComment[], sort: SortOption, depth = 0): SerializedComment[] {
  return [...items]
    .map(item => ({
      ...item,
      replies: sortCommentTree(item.replies, sort, depth + 1),
    }))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (depth > 0) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "top" && a.score !== b.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export default function CommentsSection({
  postSlug,
  initialComments,
  initialCursor,
  initialTotal,
  initialPinnedComment,
  postAuthorId,
}: CommentsSectionProps) {
  const { data: session, status } = useSession();
  const [comments, setComments] = useState<SerializedComment[]>(() => sortCommentTree(initialComments, "recent"));
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [total, setTotal] = useState<number>(initialTotal);
  const [sortOrder, setSortOrder] = useState<SortOption>("recent");
  const [sortLoading, setSortLoading] = useState(false);
  const [pinnedComment, setPinnedComment] = useState<SerializedComment | null>(initialPinnedComment);
  const [commentText, setCommentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetCommentId, setTargetCommentId] = useState<string | null>(null);
  const [highlightedComment, setHighlightedComment] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<
    { id: string; authorName: string; depth: number } | null
  >(null);
  const [visibleRepliesMap, setVisibleRepliesMap] = useState<Record<string, number>>({});
  const [revealedHidden, setRevealedHidden] = useState<Record<string, boolean>>({});
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [pinning, setPinning] = useState<Record<string, boolean>>({});
  const [replyDisplayLimit, setReplyDisplayLimit] = useState(5);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadRootComment, setThreadRootComment] = useState<SerializedComment | null>(null);
  const [threadRootDepth, setThreadRootDepth] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [targetThreadLookupId, setTargetThreadLookupId] = useState<string | null>(null);
  const [threadMaxDepth, setThreadMaxDepth] = useState(5);
  const threadRequestSeqRef = useRef(0);
  const focusHandledRef = useRef(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cameFromNotificationsRef = useRef(false);
  const [pulseHighlights, setPulseHighlights] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  const currentUser: CurrentUser | null = session?.user?.id
    ? {
      id: session.user.id,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    }
    : null;
  const isAdmin = session?.user?.isAdmin === true;

  const canPost = Boolean(currentUser);
  const canManagePins = currentUser?.id === postAuthorId;
  const loginRedirect = `/login?next=${encodeURIComponent(`/posts/${postSlug}`)}`;
  const isCommentValid = commentText.trim().length >= COMMENT_MIN_LENGTH;
  const isReplyValid = replyText.trim().length >= COMMENT_MIN_LENGTH;
  const replyTargetId = replyTarget?.id ?? null;
  const replyTargetDepth = replyTarget?.depth ?? null;

  const flatComments = useMemo(() => flattenComments(comments), [comments]);
  const flatThreadComments = useMemo(
    () => (threadRootComment ? flattenComments([threadRootComment]) : []),
    [threadRootComment],
  );
  const commentExists = useCallback(
    (id: string | null) => {
      if (!id) return false;
      return (
        flatComments.some(comment => comment.id === id) ||
        flatThreadComments.some(comment => comment.id === id)
      );
    },
    [flatComments, flatThreadComments],
  );

  const threadRootFromComments = useMemo(() => {
    if (!threadRootId) return null;
    return findCommentById(comments, threadRootId);
  }, [comments, threadRootId]);
  const threadRoot = threadRootComment ?? threadRootFromComments;

  const markCommentDeleted = (id: string) => {
    setComments(prev => {
      const updated = updateCommentTree(prev, id, comment => ({ ...comment, isDeleted: true, isPinned: false }));
      return updated.updated ? updated.items : prev;
    });
    setPinnedComment(prev => (prev?.id === id ? null : prev));
  };

  const sortComments = useCallback((items: SerializedComment[], sort: SortOption) => {
    return sortCommentTree(items, sort);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 640px)");
    const handleChange = () => setReplyDisplayLimit(media.matches ? 5 : 3);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromNotifications =
      params.get("from") === "notifications" ||
      params.get("source") === "notifications" ||
      params.has("fromNotifications") ||
      document.referrer.includes("/notifications");
    cameFromNotificationsRef.current = fromNotifications;
  }, []);

  const startPulseHighlight = useCallback(() => {
    if (!cameFromNotificationsRef.current) return;
    setPulseHighlights(true);
    if (pulseTimeoutRef.current !== null) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    pulseTimeoutRef.current = window.setTimeout(() => setPulseHighlights(false), 6000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const smQuery = window.matchMedia("(min-width: 640px)");
    const mdQuery = window.matchMedia("(min-width: 768px)");

    const handleChange = () => {
      if (mdQuery.matches) {
        setThreadMaxDepth(5);
      } else if (smQuery.matches) {
        setThreadMaxDepth(3);
      } else {
        setThreadMaxDepth(2);
      }
    };

    handleChange();

    smQuery.addEventListener("change", handleChange);
    mdQuery.addEventListener("change", handleChange);

    return () => {
      smQuery.removeEventListener("change", handleChange);
      mdQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!threadRootId) {
      threadRequestSeqRef.current += 1;
      setThreadRootDepth(0);
      setThreadRootComment(null);
      setThreadLoading(false);
    }
  }, [threadRootId]);

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

  const fetchThread = useCallback(
    async (commentId: string, sortOverride?: SortOption): Promise<ThreadResponse> => {
      const params = new URLSearchParams();
      params.set("sort", sortOverride ?? sortOrder);
      const res = await fetch(`/api/posts/${postSlug}/comments/${commentId}/thread?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ThreadResponse;
        return { error: data.error ?? "Failed to load thread" };
      }
      return (await res.json()) as ThreadResponse;
    },
    [postSlug, sortOrder],
  );

  const openThread = useCallback(
    async (id: string, depth: number) => {
      const requestSeq = threadRequestSeqRef.current + 1;
      threadRequestSeqRef.current = requestSeq;
      setThreadRootId(id);
      setThreadRootDepth(depth);
      setThreadLoading(true);
      setError(null);
      try {
        const data = await fetchThread(id);
        if (threadRequestSeqRef.current !== requestSeq) return;
        if (data.error || !data.comment) {
          throw new Error(data.error ?? "Failed to load thread");
        }
        setThreadRootComment(data.comment);
      } catch (err) {
        if (threadRequestSeqRef.current !== requestSeq) return;
        const message = err instanceof Error ? err.message : "Failed to load thread";
        setError(message);
      } finally {
        if (threadRequestSeqRef.current !== requestSeq) return;
        setThreadLoading(false);
      }
    },
    [fetchThread],
  );

  useEffect(() => {
    if (status !== "authenticated" || !currentUser?.id) return;

    let active = true;
    setError(null);

    void (async () => {
      try {
        const data = await fetchComments(null, sortOrder);
        if (!active || data.error) return;
        setComments(sortComments(data.comments ?? [], sortOrder));
        setCursor(data.nextCursor ?? null);
        setTotal(data.total ?? initialTotal);
        setPinnedComment(data.pinnedComment ?? null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to refresh viewer-specific comments:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUser?.id, fetchComments, initialTotal, sortComments, sortOrder, status]);

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
            voteCount: data.comment!.voteCount,
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
    [canPost, loginRedirect, sortComments, sortOrder, voting],
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
      if (replyTargetDepth !== null && replyTargetDepth >= COMMENT_MAX_DEPTH) {
        setError("This thread reached the maximum reply depth. Please start a new top-level comment to continue.");
        return;
      }
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
            const current = prev[replyTargetId] ?? 0;
            const next = Math.min(insertedReplyCount, current + 1);
            if (next === current) return prev;
            return { ...prev, [replyTargetId]: next };
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
    [
      canPost,
      replySubmitting,
      replyTargetId,
      replyTargetDepth,
      isReplyValid,
      postSlug,
      replyText,
    ],
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.slice(0, COMMENT_MAX_LENGTH);
    setCommentText(value);
  }, []);

  const handleReplyInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value.slice(0, COMMENT_MAX_LENGTH);
    setReplyText(value);
  }, []);

  const toggleReply = useCallback((comment: SerializedComment, depth: number) => {
    if (depth >= COMMENT_MAX_DEPTH) return;
    setReplyText("");
    setReplyTarget(prev => {
      if (prev?.id === comment.id) return null;
      return { id: comment.id, authorName: comment.author?.name ?? "Deleted user", depth };
    });
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTarget(null);
    setReplyText("");
  }, []);

  const handlePinToggle = useCallback(
    async (comment: SerializedComment) => {
      if (!canManagePins || pinning[comment.id] || comment.isDeleted) return;

      setPinning(prev => ({ ...prev, [comment.id]: true }));
      setError(null);

      const method = comment.isPinned ? "DELETE" : "POST";

      try {
        const res = await fetch(`/api/comments/${comment.id}/pin`, {
          method,
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as PinCommentResponse;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update pinned comment");
        }

        setComments(prev =>
          sortComments(
            mapCommentTree(prev, current => ({
              ...current,
              isPinned: method === "POST" ? current.id === comment.id : false,
            })),
            sortOrder,
          ),
        );
        setPinnedComment(method === "POST" ? (data.comment ?? { ...comment, isPinned: true, replies: [] }) : null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update pinned comment";
        setError(message);
      } finally {
        setPinning(prev => ({ ...prev, [comment.id]: false }));
      }
    },
    [canManagePins, pinning, sortComments, sortOrder],
  );

  const INITIAL_VISIBLE_REPLIES = 2;

  const AUTO_EXPANDED_DEPTH = 2;

  const getInitialVisibleReplies = (depth: number, totalReplies: number): number => {
    if (totalReplies <= 0) return 0;
    if (depth < AUTO_EXPANDED_DEPTH) {
      return Math.min(INITIAL_VISIBLE_REPLIES, totalReplies);
    }
    return 0;
  };

  const getVisibleReplies = useCallback(
    (commentId: string, depth: number, loadedReplies: number) => {
      if (loadedReplies <= 0) return 0;
      const stored = visibleRepliesMap[commentId];
      const initial = getInitialVisibleReplies(depth, loadedReplies);

      const current = typeof stored === "number" ? stored : initial;
      return Math.min(current, loadedReplies);
    },
    [visibleRepliesMap],
  );

  const showNextReply = useCallback(
    (commentId: string, depth: number, loadedReplies: number) => {
      if (loadedReplies <= 0) return;

      setVisibleRepliesMap(prev => {
        const stored = prev[commentId];
        const initial = getInitialVisibleReplies(depth, loadedReplies);
        const current = typeof stored === "number" ? stored : initial;

        if (current >= loadedReplies) return prev;

        return { ...prev, [commentId]: current + 1 };
      });
    },
    [setVisibleRepliesMap],
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
        setPinnedComment(data.pinnedComment ?? null);
        setVisibleRepliesMap({});
        setRevealedHidden({});
        setThreadRootId(null);
        setThreadRootComment(null);
        setThreadLoading(false);
        setTargetThreadLookupId(null);
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
      if ("pinnedComment" in data) {
        setPinnedComment(data.pinnedComment ?? null);
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
    startPulseHighlight();
    const timer = setTimeout(() => setHighlightedComment(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightedComment, startPulseHighlight]);

  useEffect(() => {
    function applyHash() {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      if (hash.startsWith("#comment-")) {
        const id = hash.replace("#comment-", "");
        setTargetCommentId(id);
        setTargetThreadLookupId(null);
        focusHandledRef.current = false;
      } else {
        setTargetCommentId(null);
        setTargetThreadLookupId(null);
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

  useEffect(() => {
    if (!targetCommentId) return;
    if (commentExists(targetCommentId)) return;
    if (cursor || loadingMore || threadLoading) return;
    if (targetThreadLookupId === targetCommentId) return;

    setTargetThreadLookupId(targetCommentId);
    void openThread(targetCommentId, 0);
  }, [
    targetCommentId,
    commentExists,
    cursor,
    loadingMore,
    threadLoading,
    targetThreadLookupId,
    openThread,
  ]);

  const targetMissing = Boolean(
    targetCommentId &&
    !commentExists(targetCommentId) &&
    !cursor &&
    !loadingMore &&
    !threadLoading &&
    targetThreadLookupId === targetCommentId,
  );

  useEffect(() => {
    if (!replyTargetId) return;
    replyTextareaRef.current?.focus();
  }, [replyTargetId]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const renderThread = (
    nodes: SerializedComment[],
    depth = 0,
    options: { limitReplies?: boolean; depthOffset?: number; idPrefix?: string; maxDepthOverride?: number } = {},
  ): ReactNode => {
    if (!nodes.length) return null;
    const { limitReplies = true, depthOffset = 0, idPrefix = "comment", maxDepthOverride } = options;

    return (
      <div
        className={clsx(
          "relative space-y-4",
          depth > 0 && "pl-4 sm:pl-6",
        )}
      >
        {depth > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-linear-to-b from-white/20 via-white/20 to-white/15"
          />
        )}
        {nodes.map(comment => {
          const authorName = comment.author?.name ?? "Deleted user";
          const avatarUrl = comment.author?.image ?? null;
          const isAuthor = comment.author?.id === postAuthorId;
          const isHighlighted = highlightedComment === comment.id;
          const isReplyingHere = replyTargetId === comment.id;

          const relativeDepth = Math.max(0, depth - depthOffset);
          const maxInlineDepth = typeof maxDepthOverride === "number" ? maxDepthOverride : replyDisplayLimit;
          const isAtDepthLimit = limitReplies && relativeDepth >= maxInlineDepth;
          const isReplyDepthCapped = depth >= COMMENT_MAX_DEPTH;

          const loadedReplies = comment.replies.length;
          const totalReplies = Math.max(comment.replyCount, loadedReplies);
          const unloadedReplies = Math.max(totalReplies - loadedReplies, 0);

          let visibleReplies = 0;
          let remainingReplies = 0;
          let hiddenReplies: SerializedComment[] = [];

          if (!limitReplies) {
            visibleReplies = loadedReplies;
            remainingReplies = 0;
            hiddenReplies = [];
          } else if (isAtDepthLimit) {
            visibleReplies = 0;
            remainingReplies = totalReplies;
            hiddenReplies = comment.replies;
          } else {
            visibleReplies = getVisibleReplies(comment.id, relativeDepth, loadedReplies);
            remainingReplies = Math.max(totalReplies - visibleReplies, 0);
            hiddenReplies = comment.replies.slice(visibleReplies);
          }

          const repliesToRender = comment.replies.slice(0, visibleReplies);
          const hiddenReplyCount = limitReplies
            ? Math.max(countNestedReplies(hiddenReplies), remainingReplies)
            : 0;

          const shouldOpenThread = limitReplies && remainingReplies > 0 && (isAtDepthLimit || unloadedReplies > 0);

          const profileHref = comment.author?.name ? `/profile/${comment.author.name}` : null;
          const { upvotes, downvotes, totalVotes } = splitVotesFromScore(comment.score, comment.voteCount);
          const confidence = wilsonScore(upvotes, downvotes, WILSON_Z_80);
          const isScoreHidden =
            totalVotes > 0 && downvotes > upvotes && confidence < COMMENT_HIDE_THRESHOLD;
          const isHidden = !comment.isPinned && isScoreHidden && !revealedHidden[comment.id];
          const votingHere = Boolean(voting[comment.id]);
          const pinningHere = Boolean(pinning[comment.id]);

          if (isHidden) {
            return (
              <div
                key={comment.id}
                className="relative space-y-3"
                id={`${idPrefix}-${comment.id}`}
              >
                {depth > 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none hidden sm:block absolute -left-4 sm:-left-6 top-6 h-6 w-6 rounded-bl-2xl border-b border-l border-[#413a40]"
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
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
                        >
                          {initials(authorName)}
                        </Link>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                          {initials(authorName)}
                        </span>
                      )}
                      {profileHref ? (
                        <Link
                          href={profileHref}
                          className="font-semibold text-white text-sm underline-offset-4 hover:underline"
                        >
                          {authorName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white text-sm">{authorName}</span>
                      )}
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-white/70">
                      Hidden comment
                    </span>
                    <span className="text-white/50">
                      Hidden due to low rating ({Math.round(confidence * 100)}% score from {totalVotes} vote
                      {totalVotes === 1 ? "" : "s"})
                    </span>
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
              id={`${idPrefix}-${comment.id}`}
            >
              {depth > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none hidden sm:block absolute -left-4 sm:-left-6 top-6 h-6 w-6 rounded-bl-2xl border-b border-l border-[#413a40]"
                />
              )}
              <article
                className={clsx(
                  "rounded-2xl border bg-white/5 p-4",
                  comment.isPinned
                    ? "border-brand-400/60 bg-brand-500/10 shadow-[0_0_0_1px_rgba(120,200,255,0.12)]"
                    : "border-white/10",
                  isHighlighted &&
                  (pulseHighlights
                    ? "ring-4 ring-brand-400/80 animate-pulse"
                    : "ring-2 ring-brand-400"),
                )}
              >
                <div className="grid grid-cols-[min-content_1fr] gap-x-3 gap-y-2 sm:items-start">
                  {avatarUrl ? (
                    profileHref ? (
                      <Link
                        href={profileHref}
                        className="sm:row-span-2 h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="sm:row-span-2 h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                    )
                  ) : profileHref ? (
                    <Link
                      href={profileHref}
                      className="sm:row-span-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
                    >
                      {initials(authorName)}
                    </Link>
                  ) : (
                    <span className="sm:row-span-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {initials(authorName)}
                    </span>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    {profileHref ? (
                      <Link
                        href={profileHref}
                        className="font-semibold text-white text-sm underline-offset-4 hover:underline"
                      >
                        {authorName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-white text-sm">{authorName}</span>
                    )}
                    <span>•</span>
                    <time dateTime={comment.createdAt}>
                      {formatTimestamp(comment.createdAt)}
                    </time>
                    {isAuthor && (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-emerald-100">
                        Author
                      </span>
                    )}
                    {comment.isPinned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-300/50 bg-brand-500/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-brand-100">
                        <Pin className="h-3 w-3" aria-hidden="true" />
                        Pinned
                      </span>
                    )}
                    {comment.isDeleted && (
                      <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-rose-100">
                        Removed
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 sm:col-span-1 sm:col-start-2 space-y-3">
                    <p
                      className={clsx(
                        "whitespace-pre-wrap wrap-anywhere text-sm",
                        comment.isDeleted ? "text-white/50" : "text-white/80",
                      )}
                    >
                      {comment.isDeleted ? "This comment was removed by moderators." : comment.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center text-xs text-white/70">
                        <button
                          type="button"
                          aria-pressed={comment.vote === "up"}
                          onClick={() => handleVote(comment, "up")}
                          className={clsx(
                            "inline-flex h-4 w-4 items-center justify-center rounded-full transition",
                            comment.vote === "up"
                              ? "text-brand-100"
                              : "text-white/60 hover:text-white",
                          )}
                          disabled={votingHere || comment.isDeleted}
                        >
                          <ArrowBigUp className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Upvote</span>
                        </button>
                        <span className="min-w-3 px-2 text-center text-sm font-semibold text-white">
                          {comment.score}
                        </span>
                        <button
                          type="button"
                          aria-pressed={comment.vote === "down"}
                          onClick={() => handleVote(comment, "down")}
                          className={clsx(
                            "inline-flex h-4 w-4 items-center justify-center rounded-full transition",
                            comment.vote === "down"
                              ? "text-brand-100"
                              : "text-white/60 hover:text-white",
                          )}
                          disabled={votingHere || comment.isDeleted}
                        >
                          <ArrowBigDown className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Downvote</span>
                        </button>
                      </div>

                      {canPost && !comment.isDeleted && !isReplyDepthCapped && (
                        <button
                          type="button"
                          onClick={() => toggleReply(comment, depth)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-white/70 transition hover:text-white"
                        >
                          <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                          Reply
                        </button>
                      )}

                      {isReplyDepthCapped && (
                        <span className="text-[0.7rem] text-white/60">
                          Reply limit reached. Start a new top-level comment to continue.
                        </span>
                      )}

                      {canManagePins && !comment.isDeleted && (
                        <button
                          type="button"
                          onClick={() => handlePinToggle(comment)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-100/90 transition hover:text-brand-100 disabled:cursor-not-allowed disabled:text-white/40"
                          disabled={pinningHere}
                        >
                          {comment.isPinned ? (
                            <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {pinningHere ? "Updating..." : comment.isPinned ? "Unpin" : "Pin comment"}
                        </button>
                      )}

                      {!comment.isDeleted && (
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
                      )}
                      {isAdmin && !comment.isDeleted && (
                        <DeletionFlagDialog
                          type="comment"
                          targetId={comment.id}
                          targetLabel={`comment by ${authorName}`}
                          onFlagged={() => markCommentDeleted(comment.id)}
                          className="border-none bg-transparent px-0 py-0 text-xs font-semibold text-rose-200 hover:text-rose-100"
                        >
                          Flag as deleted
                        </DeletionFlagDialog>
                      )}
                    </div>
                  </div>
                </div>
              </article>

              {isReplyingHere && canPost && !comment.isDeleted && depth < COMMENT_MAX_DEPTH && (
                <form className="space-y-2 pl-6" onSubmit={handleReplySubmit}>
                  <p className="text-xs text-white/50">
                    Replying to {replyTarget?.authorName ?? "this comment"}
                  </p>
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
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!isReplyValid || replySubmitting}
                      >
                        {replySubmitting && (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        )}{" "}
                        Submit reply
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
                  {renderThread(repliesToRender, depth + 1, { ...options, idPrefix })}
                </div>
              )}

              {limitReplies && remainingReplies > 0 && (
                <div className="ml-4 sm:ml-6">
                  <button
                    type="button"
                    onClick={() =>
                      shouldOpenThread
                        ? void openThread(comment.id, depth)
                        : showNextReply(comment.id, relativeDepth, loadedReplies)
                    }
                    className="text-xs font-semibold text-brand-200 underline-offset-4 transition hover:text-brand-100 hover:underline"
                  >
                    {shouldOpenThread ? "Show rest in thread" : "Show 1 more reply"}
                    {shouldOpenThread && hiddenReplyCount > 0 ? ` (${hiddenReplyCount} more)` : ""}
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
            <Link href={`/login?next=${encodeURIComponent(`/posts/${postSlug}`)}`} className="inline-flex">
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

        {pinnedComment && (
          <div className="space-y-3 rounded-2xl border border-brand-400/50 bg-brand-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-100">
                <Pin className="h-4 w-4" aria-hidden="true" />
                Pinned comment
              </div>
              <p className="text-xs text-brand-100/80">
                Highlighted by the post author
              </p>
            </div>
            {renderThread([{ ...pinnedComment, replies: [] }], 0, {
              idPrefix: "pinned-comment",
              limitReplies: false,
            })}
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
                <div className="flex items-center gap-3">
                  {threadLoading && (
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Loading full thread
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setThreadRootId(null)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to comments
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                {renderThread([threadRoot], threadRootDepth, {
                  limitReplies: true,
                  depthOffset: threadRootDepth,
                  maxDepthOverride: threadMaxDepth,
                })}
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
