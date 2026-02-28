import { NextResponse } from "next/server";
import { searchPostsHybrid } from "@/lib/search-db";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const SEARCH_WINDOW_MS = 60 * 1000;
const SEARCH_LIMIT_PER_WINDOW = 60;
const SEARCH_QUERY_MAX_LENGTH = 100;
const SEARCH_RESULT_MAX = 20;

export async function GET(req: Request) {
  const clientKey = getClientRateLimitKey(req.headers);
  const rateLimit = await checkRateLimit(`search:posts:${clientKey}`, {
    windowMs: SEARCH_WINDOW_MS,
    limit: SEARCH_LIMIT_PER_WINDOW,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many search requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.floor(limitParam), SEARCH_RESULT_MAX)) : 20;

  if (!q) return NextResponse.json({ results: [] });
  if (q.length > SEARCH_QUERY_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Query must be ${SEARCH_QUERY_MAX_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const { results } = await searchPostsHybrid({ q, limit });
  return NextResponse.json({ results });
}
