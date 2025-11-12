import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldCountViewAndMark } from "@/lib/views";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const post = await db.post.findUnique({
    where: { slug: slug },
    include: { category: true, images: true, dependencies: true, author: true },
  }).catch(() => null);

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await shouldCountViewAndMark(post.id)) {
    await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    post.views += 1;
  }

  return NextResponse.json(post);
}