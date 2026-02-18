import type { Prisma } from "@prisma/client";
import { makeSlug } from "@/lib/slug";

const FALLBACK_SLUG = "build";

function getSlugBase(nameLower: string) {
  const base = makeSlug(nameLower);
  return base || FALLBACK_SLUG;
}

// Slugs are deterministic per user: first "base", then "base-2", "base-3", ...
// Callers run this inside a transaction and retry on unique slug conflicts.
export async function getNextBuildSlugForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  nameLower: string,
) {
  const base = getSlugBase(nameLower);

  const existing = await tx.build.findMany({
    where: {
      userId,
      slug: { startsWith: base },
    },
    select: { slug: true },
  });

  const taken = new Set(existing.map((entry) => entry.slug));
  if (!taken.has(base)) {
    return base;
  }

  for (let i = 2; i < 10_000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("UNABLE_TO_GENERATE_SLUG");
}
