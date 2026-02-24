import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBuildDetail } from "@/lib/builds/detail";

export async function GET(request: Request, ctx: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await ctx.params;
  const requestedCommitId = new URL(request.url).searchParams.get("commitId");
  const session = await auth();
  const result = await getBuildDetail({
    username,
    slug,
    commitId: requestedCommitId,
    viewerEmail: session?.user?.email ?? null,
  });

  if (result.status === 404 || !result.payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const response = NextResponse.json(result.payload);
  if (result.visibility === "PUBLIC" && !requestedCommitId) {
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  } else {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}
