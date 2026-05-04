import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { shouldCountViewAndMark } from "@/lib/views";
import { checkRateLimit, getClientRateLimitKey, hashRateLimitIdentifier } from "@/lib/request-security";

const VIEW_WINDOW_MS = 10 * 1000;
const VIEW_LIMIT_PER_IP_PER_POST = 6;
const UNIQUE_VIEW_WINDOW_MS = 6 * 60 * 60 * 1000;

function getViewClientKey(headers: Headers) {
  const clientKey = getClientRateLimitKey(headers);
  const userAgent = headers.get("user-agent")?.trim().toLowerCase() ?? "";
  const language = headers.get("accept-language")?.trim().toLowerCase() ?? "";
  return hashRateLimitIdentifier(`${clientKey}|${userAgent}|${language}`, "post-view");
}

function getUtcDay(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function isMissingPostViewDayTableError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") {
    return false;
  }

  return error.message.includes("PostViewDay") || JSON.stringify(error.meta ?? {}).includes("PostViewDay");
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const clientKey = getClientRateLimitKey(req.headers);
  const viewClientKey = getViewClientKey(req.headers);
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

  const uniqueViewLimit = await checkRateLimit(`view-unique:${slug}:${viewClientKey}`, {
    windowMs: UNIQUE_VIEW_WINDOW_MS,
    limit: 1,
  });
  if (!uniqueViewLimit.allowed) {
    return NextResponse.json({ ok: true, counted: false });
  }

  const post = await db.post.findFirst({ where: { slug, isDeleted: false } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await shouldCountViewAndMark(post.id)) {
    const day = getUtcDay();
    const updatedPost = await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });

    try {
      await db.$executeRaw`
        INSERT INTO "PostViewDay" ("postId", "day", "views")
        VALUES (${post.id}, ${day}::date, 1)
        ON CONFLICT ("postId", "day")
        DO UPDATE SET "views" = "PostViewDay"."views" + 1
      `;
    } catch (error) {
      if (!isMissingPostViewDayTableError(error)) {
        throw error;
      }
    }

    return NextResponse.json({ ok: true, counted: true, views: updatedPost.views });
  }
  return NextResponse.json({ ok: true, counted: false, views: post.views });
}
