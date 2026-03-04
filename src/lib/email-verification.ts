import { db } from "@/lib/db";
import { sendEmailVerificationEmail } from "@/lib/email";
import { generateRandomToken, hashToken } from "@/lib/tokens";

const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1000;

type VerificationUser = {
  id: string;
  email: string;
  name?: string | null;
};

export async function sendVerificationEmailForUser(user: VerificationUser) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await db.$transaction([
    db.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    }),
    db.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  await sendEmailVerificationEmail({
    to: user.email,
    verificationToken: rawToken,
    name: user.name,
  });
}
