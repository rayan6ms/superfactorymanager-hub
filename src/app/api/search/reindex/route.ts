import { NextResponse } from "next/server";
import { isInternalApiAuthorized } from "@/lib/internal-api-auth";
import { reindexPostSearch } from "@/lib/search-db";

export async function POST(request: Request) {
  if (!(await isInternalApiAuthorized(request, { allowAdminSession: false }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updatedPosts = await reindexPostSearch();
  return NextResponse.json({
    ok: true,
    updatedPosts,
    reindexedAt: new Date().toISOString(),
  });
}
