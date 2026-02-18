import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNextBuildSlugForUser } from "@/lib/builds/slug";
import { forkBuildSchema, getNextForkNameForUser, normalizeBuildName } from "@/lib/builds/validation";

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

export async function POST(request: Request, ctx: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await ctx.params;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.name) {
    return NextResponse.json({ error: "USERNAME_REQUIRED" }, { status: 400 });
  }

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const parsed = forkBuildSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "INVALID_PAYLOAD" }, { status: 400 });
  }

  const sourceUsername = username.trim().toLowerCase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await db.$transaction(async (tx) => {
        const source = await tx.build.findFirst({
          where: {
            slug,
            user: { name: sourceUsername },
            // Private builds should be indistinguishable from missing for non-owners.
            OR: [{ visibility: "PUBLIC" }, { userId: user.id }],
          },
          select: {
            id: true,
            nameOriginal: true,
            currentCode: true,
          },
        });

        if (!source) {
          throw new Error("SOURCE_NOT_FOUND");
        }

        const nextNameOriginal = parsed.data.name
          ? normalizeBuildName(parsed.data.name).nameOriginal
          : await getNextForkNameForUser(tx, user.id, source.nameOriginal);

        const { nameOriginal, nameLower } = normalizeBuildName(nextNameOriginal);

        if (parsed.data.name) {
          const existingName = await tx.build.findUnique({
            where: { userId_nameLower: { userId: user.id, nameLower } },
            select: { id: true },
          });
          if (existingName) {
            throw new Error("BUILD_NAME_TAKEN");
          }
        }

        const nextSlug = await getNextBuildSlugForUser(tx, user.id, nameLower);

        const build = await tx.build.create({
          data: {
            userId: user.id,
            nameOriginal,
            nameLower,
            slug: nextSlug,
            visibility: parsed.data.visibility,
            currentCode: source.currentCode,
            forkedFromBuildId: source.id,
          },
          select: {
            id: true,
            slug: true,
            nameOriginal: true,
            nameLower: true,
            visibility: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.buildCommit.create({
          data: {
            buildId: build.id,
            code: source.currentCode,
            message: "Initial commit",
          },
        });

        return build;
      });

      return NextResponse.json(
        {
          build: {
            username: user.name,
            slug: created.slug,
            nameOriginal: created.nameOriginal,
            nameLower: created.nameLower,
            visibility: created.visibility,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "SOURCE_NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (error instanceof Error && error.message === "BUILD_NAME_TAKEN") {
        return NextResponse.json({ error: "BUILD_NAME_TAKEN" }, { status: 409 });
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const target = error.meta?.target as string[] | string | undefined;
        if (uniqueTargetIncludes(target, ["userId", "nameLower"])) {
          return NextResponse.json({ error: "BUILD_NAME_TAKEN" }, { status: 409 });
        }
        if (uniqueTargetIncludes(target, ["userId", "slug"])) {
          // Retry with a new suffix if another concurrent fork consumed this slug.
          continue;
        }
      }

      throw error;
    }
  }

  return NextResponse.json({ error: "Unable to fork build" }, { status: 409 });
}
