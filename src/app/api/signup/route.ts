import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "bcrypt";
import { z } from "zod";
import { generateInitialAvatar } from "@/lib/avatar";
import { validateUsernameInput } from "@/lib/usernames";
import { isUsernameTaken } from "@/lib/usernames.server";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";
import { sendVerificationEmailForUser } from "@/lib/email-verification";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "EMAIL_REQUIRED")
    .pipe(
      z.email({ message: "INVALID_EMAIL" }),
    )
    .transform((value) => value.toLowerCase()),
  name: z
    .string()
    .trim()
    .min(1, "NAME_REQUIRED"),
  password: z
    .string()
    .min(1, "PASSWORD_REQUIRED")
    .min(8, "PASSWORD_TOO_SHORT"),
});

const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_LIMIT_PER_IP = 10;
const SIGNUP_LIMIT_PER_EMAIL = 4;

function genericSignupResponse(options: { verificationEmailSent?: boolean } = {}) {
  return NextResponse.json(
    {
      success: true,
      verificationEmailSent: options.verificationEmailSent ?? true,
    },
    { status: 201 },
  );
}

export async function POST(req: Request) {
  try {
    const clientKey = getClientRateLimitKey(req.headers);
    const ipLimit = await checkRateLimit(`auth:signup:client:${clientKey}`, {
      windowMs: SIGNUP_WINDOW_MS,
      limit: SIGNUP_LIMIT_PER_IP,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }

    const data = await req.json();
    const parsed = schema.parse(data);
    const usernameValidation = validateUsernameInput(parsed.name);
    if (!usernameValidation.ok) {
      return NextResponse.json({ error: usernameValidation.code }, { status: 400 });
    }

    const normalizedName = usernameValidation.normalized;
    if (await isUsernameTaken(normalizedName)) {
      return NextResponse.json({ error: "NAME_TAKEN" }, { status: 409 });
    }
    const emailLimit = await checkRateLimit(`auth:signup:email:${parsed.email.toLowerCase()}`, {
      windowMs: SIGNUP_WINDOW_MS,
      limit: SIGNUP_LIMIT_PER_EMAIL,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } },
      );
    }

    const existing = await db.user.findUnique({
      where: { email: parsed.email },
      select: { id: true, email: true, name: true, emailVerified: true },
    });
    if (existing) {
      let verificationEmailSent = true;
      if (!existing.emailVerified) {
        try {
          await sendVerificationEmailForUser(existing);
        } catch (err) {
          console.error("Failed to resend verification email during signup:", err);
          verificationEmailSent = false;
        }
      }
      return genericSignupResponse({ verificationEmailSent });
    }

    const passwordHash = await hash(parsed.password, 10);
    const avatar = generateInitialAvatar({ name: normalizedName, seed: parsed.email });

    const user = await db.user.create({
      data: {
        email: parsed.email,
        name: normalizedName,
        passwordHash,
        image: avatar,
      },
    });

    let verificationEmailSent = true;
    try {
      await sendVerificationEmailForUser(user);
    } catch (err) {
      console.error("Failed to send verification email:", err);
      verificationEmailSent = false;
    }

    return genericSignupResponse({ verificationEmailSent });
  } catch (error: unknown) {
    console.error("Signup error:", error);
    if (error instanceof z.ZodError) {
      const { fieldErrors } = z.flattenError(error);
      return NextResponse.json({ error: fieldErrors }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to process signup." }, { status: 400 });
  }
}
