import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { refreshSfm } from "@/lib/sfm";
import { refreshChangelog } from "@/lib/changelog";
import { isInternalApiAuthorized } from "@/lib/internal-api-auth";

async function handle(req: Request) {
  if (!(await isInternalApiAuthorized(req, { allowAdminSession: false }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawSource = url.searchParams.get("source");
  const source = rawSource === "cf" || rawSource === "mr" || rawSource === "both"
    ? rawSource
    : "both";
  const ignoreCooldown = url.searchParams.get("ignoreCooldown") === "1";

  const [{ insertedCf, insertedMr, matrix }, changelog] = await Promise.all([
    refreshSfm({ source, ignoreCooldown }),
    refreshChangelog({ ignoreCooldown }),
  ]);

  revalidateTag("sfm-matrix", "max");

  return NextResponse.json({
    ok: true,
    insertedCf,
    insertedMr,
    changelogInserted: changelog.inserted,
    byGame: matrix.byGame,
    gameVersions: matrix.gameVersions,
    refreshedAt: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function POST(req: Request) {
  return handle(req);
}
