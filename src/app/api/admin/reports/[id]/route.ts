import { NextResponse } from "next/server";
import { ReportActionType } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { recomputePostRating } from "@/lib/posts";

const moderationSchema = z.object({
  markResolved: z.boolean().optional().default(false),
  flagTarget: z.boolean().optional().default(false),
  flagAuthorPosts: z.boolean().optional().default(false),
  flagAuthorComments: z.boolean().optional().default(false),
  revokePostVotes: z.boolean().optional().default(false),
  disableCreatePosts: z.boolean().optional().default(false),
  disableCreateComments: z.boolean().optional().default(false),
  disableVotePosts: z.boolean().optional().default(false),
  disableVoteComments: z.boolean().optional().default(false),
  timeoutMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const adminUser = session?.user?.email
    ? await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : null;
  if (!adminUser) {
    return NextResponse.json({ error: "Admin account missing" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const parsed = moderationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid moderation payload" }, { status: 400 });
  }

  const {
    markResolved,
    flagTarget,
    flagAuthorPosts,
    flagAuthorComments,
    revokePostVotes,
    disableCreatePosts,
    disableCreateComments,
    disableVotePosts,
    disableVoteComments,
    timeoutMinutes,
    note,
  } = parsed.data;

  const performedModeration =
    markResolved ||
    flagTarget ||
    flagAuthorPosts ||
    flagAuthorComments ||
    revokePostVotes ||
    disableCreatePosts ||
    disableCreateComments ||
    disableVotePosts ||
    disableVoteComments ||
    Boolean(timeoutMinutes);

  if (!performedModeration && !note) {
    return NextResponse.json({ error: "Select at least one action or leave a note." }, { status: 400 });
  }

  const report = await db.report.findUnique({
    where: { id },
    include: {
      post: { select: { id: true, authorId: true } },
      comment: { select: { id: true, authorId: true } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const offenderId = report.comment?.authorId ?? report.post?.authorId ?? null;
  const affectedPostIds = new Set<string>();
  const now = new Date();

  await db.$transaction(async tx => {
    if (flagTarget && report.commentId) {
      await tx.comment.update({ where: { id: report.commentId }, data: { isDeleted: true } });
    }
    if (flagTarget && report.postId) {
      await tx.post.update({ where: { id: report.postId }, data: { isDeleted: true } });
    }

    if (offenderId) {
      if (flagAuthorPosts) {
        await tx.post.updateMany({ where: { authorId: offenderId }, data: { isDeleted: true } });
      }
      if (flagAuthorComments) {
        await tx.comment.updateMany({ where: { authorId: offenderId }, data: { isDeleted: true } });
      }
      if (revokePostVotes) {
        const ratings = await tx.rating.findMany({ where: { userId: offenderId }, select: { postId: true } });
        ratings.forEach(rating => affectedPostIds.add(rating.postId));
        if (ratings.length) {
          await tx.rating.deleteMany({ where: { userId: offenderId } });
        }
      }

      if (
        disableCreatePosts ||
        disableCreateComments ||
        disableVotePosts ||
        disableVoteComments ||
        timeoutMinutes
      ) {
        await tx.user.update({
          where: { id: offenderId },
          data: {
            canCreatePosts: disableCreatePosts ? false : undefined,
            canCreateComments: disableCreateComments ? false : undefined,
            canVotePosts: disableVotePosts ? false : undefined,
            canVoteComments: disableVoteComments ? false : undefined,
            interactionBanUntil: timeoutMinutes ? new Date(Date.now() + timeoutMinutes * 60 * 1000) : undefined,
          },
        });
      }
    }

    if (performedModeration) {
      await tx.report.update({
        where: { id },
        data: { resolvedAt: report.resolvedAt ?? now },
      });
    }

    await tx.reportAction.create({
      data: {
        reportId: id,
        actorId: adminUser.id,
        type: performedModeration ? ReportActionType.MODERATION : ReportActionType.NOTE,
        note: note?.trim() || null,
        metadata: {
          markResolved,
          flagTarget,
          flagAuthorPosts,
          flagAuthorComments,
          revokePostVotes,
          disableCreatePosts,
          disableCreateComments,
          disableVotePosts,
          disableVoteComments,
          timeoutMinutes,
        },
      },
    });
  });

  if (affectedPostIds.size) {
    await Promise.all(Array.from(affectedPostIds).map(postId => recomputePostRating(postId)));
  }

  return NextResponse.json({ success: true });
}
