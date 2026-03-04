import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientRateLimitKey, hashRateLimitIdentifier } from "@/lib/request-security";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "EMAIL_REQUIRED")
    .pipe(
      z.email({ message: "INVALID_EMAIL" })
    )
    .transform((value) => value.toLowerCase()),
});

const RESET_REQUEST_WINDOW_MS = 10 * 60 * 1000;
const RESET_REQUEST_LIMIT_PER_IP = 12;
const RESET_REQUEST_LIMIT_PER_EMAIL = 4;

export async function POST(request: Request) {
  const clientKey = getClientRateLimitKey(request.headers);
  const ipLimit = await checkRateLimit(`auth:password-request:client:${clientKey}`, {
    windowMs: RESET_REQUEST_WINDOW_MS,
    limit: RESET_REQUEST_LIMIT_PER_IP,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const email = parsed.data.email;
  const emailKey = hashRateLimitIdentifier(email, "auth:password-request:email");
  const emailLimit = await checkRateLimit(`auth:password-request:email:${emailKey}`, {
    windowMs: RESET_REQUEST_WINDOW_MS,
    limit: RESET_REQUEST_LIMIT_PER_EMAIL,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reset requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } },
    );
  }

  const user = await db.user.findUnique({ where: { email } });

  if (!user?.emailVerified) {
    return NextResponse.json({ success: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await db.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      resetToken: token,
      name: user.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send email to reset password", error);
    return NextResponse.json({ success: true });
  }
}
