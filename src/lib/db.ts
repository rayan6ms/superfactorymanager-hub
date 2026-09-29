import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";

const prismaUrl = process.env.PRISMA_DATABASE_URL?.trim();

function normalizeDirectDatabaseUrl(value: string | undefined) {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    const sslmode = parsed.searchParams.get("sslmode");
    if (sslmode === "require" || sslmode === "prefer" || sslmode === "verify-ca") {
      // pg-connection-string currently treats these modes as verify-full and
      // logs a warning. Make that security behavior explicit at runtime.
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    // Let Prisma/pg report malformed connection strings normally.
  }

  return value;
}

const directDatabaseUrl = normalizeDirectDatabaseUrl(
  process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim(),
);
const isAccelerateUrl = Boolean(
  prismaUrl && (prismaUrl.startsWith("prisma://") || prismaUrl.startsWith("prisma+postgres://")),
);
// Prefer the direct URL when it is available. It is already required for
// migrations and avoids making page requests depend on Accelerate availability.
// Set PRISMA_USE_ACCELERATE=true when an environment specifically needs it.
const useAccelerate =
  isAccelerateUrl && (process.env.PRISMA_USE_ACCELERATE === "true" || !directDatabaseUrl);
const fallbackDatabaseUrl = "postgresql://prisma:prisma@127.0.0.1:5432/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function warnAboutPrismaConfig() {
  if (!prismaUrl && !directDatabaseUrl) {
    console.warn(
      "Neither PRISMA_DATABASE_URL nor POSTGRES_URL/DATABASE_URL is set. Database queries will fail in this runtime.",
    );
    return;
  }

  if (
    prismaUrl &&
    (prismaUrl.startsWith("postgres://") || prismaUrl.startsWith("postgresql://")) &&
    prismaUrl.includes("prisma-data.net") &&
    !/([?&])sslmode=(?:require|verify-full)(?:&|$)/.test(prismaUrl)
  ) {
    console.warn(
      "PRISMA_DATABASE_URL points to Prisma Postgres over TCP without sslmode=require. Vercel production should use sslmode=require, or switch PRISMA_DATABASE_URL to an Accelerate URL.",
    );
  }

  if (isAccelerateUrl && !directDatabaseUrl) {
    console.warn(
      "PRISMA_DATABASE_URL is using Accelerate, but POSTGRES_URL/DATABASE_URL is missing. Prisma CLI commands still need a direct Postgres URL in prisma.config.ts.",
    );
  }
}

if (process.env.NODE_ENV === "production") {
  warnAboutPrismaConfig();
}

const prismaClientOptions: Prisma.PrismaClientOptions =
  useAccelerate && prismaUrl
    ? { accelerateUrl: prismaUrl }
    : {
        adapter: new PrismaPg({
          connectionString: directDatabaseUrl || prismaUrl || fallbackDatabaseUrl,
          // Vercel functions scale horizontally. Keep each warm instance from
          // opening a full default pg pool while allowing parallel public reads.
          max: 4,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        }),
      };

const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions);

export const db = (useAccelerate ? prisma.$extends(withAccelerate()) : prisma) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
