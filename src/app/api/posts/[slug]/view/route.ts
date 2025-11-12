import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldCountViewAndMark } from "@/lib/views";

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const post = await db.post.findUnique({ where: { slug } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await shouldCountViewAndMark(post.id)) {
    await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    return NextResponse.json({ ok: true, counted: true, views: post.views + 1 });
  }
  return NextResponse.json({ ok: true, counted: false, views: post.views });
}