import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isInternalApiAuthorized } from "@/lib/internal-api-auth";

const MAX_ACCOUNT_AGE_DAYS = 7;

export async function DELETE(req: Request) {
  if (!(await isInternalApiAuthorized(req, { allowAdminSession: false }))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MAX_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000);

  const result = await db.user.deleteMany({
    where: {
      emailVerified: null,
      createdAt: { lt: cutoff },
    },
  });

  return NextResponse.json({
    deleted: result.count,
    olderThanDays: MAX_ACCOUNT_AGE_DAYS,
    cutoff: cutoff.toISOString(),
  });
}
