import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendVerificationEmailForUser } from "@/lib/email-verification";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "IDENTIFIER_REQUIRED")
    .transform(value => value.toLowerCase()),
});

const RESEND_WINDOW_MS = 10 * 60 * 1000;
const RESEND_LIMIT_PER_IP = 12;
const RESEND_LIMIT_PER_IDENTIFIER = 4;

export async function POST(request: Request) {
  const clientKey = getClientRateLimitKey(request.headers);
  const ipLimit = await checkRateLimit(`auth:verification-resend:client:${clientKey}`, {
    windowMs: RESEND_WINDOW_MS,
    limit: RESEND_LIMIT_PER_IP,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification email requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "IDENTIFIER_REQUIRED" }, { status: 400 });
  }

  const identifier = parsed.data.identifier;
  const identifierLimit = await checkRateLimit(`auth:verification-resend:identifier:${identifier}`, {
    windowMs: RESEND_WINDOW_MS,
    limit: RESEND_LIMIT_PER_IDENTIFIER,
  });
  if (!identifierLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification email requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(identifierLimit.retryAfterSeconds) } },
    );
  }

  const user = await db.user.findFirst({
    where: {
      emailVerified: null,
      OR: [
        { email: identifier },
        { name: identifier },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    return NextResponse.json({ success: true });
  }

  try {
    await sendVerificationEmailForUser(user);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to resend verification email:", error);
    return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 503 });
  }
}
