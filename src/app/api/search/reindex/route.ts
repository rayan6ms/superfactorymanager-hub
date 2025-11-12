import { NextResponse } from "next/server";
import { ensureIndexes, reindexAll } from "@/lib/search";

export async function POST() {
  await ensureIndexes();
  await reindexAll();
  return NextResponse.json({ ok: true });
}