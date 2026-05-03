import "server-only";

import crypto from "crypto";
import net from "net";
import { db } from "./db";

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type DatabaseBucketRow = {
  count: number | bigint;
  resetAt: Date;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;
const DATABASE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const TRUSTED_PROXY_IP_HEADERS = new Set([
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
]);
const VERCEL_TRUSTED_PROXY_IP_HEADER = "x-forwarded-for";

let lastDatabaseCleanupAt = 0;
let didWarnAboutDatabaseFallback = false;
let didWarnAboutAnonymousFingerprintFallback = false;
let didWarnAboutRateLimitHashFallback = false;
let trustedProxyHeaderCache: string | null | undefined;

export class TrustedProxyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustedProxyConfigurationError";
  }
}

function trimBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  if (buckets.size <= MAX_BUCKETS) return;

  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function normalizeIp(candidate: string | null | undefined): string | null {
  if (!candidate) return null;

  const trimmed = candidate.trim().replace(/^"|"$/g, "");
  if (!trimmed) return null;

  if (net.isIP(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    const bracketEnd = trimmed.indexOf("]");
    const inside = trimmed.slice(1, bracketEnd);
    return net.isIP(inside) ? inside.toLowerCase() : null;
  }

  const maybeHost = trimmed.match(/^(.+):(\d+)$/);
  if (maybeHost?.[1] && maybeHost[1].includes(".") && net.isIP(maybeHost[1])) {
    return maybeHost[1].toLowerCase();
  }

  return null;
}

function getConfiguredTrustedProxyHeader(): string | null {
  if (typeof trustedProxyHeaderCache !== "undefined") {
    return trustedProxyHeaderCache;
  }

  const configured = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (!configured) {
    if (process.env.VERCEL === "1") {
      trustedProxyHeaderCache = VERCEL_TRUSTED_PROXY_IP_HEADER;
      return trustedProxyHeaderCache;
    }

    if (process.env.NODE_ENV === "production") {
      throw new TrustedProxyConfigurationError(
        "TRUSTED_PROXY_IP_HEADER must be configured for production rate limiting.",
      );
    }
    trustedProxyHeaderCache = null;
    return null;
  }
  if (!TRUSTED_PROXY_IP_HEADERS.has(configured)) {
    const message = `Unsupported TRUSTED_PROXY_IP_HEADER value: ${configured}`;
    if (process.env.NODE_ENV === "production") {
      throw new TrustedProxyConfigurationError(message);
    }
    console.warn(`Ignoring ${message}`);
    trustedProxyHeaderCache = null;
    return null;
  }
  trustedProxyHeaderCache = configured;
  return configured;
}

function buildAnonymousFingerprint(headers: Headers): string {
  const material = [
    headers.get("user-agent")?.trim().toLowerCase() ?? "",
    headers.get("accept-language")?.trim().toLowerCase() ?? "",
    headers.get("sec-ch-ua")?.trim().toLowerCase() ?? "",
    headers.get("sec-ch-ua-mobile")?.trim().toLowerCase() ?? "",
    headers.get("sec-ch-ua-platform")?.trim().toLowerCase() ?? "",
  ].join("|");

  return crypto.createHash("sha256").update(material || "anonymous").digest("hex").slice(0, 24);
}

function getRateLimitHashSecret(): string | null {
  const configuredSecret = process.env.RATE_LIMIT_HASH_SECRET
    ?? process.env.AUTH_SECRET
    ?? process.env.NEXTAUTH_SECRET;

  if (configuredSecret && configuredSecret.trim().length > 0) {
    return configuredSecret;
  }

  if (!didWarnAboutRateLimitHashFallback) {
    didWarnAboutRateLimitHashFallback = true;
    console.warn(
      "RATE_LIMIT_HASH_SECRET is not configured. Falling back to unkeyed SHA-256 for rate-limit identifiers.",
    );
  }

  return null;
}

export function hashRateLimitIdentifier(identifier: string, scope: string): string {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const material = `${scope}:${normalizedIdentifier}`;
  const secret = getRateLimitHashSecret();
  const digest = secret
    ? crypto.createHmac("sha256", secret).update(material).digest("hex")
    : crypto.createHash("sha256").update(material).digest("hex");
  return digest.slice(0, 32);
}

export function getTrustedClientIpFromHeaders(headers: Headers): string | null {
  const trustedHeader = getConfiguredTrustedProxyHeader();
  if (!trustedHeader) {
    return null;
  }

  const rawValue = headers.get(trustedHeader);
  if (!rawValue) {
    return null;
  }

  const firstValue = trustedHeader === "x-forwarded-for"
    ? rawValue.split(",")[0]?.trim()
    : rawValue.trim();

  return normalizeIp(firstValue);
}

export function getClientRateLimitKey(headers: Headers): string {
  const trustedHeader = getConfiguredTrustedProxyHeader();
  if (trustedHeader) {
    const trustedIp = getTrustedClientIpFromHeaders(headers);
    if (trustedIp) {
      return `ip:${trustedIp}`;
    }

    if (process.env.NODE_ENV === "production") {
      throw new TrustedProxyConfigurationError(
        `Expected a valid client IP in the ${trustedHeader} header for production rate limiting.`,
      );
    }
  }

  if (!didWarnAboutAnonymousFingerprintFallback) {
    didWarnAboutAnonymousFingerprintFallback = true;
    console.warn("Using best-effort anonymous request fingerprint for rate limiting.");
  }

  return `anon:${buildAnonymousFingerprint(headers)}`;
}

function checkMemoryRateLimit(
  key: string,
  options: { windowMs: number; limit: number },
): RateLimitResult {
  const now = Date.now();
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const limit = Math.max(1, Math.floor(options.limit));
  trimBuckets(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    trimBuckets(now);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - current.count),
  };
}

async function cleanupDatabaseBuckets(now: Date) {
  const nowMs = now.getTime();
  if (nowMs - lastDatabaseCleanupAt < DATABASE_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastDatabaseCleanupAt = nowMs;
  await db.$executeRaw`
    DELETE FROM "RateLimitBucket"
    WHERE "resetAt" <= ${now}
  `;
}

function toCount(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

async function checkDatabaseRateLimit(
  key: string,
  options: { windowMs: number; limit: number },
): Promise<RateLimitResult> {
  const now = new Date();
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const limit = Math.max(1, Math.floor(options.limit));
  const resetAt = new Date(now.getTime() + windowMs);

  await cleanupDatabaseBuckets(now);

  return db.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rows = await tx.$queryRaw<DatabaseBucketRow[]>`
        SELECT "count", "resetAt"
        FROM "RateLimitBucket"
        WHERE "key" = ${key}
        FOR UPDATE
      `;

      const current = rows[0];
      if (!current) {
        const inserted = await tx.$executeRaw`
          INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
          VALUES (${key}, 1, ${resetAt}, ${now})
          ON CONFLICT ("key") DO NOTHING
        `;

        if (inserted > 0) {
          return {
            allowed: true,
            retryAfterSeconds: 0,
            remaining: Math.max(0, limit - 1),
          };
        }

        continue;
      }

      const currentCount = toCount(current.count);
      if (current.resetAt <= now) {
        await tx.$executeRaw`
          UPDATE "RateLimitBucket"
          SET "count" = 1,
              "resetAt" = ${resetAt},
              "updatedAt" = ${now}
          WHERE "key" = ${key}
        `;

        return {
          allowed: true,
          retryAfterSeconds: 0,
          remaining: Math.max(0, limit - 1),
        };
      }

      if (currentCount >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000),
          ),
          remaining: 0,
        };
      }

      const nextCount = currentCount + 1;
      await tx.$executeRaw`
        UPDATE "RateLimitBucket"
        SET "count" = ${nextCount},
            "updatedAt" = ${now}
        WHERE "key" = ${key}
      `;

      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.max(0, limit - nextCount),
      };
    }

    throw new Error("RATE_LIMIT_INSERT_RACE");
  });
}

export async function checkRateLimit(
  key: string,
  options: { windowMs: number; limit: number },
): Promise<RateLimitResult> {
  try {
    return await checkDatabaseRateLimit(key, options);
  } catch (error) {
    if (!didWarnAboutDatabaseFallback) {
      didWarnAboutDatabaseFallback = true;
      console.warn("Falling back to in-memory rate limiting:", error);
    }
    return checkMemoryRateLimit(key, options);
  }
}
