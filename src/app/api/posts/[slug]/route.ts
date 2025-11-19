import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shouldCountViewAndMark } from "@/lib/views";
import { auth } from "@/lib/auth";
import { postSchema, TAG_MIN_COUNT } from "@/lib/validation";
import { getSfmMatrix } from "@/lib/sfm";
import { normalizeTags } from "@/lib/tags";
import { parseDependency } from "@/lib/deps";
import { analyzeYoutubeUrl, toEmbed } from "@/lib/youtube";
import { indexPost } from "@/lib/search";
import { recordPostContributor, resetPostRatings } from "@/lib/posts";
import type { z } from "zod";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const post = await db.post.findUnique({
    where: { slug: slug },
    include: { category: true, images: true, dependencies: true, author: true, tags: { include: { tag: true } } },
  }).catch(() => null);

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (await shouldCountViewAndMark(post.id)) {
    await db.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    post.views += 1;
  }

  return NextResponse.json(post);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await db.post.findUnique({
    where: { slug },
    include: {
      category: true,
      images: true,
      dependencies: true,
      author: true,
      tags: { include: { tag: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let parsed: z.infer<typeof postSchema>;
  try {
    parsed = postSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

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

  const category = await db.category.findUnique({ where: { key: parsed.categoryKey } });
  if (!category) {
    return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
  }

  const depObjs = parsed.dependencies
    .map(parseDependency)
    .filter((d): d is NonNullable<ReturnType<typeof parseDependency>> => Boolean(d));

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
  if (code.length < 3) { codeStatus = "BROKEN"; codeNote = "Code is too short."; }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(code)) { codeStatus = "BROKEN"; codeNote = "Invalid control characters found."; }

  const codeChanged = code !== post.code;

  const updated = await db.$transaction(async tx => {
    await tx.postTag.deleteMany({ where: { postId: post.id } });
    await tx.dependency.deleteMany({ where: { postId: post.id } });

    const updatedPost = await tx.post.update({
      where: { id: post.id },
      data: {
        title: parsed.title,
        description: parsed.description,
        gameVersion: parsed.gameVersion,
        modVersion: parsed.modVersion,
        categoryId: category.id,
        code,
        codeStatus,
        codeNote,
        youtubeUrl: yt,
        openForImprovement: parsed.openForImprovement ?? false,
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
        images: true,
        dependencies: true,
        author: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });

    await resetPostRatings(tx, post.id);

    if (codeChanged) {
      const mergedCommit = await tx.postCommit.create({
        data: {
          postId: post.id,
          authorId: user.id,
          title: "Author update",
          message: "Post updated by author",
          code,
          status: "MERGED",
          mergedAt: new Date(),
          baseCommitId: post.currentCommitId,
        },
      });
      await tx.post.update({ where: { id: post.id }, data: { currentCommitId: mergedCommit.id } });
      await recordPostContributor(tx, post.id, user.id);
      return { ...updatedPost, currentCommitId: mergedCommit.id };
    }

    return updatedPost;
  });

  try {
    await indexPost(updated as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[search] Failed to reindex post in Meilisearch:", msg);
  }
  return NextResponse.json({ slug: updated.slug });
}