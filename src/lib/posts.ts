import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { withDatabaseFallback } from "@/lib/db-availability";
import { db } from "@/lib/db";
import { searchPostsHybrid } from "@/lib/search-db";
import { wilsonScore, WILSON_Z_80 } from "@/lib/wilson-score";
import { subDays } from "date-fns";

export const POST_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  uploadDate: true,
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

const PUBLIC_POST_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  uploadDate: true,
  updatedAt: true,
  moderationEditedAt: true,
  moderationEditedNote: true,
  modVersion: true,
  gameVersion: true,
  views: true,
  code: true,
  codeStatus: true,
  codeNote: true,
  openForImprovement: true,
  youtubeUrl: true,
  isDeleted: true,
  authorId: true,
  authorName: true,
  workedCount: true,
  brokenCount: true,
  category: { select: { name: true } },
  images: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      original: true,
      thumbSm: true,
      thumbMd: true,
      thumbLg: true,
      position: true,
    },
  },
  dependencies: {
    select: {
      id: true,
      name: true,
      slug: true,
      url: true,
    },
  },
  author: {
    select: {
      name: true,
      image: true,
      bio: true,
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
} satisfies Prisma.PostSelect;

type PublicPostDetail = Prisma.PostGetPayload<{ select: typeof PUBLIC_POST_DETAIL_SELECT }>;

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

export async function generateUniquePostSlug(baseSlug: string) {
  const candidates = await db.post.findMany({
    where: {
      OR: [
        { slug: baseSlug },
        { slug: { startsWith: `${baseSlug}-` } },
      ],
    },
    select: { slug: true },
  });

  const taken = new Set(candidates.map(candidate => candidate.slug));
  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  let nextSuffix = 1;
  const suffixPattern = new RegExp(`^${baseSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-([0-9]+)$`);
  for (const slug of taken) {
    const match = suffixPattern.exec(slug);
    if (!match) continue;
    const suffix = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(suffix) && suffix >= nextSuffix) {
      nextSuffix = suffix + 1;
    }
  }

  return `${baseSlug}-${nextSuffix}`;
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

type CachedPublicPostDetail = Omit<PublicPostDetail, "uploadDate" | "updatedAt" | "moderationEditedAt"> & {
  uploadDate: string;
  updatedAt: string;
  moderationEditedAt: string | null;
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

function toCachedPublicPostDetail(post: PublicPostDetail): CachedPublicPostDetail {
  return {
    ...post,
    uploadDate: post.uploadDate.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    moderationEditedAt: post.moderationEditedAt?.toISOString() ?? null,
  };
}

function fromCachedPublicPostDetail(post: CachedPublicPostDetail): PublicPostDetail {
  return {
    ...post,
    uploadDate: new Date(post.uploadDate),
    updatedAt: new Date(post.updatedAt),
    moderationEditedAt: post.moderationEditedAt ? new Date(post.moderationEditedAt) : null,
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

const getCachedPopularPosts = unstable_cache(
  async (limit: number) => {
    const posts = await db.post.findMany({
      where: { isDeleted: false },
      orderBy: [
        { views: "desc" },
        { ratingCount: "desc" },
        { rating: "desc" },
        { uploadDate: "desc" },
      ],
      select: POST_CARD_SELECT,
      take: limit,
    });
    return posts.map(post => toCachedSerializedPost(serializePost(post)));
  },
  ["popular-posts"],
  { revalidate: 60 },
);

function isMissingPostViewDayTableError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") {
    return false;
  }

  return error.message.includes("PostViewDay") || JSON.stringify(error.meta ?? {}).includes("PostViewDay");
}

const getCachedTrendingPosts = unstable_cache(
  async (limit: number) => {
    const since = subDays(new Date(), 30).toISOString().slice(0, 10);
    let rows: { postId: string; recentViews: number }[] = [];
    try {
      rows = await db.$queryRaw<{ postId: string; recentViews: number }[]>`
        SELECT pvd."postId", SUM(pvd."views")::int AS "recentViews"
        FROM "PostViewDay" pvd
        INNER JOIN "Post" p ON p."id" = pvd."postId"
        WHERE pvd."day" >= ${since}::date
          AND p."isDeleted" = false
        GROUP BY pvd."postId"
        ORDER BY SUM(pvd."views") DESC, MAX(p."uploadDate") DESC
        LIMIT ${limit * 3}
      `;
    } catch (error) {
      if (!isMissingPostViewDayTableError(error)) {
        throw error;
      }
    }

    const ids = rows.map(row => row.postId);

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

    return ordered.slice(0, limit).map(toCachedSerializedPost);
  },
  ["trending-posts"],
  { revalidate: 60 },
);

const getCachedPublicPostCount = unstable_cache(
  async () => db.post.count({ where: { isDeleted: false } }),
  ["public-post-count"],
  { revalidate: 60 },
);

const getCachedPublicPostDetail = unstable_cache(
  async (slug: string) => {
    const post = await db.post.findUnique({
      where: { slug },
      select: PUBLIC_POST_DETAIL_SELECT,
    });

    return post ? toCachedPublicPostDetail(post) : null;
  },
  ["public-post-detail"],
  { revalidate: 60 },
);

export async function getPopularTags(limit = 12) {
  return withDatabaseFallback(() => getCachedPopularTags(limit), []);
}

export async function getRecentPosts(limit = 6) {
  const posts = await withDatabaseFallback(() => getCachedRecentPosts(limit), []);
  return posts.map(fromCachedSerializedPost);
}

export async function getTrendingPosts(limit = 6) {
  const posts = await withDatabaseFallback(() => getCachedTrendingPosts(limit), []);
  return posts.map(fromCachedSerializedPost);
}

export async function getPopularPosts(limit = 6) {
  const posts = await withDatabaseFallback(() => getCachedPopularPosts(limit), []);
  return posts.map(fromCachedSerializedPost);
}

export async function getPublicPostCount() {
  return withDatabaseFallback(() => getCachedPublicPostCount(), 0);
}

export async function getPublicPostDetail(slug: string) {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  const post = await withDatabaseFallback(
    () => getCachedPublicPostDetail(normalizedSlug),
    null,
  );

  return post ? fromCachedPublicPostDetail(post) : null;
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

  const result = await withDatabaseFallback(
    () => getCachedSearchPostsWithFilters(normalized),
    { posts: [], total: 0 },
  );
  return {
    posts: result.posts.map(fromCachedSerializedPost),
    total: result.total,
  };
}
