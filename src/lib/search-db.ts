import { Prisma } from "@prisma/client";
import { db } from "./db";

export type PostSearchResult = {
  id: string;
  slug: string;
  title: string;
  description: string;
  uploadDate: Date;
  views: number;
  rating: number;
  rank: number;
};

export type PostSearchFilters = {
  minRating?: number;
  categoryKey?: string;
  gameVersion?: string;
  sfmVersion?: string;
};

function buildConditions(filters?: PostSearchFilters) {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."isDeleted" = false`];

  if (typeof filters?.minRating === "number") {
    conditions.push(Prisma.sql`p."rating" >= ${filters.minRating}`);
  }
  if (filters?.gameVersion) {
    conditions.push(Prisma.sql`p."gameVersion" = ${filters.gameVersion}`);
  }
  if (filters?.sfmVersion) {
    conditions.push(Prisma.sql`p."modVersion" = ${filters.sfmVersion}`);
  }
  if (filters?.categoryKey) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = p."categoryId" AND c."key" = ${filters.categoryKey})`,
    );
  }

  return Prisma.join(conditions, " AND ");
}

async function runRankedSearch(
  tsQuerySql: Prisma.Sql,
  options: { limit?: number; offset?: number; filters?: PostSearchFilters },
): Promise<{ results: PostSearchResult[]; total: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const whereClause = buildConditions(options.filters);

  const results = await db.$queryRaw<PostSearchResult[]>(Prisma.sql`
    WITH search AS (SELECT ${tsQuerySql} AS query)
    SELECT p."id", p."slug", p."title", p."description", p."uploadDate", p."views", p."rating",
           ts_rank_cd(p."searchVector", search.query) AS rank
    FROM "Post" p, search
    WHERE ${whereClause} AND p."searchVector" @@ search.query
    ORDER BY rank DESC, p."uploadDate" DESC, p."rating" DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalRows = await db.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    WITH search AS (SELECT ${tsQuerySql} AS query)
    SELECT COUNT(*)::bigint AS count
    FROM "Post" p, search
    WHERE ${whereClause} AND p."searchVector" @@ search.query
  `);

  const total = totalRows?.[0]?.count ? Number(totalRows[0].count) : 0;
  return { results, total };
}

export async function searchPosts(q: string, limit = 20): Promise<PostSearchResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const { results } = await runRankedSearch(
    Prisma.sql`websearch_to_tsquery('english', ${trimmed})`,
    { limit },
  );

  return results;
}

export function toPrefixQuery(q: string): string {
  const tokens = q
    .split(/\s+/)
    .map(part => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .map(part => `${part}:*`);

  return tokens.join(" & ");
}

export async function searchPostsPrefix(q: string, limit = 20): Promise<PostSearchResult[]> {
  const prefixQuery = toPrefixQuery(q.trim());
  if (!prefixQuery) return [];

  const { results } = await runRankedSearch(
    Prisma.sql`to_tsquery('english', ${prefixQuery})`,
    { limit },
  );

  return results;
}

export async function searchPostsHybrid(options: {
  q: string;
  limit?: number;
  offset?: number;
  filters?: PostSearchFilters;
}): Promise<{ results: PostSearchResult[]; total: number }> {
  const trimmed = options.q.trim();
  if (!trimmed) return { results: [], total: 0 };

  const primary = await runRankedSearch(
    Prisma.sql`websearch_to_tsquery('english', ${trimmed})`,
    options,
  );

  if (primary.results.length > 0) return primary;

  const prefixQuery = toPrefixQuery(trimmed);
  if (!prefixQuery) return primary;

  return runRankedSearch(Prisma.sql`to_tsquery('english', ${prefixQuery})`, options);
}
