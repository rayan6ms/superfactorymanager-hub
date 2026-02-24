import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parsePageParam } from "@/lib/pagination";
import { getProfileBuildList } from "@/lib/builds/profile-list";

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function GET(request: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const url = new URL(request.url);

  const page = parsePageParam(url.searchParams.get("page") ?? undefined, 1);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"));

  const session = await auth();
  const result = await getProfileBuildList(username, {
    page,
    pageSize,
    viewerEmail: session?.user?.email ?? null,
  });

  if (result.status === 404 || !result.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result.data);
}
