import { NextResponse } from "next/server";
import { getSfmMatrix } from "@/lib/sfm";

export async function GET() {
  const data = await getSfmMatrix(false);
  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return response;
}
