import nodemailer from "nodemailer";
import { NotificationOrigin } from "@prisma/client";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveNotificationLink(link: string) {
  if (/^https?:\/\//i.test(link)) {
    return link;
  }
  const baseUrl = getAppBaseUrl();
  const normalizedLink = link.startsWith("/") ? link : `/${link}`;
  return `${baseUrl}${normalizedLink}`;
}

function notificationSubject(origin: NotificationOrigin, title: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    return `${trimmedTitle} · SFMHub`;
  }

  switch (origin) {
    case NotificationOrigin.POST:
      return "New post notification · SFMHub";
    case NotificationOrigin.REPORT:
      return "Report update · SFMHub";
    case NotificationOrigin.SYSTEM:
    default:
      return "System notification · SFMHub";
  }
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
    throw new Error("EMAIL_FROM_NOT_CONFIGURED");
  }

  const transporter = await getTransporter();

  const baseUrl = getAppBaseUrl();
  const resetLink = `${baseUrl}/reset-password/${resetToken}`;
  const displayName = name?.trim() ? name.trim() : "there";

  await transporter.sendMail({
    to,
    from,
    subject: "Reset your SFMHub password",
    text: `Hi ${displayName},\n\nWe received a request to reset your SFMHub password.\n\nIf you made this request, you can set a new password using the link below:\n${resetLink}\n\nIf you didn't request a password reset, you can ignore this email.\n\nThis link will expire in one hour.\n\nThanks,\nSFMHub Team`,
    html: `<!DOCTYPE html><html><body style="font-family: sans-serif; color: #0f172a;">` +
      `<p>Hi ${displayName},</p>` +
      `<p>We received a request to reset your SFMHub password.</p>` +
      `<p>If you made this request, click the button below to choose a new password.</p>` +
      `<p style="margin: 24px 0;">` +
      `<a href="${resetLink}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 20px; border-radius: 9999px; text-decoration: none;">Reset password</a>` +
      `</p>` +
      `<p>If you didn't request a password reset, you can safely ignore this email.</p>` +
      `<p style="margin-top: 24px;">This link will expire in one hour.</p>` +
      `<p style="margin-top: 24px;">Thanks,<br/>SFMHub Team</p>` +
      `</body></html>`,
  });
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
    throw new Error("EMAIL_FROM_NOT_CONFIGURED");
  }

  const transporter = await getTransporter();

  const baseUrl = getAppBaseUrl();
  const verifyLink = `${baseUrl}/verify-email/${verificationToken}`;
  const displayName = name?.trim() ? name.trim() : "there";

  await transporter.sendMail({
    to,
    from,
    subject: "Verify your SFMHub email",
    text: `Hi ${displayName},\n\nThanks for signing up for SFMHub!\n\nPlease confirm that this email address belongs to you by clicking the link below:\n${verifyLink}\n\nIf you did not create an account, you can safely ignore this message.\n\nThis link will expire in one hour.\n\nThanks,\nSFMHub Team`,
    html:
      "<!DOCTYPE html><html><body style=\"font-family: sans-serif; color: #0f172a;\">" +
      `<p>Hi ${displayName},</p>` +
      `<p>Thanks for signing up for SFMHub!</p>` +
      `<p>Please confirm that this email address belongs to you by clicking the button below.</p>` +
      `<p style=\"margin: 24px 0;\">` +
      `<a href=\"${verifyLink}\" style=\"display: inline-block; background: #22c55e; color: #fff; padding: 12px 20px; border-radius: 9999px; text-decoration: none;\">Verify email</a>` +
      `</p>` +
      `<p>If you didn’t create this account, you can safely ignore this message.</p>` +
      `<p style=\"margin-top: 24px;\">This link will expire in one hour.</p>` +
      `<p style=\"margin-top: 24px;\">Thanks,<br/>SFMHub Team</p>` +
      `</body></html>`,
  });
}

export async function sendNotificationEmail({
  to,
  name,
  notification,
}: {
  to: string;
  name?: string | null;
  notification: {
    title: string;
    message: string;
    origin: NotificationOrigin;
    link?: string | null;
  };
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM_NOT_CONFIGURED");
  }

  const transporter = await getTransporter();
  const displayName = name?.trim() ? name.trim() : "there";
  const subject = notificationSubject(notification.origin, notification.title);
  const safeTitle = escapeHtml(notification.title);
  const safeMessage = escapeHtml(notification.message);
  const ctaLink = notification.link ? resolveNotificationLink(notification.link) : null;

  const textParts = [
    `Hi ${displayName},`,
    "",
    notification.title,
    notification.message,
    "",
    ctaLink ? `Open notification: ${ctaLink}` : null,
    "You can change email notification preferences in your profile.",
    "",
    "Thanks,",
    "SFMHub Team",
  ].filter((part): part is string => Boolean(part));

  const htmlParts = [
    "<!DOCTYPE html><html><body style=\"font-family: sans-serif; color: #0f172a;\">",
    `<p>Hi ${escapeHtml(displayName)},</p>`,
    `<h2 style=\"margin: 0 0 8px;\">${safeTitle}</h2>`,
    `<p style=\"margin: 0 0 16px;\">${safeMessage}</p>`,
    ctaLink
      ? `<p style=\"margin: 24px 0;\"><a href=\"${escapeHtml(ctaLink)}\" style=\"display: inline-block; background: #6366f1; color: #fff; padding: 12px 20px; border-radius: 9999px; text-decoration: none;\">View notification</a></p>`
      : "",
    "<p>You can change email notification preferences in your profile.</p>",
    "<p style=\"margin-top: 24px;\">Thanks,<br/>SFMHub Team</p>",
    "</body></html>",
  ];

  await transporter.sendMail({
    to,
    from,
    subject,
    text: textParts.join("\n"),
    html: htmlParts.join(""),
  });
}
