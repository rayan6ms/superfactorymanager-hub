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

const serializeComment = (comment: CommentWithAuthor, replies: SerializedComment[] = []): SerializedComment => ({
  id: comment.id,
  content: comment.content,
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
  replies,
});

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
): SerializedComment {
  const children = childrenMap.get(comment.id) ?? [];
  const replies = children
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(child => attachReplies(child, childrenMap));
  return serializeComment(comment, replies);
}

export async function getPostComments(
  postId: string,
  options: { take?: number; cursor?: string | null } = {},
): Promise<{ comments: SerializedComment[]; nextCursor: string | null; total: number }> {
  const take = Math.min(Math.max(options.take ?? COMMENT_PAGE_SIZE, 1), 50);
  const cursor = options.cursor ?? null;

  const roots: CommentWithAuthor[] = await db.comment.findMany({
    where: { postId, parentId: null },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    include: { author: { select: authorSelect } },
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
  });

  let nextCursor: string | null = null;
  if (roots.length > take) {
    const next = roots.pop();
    nextCursor = next ? next.id : null;
  }

  const visibleRoots = roots;
  const descendants = await fetchRepliesForParents(visibleRoots.map(comment => comment.id));
  const childrenMap = buildChildrenMap(descendants);
  const serialized = visibleRoots.map(comment => attachReplies(comment, childrenMap));

  const total = await db.comment.count({ where: { postId } });

  return {
    comments: serialized,
    nextCursor,
    total,
  };
}

export async function getCommentById(commentId: string, postId?: string | null) {
  if (!commentId) return null;
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    include: { author: { select: authorSelect } },
  });
  if (!comment) return null;
  if (postId && comment.postId !== postId) return null;
  return serializeComment(comment);
}
