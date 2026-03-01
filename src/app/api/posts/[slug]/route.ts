import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { MAX_POST_IMAGES, normalizeImages } from "@/lib/images";
import { postSchema, TAG_MIN_COUNT } from "@/lib/validation";
import { getSfmMatrix } from "@/lib/sfm";
import { normalizeTags } from "@/lib/tags";
import { parseDependency } from "@/lib/deps";
import { analyzeYoutubeUrl, toEmbed } from "@/lib/youtube";
import { recordPostContributor, resetPostRatings } from "@/lib/posts";
import type { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { deleteBlobs } from "@/lib/blob";
import { revalidateSeoPaths } from "@/lib/seo-revalidate";

async function removeImageFiles(urls: Array<string | null | undefined>) {
  await deleteBlobs(urls);
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const post = await db.post.findFirst({
    where: { slug, isDeleted: false },
    include: {
      category: true,
      images: { orderBy: { position: "asc" } },
      dependencies: true,
      author: { select: { id: true, name: true, image: true } },
      tags: { include: { tag: true } },
    },
  }).catch(() => null);

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const isAdmin = isAdminEmail(session.user.email);

  const post = await db.post.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { orderBy: { position: "asc" } },
      dependencies: true,
      author: true,
      tags: { include: { tag: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isAuthor = post.authorId === user.id;
  if (!isAuthor && !isAdmin) {
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
  const normalizedImages = normalizeImages(parsed.images);
  const existingImageIds = new Set(post.images.map(img => img.id));
  const keepImageIdList = (parsed.keepImageIds ?? []).filter(id => existingImageIds.has(id));
  const keepImageIds = new Set(keepImageIdList);
  const preferredImageOrder = parsed.imageOrder.length
    ? parsed.imageOrder
    : [
      ...keepImageIdList.map(id => ({ existingId: id })),
      ...normalizedImages.map((_, uploadIndex) => ({ uploadIndex })),
    ];
  const seenExisting = new Set<string>();
  const seenUploads = new Set<number>();
  const finalImagePlan: Array<
    | { kind: "existing"; imageId: string; position: number }
    | { kind: "new"; image: (typeof normalizedImages)[number]; position: number }
  > = [];

  const pushExisting = (imageId: string) => {
    if (seenExisting.has(imageId) || !keepImageIds.has(imageId)) return;
    seenExisting.add(imageId);
    finalImagePlan.push({ kind: "existing", imageId, position: finalImagePlan.length });
  };

  const pushUpload = (uploadIndex: number) => {
    if (seenUploads.has(uploadIndex)) return;
    const image = normalizedImages[uploadIndex];
    if (!image) return;
    seenUploads.add(uploadIndex);
    finalImagePlan.push({ kind: "new", image, position: finalImagePlan.length });
  };

  for (const item of preferredImageOrder) {
    if ("existingId" in item) {
      pushExisting(item.existingId);
    } else {
      pushUpload(item.uploadIndex);
    }
  }

  keepImageIdList.forEach(pushExisting);
  normalizedImages.forEach((_, uploadIndex) => pushUpload(uploadIndex));

  const totalImages = finalImagePlan.length;

  if (totalImages === 0) {
    return NextResponse.json(
      { error: "Upload at least one image to showcase your build." },
      { status: 400 },
    );
  }

  if (totalImages > MAX_POST_IMAGES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_POST_IMAGES} images.` },
      { status: 400 },
    );
  }

  const imagesToRemove = post.images.filter(img => !keepImageIds.has(img.id));
  const moderationNote = !isAuthor && isAdmin ? "Edited by moderation" : null;
  const moderationTimestamp = moderationNote ? new Date() : null;

  const updated = await db.$transaction(async tx => {
    if (imagesToRemove.length) {
      await tx.postImage.deleteMany({ where: { postId: post.id, id: { in: imagesToRemove.map(img => img.id) } } });
    }
    await tx.postTag.deleteMany({ where: { postId: post.id } });
    await tx.dependency.deleteMany({ where: { postId: post.id } });
    await Promise.all(
      finalImagePlan
        .filter((entry): entry is Extract<typeof finalImagePlan[number], { kind: "existing" }> => entry.kind === "existing")
        .map(entry =>
          tx.postImage.update({
            where: { id: entry.imageId },
            data: { position: entry.position },
          }),
        ),
    );

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
        moderationEditedAt: moderationTimestamp,
        moderationEditedById: moderationNote ? user.id : null,
        moderationEditedNote: moderationNote,
        dependencies: {
          create: depObjs.map(d => ({
            name: d.name,
            slug: d.slug,
            source: d.source,
            url: d.url,
          })),
        },
        images: {
          create: finalImagePlan
            .filter((entry): entry is Extract<typeof finalImagePlan[number], { kind: "new" }> => entry.kind === "new")
            .map(entry => ({
              position: entry.position,
              original: entry.image.original,
              thumbSm: entry.image.thumbSm,
              thumbMd: entry.image.thumbMd,
              thumbLg: entry.image.thumbLg,
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

    await resetPostRatings(tx, post.id);

    if (codeChanged) {
      const mergedCommit = await tx.postCommit.create({
        data: {
          postId: post.id,
          authorId: user.id,
          title: isAuthor ? "Author update" : "Moderator update",
          message: isAuthor ? "Post updated by author" : "Post updated by moderator",
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

  if (imagesToRemove.length) {
    await Promise.all(
      imagesToRemove.map(img => removeImageFiles([img.original, img.thumbSm, img.thumbMd, img.thumbLg])),
    );
  }

  try {
    revalidateSeoPaths();
  } catch (error) {
    console.error("Failed to revalidate SEO routes after post update:", error);
  }

  return NextResponse.json({ slug: updated.slug, id: post.id });
}
