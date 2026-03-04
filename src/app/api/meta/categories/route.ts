import { NextResponse } from "next/server";
import { getCategoryOptions } from "@/lib/categories";

export async function GET() {
  const categories = await getCategoryOptions();
  return NextResponse.json({ categories });
}
