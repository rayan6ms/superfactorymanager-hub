import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    select: { key: true, name: true },
  });
  return NextResponse.json({ categories });
}
