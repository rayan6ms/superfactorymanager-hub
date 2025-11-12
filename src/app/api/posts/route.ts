import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { postSchema, searchQuerySchema } from "@/lib/validation";
import { makeSlug } from "@/lib/slug";
import { indexPost } from "@/lib/search";
import { toEmbed } from "@/lib/youtube";
import { normalizeImages } from "@/lib/images";
import { parseDependency, type ParsedDep } from "@/lib/deps";
import { getSfmMatrix } from "@/lib/sfm";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = searchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    version: url.searchParams.get("version") ?? undefined,
    page: url.searchParams.get("page") ?? 1,
    perPage: url.searchParams.get("perPage") ?? 20,
  });
  if (!parsed.success) return NextResponse.json({ error: "Bad query" }, { status: 400 });
  const { q, category, version, page, perPage } = parsed.data;

  const baseWhere: any = {};
  if (category) baseWhere.category = { key: category };
  if (version) baseWhere.modVersion = version;
  if (q && q.trim().length) {
    try {
      const { postsIndex } = await import("@/lib/search");
      const res = await postsIndex().search(q, {
        filter: [
          ...(category ? [`categoryKey = "${category}"`] : []),
          ...(version ? [`modVersion = "${version}"`] : []),
        ].join(" AND ") || undefined,
        limit: perPage,
        offset: (page - 1) * perPage,
        sort: ["uploadDate:desc"],
      });

      if (res.hits?.length) {
        const ids = res.hits.map((h: any) => h.id);
        const items = await db.post.findMany({
          where: { ...baseWhere, id: { in: ids } },
          include: {
            category: true,
            images: true,
            dependencies: true,
            author: { select: { id: true, name: true } },
          },
        });
        const map = new Map(items.map(i => [i.id, i]));
        const ordered = ids.map((id: string) => map.get(id)).filter(Boolean);
        return NextResponse.json({
          items: ordered,
          total: res.estimatedTotalHits ?? ordered.length,
          page, perPage,
        });
      }
    } catch {
      // fallback to prisma
    }

    const or = [
      { title: { contains: q } },
      { description: { contains: q } },
      { code: { contains: q } },
      { authorName: { contains: q } },
      { slug: { contains: q } },
      { modVersion: { contains: q } },
      { category: { is: { name: { contains: q } } } },
      { category: { is: { key: { contains: q } } } },
      { dependencies: { some: { name: { contains: q } } } },
    ];

    const items = await db.post.findMany({
      where: { ...baseWhere, OR: or },
      orderBy: { uploadDate: "desc" },
      include: {
        category: true,
        images: true,
        dependencies: true,
        author: { select: { id: true, name: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const total = await db.post.count({
      where: { ...baseWhere, OR: or },
    });

    return NextResponse.json({ items, total, page, perPage });
  }

  const [items, total] = await Promise.all([
    db.post.findMany({
      where: baseWhere,
      orderBy: { uploadDate: "desc" },
      include: {
        category: true,
        images: true,
        dependencies: true,
        author: { select: { id: true, name: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.post.count({ where: baseWhere }),
  ]);

  return NextResponse.json({ items, total, page, perPage });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = postSchema.parse(body);

    const { byGame } = await getSfmMatrix(false);
    const modsForGame = byGame[parsed.gameVersion] || [];
    if (!modsForGame.includes(parsed.modVersion)) {
      return NextResponse.json({ error: `Mod version ${parsed.modVersion} is not available for Minecraft ${parsed.gameVersion}` }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const derivedAuthorName = user.name?.trim() || (user.email?.split("@")[0] ?? "user");

    const category = await db.category.upsert({
      where: { key: parsed.categoryKey },
      update: {},
      create: { key: parsed.categoryKey, name: parsed.categoryKey },
    });

    const slugBase = makeSlug(parsed.title);
    let slug = slugBase;
    for (let i = 1; i < 10_000; i++) {
      const exists = await db.post.findUnique({ where: { slug } });
      if (!exists) break;
      slug = `${slugBase}-${i}`;
    }

    const depObjs = parsed.dependencies
      .map(parseDependency)
      .filter((d): d is ParsedDep => d !== null);

    const yt = parsed.youtubeUrl ? toEmbed(parsed.youtubeUrl) : null;
    if (parsed.youtubeUrl && !yt) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    let codeStatus: "VERIFIED" | "UNVERIFIED" | "BROKEN" = "UNVERIFIED";
    let codeNote: string | null = null;
    const code = parsed.code.trim();
    if (code.length < 3) { codeStatus = "BROKEN"; codeNote = "Code is too short."; }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(code)) { codeStatus = "BROKEN"; codeNote = "Invalid control characters found."; }

    const created = await db.post.create({
      data: {
        slug,
        title: parsed.title,
        gameVersion: parsed.gameVersion,
        modVersion: parsed.modVersion,
        categoryId: category.id,
        authorId: user.id,
        authorName: derivedAuthorName,
        rating: 0,
        code,
        codeStatus, codeNote,
        description: parsed.description,
        youtubeUrl: yt,
        images: {
          create: normalizeImages(parsed.images).map(i => ({
            original: i.original,
            thumbSm: i.thumbSm,
            thumbMd: i.thumbMd,
            thumbLg: i.thumbLg,
          }))
        },
        dependencies: {
          create: depObjs.map(d => ({
            name: d.name,
            slug: d.slug,
            source: d.source,
            url: d.url,
          }))
        },
      },
      include: { category: true, images: true, dependencies: true },
    });

    await indexPost(created);
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
