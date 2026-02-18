import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePageParam } from "@/lib/pagination";

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.name) {
    return NextResponse.json({ error: "USERNAME_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = parsePageParam(url.searchParams.get("page") ?? undefined, 1);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"));

  const where = { userId: user.id };

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
      username: user.name,
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
