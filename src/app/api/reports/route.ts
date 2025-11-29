import { NextResponse } from "next/server";
import { ReportReason } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { AUTO_DELETE_REPORT_THRESHOLD, flagAsDeleted } from "@/lib/deletions";

const reasonOptions = [
  { value: "spam", reason: ReportReason.SPAM },
  { value: "inappropriate_content", reason: ReportReason.INAPPROPRIATE_CONTENT },
  { value: "harassment_or_bullying", reason: ReportReason.HARASSMENT_OR_BULLYING },
  { value: "spreads_false_information", reason: ReportReason.SPREADS_FALSE_INFORMATION },
  { value: "hate_speech_or_symbols", reason: ReportReason.HATE_SPEECH_OR_SYMBOLS },
  { value: "promotes_violence_or_dangerous_behavior", reason: ReportReason.PROMOTES_VIOLENCE_OR_DANGEROUS_BEHAVIOR },
  { value: "promotes_illegal_activity", reason: ReportReason.PROMOTES_ILLEGAL_ACTIVITY },
  { value: "promotes_self_harm_or_suicide", reason: ReportReason.PROMOTES_SELF_HARM_OR_SUICIDE },
  { value: "other", reason: ReportReason.OTHER },
] as const;

const reasonValues = reasonOptions.map(option => option.value) as [string, ...string[]];

const reportSchema = z
  .object({
    type: z.enum(["post", "comment"]),
    targetId: z.string().min(1),
    reason: z.enum(reasonValues),
    message: z.string().trim().max(500).optional(),
  })
  .refine(data => data.reason !== "other" || Boolean(data.message && data.message.trim().length >= 10), {
    message: "Include at least 10 characters when selecting Other.",
    path: ["message"],
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

  const { type, targetId, reason: reasonValue, message } = parsed.data;
  let postId: string | null = null;
  let commentId: string | null = null;
  const selectedReason = reasonOptions.find(option => option.value === reasonValue)?.reason ?? ReportReason.OTHER;
  if (type === "post") {
    const post = await db.post.findUnique({
      where: { slug: targetId },
      select: { id: true, title: true, slug: true, authorId: true, isDeleted: true, deletionFlaggedByAuto: true },
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

  const trimmedMessage = message?.trim() || null;

  await db.report.create({
    data: {
      reporterId: user.id,
      postId,
      commentId,
      reason: selectedReason,
      message: selectedReason === ReportReason.OTHER ? trimmedMessage : null,
    },
  });

  if (postId) {
    const [reportCount, postStatus] = await Promise.all([
      db.report.count({ where: { postId } }),
      db.post.findUnique({ where: { id: postId }, select: { isDeleted: true, deletionFlaggedByAuto: true } }),
    ]);

    if (
      reportCount >= AUTO_DELETE_REPORT_THRESHOLD &&
      !(postStatus?.isDeleted && !postStatus?.deletionFlaggedByAuto)
    ) {
      try {
        await flagAsDeleted("post", postId, { auto: true });
      } catch (error) {
        console.warn("[reports] Failed to auto-flag post", { postId, error });
      }
    }
  }

  return NextResponse.json({ success: true });
}
