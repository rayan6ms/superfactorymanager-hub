import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  BUILD_CODE_MIN_NON_WHITESPACE,
  getCodeContentStats,
  updateBuildSchema,
} from "@/lib/builds/validation";

export async function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

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

  const parsed = updateBuildSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "INVALID_PAYLOAD" }, { status: 400 });
  }

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

  const existing = await db.build.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const commitMessage = parsed.data.commitMessage?.trim() || null;

  const updated = await db.$transaction(async (tx) => {
    const build = await tx.build.update({
      where: { id: existing.id },
      data: {
        currentCode: trimmedCode,
        ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
      },
      select: {
        slug: true,
        nameOriginal: true,
        nameLower: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (parsed.data.createCommit) {
      await tx.buildCommit.create({
        data: {
          buildId: existing.id,
          code: trimmedCode,
          message: commitMessage,
        },
      });
    }

    return build;
  });

  return NextResponse.json({
    build: {
      username: user.name,
      slug: updated.slug,
      nameOriginal: updated.nameOriginal,
      nameLower: updated.nameLower,
      visibility: updated.visibility,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
}
