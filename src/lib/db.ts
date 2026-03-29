import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";

const prismaUrl = process.env.PRISMA_DATABASE_URL?.trim();
const directDatabaseUrl = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
const isAccelerateUrl = Boolean(
  prismaUrl
  && (prismaUrl.startsWith("prisma://") || prismaUrl.startsWith("prisma+postgres://")),
);
const fallbackDatabaseUrl = "postgresql://prisma:prisma@127.0.0.1:5432/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function warnAboutPrismaConfig() {
  if (!prismaUrl && !directDatabaseUrl) {
    console.warn("Neither PRISMA_DATABASE_URL nor POSTGRES_URL/DATABASE_URL is set. Database queries will fail in this runtime.");
    return;
  }

  if (
    prismaUrl
    && (prismaUrl.startsWith("postgres://") || prismaUrl.startsWith("postgresql://"))
    && prismaUrl.includes("prisma-data.net")
    && !/([?&])sslmode=require(?:&|$)/.test(prismaUrl)
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

const prismaClientOptions: Prisma.PrismaClientOptions = isAccelerateUrl && prismaUrl
  ? { accelerateUrl: prismaUrl }
  : {
    adapter: new PrismaPg({
      connectionString: directDatabaseUrl || prismaUrl || fallbackDatabaseUrl,
    }),
  };

const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions);

export const db = (isAccelerateUrl ? prisma.$extends(withAccelerate()) : prisma) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
