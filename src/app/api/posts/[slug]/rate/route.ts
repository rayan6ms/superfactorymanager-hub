import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { indexPost } from "@/lib/search";

const COOLDOWN_SEC = 10;

async function recompute(postId: string) {
  const groups = await db.rating.groupBy({
    where: { postId },
    by: ["value"],
    _count: { value: true },
  });

  let worked = 0;
  let broken = 0;
  for (const entry of groups) {
    if (entry.value > 0) worked += entry._count.value;
    else if (entry.value < 0) broken += entry._count.value;
  }

  const total = worked + broken;
  const updated = await db.post.update({
    where: { id: postId },
    data: { rating: worked, ratingCount: total },
    include: { dependencies: true, category: true, tags: { include: { tag: true } } },
  });
  await indexPost(updated);
  return { updated, worked, broken, total };
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const post = await db.post.findUnique({ where: { slug } });
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

  const { updated, worked, broken, total } = await recompute(post.id);
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

  await db.rating.delete({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  }).catch(() => null);

  const { updated, worked, broken, total } = await recompute(post.id);
  return NextResponse.json({ worked, broken, total, my: null, post: updated });
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ my: null });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  const post = await db.post.findUnique({ where: { slug } });
  if (!user || !post) return NextResponse.json({ my: null });

  const r = await db.rating.findUnique({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  });

  return NextResponse.json({ my: r ? (r.value > 0 ? "up" : "down") : null });
}