import { NextResponse } from "next/server";
import { searchPostsHybrid } from "@/lib/search-db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.floor(limitParam), 100)) : 20;

  if (!q) return NextResponse.json({ results: [] });

  const { results } = await searchPostsHybrid({ q, limit });
  return NextResponse.json({ results });
}
