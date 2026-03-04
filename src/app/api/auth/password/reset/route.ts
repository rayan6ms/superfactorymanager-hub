import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { hash } from "bcrypt";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const postSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "PASSWORD_TOO_SHORT"),
});

const RESET_TOKEN_CHECK_WINDOW_MS = 10 * 60 * 1000;
const RESET_TOKEN_CHECK_LIMIT_PER_IP = 40;
const RESET_SUBMIT_LIMIT_PER_IP = 12;
const RESET_SUBMIT_LIMIT_PER_TOKEN = 6;

export async function GET(request: Request) {
  const clientKey = getClientRateLimitKey(request.headers);
  const ipLimit = await checkRateLimit(`auth:password-reset:get:client:${clientKey}`, {
    windowMs: RESET_TOKEN_CHECK_WINDOW_MS,
    limit: RESET_TOKEN_CHECK_LIMIT_PER_IP,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reset link checks. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "TOKEN_REQUIRED" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 404 });
  }

  return NextResponse.json({ email: record.user.email, expiresAt: record.expiresAt });
}

export async function POST(request: Request) {
  const clientKey = getClientRateLimitKey(request.headers);
  const ipLimit = await checkRateLimit(`auth:password-reset:post:client:${clientKey}`, {
    windowMs: RESET_TOKEN_CHECK_WINDOW_MS,
    limit: RESET_SUBMIT_LIMIT_PER_IP,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many password reset attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const tokenLimit = await checkRateLimit(`auth:password-reset:token:${tokenHash}`, {
    windowMs: RESET_TOKEN_CHECK_WINDOW_MS,
    limit: RESET_SUBMIT_LIMIT_PER_TOKEN,
  });
  if (!tokenLimit.allowed) {
    return NextResponse.json(
      { error: "Too many password reset attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(tokenLimit.retryAfterSeconds) } },
    );
  }

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 400 });
  }

  const passwordHash = await hash(password, 10);

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
  ]);

  return NextResponse.json({ success: true });
}
