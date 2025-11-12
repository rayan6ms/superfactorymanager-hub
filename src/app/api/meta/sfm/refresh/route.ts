import { NextResponse } from "next/server";
import { refreshSfm } from "@/lib/sfm";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") ?? "both") as "cf" | "mr" | "both";
  const ignoreCooldown = url.searchParams.get("ignoreCooldown") === "1";

  const { insertedCf, insertedMr, matrix } = await refreshSfm({ source, ignoreCooldown });

  return NextResponse.json({
    ok: true,
    insertedCf,
    insertedMr,
    byGame: matrix.byGame,
    gameVersions: matrix.gameVersions,
    refreshedAt: new Date().toISOString(),
  });
}
