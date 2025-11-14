import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { Card, Button } from "@/components/ui";

function getStatusCopy(status: Status) {
  switch (status) {
    case "success":
      return {
        title: "Email verified",
        description:
          "Thanks for confirming your email address. You can now sign in with your SuperFactoryManager account.",
      };
    case "expired":
      return {
        title: "Verification link expired",
        description:
          "This verification link has expired. Please request a new verification email from the login page.",
      };
    case "already":
      return {
        title: "Email already verified",
        description: "This email address is already verified. You can sign in with your account.",
      };
    default:
      return {
        title: "Invalid verification link",
        description: "We couldn’t verify your email address. Please request a new verification email.",
      };
  }
}

type Status = "success" | "expired" | "invalid" | "already";

type VerifyEmailPageProps = {
  params: Promise<{ token: string }>;
};

export default async function VerifyEmailPage(props: VerifyEmailPageProps) {
  const { token } = await props.params;
  let status: Status = "invalid";

  if (typeof token === "string" && token.trim()) {
    const hashed = hashToken(token);
    const record = await db.emailVerificationToken.findUnique({
      where: { tokenHash: hashed },
      include: { user: true },
    });

    if (!record) {
      status = "invalid";
    } else if (record.consumedAt) {
      status = record.user.emailVerified ? "already" : "invalid";
    } else {
      const now = new Date();
      if (record.expiresAt < now) {
        status = "expired";
        await db.emailVerificationToken.delete({ where: { tokenHash: record.tokenHash } });
      } else {
        await db.$transaction([
          db.user.update({
            where: { id: record.userId },
            data: { emailVerified: new Date() },
          }),
          db.emailVerificationToken.update({
            where: { tokenHash: record.tokenHash },
            data: { consumedAt: new Date() },
          }),
          db.emailVerificationToken.deleteMany({
            where: {
              userId: record.userId,
              NOT: { tokenHash: record.tokenHash },
            },
          }),
        ]);
        status = "success";
      }
    }
  }

  const copy = getStatusCopy(status);

  return (
    <main className="flex flex-col items-center justify-start gap-6 px-4 pb-12 pt-16">
      <Card className="w-full max-w-md space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">{copy.title}</h1>
          <p className="text-sm text-white/70">{copy.description}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/login" className="inline-flex justify-center">
            <Button className="w-full justify-center">Go to login</Button>
          </Link>
          <Link href="/signup" className="text-sm text-white/70 underline">
            Need a new account?
          </Link>
        </div>
      </Card>
    </main>
  );
}
