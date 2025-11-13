import nodemailer from "nodemailer";

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

function getTransporter() {
  if (transporterPromise) return transporterPromise;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";

  if (!host || !port || Number.isNaN(port)) {
    transporterPromise = Promise.reject(new Error("SMTP transport not configured"));
    return transporterPromise;
  }

  transporterPromise = Promise.resolve(
    nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  );

  return transporterPromise;
}

function getAppBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return withProtocol.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export async function sendPasswordResetEmail({
  to,
  resetToken,
  name,
}: {
  to: string;
  resetToken: string;
  name?: string | null;
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.warn("EMAIL_FROM env var is not set. Skipping password reset email send.");
    return;
  }

  try {
    const transporter = await getTransporter();
    const baseUrl = getAppBaseUrl();
    const resetLink = `${baseUrl}/reset-password/${resetToken}`;
    const displayName = name?.trim() ? name.trim() : "there";

    await transporter.sendMail({
      to,
      from,
      subject: "Reset your SuperFactoryManager password",
      text: `Hi ${displayName},\n\nWe received a request to reset your SuperFactoryManager password.\n\nIf you made this request, you can set a new password using the link below:\n${resetLink}\n\nIf you didn't request a password reset, you can ignore this email.\n\nThis link will expire in one hour.\n\nThanks,\nSuperFactoryManager Team`,
      html: `<!DOCTYPE html><html><body style="font-family: sans-serif; color: #0f172a;">` +
        `<p>Hi ${displayName},</p>` +
        `<p>We received a request to reset your SuperFactoryManager password.</p>` +
        `<p>If you made this request, click the button below to choose a new password.</p>` +
        `<p style="margin: 24px 0;">` +
        `<a href="${resetLink}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 20px; border-radius: 9999px; text-decoration: none;">Reset password</a>` +
        `</p>` +
        `<p>If you didn't request a password reset, you can safely ignore this email.</p>` +
        `<p style="margin-top: 24px;">This link will expire in one hour.</p>` +
        `<p style="margin-top: 24px;">Thanks,<br/>SuperFactoryManager Team</p>` +
        `</body></html>`,
    });
  } catch (error) {
    console.error("Failed to send password reset email", error);
  }
}

export async function sendEmailVerificationEmail({
  to,
  verificationToken,
  name,
}: {
  to: string;
  verificationToken: string;
  name?: string | null;
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.warn("EMAIL_FROM env var is not set. Skipping verification email send.");
    return;
  }

  try {
    const transporter = await getTransporter();
    const baseUrl = getAppBaseUrl();
    const verifyLink = `${baseUrl}/verify-email/${verificationToken}`;
    const displayName = name?.trim() ? name.trim() : "there";

    await transporter.sendMail({
      to,
      from,
      subject: "Verify your SuperFactoryManager email",
      text: `Hi ${displayName},\n\nThanks for signing up for SuperFactoryManager!\n\nPlease confirm that this email address belongs to you by clicking the link below:\n${verifyLink}\n\nIf you did not create an account, you can safely ignore this message.\n\nThis link will expire in one hour.\n\nThanks,\nSuperFactoryManager Team`,
      html:
        "<!DOCTYPE html><html><body style=\"font-family: sans-serif; color: #0f172a;\">" +
        `<p>Hi ${displayName},</p>` +
        `<p>Thanks for signing up for SuperFactoryManager!</p>` +
        `<p>Please confirm that this email address belongs to you by clicking the button below.</p>` +
        `<p style=\"margin: 24px 0;\">` +
        `<a href=\"${verifyLink}\" style=\"display: inline-block; background: #22c55e; color: #fff; padding: 12px 20px; border-radius: 9999px; text-decoration: none;\">Verify email</a>` +
        `</p>` +
        `<p>If you didn’t create this account, you can safely ignore this message.</p>` +
        `<p style=\"margin-top: 24px;\">This link will expire in one hour.</p>` +
        `<p style=\"margin-top: 24px;\">Thanks,<br/>SuperFactoryManager Team</p>` +
        `</body></html>`,
    });
  } catch (error) {
    console.error("Failed to send verification email", error);
  }
}
