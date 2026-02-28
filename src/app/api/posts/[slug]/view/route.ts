import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldCountViewAndMark } from "@/lib/views";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const VIEW_WINDOW_MS = 10 * 1000;
const VIEW_LIMIT_PER_IP_PER_POST = 6;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const clientKey = getClientRateLimitKey(req.headers);
  const viewLimit = await checkRateLimit(`view:${slug}:${clientKey}`, {
    windowMs: VIEW_WINDOW_MS,
    limit: VIEW_LIMIT_PER_IP_PER_POST,
  });
  if (!viewLimit.allowed) {
    return NextResponse.json(
      { ok: true, counted: false },
      { status: 429, headers: { "Retry-After": String(viewLimit.retryAfterSeconds) } },
    );
  }

  const post = await db.post.findFirst({ where: { slug, isDeleted: false } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await shouldCountViewAndMark(post.id)) {
    await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    return NextResponse.json({ ok: true, counted: true, views: post.views + 1 });
  }
  return NextResponse.json({ ok: true, counted: false, views: post.views });
}
