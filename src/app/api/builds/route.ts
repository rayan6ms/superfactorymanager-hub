import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  BUILD_CODE_MIN_NON_WHITESPACE,
  createBuildSchema,
  getCodeContentStats,
  normalizeBuildName,
} from "@/lib/builds/validation";
import { getNextBuildSlugForUser } from "@/lib/builds/slug";

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

export async function POST(request: Request) {
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = createBuildSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { nameOriginal, nameLower } = normalizeBuildName(parsed.data.name);
  const { trimmedCode, nonWhitespaceCount } = getCodeContentStats(parsed.data.code);

  if (nonWhitespaceCount < BUILD_CODE_MIN_NON_WHITESPACE) {
    return NextResponse.json(
      {
        error: "CODE_TOO_SHORT",
        nonWhitespaceCount,
        minNonWhitespaceCount: BUILD_CODE_MIN_NON_WHITESPACE,
      },
      { status: 400 },
    );
  }

  const forkedFrom = parsed.data.forkedFrom
    ? {
      username: parsed.data.forkedFrom.username.trim().toLowerCase(),
      slug: parsed.data.forkedFrom.slug.trim(),
    }
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await db.$transaction(async (tx) => {
        const existingName = await tx.build.findUnique({
          where: { userId_nameLower: { userId: user.id, nameLower } },
          select: { id: true },
        });
        if (existingName) {
          throw new Error("BUILD_NAME_TAKEN");
        }

        let forkedFromBuildId: string | null = null;
        if (forkedFrom) {
          const source = await tx.build.findFirst({
            where: {
              slug: forkedFrom.slug,
              user: { name: forkedFrom.username },
              // Hide private source existence from non-owners.
              OR: [{ visibility: "PUBLIC" }, { userId: user.id }],
            },
            select: {
              id: true,
            },
          });

          if (!source) {
            throw new Error("FORK_SOURCE_NOT_FOUND");
          }

          forkedFromBuildId = source.id;
        }

        const slug = await getNextBuildSlugForUser(tx, user.id, nameLower);

        const build = await tx.build.create({
          data: {
            userId: user.id,
            nameOriginal,
            nameLower,
            slug,
            visibility: parsed.data.visibility,
            currentCode: trimmedCode,
            forkedFromBuildId,
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
            code: trimmedCode,
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
      if (error instanceof Error && error.message === "BUILD_NAME_TAKEN") {
        return NextResponse.json({ error: "BUILD_NAME_TAKEN", normalized: nameLower }, { status: 409 });
      }

      if (error instanceof Error && error.message === "FORK_SOURCE_NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const target = error.meta?.target as string[] | string | undefined;
        if (uniqueTargetIncludes(target, ["userId", "nameLower"])) {
          return NextResponse.json({ error: "BUILD_NAME_TAKEN", normalized: nameLower }, { status: 409 });
        }
        if (uniqueTargetIncludes(target, ["userId", "slug"])) {
          // Another transaction grabbed the slug; retry and generate the next suffix.
          continue;
        }
      }

      throw error;
    }
  }

  return NextResponse.json({ error: "Unable to create build" }, { status: 409 });
}
