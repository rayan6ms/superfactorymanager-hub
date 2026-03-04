import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const SUGGESTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SUGGESTION_LIMIT_PER_CLIENT = 8;
const SUGGESTION_LIMIT_PER_CONTACT_EMAIL = 4;

const SuggestionSchema = z.object({
  message: z.string().trim().min(10).max(5000),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().max(254).optional(),
  website: z.string().max(200).optional(),
});

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many suggestions submitted. Please wait before trying again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(req: Request) {
  const session = await auth();
  const json = await req.json().catch(() => null);
  const parse = SuggestionSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const {
    message,
    contactEmail,
    contactName,
    website,
  } = parse.data;

  if (website?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const clientIdentity = session?.user?.id
    ? `user:${session.user.id}`
    : getClientRateLimitKey(req.headers);
  const clientLimit = await checkRateLimit(`suggestion:client:${clientIdentity}`, {
    windowMs: SUGGESTION_WINDOW_MS,
    limit: SUGGESTION_LIMIT_PER_CLIENT,
  });
  if (!clientLimit.allowed) {
    return tooManyRequests(clientLimit.retryAfterSeconds);
  }

  const normalizedContactEmail = contactEmail?.trim().toLowerCase() || null;
  if (normalizedContactEmail) {
    const emailLimit = await checkRateLimit(`suggestion:email:${normalizedContactEmail}`, {
      windowMs: SUGGESTION_WINDOW_MS,
      limit: SUGGESTION_LIMIT_PER_CONTACT_EMAIL,
    });
    if (!emailLimit.allowed) {
      return tooManyRequests(emailLimit.retryAfterSeconds);
    }
  }

  await db.suggestion.create({
    data: {
      message,
      contactName: contactName?.trim() || null,
      contactEmail: normalizedContactEmail,
      authorId: session?.user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
