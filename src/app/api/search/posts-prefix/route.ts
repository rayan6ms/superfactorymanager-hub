import { NextResponse } from "next/server";
import { searchPostsPrefix } from "@/lib/search-db";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";
import { MAX_PUBLIC_QUERY_LENGTH } from "@/lib/public-query";

const SEARCH_WINDOW_MS = 60 * 1000;
const SEARCH_LIMIT_PER_WINDOW = 60;
const SEARCH_RESULT_MAX = 20;
const publicCacheHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function GET(req: Request) {
  const clientKey = getClientRateLimitKey(req.headers);
  const rateLimit = await checkRateLimit(`search:posts-prefix:${clientKey}`, {
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
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.floor(limitParam), SEARCH_RESULT_MAX))
    : 20;

  if (!q) return NextResponse.json({ results: [] }, { headers: publicCacheHeaders });
  if (q.length > MAX_PUBLIC_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Query must be ${MAX_PUBLIC_QUERY_LENGTH} characters or fewer.` },
      { status: 400, headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  const results = await searchPostsPrefix(q, limit);
  return NextResponse.json({ results }, { headers: publicCacheHeaders });
}
