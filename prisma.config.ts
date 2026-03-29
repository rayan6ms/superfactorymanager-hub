import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const prismaDatabaseUrl = process.env.PRISMA_DATABASE_URL?.trim();
const directDatabaseUrl = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

const isAccelerateUrl = Boolean(
  prismaDatabaseUrl
  && (prismaDatabaseUrl.startsWith("prisma://") || prismaDatabaseUrl.startsWith("prisma+postgres://")),
);

const migrationUrl = directDatabaseUrl || (!isAccelerateUrl ? prismaDatabaseUrl : undefined);

if (!migrationUrl) {
  throw new Error(
    "Prisma CLI requires a direct Postgres connection URL. Set POSTGRES_URL or DATABASE_URL in environments that use Prisma Accelerate.",
  );
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: migrationUrl,
  },
});
