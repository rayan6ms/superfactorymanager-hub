import { NextResponse } from "next/server";
import { NotificationOrigin } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { commentSchema } from "@/lib/validation";
import { getPostComments } from "@/lib/comments";
import { COMMENT_PAGE_SIZE } from "@/lib/comment-constants";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");

  const take = limitParam ? Number(limitParam) : COMMENT_PAGE_SIZE;
  if (Number.isNaN(take) || take <= 0) {
    return badRequest("Invalid limit");
  }

  const post = await db.post.findUnique({ where: { slug }, select: { id: true } });
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

  const data = await getPostComments(post.id, { cursor, take });
  return NextResponse.json(data);
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
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
    db.user.findUnique({ where: { email: session.user.email }, select: { id: true, name: true, image: true } }),
    db.post.findUnique({ where: { slug }, select: { id: true, authorId: true, slug: true, title: true } }),
  ]);

  if (!user || !post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  let parentComment: { id: string; authorId: string; postId: string } | null = null;
  if (parentId) {
    parentComment = await db.comment.findUnique({
      where: { id: parentId },
      select: { id: true, authorId: true, postId: true },
    });
    if (!parentComment || parentComment.postId !== post.id) {
      return badRequest("Invalid parent comment");
    }
  }

  const comment = await db.comment.create({
    data: {
      content,
      postId: post.id,
      authorId: user.id,
      parentId,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
    },
  });

  const serialized = {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    parentId: comment.parentId,
    author: comment.author,
    replies: [],
  };

  const notificationPayloads: {
    userId: string;
    title: string;
    message: string;
    link: string;
    metadata: Record<string, unknown>;
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
      },
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
      },
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

  const total = await db.comment.count({ where: { postId: post.id } });

  return NextResponse.json({ comment: serialized, total });
}
