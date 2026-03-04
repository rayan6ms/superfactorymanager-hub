import type { Prisma } from "@prisma/client";
import { makeSlug } from "@/lib/slug";

const FALLBACK_SLUG = "build";

function getSlugBase(nameLower: string) {
  const base = makeSlug(nameLower);
  return base || FALLBACK_SLUG;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Slugs are deterministic per user: first "base", then "base-2", "base-3", ...
// Callers run this inside a transaction and retry on unique slug conflicts.
export async function getNextBuildSlugForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  nameLower: string,
) {
  const base = getSlugBase(nameLower);

  const existingBase = await tx.build.findUnique({
    where: { userId_slug: { userId, slug: base } },
    select: { slug: true },
  });
  if (!existingBase) {
    return base;
  }

  const suffixPattern = `^${escapeRegex(base)}-(\\d+)$`;
  const rows = await tx.$queryRaw<{ maxSuffix: number | null }[]>`
    SELECT MAX(NULLIF(SUBSTRING("slug" FROM ${suffixPattern}), '')::int) AS "maxSuffix"
    FROM "Build"
    WHERE "userId" = ${userId}
      AND "slug" ~ ${suffixPattern}
  `;

  const maxSuffix = rows[0]?.maxSuffix ?? null;
  if (typeof maxSuffix === "number" && Number.isInteger(maxSuffix) && maxSuffix >= 2) {
    return `${base}-${maxSuffix + 1}`;
  }

  return `${base}-2`;
}
