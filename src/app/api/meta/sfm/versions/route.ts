import { NextResponse } from "next/server";
import { getSfmMatrix } from "@/lib/sfm";

export async function GET() {
  const data = await getSfmMatrix(false);
  return NextResponse.json(data);
}
