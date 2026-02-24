import { NextRequest, NextResponse } from "next/server";
import { revalidateSeoPaths } from "@/lib/seo-revalidate";

export const runtime = "nodejs";

async function resolveSecret(request: NextRequest) {
  const fromHeader = request.headers.get("x-revalidate-secret");
  if (fromHeader) return fromHeader;

  try {
    const body = await request.json();
    if (body && typeof body.secret === "string") {
      return body.secret;
    }
  } catch {
    return null;
  }

  return null;
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
  if (!providedSecret || providedSecret !== expectedSecret) {
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
