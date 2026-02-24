import "server-only";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

type InternalAuthOptions = {
  allowAdminSession?: boolean;
  secretEnvVar?: "CRON_SECRET" | "INTERNAL_API_SECRET";
};

function extractBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function isInternalApiAuthorized(
  request: Request,
  options: InternalAuthOptions = {},
) {
  const {
    allowAdminSession = true,
    secretEnvVar = "CRON_SECRET",
  } = options;

  const expectedSecret = process.env[secretEnvVar];
  const bearer = extractBearerToken(request);

  if (expectedSecret && bearer && secureEquals(bearer, expectedSecret)) {
    return true;
  }

  if (!allowAdminSession) {
    return false;
  }

  const session = await auth();
  return isAdminEmail(session?.user?.email);
}
