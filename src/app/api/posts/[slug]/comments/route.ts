import { NextResponse } from "next/server";
import { NotificationOrigin, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { commentSchema } from "@/lib/validation";
import { getPostComments } from "@/lib/comments";
import { COMMENT_MAX_DEPTH, COMMENT_PAGE_SIZE } from "@/lib/comment-constants";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { interactionBlockReason } from "@/lib/moderation";
import { getCurrentUserFromSession } from "@/lib/current-user";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function getCommentDepth(commentId: string): Promise<number | null> {
  const rows = await db.$queryRaw<Array<{ depth: number | bigint | null }>>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId", 0::int AS depth
      FROM "Comment"
      WHERE id = ${commentId}

      UNION ALL

      SELECT c.id, c."parentId", ancestors.depth + 1
      FROM "Comment" AS c
      INNER JOIN ancestors ON c.id = ancestors."parentId"
      WHERE ancestors.depth < ${COMMENT_MAX_DEPTH + 2}
    )
    SELECT MAX(depth) AS depth
    FROM ancestors
  `);

  const depth = rows[0]?.depth;
  if (depth === null || typeof depth === "undefined") {
    return null;
  }

  return typeof depth === "bigint" ? Number(depth) : depth;
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const sortParam = url.searchParams.get("sort");

  const take = limitParam ? Number(limitParam) : COMMENT_PAGE_SIZE;
  if (Number.isNaN(take) || take <= 0) {
    return badRequest("Invalid limit");
  }

  const sort = sortParam === "top" ? "top" : "recent";

  const post = await db.post.findFirst({ where: { slug, isDeleted: false }, select: { id: true } });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (cursor) {
    const cursorComment = await db.comment.findUnique({
      where: { id: cursor },
      select: { id: true, postId: true, parentId: true },
    });
    if (!cursorComment || cursorComment.postId !== post.id || cursorComment.parentId !== null) {
      return badRequest("Invalid cursor");
    }
  }

  const includeSummary = !cursor;
  const data = await getPostComments(post.id, {
    cursor,
    take,
    sort,
    viewerId: session?.user?.id ?? null,
    includeTotal: includeSummary,
    includePinnedComment: includeSummary,
  });
  return NextResponse.json(data);
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const content = parsed.data.content.trim();
  const parentId = parsed.data.parentId ?? null;
  if (!content) {
    return badRequest("Comment cannot be empty");
  }

  const [user, post] = await Promise.all([
    getCurrentUserFromSession(session.user, {
      id: true,
      name: true,
      image: true,
      canCreatePosts: true,
      canCreateComments: true,
      canVotePosts: true,
      canVoteComments: true,
      interactionBanUntil: true,
    }),
    db.post.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true, authorId: true, slug: true, title: true },
    }),
  ]);

  if (!user || !post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const restriction = interactionBlockReason(user, "create-comment");
  if (restriction) {
    return NextResponse.json({ error: restriction }, { status: 403 });
  }

  try {
    await assertRateLimit(user.id, "comment:create");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  let parentComment: { id: string; authorId: string; postId: string; isDeleted: boolean } | null = null;
  if (parentId) {
    parentComment = await db.comment.findUnique({
      where: { id: parentId },
      select: { id: true, authorId: true, postId: true, isDeleted: true },
    });
    if (!parentComment || parentComment.postId !== post.id) {
      return badRequest("Invalid parent comment");
    }
    if (parentComment.isDeleted) {
      return badRequest("Cannot reply to a removed comment");
    }

    const parentDepth = await getCommentDepth(parentId);
    if (parentDepth === null) {
      return badRequest("Invalid parent comment");
    }
    if (parentDepth >= COMMENT_MAX_DEPTH) {
      return badRequest("This thread reached the maximum reply depth. Please start a new top-level comment.");
    }
  }

  const comment = await db.comment.create({
    data: {
      content,
      postId: post.id,
      authorId: user.id,
      parentId,
      score: 0,
      voteCount: 0,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
    },
  });

  const serialized = {
    id: comment.id,
    content: comment.content,
    isDeleted: false,
    isPinned: false,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    parentId: comment.parentId,
    author: comment.author,
    score: comment.score,
    voteCount: comment.voteCount,
    vote: null,
    replyCount: 0,
    replies: [],
  };

  const notificationPayloads: {
    userId: string;
    title: string;
    message: string;
    link: string;
    metadata: Prisma.InputJsonValue;
  }[] = [];

  if (post.authorId !== user.id) {
    notificationPayloads.push({
      userId: post.authorId,
      title: "New comment on your post",
      message: `${user.name ?? "Someone"} commented on "${post.title}".`,
      link: `/posts/${post.slug}#comment-${comment.id}`,
      metadata: {
        kind: parentId ? "post-comment-reply" : "post-comment",
        postId: post.id,
        commentId: comment.id,
        parentId,
      } satisfies Prisma.InputJsonValue,
    });
  }

  if (parentComment && parentComment.authorId !== user.id) {
    notificationPayloads.push({
      userId: parentComment.authorId,
      title: "Someone replied to your comment",
      message: `${user.name ?? "Someone"} replied to your comment on "${post.title}".`,
      link: `/posts/${post.slug}#comment-${comment.id}`,
      metadata: {
        kind: "comment-reply",
        postId: post.id,
        commentId: comment.id,
        parentId,
      } satisfies Prisma.InputJsonValue,
    });
  }

  if (notificationPayloads.length) {
    const seen = new Set<string>();
    await Promise.all(
      notificationPayloads
        .filter(payload => {
          if (seen.has(payload.userId)) return false;
          seen.add(payload.userId);
          return true;
        })
        .map(payload =>
          createNotification({
            userId: payload.userId,
            title: payload.title,
            message: payload.message,
            origin: NotificationOrigin.POST,
            link: payload.link,
            metadata: payload.metadata,
          }).catch(error => {
            console.warn("Failed to create comment notification", error);
          }),
        ),
    );
  }

  return NextResponse.json({ comment: serialized });
}
