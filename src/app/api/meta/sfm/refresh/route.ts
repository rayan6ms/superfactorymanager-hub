import { NextResponse } from "next/server";
import { refreshSfm } from "@/lib/sfm";
import { refreshChangelog } from "@/lib/changelog";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") ?? "both") as "cf" | "mr" | "both";
  const ignoreCooldown = url.searchParams.get("ignoreCooldown") === "1";

  const [{ insertedCf, insertedMr, matrix }, changelog] = await Promise.all([
    refreshSfm({ source, ignoreCooldown }),
    refreshChangelog({ ignoreCooldown }),
  ]);

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
