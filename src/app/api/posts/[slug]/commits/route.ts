import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { NotificationOrigin } from "@prisma/client";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

const contributionSchema = z.object({
  code: z.string().min(3, { message: "Code is required." }),
  message: z.string().min(10, { message: "Share at least 10 characters about your change." }),
  title: z
    .string()
    .trim()
    .min(5, { message: "Add a short title for your change." })
    .max(80, { message: "Keep the title under 80 characters." }),
  baseCommitId: z.string().optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = contributionSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues?.[0]?.message || "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const post = await db.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!post.openForImprovement) {
    return NextResponse.json({ error: "This post is closed to community edits." }, { status: 403 });
  }
  if (post.authorId === user.id) {
    return NextResponse.json({ error: "Use the edit form to update your own post." }, { status: 400 });
  }

  try {
    await assertRateLimit(user.id, "commit:create");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const trimmedCode = parsed.data.code.trim();
  if (trimmedCode.length < 3) {
    return NextResponse.json({ error: "Code is too short." }, { status: 400 });
  }
  if (/[^\s]/.test(trimmedCode) === false) {
    return NextResponse.json({ error: "Code must include non-whitespace characters." }, { status: 400 });
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmedCode)) {
    return NextResponse.json({ error: "Code contains invalid control characters." }, { status: 400 });
  }

  if (parsed.data.baseCommitId && post.currentCommitId && parsed.data.baseCommitId !== post.currentCommitId) {
    return NextResponse.json({ error: "Please refresh before submitting another update." }, { status: 409 });
  }

  const commitTitle = parsed.data.title.trim();
  const commitMessage = parsed.data.message.trim();

  const commit = await db.postCommit.create({
    data: {
      postId: post.id,
      authorId: user.id,
      title: commitTitle,
      message: commitMessage,
      code: trimmedCode,
      status: "PENDING",
      baseCommitId: parsed.data.baseCommitId ?? post.currentCommitId,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  if (post.authorId !== user.id) {
    await createNotification({
      userId: post.authorId,
      origin: NotificationOrigin.POST,
      title: `New contribution: ${commitTitle}`,
      message: `${user.name ?? "Someone"} says: ${commitMessage}`,
      link: `/posts/${post.slug}/edit?commit=${commit.id}`,
    });
  }

  return NextResponse.json(commit, { status: 201 });
}
