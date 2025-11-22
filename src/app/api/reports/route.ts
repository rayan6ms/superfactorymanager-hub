import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

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

  try {
    await assertRateLimit(user.id, "report:create");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
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
  if (type === "post") {
    const post = await db.post.findUnique({
      where: { slug: targetId },
      select: { id: true, title: true, slug: true, authorId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    postId = post.id;
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
  }

  await db.report.create({
    data: {
      reporterId: user.id,
      postId,
      commentId,
      message,
    },
  });

  return NextResponse.json({ success: true });
}
