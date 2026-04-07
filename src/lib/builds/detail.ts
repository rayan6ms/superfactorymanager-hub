import "server-only";
import type { BuildVisibility } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { BuildDetailPayload } from "@/lib/builds/types";

const BUILD_DETAIL_COMMITS_LIMIT = 50;

export type BuildDetailQueryResult =
  | {
    status: 404;
    payload: null;
    visibility: null;
  }
  | {
    status: 200;
    payload: BuildDetailPayload;
    visibility: BuildVisibility;
  };

type BuildDetailLookupOptions = {
  username: string;
  slug: string;
  commitId?: string | null;
  viewerId?: string | null;
};

type CachedPublicBuildDetailInput = {
  username: string;
  slug: string;
  commitId: string | null;
};

async function getBuildDetailUncached(
  options: BuildDetailLookupOptions,
): Promise<BuildDetailQueryResult> {
  const visibilityFilters = options.viewerId
    ? [{ visibility: "PUBLIC" as const }, { userId: options.viewerId }]
    : [{ visibility: "PUBLIC" as const }];

  const build = await db.build.findFirst({
    where: {
      slug: options.slug,
      user: { name: options.username },
      OR: visibilityFilters,
    },
    select: {
      id: true,
      slug: true,
      nameOriginal: true,
      tag: true,
      visibility: true,
      currentCode: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
      forkedFromBuild: {
        select: {
          slug: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!build?.user.name) {
    return { status: 404, payload: null, visibility: null };
  }

  let code = build.currentCode;
  let selectedCommitId: string | null = null;
  let selectedCommitSummary: { id: string; createdAt: Date; message: string | null } | null = null;

  if (options.commitId) {
    const commit = await db.buildCommit.findFirst({
      where: {
        id: options.commitId,
        buildId: build.id,
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        message: true,
      },
    });

    if (!commit) {
      return { status: 404, payload: null, visibility: null };
    }

    code = commit.code;
    selectedCommitId = commit.id;
    selectedCommitSummary = {
      id: commit.id,
      createdAt: commit.createdAt,
      message: commit.message,
    };
  }

  const [recentCommits, totalCommitCount] = await Promise.all([
    db.buildCommit.findMany({
      where: { buildId: build.id },
      orderBy: { createdAt: "desc" },
      take: BUILD_DETAIL_COMMITS_LIMIT,
      select: {
        id: true,
        createdAt: true,
        message: true,
      },
    }),
    db.buildCommit.count({
      where: { buildId: build.id },
    }),
  ]);

  const includesSelectedCommitOutsideWindow = Boolean(
    selectedCommitSummary
    && !recentCommits.some((commit) => commit.id === selectedCommitSummary?.id),
  );
  const commits = includesSelectedCommitOutsideWindow && selectedCommitSummary
    ? [selectedCommitSummary, ...recentCommits]
    : recentCommits;

  return {
    status: 200,
    visibility: build.visibility,
    payload: {
      build: {
        username: build.user.name,
        slug: build.slug,
        nameOriginal: build.nameOriginal,
        tag: build.tag,
        visibility: build.visibility,
        createdAt: build.createdAt.toISOString(),
        updatedAt: build.updatedAt.toISOString(),
        forkedFrom: build.forkedFromBuild?.user.name
          ? {
            username: build.forkedFromBuild.user.name,
            slug: build.forkedFromBuild.slug,
          }
          : null,
      },
      code,
      commits: commits.map((commit) => ({
        id: commit.id,
        createdAt: commit.createdAt.toISOString(),
        message: commit.message,
      })),
      commitHistory: {
        totalCount: totalCommitCount,
        visibleCount: commits.length,
        limit: BUILD_DETAIL_COMMITS_LIMIT,
        hasMore: totalCommitCount > recentCommits.length,
        includesSelectedCommitOutsideWindow,
      },
      selectedCommitId,
    },
  };
}

const getCachedPublicBuildDetail = unstable_cache(
  async (options: CachedPublicBuildDetailInput) => getBuildDetailUncached({
    username: options.username,
    slug: options.slug,
    commitId: options.commitId,
    viewerId: null,
  }),
  ["public-build-detail"],
  { revalidate: 60 },
);

export async function getBuildDetail(
  options: {
    username: string;
    slug: string;
    commitId?: string | null;
    viewerEmail?: string | null;
  },
): Promise<BuildDetailQueryResult> {
  const normalizedUsername = options.username.trim().toLowerCase();
  const normalizedSlug = options.slug.trim();
  if (!normalizedUsername || !normalizedSlug) {
    return { status: 404, payload: null, visibility: null };
  }

  if (!options.viewerEmail) {
    return getCachedPublicBuildDetail({
      username: normalizedUsername,
      slug: normalizedSlug,
      commitId: options.commitId?.trim() || null,
    });
  }

  const viewer = await db.user.findUnique({
    where: { email: options.viewerEmail },
    select: { id: true },
  });

  return getBuildDetailUncached({
    username: normalizedUsername,
    slug: normalizedSlug,
    commitId: options.commitId?.trim() || null,
    viewerId: viewer?.id ?? null,
  });
}
