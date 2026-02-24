import "server-only";
import type { BuildVisibility } from "@prisma/client";
import { db } from "@/lib/db";
import type { BuildDetailPayload } from "@/lib/builds/types";

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

  const viewer = options.viewerEmail
    ? await db.user.findUnique({
      where: { email: options.viewerEmail },
      select: { id: true },
    })
    : null;

  const build = await db.build.findFirst({
    where: {
      slug: normalizedSlug,
      user: { name: normalizedUsername },
      OR: [
        { visibility: "PUBLIC" },
        ...(viewer?.id ? [{ userId: viewer.id }] : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      nameOriginal: true,
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

  if (options.commitId) {
    const commit = await db.buildCommit.findFirst({
      where: {
        id: options.commitId,
        buildId: build.id,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!commit) {
      return { status: 404, payload: null, visibility: null };
    }

    code = commit.code;
    selectedCommitId = commit.id;
  }

  const commits = await db.buildCommit.findMany({
    where: { buildId: build.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      message: true,
    },
  });

  return {
    status: 200,
    visibility: build.visibility,
    payload: {
      build: {
        username: build.user.name,
        slug: build.slug,
        nameOriginal: build.nameOriginal,
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
      selectedCommitId,
    },
  };
}
