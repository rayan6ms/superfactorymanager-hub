import "server-only";
import { Prisma } from "@prisma/client";

const UNAVAILABLE_KNOWN_ERROR_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1008",
  "P1010",
  "P1011",
  "P1013",
  "P1017",
  "P2024",
  "P5011",
  "P6002",
  "P6003",
  "P6004",
  "P6008",
  "P6010",
]);

const UNAVAILABLE_MESSAGE_PATTERNS = [
  "planlimitreached",
  "projectdisablederror",
  "included usage of the current plan has been exceeded",
  "workspace plan limit reached",
  "can't reach database server",
  "database server",
  "timed out",
  "too many requests",
  "server has closed the connection",
];

const UNAVAILABLE_WINDOW_MS = 5 * 60 * 1000;

let lastDatabaseUnavailableAt = 0;
let lastDatabaseUnavailableReason: string | null = null;

function getErrorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode ?? null;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isPrismaDatabaseUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return UNAVAILABLE_KNOWN_ERROR_CODES.has(error.code);
  }

  const code = getErrorCode(error);
  if (code && UNAVAILABLE_KNOWN_ERROR_CODES.has(code)) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

function rememberDatabaseUnavailable(error: unknown) {
  const now = Date.now();
  const reason = getErrorCode(error) ?? getErrorMessage(error);
  const shouldLog = reason !== lastDatabaseUnavailableReason || now - lastDatabaseUnavailableAt > 30_000;

  lastDatabaseUnavailableAt = now;
  lastDatabaseUnavailableReason = reason;

  if (shouldLog) {
    console.warn("Database unavailable, falling back to degraded mode:", error);
  }
}

export function hasRecentDatabaseFallback() {
  return Date.now() - lastDatabaseUnavailableAt <= UNAVAILABLE_WINDOW_MS;
}

export function getRecentDatabaseFallbackReason() {
  if (!hasRecentDatabaseFallback()) {
    return null;
  }

  return lastDatabaseUnavailableReason;
}

export async function withDatabaseFallback<T>(
  run: () => Promise<T>,
  fallback: T | (() => T | Promise<T>),
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isPrismaDatabaseUnavailableError(error)) {
      throw error;
    }

    rememberDatabaseUnavailable(error);
    return typeof fallback === "function"
      ? await (fallback as () => T | Promise<T>)()
      : fallback;
  }
}
