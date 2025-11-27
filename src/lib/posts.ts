import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { indexPost } from "@/lib/search";
import { subDays } from "date-fns";

export const POST_CARD_INCLUDE = {
  category: true,
  images: true,
  tags: { include: { tag: true } },
  author: { select: { id: true, name: true, image: true } },
} satisfies Prisma.PostInclude;

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof POST_CARD_INCLUDE }>;

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
  const updated = await db.post.update({
    where: { id: postId },
    data: { rating: worked, ratingCount: total },
    include: { dependencies: true, category: true, tags: { include: { tag: true } } },
  });
  await indexPost(updated);
  return { updated, worked, broken, total };
}

export async function resetPostRatings(client: PrismaClientOrTransaction, postId: string) {
  await client.rating.deleteMany({ where: { postId } });
  await client.post.update({ where: { id: postId }, data: { rating: 0, ratingCount: 0 } });
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

export async function getPopularTags(limit = 12) {
  const tags = await db.tag.findMany({
    orderBy: { posts: { _count: "desc" } },
    take: limit,
    include: { _count: { select: { posts: true } } },
  });
  return tags;
}

export async function getRecentPosts(limit = 6) {
  const posts = await db.post.findMany({
    where: { isDeleted: false },
    orderBy: { uploadDate: "desc" },
    include: POST_CARD_INCLUDE,
    take: limit,
  });
  return posts.map(serializePost);
}

export async function getTrendingPosts(limit = 6) {
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
      include: POST_CARD_INCLUDE,
    })
    : [];

  const map = new Map(posts.map(post => [post.id, post]));

  const ordered = ids
    .map(id => map.get(id))
    .filter((post): post is PostWithRelations => Boolean(post))
    .map(serializePost);

  if (ordered.length >= limit) return ordered.slice(0, limit);

  const fallback = await db.post.findMany({
    where: { isDeleted: false },
    orderBy: [
      { ratingCount: "desc" },
      { rating: "desc" },
      { views: "desc" },
    ],
    include: POST_CARD_INCLUDE,
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

  return combined.slice(0, limit);
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

export async function getRecommendedPosts(opts: {
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
    include: POST_CARD_INCLUDE,
    take: limit,
  });

  if (posts.length) return posts.map(serializePost);

  const fallback = await getTrendingPosts(limit);
  return fallback;
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
  limit?: number;
  page?: number;
};

export async function searchPostsWithFilters(opts: PostsFilterOptions) {
  const {
    q,
    order = "most-views",
    minRating,
    categoryKey,
    gameVersion,
    sfmVersion,
    limit = 24,
    page = 1,
  } = opts;

  const pageSize = Math.max(1, Math.min(limit, 100));
  const currentPage = Math.max(1, Math.floor(page));
  const skip = (currentPage - 1) * pageSize;

  const baseWhere: Prisma.PostWhereInput = { isDeleted: false };
  if (minRating && minRating > 0) baseWhere.rating = { gte: minRating };
  if (categoryKey) baseWhere.category = { key: categoryKey };
  if (gameVersion) baseWhere.gameVersion = gameVersion;
  if (sfmVersion) baseWhere.modVersion = sfmVersion;

  if (q && q.trim().length && order === "best") {
    try {
      const { postsIndex } = await import("@/lib/search");
      const res = await postsIndex().search(q, {
        limit: pageSize,
        offset: skip,
        filter: [
          ...(categoryKey ? [`categoryKey = "${categoryKey}"`] : []),
          ...(gameVersion ? [`gameVersion = "${gameVersion}"`] : []),
          ...(sfmVersion ? [`modVersion = "${sfmVersion}"`] : []),
        ].join(" AND ") || undefined,
      });
      if (res.hits?.length) {
        const ids = res.hits.map((hit: any) => hit.id);
        const posts = await db.post.findMany({ where: { id: { in: ids }, ...baseWhere }, include: POST_CARD_INCLUDE });
        const map = new Map(posts.map(post => [post.id, post]));
        const ordered = ids
          .map((id: string) => map.get(id))
          .filter((post): post is PostWithRelations => Boolean(post))
          .map(serializePost);
        const total = res.estimatedTotalHits ?? ordered.length;
        return { posts: ordered, total };
      }
    } catch {
      // fall through to Prisma search
    }
  }

  const where: Prisma.PostWhereInput = { ...baseWhere };
  if (q && q.trim().length) {
    const or: Prisma.PostWhereInput[] = [
      { title: { contains: q } },
      { description: { contains: q } },
      { code: { contains: q } },
      { authorName: { contains: q } },
      { slug: { contains: q } },
      { modVersion: { contains: q } },
      { category: { is: { name: { contains: q } } } },
      { category: { is: { key: { contains: q } } } },
      { tags: { some: { tag: { name: { contains: q } } } } },
      { dependencies: { some: { name: { contains: q } } } },
    ];
    where.OR = or;
  }

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
    db.post.findMany({ where, orderBy, include: POST_CARD_INCLUDE, take: pageSize, skip }),
    db.post.count({ where }),
  ]);

  return { posts: posts.map(serializePost), total };
}