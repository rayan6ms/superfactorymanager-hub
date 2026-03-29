import { NextResponse } from "next/server";
import { getCategoryOptions } from "@/lib/categories";

export async function GET() {
  const categories = await getCategoryOptions();
  const response = NextResponse.json({ categories });
  response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return response;
}
