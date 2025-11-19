import { NextResponse } from "next/server";
import { NotificationOrigin } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

const reportSchema = z.object({
  type: z.enum(["post", "comment"]),
  targetId: z.string().min(1),
  message: z.string().trim().min(10).max(500),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Log in to report content." }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "Log in to report content." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Include a message between 10 and 500 characters." }, { status: 400 });
  }

  const { type, targetId, message } = parsed.data;
  let postId: string | null = null;
  let commentId: string | null = null;
  let notifyUserId: string | null = null;
  let link: string | undefined;
  let postTitle = "";
  let commentAuthorName: string | null = null;

  if (type === "post") {
    const post = await db.post.findUnique({
      where: { slug: targetId },
      select: { id: true, title: true, slug: true, authorId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    postId = post.id;
    notifyUserId = post.authorId;
    postTitle = post.title;
    link = `/posts/${post.slug}`;
  } else {
    const comment = await db.comment.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        postId: true,
        author: { select: { name: true } },
        post: { select: { slug: true, title: true, authorId: true } },
      },
    });
    if (!comment || !comment.post) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    commentId = comment.id;
    postId = comment.postId;
    notifyUserId = comment.post.authorId;
    postTitle = comment.post.title;
    commentAuthorName = comment.author?.name ?? null;
    link = `/posts/${comment.post.slug}#comment-${comment.id}`;
  }

  const report = await db.report.create({
    data: {
      reporterId: user.id,
      postId,
      commentId,
      message,
    },
  });

  if (notifyUserId && notifyUserId !== user.id) {
    const title = type === "post" ? "Your post was reported" : "A comment was reported";
    const summaryPrefix =
      type === "post" ? `Another builder flagged "${postTitle}".` : `A comment on "${postTitle}" needs your review.`;
    const detail = commentAuthorName ? ` Reported comment author: ${commentAuthorName}.` : "";
    await createNotification({
      userId: notifyUserId,
      title,
      message: `${summaryPrefix}${detail} Reporter note: ${message}`,
      origin: NotificationOrigin.REPORT,
      link,
      metadata: {
        reportId: report.id,
        postId,
        commentId,
        type,
      },
    });
  }

  return NextResponse.json({ success: true });
}
