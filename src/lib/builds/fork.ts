import "server-only";

import type { BuildVisibility, Prisma } from "@prisma/client";
import { Prisma as PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getNextBuildSlugForUser } from "@/lib/builds/slug";
import type { BuildSummary } from "@/lib/builds/types";

type ForkSourceReference = {
  username: string;
  slug: string;
};

type ForkSourceBuild = {
  id: string;
  nameOriginal: string;
  tag: string;
  currentCode: string;
};

type ForkBuildDraft = {
  nameOriginal: string;
  nameLower: string;
  tag: string;
  tagLower: string;
  code: string;
  visibility: BuildVisibility;
};

type CreateForkBuildOptions = {
  userId: string;
  username: string;
  source: ForkSourceReference;
  resolveDraft: (
    tx: Prisma.TransactionClient,
    source: ForkSourceBuild,
  ) => Promise<ForkBuildDraft> | ForkBuildDraft;
};

export type CreateForkBuildResult =
  | {
    ok: true;
    build: BuildSummary;
  }
  | {
    ok: false;
    error: "BUILD_NAME_TAKEN";
    normalized: string;
  }
  | {
    ok: false;
    error: "FORK_SOURCE_NOT_FOUND";
  }
  | {
    ok: false;
    error: "UNABLE_TO_CREATE_BUILD";
  };

function uniqueTargetIncludes(
  target: string[] | string | undefined,
  fields: string[],
) {
  if (!target) return false;
  if (Array.isArray(target)) {
    return fields.every((field) => target.includes(field));
  }
  return fields.every((field) => target.includes(field));
}

export async function createForkBuild({
  userId,
  username,
  source,
  resolveDraft,
}: CreateForkBuildOptions): Promise<CreateForkBuildResult> {
  const sourceUsername = source.username.trim().toLowerCase();
  const sourceSlug = source.slug.trim();
  if (!sourceUsername || !sourceSlug) {
    return { ok: false, error: "FORK_SOURCE_NOT_FOUND" };
  }

  let latestNormalizedName = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await db.$transaction(async (tx) => {
        const forkSource = await tx.build.findFirst({
          where: {
            slug: sourceSlug,
            user: { name: sourceUsername },
            // Hide private source existence from non-owners.
            OR: [{ visibility: "PUBLIC" }, { userId }],
          },
          select: {
            id: true,
            nameOriginal: true,
            tag: true,
            currentCode: true,
          },
        });

        if (!forkSource) {
          throw new Error("FORK_SOURCE_NOT_FOUND");
        }

        const draft = await resolveDraft(tx, forkSource);
        latestNormalizedName = draft.nameLower;

        const existingName = await tx.build.findUnique({
          where: { userId_nameLower: { userId, nameLower: draft.nameLower } },
          select: { id: true },
        });
        if (existingName) {
          throw new Error("BUILD_NAME_TAKEN");
        }

        const slug = await getNextBuildSlugForUser(tx, userId, draft.nameLower);

        const build = await tx.build.create({
          data: {
            userId,
            nameOriginal: draft.nameOriginal,
            nameLower: draft.nameLower,
            tag: draft.tag,
            tagLower: draft.tagLower,
            slug,
            visibility: draft.visibility,
            currentCode: draft.code,
            forkedFromBuildId: forkSource.id,
          },
          select: {
            id: true,
            slug: true,
            nameOriginal: true,
            nameLower: true,
            tag: true,
            visibility: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.buildCommit.create({
          data: {
            buildId: build.id,
            code: draft.code,
            message: "Initial commit",
          },
        });

        return build;
      });

      return {
        ok: true,
        build: {
          username,
          slug: created.slug,
          nameOriginal: created.nameOriginal,
          nameLower: created.nameLower,
          tag: created.tag,
          visibility: created.visibility,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === "FORK_SOURCE_NOT_FOUND") {
        return { ok: false, error: "FORK_SOURCE_NOT_FOUND" };
      }

      if (error instanceof Error && error.message === "BUILD_NAME_TAKEN") {
        return {
          ok: false,
          error: "BUILD_NAME_TAKEN",
          normalized: latestNormalizedName,
        };
      }

      if (
        error instanceof PrismaClient.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const target = error.meta?.target as string[] | string | undefined;
        if (uniqueTargetIncludes(target, ["userId", "nameLower"])) {
          return {
            ok: false,
            error: "BUILD_NAME_TAKEN",
            normalized: latestNormalizedName,
          };
        }
        if (uniqueTargetIncludes(target, ["userId", "slug"])) {
          // Another concurrent request consumed this slug. Retry with a new suffix.
          continue;
        }
      }

      throw error;
    }
  }

  return { ok: false, error: "UNABLE_TO_CREATE_BUILD" };
}
