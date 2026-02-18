import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request, ctx: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await ctx.params;
  const requestedCommitId = new URL(request.url).searchParams.get("commitId");
  const session = await auth();
  const viewer = session?.user?.email
    ? await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    : null;

  const build = await db.build.findFirst({
    where: {
      slug,
      user: { name: username.trim().toLowerCase() },
      // Private builds are only queryable by owner and otherwise look absent.
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
      userId: true,
      user: { select: { name: true } },
      forkedFromBuild: {
        select: {
          slug: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!build || !build.user.name) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let code = build.currentCode;
  let selectedCommitId: string | null = null;

  if (requestedCommitId) {
    const commit = await db.buildCommit.findFirst({
      where: {
        id: requestedCommitId,
        buildId: build.id,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!commit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const response = NextResponse.json({
    build: {
      username: build.user.name,
      slug: build.slug,
      nameOriginal: build.nameOriginal,
      visibility: build.visibility,
      createdAt: build.createdAt,
      updatedAt: build.updatedAt,
      forkedFrom: build.forkedFromBuild?.user.name
        ? {
          username: build.forkedFromBuild.user.name,
          slug: build.forkedFromBuild.slug,
        }
        : null,
    },
    code,
    commits,
    selectedCommitId,
  });

  if (build.visibility === "PUBLIC" && !requestedCommitId) {
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  } else {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}
