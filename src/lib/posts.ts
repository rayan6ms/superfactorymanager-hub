import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { searchPostsHybrid } from "@/lib/search-db";
import { wilsonScore, WILSON_Z_80 } from "@/lib/wilson-score";
import { subDays } from "date-fns";

export const POST_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  modVersion: true,
  views: true,
  rating: true,
  ratingCount: true,
  workedCount: true,
  brokenCount: true,
  authorName: true,
  category: { select: { name: true } },
  images: {
    orderBy: { position: "asc" },
    select: {
      original: true,
      thumbSm: true,
      thumbMd: true,
      thumbLg: true,
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  author: { select: { id: true, name: true, image: true } },
} satisfies Prisma.PostSelect;

export type PostWithRelations = Prisma.PostGetPayload<{ select: typeof POST_CARD_SELECT }>;

export type SerializedPost = Omit<PostWithRelations, "tags"> & {
  tags: { id: string; name: string; slug: string }[];
};

export type PrismaClientOrTransaction = Pick<
  PrismaClient,
  "rating" | "post" | "postContributor"
>;

export async function recomputePostRating(postId: string) {
  const groups = await db.rating.groupBy({
    where: { postId },
    by: ["value"],
    _count: { value: true },
  });

  let worked = 0;
  let broken = 0;
  for (const entry of groups) {
    if (entry.value > 0) worked += entry._count.value;
    else if (entry.value < 0) broken += entry._count.value;
  }

  const total = worked + broken;
  const rating = wilsonScore(worked, broken, WILSON_Z_80);

  const updated = await db.post.update({
    where: { id: postId },
    data: {
      rating,
      ratingCount: total,
      workedCount: worked,
      brokenCount: broken,
    },
    include: { dependencies: true, category: true, tags: { include: { tag: true } } },
  });

  return { updated, worked, broken, total };
}

export async function resetPostRatings(client: PrismaClientOrTransaction, postId: string) {
  await client.rating.deleteMany({ where: { postId } });
  await client.post.update({
    where: { id: postId },
    data: {
      rating: 0,
      ratingCount: 0,
      workedCount: 0,
      brokenCount: 0,
    },
  });
}

export async function recordPostContributor(
  client: PrismaClientOrTransaction,
  postId: string,
  userId: string,
) {
  await client.postContributor.upsert({
    where: { postId_userId: { postId, userId } },
    update: {
      mergedCommits: { increment: 1 },
      lastContributionAt: new Date(),
    },
    create: { postId, userId, mergedCommits: 1 },
  });
}

export const serializePost = (post: PostWithRelations): SerializedPost => ({
  ...post,
  tags: (post.tags ?? [])
    .map(({ tag }) => tag)
    .filter((tag): tag is { id: string; name: string; slug: string } => Boolean(tag)),
});

type CachedSerializedPost = Omit<SerializedPost, "uploadDate"> & {
  uploadDate: string;
};

function toCachedSerializedPost(post: SerializedPost): CachedSerializedPost {
  return {
    ...post,
    uploadDate: post.uploadDate.toISOString(),
  };
}

function fromCachedSerializedPost(post: CachedSerializedPost): SerializedPost {
  return {
    ...post,
    uploadDate: new Date(post.uploadDate),
  };
}

const getCachedPopularTags = unstable_cache(
  async (limit: number) => db.tag.findMany({
    orderBy: { posts: { _count: "desc" } },
    take: limit,
    include: { _count: { select: { posts: true } } },
  }),
  ["popular-tags"],
  { revalidate: 60 * 15 },
);

const getCachedRecentPosts = unstable_cache(
  async (limit: number) => {
    const posts = await db.post.findMany({
      where: { isDeleted: false },
      orderBy: { uploadDate: "desc" },
      select: POST_CARD_SELECT,
      take: limit,
    });
    return posts.map(post => toCachedSerializedPost(serializePost(post)));
  },
  ["recent-posts"],
  { revalidate: 60 },
);

const getCachedTrendingPosts = unstable_cache(
  async (limit: number) => {
    const since = subDays(new Date(), 14);

    const ratingGroups = await db.rating.groupBy({
      by: ["postId"],
      where: { ratedAt: { gte: since } },
      _count: { postId: true },
      orderBy: { _count: { postId: "desc" } },
      take: limit * 3,
    });

    const ids = ratingGroups.map(group => group.postId);

    const posts = ids.length
      ? await db.post.findMany({
        where: { id: { in: ids }, isDeleted: false },
        select: POST_CARD_SELECT,
      })
      : [];

    const map = new Map(posts.map(post => [post.id, post]));

    const ordered = ids
      .map(id => map.get(id))
      .filter((post): post is PostWithRelations => Boolean(post))
      .map(serializePost);

    if (ordered.length >= limit) {
      return ordered.slice(0, limit).map(toCachedSerializedPost);
    }

    const fallback = await db.post.findMany({
      where: { isDeleted: false },
      orderBy: [
        { ratingCount: "desc" },
        { rating: "desc" },
        { views: "desc" },
      ],
      select: POST_CARD_SELECT,
      take: limit * 2,
    });

    const combined: SerializedPost[] = [];
    const seen = new Set(ordered.map(post => post.id));
    combined.push(...ordered);

    for (const post of fallback) {
      if (seen.has(post.id)) continue;
      combined.push(serializePost(post));
      seen.add(post.id);
      if (combined.length >= limit) break;
    }

    return combined.slice(0, limit).map(toCachedSerializedPost);
  },
  ["trending-posts"],
  { revalidate: 60 },
);

const getCachedPublicPostCount = unstable_cache(
  async () => db.post.count({ where: { isDeleted: false } }),
  ["public-post-count"],
  { revalidate: 60 },
);

export async function getPopularTags(limit = 12) {
  return getCachedPopularTags(limit);
}

export async function getRecentPosts(limit = 6) {
  const posts = await getCachedRecentPosts(limit);
  return posts.map(fromCachedSerializedPost);
}

export async function getTrendingPosts(limit = 6) {
  const posts = await getCachedTrendingPosts(limit);
  return posts.map(fromCachedSerializedPost);
}

export async function getPublicPostCount() {
  return getCachedPublicPostCount();
}

function keywordSet(...terms: (string | null | undefined)[]) {
  const words = new Set<string>();
  for (const term of terms) {
    if (!term) continue;
    const chunks = term
      .split(/[^a-zA-Z0-9]+/g)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length >= 3);
    chunks.forEach(chunk => words.add(chunk));
  }
  return words;
}

async function getRecommendedPostsUncached(opts: {
  userId?: string | null;
  searchTerm?: string | null;
  limit?: number;
}) {
  const { userId, searchTerm, limit = 6 } = opts;
  const recentUserPosts = userId
    ? await db.post.findMany({
      where: { authorId: userId, isDeleted: false },
      include: { tags: { include: { tag: true } } },
      orderBy: { uploadDate: "desc" },
      take: 5,
    })
    : [];

  const categoryIds = new Set(recentUserPosts.map(post => post.categoryId));
  const tagSlugs = new Set(
    recentUserPosts
      .flatMap(post => post.tags.map(tag => tag.tag?.slug).filter(Boolean))
      .map(slug => slug!)
  );
  const titleKeywords = keywordSet(...recentUserPosts.map(post => post.title), searchTerm ?? undefined);

  const orFilters: Prisma.PostWhereInput[] = [];
  if (categoryIds.size) orFilters.push({ categoryId: { in: Array.from(categoryIds) } });
  if (tagSlugs.size) {
    orFilters.push({
      tags: { some: { tag: { slug: { in: Array.from(tagSlugs) } } } },
    });
  }
  if (titleKeywords.size) {
    orFilters.push({
      OR: Array.from(titleKeywords).map(word => ({
        title: { contains: word },
      })),
    });
  }

  if (!orFilters.length) {
    return getTrendingPosts(limit);
  }

  const where: Prisma.PostWhereInput = {
    NOT: userId ? { authorId: userId } : undefined,
    OR: orFilters,
    isDeleted: false,
  };

  const posts = await db.post.findMany({
    where,
    orderBy: { uploadDate: "desc" },
    select: POST_CARD_SELECT,
    take: limit,
  });

  if (posts.length) return posts.map(serializePost);

  const fallback = await getTrendingPosts(limit);
  return fallback;
}

type CachedRecommendedPostsInput = {
  userId: string | null;
  searchTerm: string | null;
  limit: number;
};

const getCachedRecommendedPosts = unstable_cache(
  async (opts: CachedRecommendedPostsInput) => {
    const posts = await getRecommendedPostsUncached(opts);
    return posts.map(toCachedSerializedPost);
  },
  ["recommended-posts"],
  { revalidate: 60 },
);

export async function getRecommendedPosts(opts: {
  userId?: string | null;
  searchTerm?: string | null;
  limit?: number;
}) {
  const normalized: CachedRecommendedPostsInput = {
    userId: opts.userId?.trim() || null,
    searchTerm: opts.searchTerm?.trim() || null,
    limit: Math.max(1, Math.min(opts.limit ?? 6, 24)),
  };

  const posts = await getCachedRecommendedPosts(normalized);
  return posts.map(fromCachedSerializedPost);
}

export type PostsFilterOptions = {
  q?: string;
  order?:
  | "best"
  | "newest"
  | "oldest"
  | "highest-rating"
  | "lowest-rating"
  | "most-views"
  | "least-views";
  minRating?: number;
  categoryKey?: string;
  gameVersion?: string;
  sfmVersion?: string;
  authorId?: string;
  limit?: number;
  page?: number;
};

async function searchPostsWithFiltersUncached(opts: PostsFilterOptions) {
  const {
    q,
    order = "most-views",
    minRating,
    categoryKey,
    gameVersion,
    sfmVersion,
    authorId,
    limit = 24,
    page = 1,
  } = opts;

  const pageSize = Math.max(1, Math.min(limit, 100));
  const currentPage = Math.max(1, Math.floor(page));
  const skip = (currentPage - 1) * pageSize;

  if (q && q.trim().length) {
    const { results, total } = await searchPostsHybrid({
      q: q.trim(),
      limit: pageSize,
      offset: skip,
      order,
      filters: {
        minRating,
        categoryKey,
        gameVersion,
        sfmVersion,
        authorId,
      },
    });

    const ids = results.map(result => result.id);
    const posts = ids.length
      ? await db.post.findMany({
        where: { id: { in: ids } },
        select: POST_CARD_SELECT,
      })
      : [];

    const map = new Map(posts.map(post => [post.id, post]));
    const ordered = ids
      .map(id => map.get(id))
      .filter((post): post is PostWithRelations => Boolean(post))
      .map(serializePost);

    return { posts: ordered, total };
  }

  const baseWhere: Prisma.PostWhereInput = { isDeleted: false };
  if (minRating && minRating > 0) baseWhere.rating = { gte: minRating };
  if (categoryKey) baseWhere.category = { key: categoryKey };
  if (gameVersion) baseWhere.gameVersion = gameVersion;
  if (sfmVersion) baseWhere.modVersion = sfmVersion;
  if (authorId) baseWhere.authorId = authorId;

  const where: Prisma.PostWhereInput = { ...baseWhere };

  const orderBy: Prisma.PostOrderByWithRelationInput[] = [];
  switch (order) {
    case "best":
    case "newest":
      orderBy.push({ uploadDate: "desc" });
      break;
    case "oldest":
      orderBy.push({ uploadDate: "asc" });
      break;
    case "highest-rating":
      orderBy.push({ rating: "desc" }, { ratingCount: "desc" });
      break;
    case "lowest-rating":
      orderBy.push({ rating: "asc" }, { ratingCount: "asc" });
      break;
    case "least-views":
      orderBy.push({ views: "asc" });
      break;
    case "most-views":
    default:
      orderBy.push({ views: "desc" });
      break;
  }

  const [posts, total] = await Promise.all([
    db.post.findMany({ where, orderBy, select: POST_CARD_SELECT, take: pageSize, skip }),
    db.post.count({ where }),
  ]);

  return { posts: posts.map(serializePost), total };
}

type CachedSearchPostsInput = {
  q: string | null;
  order: NonNullable<PostsFilterOptions["order"]>;
  minRating: number | null;
  categoryKey: string | null;
  gameVersion: string | null;
  sfmVersion: string | null;
  authorId: string | null;
  limit: number;
  page: number;
};

const getCachedSearchPostsWithFilters = unstable_cache(
  async (opts: CachedSearchPostsInput) => {
    const result = await searchPostsWithFiltersUncached({
      q: opts.q ?? undefined,
      order: opts.order,
      minRating: opts.minRating ?? undefined,
      categoryKey: opts.categoryKey ?? undefined,
      gameVersion: opts.gameVersion ?? undefined,
      sfmVersion: opts.sfmVersion ?? undefined,
      authorId: opts.authorId ?? undefined,
      limit: opts.limit,
      page: opts.page,
    });

    return {
      posts: result.posts.map(toCachedSerializedPost),
      total: result.total,
    };
  },
  ["search-posts-with-filters"],
  { revalidate: 60 },
);

export async function searchPostsWithFilters(opts: PostsFilterOptions) {
  const normalized: CachedSearchPostsInput = {
    q: opts.q?.trim() || null,
    order: opts.order ?? "most-views",
    minRating: typeof opts.minRating === "number" ? opts.minRating : null,
    categoryKey: opts.categoryKey?.trim() || null,
    gameVersion: opts.gameVersion?.trim() || null,
    sfmVersion: opts.sfmVersion?.trim() || null,
    authorId: opts.authorId?.trim() || null,
    limit: Math.max(1, Math.min(opts.limit ?? 24, 100)),
    page: Math.max(1, Math.floor(opts.page ?? 1)),
  };

  const result = await getCachedSearchPostsWithFilters(normalized);
  return {
    posts: result.posts.map(fromCachedSerializedPost),
    total: result.total,
  };
}
