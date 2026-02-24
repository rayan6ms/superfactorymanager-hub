import { NextResponse } from "next/server";
import { isInternalApiAuthorized } from "@/lib/internal-api-auth";

export async function POST(request: Request) {
  if (!(await isInternalApiAuthorized(request, { allowAdminSession: false }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
