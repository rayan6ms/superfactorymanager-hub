import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { recomputePostRating } from "@/lib/posts";
import { interactionBlockReason } from "@/lib/moderation";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

const COOLDOWN_SEC = 10;
const VOTE_THROTTLE_MS = 2000;

async function enforceVoteThrottle(userId: string) {
  const latest = await db.rating.findFirst({
    where: { userId },
    orderBy: { ratedAt: "desc" },
    select: { ratedAt: true },
  });

  if (!latest) return null;
  const elapsed = Date.now() - latest.ratedAt.getTime();
  if (elapsed < VOTE_THROTTLE_MS) {
    const retry = Math.ceil((VOTE_THROTTLE_MS - elapsed) / 1000);
    return NextResponse.json(
      { error: "You're voting too quickly. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      canCreatePosts: true,
      canCreateComments: true,
      canVotePosts: true,
      canVoteComments: true,
      interactionBanUntil: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restriction = interactionBlockReason(user, "vote-post");
  if (restriction) {
    return NextResponse.json({ error: restriction }, { status: 403 });
  }

  try {
    await assertRateLimit(user.id, "post:vote");
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

  const post = await db.post.findFirst({ where: { slug, isDeleted: false } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (post.authorId === user.id) {
    return NextResponse.json({ error: "Authors cannot rate their own posts" }, { status: 403 });
  }

  const existing = await db.rating.findUnique({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  });

  if (existing) {
    const elapsed = (Date.now() - new Date(existing.ratedAt).getTime()) / 1000;
    if (elapsed < COOLDOWN_SEC && existing.value === value) {
      return NextResponse.json({ error: "Too many updates; try again shortly" }, { status: 429 });
    }
  }

  await db.rating.upsert({
    where: { userId_postId: { userId: user.id, postId: post.id } },
    create: { userId: user.id, postId: post.id, value },
    update: { value, ratedAt: new Date() },
  });

  const { updated, worked, broken, total } = await recomputePostRating(post.id);
  return NextResponse.json({ worked, broken, total, my: vote, post: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await db.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertRateLimit(user.id, "post:vote");
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

  await db.rating.delete({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  }).catch(() => null);

  const { updated, worked, broken, total } = await recomputePostRating(post.id);
  return NextResponse.json({ worked, broken, total, my: null, post: updated });
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ my: null });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  const post = await db.post.findFirst({ where: { slug, isDeleted: false } });
  if (!user || !post) return NextResponse.json({ my: null });

  const r = await db.rating.findUnique({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  });

  return NextResponse.json({ my: r ? (r.value > 0 ? "up" : "down") : null });
}