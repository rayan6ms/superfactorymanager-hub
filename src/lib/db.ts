import "server-only";
import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const prismaUrl = process.env.PRISMA_DATABASE_URL?.trim();
const isAccelerateUrl = Boolean(
  prismaUrl
  && (prismaUrl.startsWith("prisma://") || prismaUrl.startsWith("prisma+postgres://")),
);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function warnAboutPrismaConfig() {
  if (!prismaUrl) {
    console.warn("PRISMA_DATABASE_URL is not set. Database queries will fail in this runtime.");
    return;
  }

  if (
    prismaUrl.startsWith("postgres://")
    && prismaUrl.includes("prisma-data.net")
    && !/([?&])sslmode=require(?:&|$)/.test(prismaUrl)
  ) {
    console.warn(
      "PRISMA_DATABASE_URL points to Prisma Postgres over TCP without sslmode=require. Vercel production should use sslmode=require, or switch PRISMA_DATABASE_URL to an Accelerate URL.",
    );
  }

  if (isAccelerateUrl && !process.env.POSTGRES_URL?.trim()) {
    console.warn(
      "PRISMA_DATABASE_URL is using Accelerate, but POSTGRES_URL is missing. Prisma migrations still need a direct Postgres URL for directUrl.",
    );
  }
}

if (process.env.NODE_ENV === "production") {
  warnAboutPrismaConfig();
}

const prisma = globalForPrisma.prisma ?? new PrismaClient(
  isAccelerateUrl ? { accelerateUrl: prismaUrl } : undefined,
);

export const db = (isAccelerateUrl ? prisma.$extends(withAccelerate()) : prisma) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
