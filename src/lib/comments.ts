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

const serializeComment = (comment: CommentWithAuthor): SerializedComment => ({
  id: comment.id,
  content: comment.content,
  createdAt: comment.createdAt.toISOString(),
  updatedAt: comment.updatedAt.toISOString(),
  author: comment.author
    ? {
        id: comment.author.id,
        name: comment.author.name,
        image: comment.author.image,
      }
    : null,
});

export async function getPostComments(
  postId: string,
  options: { take?: number; cursor?: string | null } = {},
): Promise<{ comments: SerializedComment[]; nextCursor: string | null; total: number }> {
  const take = Math.min(Math.max(options.take ?? COMMENT_PAGE_SIZE, 1), 50);
  const cursor = options.cursor ?? null;

  const queryOptions: Prisma.CommentFindManyArgs = {
    where: { postId },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    include: { author: { select: authorSelect } },
  };

  if (cursor) {
    queryOptions.cursor = { id: cursor };
    queryOptions.skip = 1;
  }

  const comments = await db.comment.findMany(queryOptions);

  let nextCursor: string | null = null;
  if (comments.length > take) {
    const next = comments.pop();
    nextCursor = next ? next.id : null;
  }

  const total = await db.comment.count({ where: { postId } });

  return {
    comments: comments.map(serializeComment),
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
