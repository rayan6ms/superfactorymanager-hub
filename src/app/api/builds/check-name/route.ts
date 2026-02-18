import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildNameSchema, normalizeBuildName } from "@/lib/builds/validation";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawName = new URL(request.url).searchParams.get("name") ?? "";
  const normalized = normalizeBuildName(rawName).nameLower;
  const parsed = buildNameSchema.safeParse(rawName);

  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      normalized,
      reason: "INVALID",
    });
  }

  const { nameLower } = normalizeBuildName(parsed.data);
  const existing = await db.build.findUnique({
    where: { userId_nameLower: { userId: user.id, nameLower } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ available: false, normalized: nameLower, reason: "TAKEN" });
  }

  return NextResponse.json({ available: true, normalized: nameLower });
}
