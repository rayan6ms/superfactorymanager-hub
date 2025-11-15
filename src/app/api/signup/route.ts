import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "bcrypt";
import { z } from "zod";
import { generateInitialAvatar } from "@/lib/avatar";
import { generateRandomToken, hashToken } from "@/lib/tokens";
import { sendEmailVerificationEmail } from "@/lib/email";
import { validateUsernameInput } from "@/lib/usernames";
import { isUsernameTaken } from "@/lib/usernames.server";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "EMAIL_REQUIRED")
    .pipe(
      z.email({ message: "INVALID_EMAIL" }),
    ),
  name: z
    .string()
    .trim()
    .min(1, "NAME_REQUIRED"),
  password: z
    .string()
    .min(1, "PASSWORD_REQUIRED")
    .min(8, "PASSWORD_TOO_SHORT"),
});

export async function POST(req: Request) {
  try {
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
    const existing = await db.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
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

    const rawToken = generateRandomToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
    await db.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    try {
      await sendEmailVerificationEmail({
        to: user.email,
        verificationToken: rawToken,
        name: user.name,
      });
    } catch (err) {
      console.error("Failed to send verification email:", err);
      return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 500 });
    }

    return NextResponse.json(
      { id: user.id, email: user.email },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Signup error:", error);
    if (error instanceof z.ZodError) {
      const { fieldErrors } = z.flattenError(error);
      return NextResponse.json({ error: fieldErrors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
