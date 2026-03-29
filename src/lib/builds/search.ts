import "server-only";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { BuildVisibility } from "@/lib/builds/profile-list-shared";

export const BUILD_CARD_SELECT = {
  id: true,
  slug: true,
  nameOriginal: true,
  tag: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.BuildSelect;

type BuildWithUser = Prisma.BuildGetPayload<{ select: typeof BUILD_CARD_SELECT }>;

type RankedBuildIdRow = { id: string };
type CountRow = { count: number };

export type SerializedBuild = {
  username: string;
  slug: string;
  nameOriginal: string;
  tag: string;
  visibility: BuildVisibility;
  createdAt: Date;
  updatedAt: Date;
};

type CachedSerializedBuild = Omit<SerializedBuild, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function toCachedSerializedBuild(build: SerializedBuild): CachedSerializedBuild {
  return {
    ...build,
    createdAt: build.createdAt.toISOString(),
    updatedAt: build.updatedAt.toISOString(),
  };
}

function fromCachedSerializedBuild(build: CachedSerializedBuild): SerializedBuild {
  return {
    ...build,
    createdAt: new Date(build.createdAt),
    updatedAt: new Date(build.updatedAt),
  };
}

export type BuildFilterOptions = {
  q?: string;
  order?:
  | "best"
  | "newest"
  | "oldest"
  | "recently-updated"
  | "least-recently-updated"
  | "name-asc"
  | "name-desc";
  username?: string;
  limit?: number;
  page?: number;
};

function serializeBuild(build: BuildWithUser): SerializedBuild | null {
  const username = build.user.name?.trim();
  if (!username) return null;

  return {
    username,
    slug: build.slug,
    nameOriginal: build.nameOriginal,
    tag: build.tag,
    visibility: build.visibility,
    createdAt: build.createdAt,
    updatedAt: build.updatedAt,
  };
}

function getOrderBy(order: BuildFilterOptions["order"]): Prisma.BuildOrderByWithRelationInput[] {
  switch (order) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "recently-updated":
      return [{ updatedAt: "desc" }];
    case "least-recently-updated":
      return [{ updatedAt: "asc" }];
    case "name-asc":
      return [{ nameLower: "asc" }];
    case "name-desc":
      return [{ nameLower: "desc" }];
    case "best":
    case "newest":
    default:
      return [{ createdAt: "desc" }];
  }
}

function getPublicBuildWhere(opts: { q?: string; username?: string }): Prisma.BuildWhereInput {
  const trimmedQuery = opts.q?.trim() ?? "";
  const trimmedUsername = opts.username?.trim() ?? "";

  return {
    visibility: "PUBLIC",
    user: {
      name: trimmedUsername
        ? {
          contains: trimmedUsername,
          mode: "insensitive",
        }
        : { not: null },
    },
    ...(trimmedQuery
      ? {
        OR: [
          {
            nameOriginal: {
              contains: trimmedQuery,
              mode: "insensitive",
            },
          },
          {
            tag: {
              contains: trimmedQuery,
              mode: "insensitive",
            },
          },
          {
            slug: {
              contains: trimmedQuery,
              mode: "insensitive",
            },
          },
          {
            user: {
              name: {
                contains: trimmedQuery,
                mode: "insensitive",
              },
            },
          },
        ],
      }
      : {}),
  };
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function getSearchFromWhereSql(matchPattern: string, usernamePattern: string | null) {
  const usernameFilterSql = usernamePattern
    ? Prisma.sql`AND u."name" ILIKE ${usernamePattern} ESCAPE '\\'`
    : Prisma.sql``;

  return Prisma.sql`
    FROM "Build" b
    INNER JOIN "User" u ON u."id" = b."userId"
    WHERE b."visibility" = 'PUBLIC'
      AND u."name" IS NOT NULL
      AND (
        b."nameOriginal" ILIKE ${matchPattern} ESCAPE '\\'
        OR b."tag" ILIKE ${matchPattern} ESCAPE '\\'
        OR b."slug" ILIKE ${matchPattern} ESCAPE '\\'
        OR u."name" ILIKE ${matchPattern} ESCAPE '\\'
      )
      ${usernameFilterSql}
  `;
}

async function searchPublicBuildsByRelevance(options: {
  q: string;
  username?: string;
  limit: number;
  skip: number;
}) {
  const trimmedQuery = options.q.trim();
  const trimmedUsername = options.username?.trim() ?? "";
  const queryLower = trimmedQuery.toLowerCase();

  const escapedQuery = escapeLikePattern(trimmedQuery);
  const escapedQueryLower = escapeLikePattern(queryLower);
  const escapedUsername = escapeLikePattern(trimmedUsername);

  const containsPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const containsLowerPattern = `%${escapedQueryLower}%`;
  const prefixLowerPattern = `${escapedQueryLower}%`;
  const usernamePattern = trimmedUsername ? `%${escapedUsername}%` : null;

  const fromWhereSql = getSearchFromWhereSql(containsPattern, usernamePattern);

  const [rankedIds, totalRows] = await Promise.all([
    db.$queryRaw<RankedBuildIdRow[]>(Prisma.sql`
      SELECT b."id"
      ${fromWhereSql}
      ORDER BY
        (
          CASE WHEN b."nameLower" = ${queryLower} THEN 400 ELSE 0 END
          + CASE WHEN b."tagLower" = ${queryLower} THEN 340 ELSE 0 END
          + CASE WHEN LOWER(b."slug") = ${queryLower} THEN 320 ELSE 0 END
          + CASE WHEN LOWER(u."name") = ${queryLower} THEN 260 ELSE 0 END
          + CASE WHEN b."nameLower" LIKE ${prefixLowerPattern} ESCAPE '\\' THEN 160 ELSE 0 END
          + CASE WHEN b."tagLower" LIKE ${prefixLowerPattern} ESCAPE '\\' THEN 150 ELSE 0 END
          + CASE WHEN b."slug" ILIKE ${prefixPattern} ESCAPE '\\' THEN 140 ELSE 0 END
          + CASE WHEN u."name" ILIKE ${prefixPattern} ESCAPE '\\' THEN 120 ELSE 0 END
          + CASE WHEN b."nameLower" LIKE ${containsLowerPattern} ESCAPE '\\' THEN 80 ELSE 0 END
          + CASE WHEN b."tagLower" LIKE ${containsLowerPattern} ESCAPE '\\' THEN 70 ELSE 0 END
          + CASE WHEN b."slug" ILIKE ${containsPattern} ESCAPE '\\' THEN 60 ELSE 0 END
          + CASE WHEN u."name" ILIKE ${containsPattern} ESCAPE '\\' THEN 40 ELSE 0 END
        ) DESC,
        b."updatedAt" DESC,
        b."createdAt" DESC
      OFFSET ${options.skip}
      LIMIT ${options.limit}
    `),
    db.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      ${fromWhereSql}
    `),
  ]);

  const ids = rankedIds.map((row) => row.id);
  if (!ids.length) {
    return {
      builds: [] as SerializedBuild[],
      total: totalRows[0]?.count ?? 0,
    };
  }

  const items = await db.build.findMany({
    where: { id: { in: ids } },
    select: BUILD_CARD_SELECT,
  });

  const map = new Map(items.map((build) => [build.id, build]));
  const builds = ids
    .map((id) => map.get(id))
    .filter((build): build is BuildWithUser => Boolean(build))
    .map(serializeBuild)
    .filter((build): build is SerializedBuild => Boolean(build));

  return {
    builds,
    total: totalRows[0]?.count ?? 0,
  };
}

async function searchPublicBuildsWithFiltersUncached(opts: BuildFilterOptions) {
  const {
    q,
    order = "best",
    username,
    limit = 24,
    page = 1,
  } = opts;

  const pageSize = Math.max(1, Math.min(limit, 100));
  const currentPage = Math.max(1, Math.floor(page));
  const skip = (currentPage - 1) * pageSize;

  const trimmedQuery = q?.trim() ?? "";
  const trimmedUsername = username?.trim() ?? "";

  if (trimmedQuery && order === "best") {
    return searchPublicBuildsByRelevance({
      q: trimmedQuery,
      username: trimmedUsername || undefined,
      limit: pageSize,
      skip,
    });
  }

  const where = getPublicBuildWhere({
    q: trimmedQuery || undefined,
    username: trimmedUsername || undefined,
  });
  const orderBy = getOrderBy(order);

  const [items, total] = await Promise.all([
    db.build.findMany({
      where,
      orderBy,
      select: BUILD_CARD_SELECT,
      skip,
      take: pageSize,
    }),
    db.build.count({ where }),
  ]);

  return {
    builds: items
      .map(serializeBuild)
      .filter((build): build is SerializedBuild => Boolean(build)),
    total,
  };
}

type CachedBuildFilterOptions = {
  q: string | null;
  order: NonNullable<BuildFilterOptions["order"]>;
  username: string | null;
  limit: number;
  page: number;
};

const getCachedPublicBuildsWithFilters = unstable_cache(
  async (opts: CachedBuildFilterOptions) => {
    const result = await searchPublicBuildsWithFiltersUncached({
      q: opts.q ?? undefined,
      order: opts.order,
      username: opts.username ?? undefined,
      limit: opts.limit,
      page: opts.page,
    });

    return {
      builds: result.builds.map(toCachedSerializedBuild),
      total: result.total,
    };
  },
  ["public-builds-with-filters"],
  { revalidate: 60 },
);

export async function searchPublicBuildsWithFilters(opts: BuildFilterOptions) {
  const normalized: CachedBuildFilterOptions = {
    q: opts.q?.trim() || null,
    order: opts.order ?? "best",
    username: opts.username?.trim() || null,
    limit: Math.max(1, Math.min(opts.limit ?? 24, 100)),
    page: Math.max(1, Math.floor(opts.page ?? 1)),
  };

  const result = await getCachedPublicBuildsWithFilters(normalized);
  return {
    builds: result.builds.map(fromCachedSerializedBuild),
    total: result.total,
  };
}

export async function getRecentPublicBuilds(limit = 6) {
  const result = await searchPublicBuildsWithFilters({
    order: "newest",
    limit,
    page: 1,
  });
  return result.builds;
}

export async function getRecentlyUpdatedPublicBuilds(limit = 6) {
  const result = await searchPublicBuildsWithFilters({
    order: "recently-updated",
    limit,
    page: 1,
  });
  return result.builds;
}
