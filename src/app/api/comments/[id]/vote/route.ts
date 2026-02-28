import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCommentById } from "@/lib/comments";
import { interactionBlockReason, type InteractionUser } from "@/lib/moderation";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

const VOTE_THROTTLE_MS = 2000;

async function enforceVoteThrottle(userId: string) {
  const latest = await db.commentVote.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  if (!latest) return null;
  const elapsed = Date.now() - latest.updatedAt.getTime();
  if (elapsed < VOTE_THROTTLE_MS) {
    const retry = Math.ceil((VOTE_THROTTLE_MS - elapsed) / 1000);
    return NextResponse.json(
      { error: "You're voting too quickly. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  return null;
}

async function getVotingUser(email: string) {
  return (await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      canCreatePosts: true,
      canCreateComments: true,
      canVotePosts: true,
      canVoteComments: true,
      interactionBanUntil: true,
    },
  })) satisfies (InteractionUser & { id: string }) | null;
}

async function getVoteableComment(id: string) {
  return db.comment.findUnique({ where: { id }, select: { id: true, isDeleted: true } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getVotingUser(session.user.email);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentExists = await getVoteableComment(id);
  if (!commentExists || commentExists.isDeleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const restriction = interactionBlockReason(user, "vote-comment");
  if (restriction) {
    return NextResponse.json({ error: restriction }, { status: 403 });
  }

  try {
    await assertRateLimit(user.id, "comment:vote");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const throttleResponse = await enforceVoteThrottle(user.id);
  if (throttleResponse) return throttleResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const vote = (body as { vote?: unknown }).vote;
  if (vote !== "up" && vote !== "down") {
    return NextResponse.json({ error: "Expected vote to be 'up' or 'down'" }, { status: 400 });
  }

  const value = vote === "up" ? 1 : -1;

  const existing = await db.commentVote.findUnique({
    where: { userId_commentId: { userId: user.id, commentId: id } },
  });

  await db.$transaction(async tx => {
    if (existing) {
      if (existing.value === value) return;
      await tx.commentVote.update({
        where: { userId_commentId: { userId: user.id, commentId: id } },
        data: { value },
      });
      await tx.comment.update({
        where: { id },
        data: { score: { increment: value - existing.value } },
      });
      return;
    }

    await tx.commentVote.create({
      data: { value, userId: user.id, commentId: id },
    });
    await tx.comment.update({
      where: { id },
      data: { score: { increment: value }, voteCount: { increment: 1 } },
    });
  });

  const comment = await getCommentById(id, null, user.id);
  return NextResponse.json({ comment });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getVotingUser(session.user.email);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentExists = await getVoteableComment(id);
  if (!commentExists || commentExists.isDeleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const restriction = interactionBlockReason(user, "vote-comment");
  if (restriction) {
    return NextResponse.json({ error: restriction }, { status: 403 });
  }

  try {
    await assertRateLimit(user.id, "comment:vote");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const throttleResponse = await enforceVoteThrottle(user.id);
  if (throttleResponse) return throttleResponse;

  const existing = await db.commentVote.findUnique({
    where: { userId_commentId: { userId: user.id, commentId: id } },
  });

  if (existing) {
    await db.$transaction([
      db.commentVote.delete({ where: { userId_commentId: { userId: user.id, commentId: id } } }),
      db.comment.update({
        where: { id },
        data: { score: { decrement: existing.value }, voteCount: { decrement: 1 } },
      }),
    ]);
  }

  const comment = await getCommentById(id, null, user.id);
  return NextResponse.json({ comment });
}
