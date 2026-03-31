#!/usr/bin/env node

const prismaDatabaseUrl = process.env.PRISMA_DATABASE_URL?.trim();
const directDatabaseUrl = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

const isAccelerateUrl = Boolean(
  prismaDatabaseUrl
  && (prismaDatabaseUrl.startsWith("prisma://") || prismaDatabaseUrl.startsWith("prisma+postgres://")),
);

const migrationUrl = directDatabaseUrl || (!isAccelerateUrl ? prismaDatabaseUrl : undefined);

if (!migrationUrl) {
  console.error(
    "Prisma CLI requires a direct Postgres connection URL. Set POSTGRES_URL or DATABASE_URL in environments that use Prisma Accelerate.",
  );
  process.exit(1);
}
