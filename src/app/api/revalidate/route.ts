import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidateSeoPaths } from "@/lib/seo-revalidate";

export const runtime = "nodejs";

async function resolveSecret(request: NextRequest) {
  const fromHeader = request.headers.get("x-revalidate-secret");
  return fromHeader;
}

function isTimingSafeSecretMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

async function handle(request: NextRequest) {
  const expectedSecret = process.env.REVALIDATE_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "REVALIDATE_SECRET is not configured." },
      { status: 500 },
    );
  }

  const providedSecret = await resolveSecret(request);
  if (!providedSecret || !isTimingSafeSecretMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const revalidated = revalidateSeoPaths();
  return NextResponse.json({
    ok: true,
    revalidated,
    at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  return handle(request);
}
