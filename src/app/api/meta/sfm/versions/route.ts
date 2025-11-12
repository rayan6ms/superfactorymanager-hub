import { NextResponse } from "next/server";
import { getSfmMatrix } from "@/lib/sfm";

export async function GET() {
  const data = await getSfmMatrix(false);
  const byGameCounts = Object.fromEntries(Object.entries(data.byGame).map(([g, mods]) => [g, mods.length]));
  return NextResponse.json({
    ...data,
    debug: {
      now: new Date().toISOString(),
      env_DEBUG_SFM: process.env.DEBUG_SFM ?? "unset",
      byGameCounts,
    }
  });
}
