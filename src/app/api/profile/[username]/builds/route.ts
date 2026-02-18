import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePageParam } from "@/lib/pagination";

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function GET(request: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const url = new URL(request.url);

  const profile = await db.user.findUnique({
    where: { name: username.trim().toLowerCase() },
    select: { id: true, name: true },
  });

  if (!profile || !profile.name) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const page = parsePageParam(url.searchParams.get("page") ?? undefined, 1);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"));

  const session = await auth();
  const viewer = session?.user?.email
    ? await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : null;

  const isOwner = viewer?.id === profile.id;

  const where = {
    userId: profile.id,
    ...(isOwner ? {} : { visibility: "PUBLIC" as const }),
  };

  const [items, total] = await Promise.all([
    db.build.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        slug: true,
        nameOriginal: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.build.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((item) => ({
      username: profile.name,
      slug: item.slug,
      nameOriginal: item.nameOriginal,
      visibility: item.visibility,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    page,
    pageSize,
    total,
  });
}
