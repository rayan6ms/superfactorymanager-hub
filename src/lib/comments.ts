import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  COMMENT_PAGE_SIZE,
  type SerializedComment,
} from "@/lib/comment-constants";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: { author: { select: typeof authorSelect } };
}>;

const serializeComment = (
  comment: CommentWithAuthor,
  replies: SerializedComment[] = [],
  voteMap?: Map<string, "up" | "down">,
): SerializedComment => ({
  id: comment.id,
  content: comment.content,
  isDeleted: comment.isDeleted,
  isPinned: comment.pinnedAt !== null,
  createdAt: comment.createdAt.toISOString(),
  updatedAt: comment.updatedAt.toISOString(),
  parentId: comment.parentId ?? null,
  author: comment.author
    ? {
        id: comment.author.id,
        name: comment.author.name,
        image: comment.author.image,
      }
    : null,
  score: comment.score,
  voteCount: comment.voteCount,
  vote: voteMap?.get(comment.id) ?? null,
  replies,
});

function compareComments(
  a: Pick<CommentWithAuthor, "createdAt" | "score" | "pinnedAt">,
  b: Pick<CommentWithAuthor, "createdAt" | "score" | "pinnedAt">,
  sort: "recent" | "top",
  depth: number,
) {
  const aPinned = a.pinnedAt ? 1 : 0;
  const bPinned = b.pinnedAt ? 1 : 0;
  if (aPinned !== bPinned) return bPinned - aPinned;

  if (depth > 0) {
    return a.createdAt.getTime() - b.createdAt.getTime();
  }

  if (sort === "top" && a.score !== b.score) {
    return b.score - a.score;
  }

  if (sort === "top") {
    return b.createdAt.getTime() - a.createdAt.getTime();
  }

  return a.createdAt.getTime() - b.createdAt.getTime();
}

async function fetchRepliesForParents(parentIds: string[]): Promise<CommentWithAuthor[]> {
  const collected: CommentWithAuthor[] = [];
  let currentParentIds = parentIds;

  while (currentParentIds.length) {
    const children = await db.comment.findMany({
      where: { parentId: { in: currentParentIds } },
      orderBy: { createdAt: "asc" },
      include: { author: { select: authorSelect } },
    });
    if (!children.length) break;
    collected.push(...children);
    currentParentIds = children.map(child => child.id);
  }

  return collected;
}

function buildChildrenMap(comments: CommentWithAuthor[]) {
  const map = new Map<string, CommentWithAuthor[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const list = map.get(comment.parentId) ?? [];
    list.push(comment);
    map.set(comment.parentId, list);
  }
  return map;
}

function attachReplies(
  comment: CommentWithAuthor,
  childrenMap: Map<string, CommentWithAuthor[]>,
  sort: "recent" | "top",
  voteMap?: Map<string, "up" | "down">,
  depth = 1,
): SerializedComment {
  const children = childrenMap.get(comment.id) ?? [];
  const replies = children
    .sort((a, b) => compareComments(a, b, sort, depth))
    .map(child => attachReplies(child, childrenMap, sort, voteMap, depth + 1));
  return serializeComment(comment, replies, voteMap);
}

export async function getPostComments(
  postId: string,
  options: { take?: number; cursor?: string | null; sort?: "recent" | "top"; viewerId?: string | null } = {},
): Promise<{ comments: SerializedComment[]; nextCursor: string | null; total: number; pinnedComment: SerializedComment | null }> {
  const take = Math.min(Math.max(options.take ?? COMMENT_PAGE_SIZE, 1), 50);
  const cursor = options.cursor ?? null;
  const sort = options.sort ?? "recent";
  const viewerId = options.viewerId ?? null;

  const roots: CommentWithAuthor[] = await db.comment.findMany({
    where: { postId, parentId: null },
    orderBy:
      sort === "top"
        ? [
            { score: "desc" },
            { createdAt: "desc" },
          ]
        : [{ createdAt: "desc" }],
    take: take + 1,
    include: { author: { select: authorSelect } },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  const pinned = await db.comment.findFirst({
    where: {
      postId,
      isDeleted: false,
      pinnedAt: { not: null },
    },
    orderBy: { pinnedAt: "desc" },
    include: { author: { select: authorSelect } },
  });

  let nextCursor: string | null = null;
  if (roots.length > take) {
    const next = roots.pop();
    nextCursor = next ? next.id : null;
  }

  const visibleRoots = roots;
  const descendants = await fetchRepliesForParents(visibleRoots.map(comment => comment.id));
  const childrenMap = buildChildrenMap(descendants);

  let voteMap: Map<string, "up" | "down"> | undefined;
  if (viewerId) {
    const allIds = [
      ...visibleRoots.map(item => item.id),
      ...descendants.map(item => item.id),
      ...(pinned ? [pinned.id] : []),
    ];
    if (allIds.length) {
      const votes = await db.commentVote.findMany({
        where: { userId: viewerId, commentId: { in: allIds } },
        select: { commentId: true, value: true },
      });
      voteMap = new Map(votes.map(vote => [vote.commentId, vote.value > 0 ? "up" : "down"]));
    }
  }

  const serialized = visibleRoots.map(comment => attachReplies(comment, childrenMap, sort, voteMap));
  const pinnedComment = pinned ? serializeComment(pinned, [], voteMap) : null;

  const total = await db.comment.count({ where: { postId } });

  return {
    comments: serialized,
    nextCursor,
    total,
    pinnedComment,
  };
}

export async function getCommentById(commentId: string, postId?: string | null, viewerId?: string | null) {
  if (!commentId) return null;
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    include: { author: { select: authorSelect } },
  });
  if (!comment) return null;
  if (postId && comment.postId !== postId) return null;
  let voteMap: Map<string, "up" | "down"> | undefined;
  if (viewerId) {
    const vote = await db.commentVote.findUnique({
      where: { userId_commentId: { userId: viewerId, commentId } },
      select: { value: true },
    });
    if (vote) {
      voteMap = new Map([[commentId, vote.value > 0 ? "up" : "down"]]);
    }
  }
  return serializeComment(comment, [], voteMap);
}
