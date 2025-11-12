import { NextResponse } from "next/server";
import { getSfmMatrix } from "@/lib/sfm";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const data = await getSfmMatrix(force);
  return NextResponse.json({
    ...data,
    debug: {
      now: new Date().toISOString(),
      env_DEBUG_SFM: process.env.DEBUG_SFM ?? "unset",
      byGameCounts: Object.fromEntries(Object.entries(data.byGame).map(([g, mods]) => [g, mods.length])),
    }
  });
}
