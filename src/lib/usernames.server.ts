import slugify from "slugify";
import { db } from "./db";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "./usernames";

function sanitizeCandidate(raw: string): string {
  const slug = slugify(raw, { lower: true, strict: true, trim: true });
  const cleaned = slug
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return cleaned.slice(0, USERNAME_MAX_LENGTH);
}

function normalizeBase(base: string | null | undefined): string {
  if (!base) return "";
  return sanitizeCandidate(base);
}

export async function isUsernameTaken(name: string, excludeUserId?: string): Promise<boolean> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  const existing = await db.user.findFirst({
    where: {
      name: normalized,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function tryCandidate(base: string, excludeUserId?: string): Promise<string | null> {
  if (!base) return null;
  let candidate = base;
  if (candidate.length < USERNAME_MIN_LENGTH) {
    candidate = candidate.padEnd(USERNAME_MIN_LENGTH, "0");
  }
  candidate = candidate.slice(0, USERNAME_MAX_LENGTH);
  let attempt = candidate;
  let counter = 1;
  const attempted = new Set<string>();

  while (attempted.size < 50) {
    if (attempt.length < USERNAME_MIN_LENGTH) {
      attempt = attempt.padEnd(USERNAME_MIN_LENGTH, "0");
    }
    attempt = attempt.slice(0, USERNAME_MAX_LENGTH);
    if (!attempted.has(attempt)) {
      attempted.add(attempt);
      const taken = await isUsernameTaken(attempt, excludeUserId);
      if (!taken) {
        return attempt;
      }
    }
    const suffix = String(counter++);
    const maxBaseLength = Math.max(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH - suffix.length - 1);
    attempt = `${candidate.slice(0, maxBaseLength)}-${suffix}`;
  }

  return null;
}

export async function generateAvailableUsername(
  preferredName: string | null,
  email: string | null,
  excludeUserId?: string,
): Promise<string> {
  const candidates: string[] = [];
  candidates.push(normalizeBase(preferredName));

  if (email) {
    const [localPart] = email.split("@");
    candidates.push(normalizeBase(localPart));
    candidates.push(normalizeBase(email));
  }

  candidates.push("user");

  for (const candidate of candidates) {
    const result = await tryCandidate(candidate, excludeUserId);
    if (result) {
      return result;
    }
  }

  for (let i = 0; i < 50; i += 1) {
    const randomCandidate = `user-${Math.random().toString(36).slice(2, 8)}`;
    const normalized = normalizeBase(randomCandidate);
    if (!normalized) continue;
    if (!(await isUsernameTaken(normalized, excludeUserId))) {
      return normalized;
    }
  }

  throw new Error("UNABLE_TO_GENERATE_USERNAME");
}
