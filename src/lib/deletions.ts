import { addDays, isBefore } from "date-fns";
import { db } from "./db";
import { makeSlug } from "./slug";
import { deleteBlobs } from "./blob";

export const MANUAL_DELETION_DAYS = 15;
export const AUTO_DELETE_REPORT_THRESHOLD = 5;

const PURGE_THROTTLE_MS = 60 * 60 * 1000; // hourly
let lastPurgeAt: number | null = null;

export async function resolveUniqueSlug(postId: string, desired: string, fallbackTitle: string) {
  const base = makeSlug(fallbackTitle || desired || `post-${postId.slice(0, 6)}`) || `post-${postId.slice(0, 8)}`;
  let candidate = base || desired || `post-${postId.slice(0, 8)}`;
  let attempt = 1;

  while (true) {
    const existing = await db.post.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === postId) {
      return candidate;
    }
    candidate = `${base}-${attempt++}`;
  }
}

export async function flagAsDeleted(
  type: "post" | "comment",
  targetId: string,
  { auto }: { auto: boolean }
) {
  const now = new Date();
  const purgeAt = auto ? null : addDays(now, MANUAL_DELETION_DAYS);

  if (type === "post") {
    const post = await db.post.findFirst({ where: { OR: [{ id: targetId }, { slug: targetId }] } });
    if (!post) {
      throw new Error("Post not found");
    }

    await db.post.update({
      where: { id: post.id },
      data: {
        isDeleted: true,
        deletionFlaggedAt: now,
        deletionFlaggedByAuto: auto,
        deletionPurgeAt: purgeAt,
      },
    });

    return { id: post.id, slug: post.slug };
  }

  const comment = await db.comment.findUnique({ where: { id: targetId } });
  if (!comment) {
    throw new Error("Comment not found");
  }

  await db.comment.update({
    where: { id: targetId },
    data: {
      isDeleted: true,
      deletionFlaggedAt: now,
      deletionFlaggedByAuto: auto,
      deletionPurgeAt: purgeAt,
    },
  });

  return { id: comment.id };
}

export async function restoreDeletion(type: "post" | "comment", targetId: string) {
  if (type === "post") {
    const post = await db.post.findFirst({ where: { OR: [{ id: targetId }, { slug: targetId }] } });
    if (!post) {
      throw new Error("Post not found");
    }

    const nextSlug = await resolveUniqueSlug(post.id, post.slug, post.title);
    await db.post.update({
      where: { id: post.id },
      data: {
        isDeleted: false,
        slug: nextSlug,
        deletionFlaggedAt: null,
        deletionFlaggedByAuto: false,
        deletionPurgeAt: null,
      },
    });

    return { slug: nextSlug, id: post.id };
  }

  const comment = await db.comment.findUnique({ where: { id: targetId } });
  if (!comment) {
    throw new Error("Comment not found");
  }

  await db.comment.update({
    where: { id: targetId },
    data: {
      isDeleted: false,
      deletionFlaggedAt: null,
      deletionFlaggedByAuto: false,
      deletionPurgeAt: null,
    },
  });

  return { id: comment.id };
}

type ImageUrls = { original: string | null; thumbSm: string | null; thumbMd: string | null; thumbLg: string | null };

async function removePostUploads(postId: string, knownImages?: ImageUrls[]) {
  const images =
    knownImages ??
    (await db.postImage.findMany({
      where: { postId },
      select: { original: true, thumbSm: true, thumbMd: true, thumbLg: true },
    }));
  const urls = images.flatMap(img => [img.original, img.thumbSm, img.thumbMd, img.thumbLg]);
  await deleteBlobs(urls);
}

export async function purgeExpiredDeletions(now = new Date()) {
  const [expiredPosts, expiredComments] = await Promise.all([
    db.post.findMany({
      where: {
        isDeleted: true,
        deletionFlaggedByAuto: false,
        deletionPurgeAt: { lte: now },
      },
      select: { id: true },
    }),
    db.comment.findMany({
      where: {
        isDeleted: true,
        deletionFlaggedByAuto: false,
        deletionPurgeAt: { lte: now },
      },
      select: { id: true },
    }),
  ]);

  const deletedPostIds = expiredPosts.map(p => p.id);
  const deletedCommentIds = expiredComments.map(c => c.id);
  const imagesByPost: Record<string, ImageUrls[] | undefined> = {};

  if (deletedPostIds.length) {
    const images = await db.postImage.findMany({
      where: { postId: { in: deletedPostIds } },
      select: { postId: true, original: true, thumbSm: true, thumbMd: true, thumbLg: true },
    });

    for (const image of images) {
      const list = imagesByPost[image.postId] ?? [];
      list.push({
        original: image.original,
        thumbSm: image.thumbSm,
        thumbMd: image.thumbMd,
        thumbLg: image.thumbLg,
      });
      imagesByPost[image.postId] = list;
    }
  }

  if (deletedPostIds.length || deletedCommentIds.length) {
    await db.$transaction(async tx => {
      if (deletedCommentIds.length) {
        await tx.comment.deleteMany({ where: { id: { in: deletedCommentIds } } });
      }
      if (deletedPostIds.length) {
        await tx.post.deleteMany({ where: { id: { in: deletedPostIds } } });
      }
    });
    await Promise.all(deletedPostIds.map(id => removePostUploads(id, imagesByPost[id])));
  }

  return { deletedPosts: deletedPostIds.length, deletedComments: deletedCommentIds.length };
}

export async function purgeExpiredDeletionsIfNeeded(now = new Date()) {
  if (lastPurgeAt) {
    const earliestNext = new Date(lastPurgeAt + PURGE_THROTTLE_MS);
    if (!isBefore(earliestNext, now)) {
      return { deletedPosts: 0, deletedComments: 0 };
    }
  }
  lastPurgeAt = now.getTime();
  return purgeExpiredDeletions(now);
}
