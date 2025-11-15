import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX_ACCOUNT_AGE_DAYS = 7;

function isAuthorized(req: Request) {
  const header = req.headers.get("authorization");
  if (!header) return false;
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (!process.env.CRON_SECRET) return false;
  return token === process.env.CRON_SECRET;
}

export async function DELETE(req: Request) {
  if (!isAuthorized(req)) {
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
