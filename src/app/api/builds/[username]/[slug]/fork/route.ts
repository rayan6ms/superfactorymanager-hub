import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createForkBuild } from "@/lib/builds/fork";
import { forkBuildSchema, getNextForkNameForUser, normalizeBuildName, normalizeBuildTag } from "@/lib/builds/validation";

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

  const result = await createForkBuild({
    userId: user.id,
    username: user.name,
    source: { username, slug },
    resolveDraft: async (tx, source) => {
      const nextNameOriginal = parsed.data.name
        ? normalizeBuildName(parsed.data.name).nameOriginal
        : await getNextForkNameForUser(tx, user.id, source.nameOriginal);
      const { nameOriginal, nameLower } = normalizeBuildName(nextNameOriginal);
      const { tag, tagLower } = normalizeBuildTag(parsed.data.tag ?? source.tag);

      return {
        nameOriginal,
        nameLower,
        tag,
        tagLower,
        code: source.currentCode,
        visibility: parsed.data.visibility,
      };
    },
  });

  if (!result.ok) {
    if (result.error === "FORK_SOURCE_NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (result.error === "BUILD_NAME_TAKEN") {
      return NextResponse.json(
        { error: "BUILD_NAME_TAKEN", normalized: result.normalized },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Unable to fork build" }, { status: 409 });
  }

  return NextResponse.json({ build: result.build }, { status: 201 });
}
