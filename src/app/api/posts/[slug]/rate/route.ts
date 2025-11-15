import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { indexPost } from "@/lib/search";

const COOLDOWN_SEC = 10;

async function recompute(postId: string) {
  const agg = await db.rating.aggregate({
    where: { postId },
    _avg: { value: true },
    _count: { value: true },
  });
  const updated = await db.post.update({
    where: { id: postId },
    data: { rating: agg._avg.value ?? 0, ratingCount: agg._count.value },
    include: { dependencies: true, category: true, tags: { include: { tag: true } } },
  });
  await indexPost(updated);
  return updated;
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { value } = await req.json() as { value: number };
  const v = Math.max(1, Math.min(5, Math.floor(value)));

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
    if (elapsed < COOLDOWN_SEC && existing.value === v) {
      return NextResponse.json({ error: "Too many updates; try again shortly" }, { status: 429 });
    }
  }

  await db.rating.upsert({
    where: { userId_postId: { userId: user.id, postId: post.id } },
    create: { userId: user.id, postId: post.id, value: v },
    update: { value: v, ratedAt: new Date() },
  });

  const updated = await recompute(post.id);
  return NextResponse.json({ rating: updated.rating, ratingCount: updated.ratingCount, my: v });
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

  const updated = await recompute(post.id);
  return NextResponse.json({ rating: updated.rating, ratingCount: updated.ratingCount, my: 0 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ my: 0 });

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  const post = await db.post.findUnique({ where: { slug } });
  if (!user || !post) return NextResponse.json({ my: 0 });

  const r = await db.rating.findUnique({
    where: { userId_postId: { userId: user.id, postId: post.id } },
  });

  return NextResponse.json({ my: r?.value ?? 0 });
}