import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { TAG_MIN_COUNT, postSchema, searchQuerySchema } from "@/lib/validation";
import { makeSlug } from "@/lib/slug";
import { analyzeYoutubeUrl, toEmbed } from "@/lib/youtube";
import { MAX_POST_IMAGES, normalizeImages } from "@/lib/images";
import { parseDependency, type ParsedDep } from "@/lib/deps";
import { getSfmMatrix } from "@/lib/sfm";
import { normalizeTags } from "@/lib/tags";
import { recordPostContributor } from "@/lib/posts";
import { interactionBlockReason } from "@/lib/moderation";
import { ZodError } from "zod";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { searchPostsHybrid } from "@/lib/search-db";
import { revalidateSeoPaths } from "@/lib/seo-revalidate";

type PostWithRelations = Prisma.PostGetPayload<{
  include: {
    category: true;
    images: { orderBy: { position: "asc" } };
    dependencies: true;
    author: { select: { id: true; name: true } };
    tags: { include: { tag: true } };
  };
}>;

type PostTagWithTag = Prisma.PostTagGetPayload<{ include: { tag: true } }>;

type SerializedPost = Omit<PostWithRelations, "tags"> & { tags: PostTagWithTag["tag"][] };

const serializePost = (post: PostWithRelations): SerializedPost => ({
  ...post,
  tags: (post.tags ?? [])
    .map(({ tag }) => tag)
    .filter((tag): tag is PostTagWithTag["tag"] => Boolean(tag)),
});

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

  const baseWhere: Prisma.PostWhereInput = { isDeleted: false };
  if (category) baseWhere.category = { key: category };
  if (version) baseWhere.modVersion = version;
  if (q && q.trim().length) {
    const { results, total } = await searchPostsHybrid({
      q: q.trim(),
      limit: perPage,
      offset: (page - 1) * perPage,
      filters: { categoryKey: category, sfmVersion: version },
    });

    const ids = results.map(result => result.id);
    const items = ids.length
      ? await db.post.findMany({
        where: { id: { in: ids } },
        include: {
          category: true,
          images: { orderBy: { position: "asc" } },
          dependencies: true,
          author: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
        },
      })
      : [];

    const map = new Map(items.map(i => [i.id, i]));
    const ordered = ids
      .map((id: string) => map.get(id))
      .filter((post): post is PostWithRelations => Boolean(post))
      .map(serializePost);

    return NextResponse.json({ items: ordered, total, page, perPage });
  }

  const [items, total] = await Promise.all([
    db.post.findMany({
      where: baseWhere,
      orderBy: { uploadDate: "desc" },
      include: {
        category: true,
        images: { orderBy: { position: "asc" } },
        dependencies: true,
        author: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.post.count({ where: baseWhere }),
  ]);

  return NextResponse.json({ items: items.map(serializePost), total, page, perPage });
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
      return NextResponse.json(
        { error: `Mod version ${parsed.modVersion} is not available for Minecraft ${parsed.gameVersion}` },
        { status: 400 },
      );
    }

    const normalizedTags = normalizeTags(parsed.tags);
    if (normalizedTags.length < TAG_MIN_COUNT) {
      return NextResponse.json({ error: "Add more distinct tags to describe your post." }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        canCreatePosts: true,
        canCreateComments: true,
        canVotePosts: true,
        canVoteComments: true,
        interactionBanUntil: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const restriction = interactionBlockReason(user, "create-post");
    if (restriction) {
      return NextResponse.json({ error: restriction }, { status: 403 });
    }

    try {
      await assertRateLimit(user.id, "post:create");
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: err.message },
          { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
        );
      }
      throw err;
    }

    const normalizedImages = normalizeImages(parsed.images);
    const derivedAuthorName = user.name?.trim() || (user.email?.split("@")[0] ?? "user");

    if (normalizedImages.length > MAX_POST_IMAGES) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_POST_IMAGES} images.` },
        { status: 400 },
      );
    }

    if (!normalizedImages.length) {
      return NextResponse.json(
        { error: "Upload at least one image to showcase your build." },
        { status: 400 },
      );
    }

    const category = await db.category.findUnique({ where: { key: parsed.categoryKey } });
    if (!category) {
      return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
    }

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

    let yt: string | null = null;
    if (parsed.youtubeUrl) {
      const ytCheck = analyzeYoutubeUrl(parsed.youtubeUrl);
      if (!ytCheck.ok) {
        return NextResponse.json({ error: ytCheck.message }, { status: 400 });
      }
      yt = toEmbed(parsed.youtubeUrl);
    }

    let codeStatus: "VERIFIED" | "UNVERIFIED" | "BROKEN" = "UNVERIFIED";
    let codeNote: string | null = null;
    const code = parsed.code.trim();
    if (code.length < 3) {
      codeStatus = "BROKEN";
      codeNote = "Code is too short.";
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(code)) {
      codeStatus = "BROKEN";
      codeNote = "Invalid control characters found.";
    }

    const hydrated = await db.$transaction(async tx => {
      const created = await tx.post.create({
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
          codeStatus,
          codeNote,
          description: parsed.description,
          youtubeUrl: yt,
          openForImprovement: parsed.openForImprovement ?? false,
          images: {
            create: normalizedImages.map((image, index) => ({
              position: index,
              original: image.original,
              thumbSm: image.thumbSm,
              thumbMd: image.thumbMd,
              thumbLg: image.thumbLg,
            })),
          },
          dependencies: {
            create: depObjs.map(d => ({
              name: d.name,
              slug: d.slug,
              source: d.source,
              url: d.url,
            })),
          },
          tags: {
            create: normalizedTags.map(tag => ({
              tag: {
                connectOrCreate: {
                  where: { slug: tag.slug },
                  create: { slug: tag.slug, name: tag.name },
                },
              },
            })),
          },
        },
        include: {
          category: true,
          images: { orderBy: { position: "asc" } },
          dependencies: true,
          author: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
        },
      });

      const initialCommit = await tx.postCommit.create({
        data: {
          postId: created.id,
          authorId: user.id,
          title: "Initial publication",
          message: "Initial publication",
          code,
          status: "MERGED",
          mergedAt: new Date(),
        },
      });

      await tx.post.update({
        where: { id: created.id },
        data: { currentCommitId: initialCommit.id },
      });

      await recordPostContributor(tx, created.id, user.id);

      return { ...created, currentCommitId: initialCommit.id };
    });

    try {
      revalidateSeoPaths();
    } catch (error) {
      console.error("Failed to revalidate SEO routes after post create:", error);
    }

    return NextResponse.json(serializePost(hydrated), { status: 201 });
  } catch (e) {
    console.error("Error in POST /api/posts:", e);

    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
